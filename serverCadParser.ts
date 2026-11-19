import path from 'path';
import zlib from 'zlib';
import * as CFB from 'cfb';

export interface ParsedCadMeshPart {
  name: string;
  colorHex?: string;
  positions: number[];
  normals: number[];
  wireSegments?: number[];
  sourceLayer: string;
}

export interface ServerParsedCadResult {
  format: 'STEP' | 'IFC' | 'IPT';
  engine: string;
  meshes: ParsedCadMeshPart[];
  headerSnippet: string;
  extractedTokens: string[];
  notes: string;
}

let occtPromise: Promise<any> | null = null;

async function getOcctInstance(): Promise<any> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const mod: any = await import('occt-import-js');
      const initFn = mod.default || mod;
      return initFn();
    })();
  }
  return occtPromise;
}

function rgbToHex(color?: number[] | null): string | undefined {
  if (!Array.isArray(color) || color.length < 3) return undefined;
  const r = Math.max(0, Math.min(255, Math.round(color[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(color[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(color[2] * 255)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function computeTriNorm(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): [number, number, number] {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export async function parseStepWithOcct(
  buffer: Buffer,
  filename: string
): Promise<ServerParsedCadResult> {
  const occt = await getOcctInstance();
  const bytes = new Uint8Array(buffer);
  const ext = path.extname(filename).toLowerCase();

  const params = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.0025,
    angularDeflection: 0.4,
  };

  let res: any;
  if (ext === '.igs' || ext === '.iges') {
    res = occt.ReadIgesFile(bytes, params);
  } else if (ext === '.brep') {
    res = occt.ReadBrepFile(bytes, params);
  } else {
    res = occt.ReadStepFile(bytes, params);
  }

  if (!res || !res.success || !Array.isArray(res.meshes) || res.meshes.length === 0) {
    throw new Error(
      `OpenCASCADE não encontrou sólidos B-Rep válidos em "${filename}".`
    );
  }

  // Collect hierarchy names per mesh index from root node tree
  const meshNameMap = new Map<number, string>();
  const walkNode = (node: any, trail: string[]) => {
    if (!node) return;
    const curName =
      typeof node.name === 'string' && node.name.trim() && node.name !== 'Root'
        ? node.name.trim()
        : '';
    const nextTrail = curName ? [...trail, curName] : trail;
    if (Array.isArray(node.meshes)) {
      for (const mIdx of node.meshes) {
        if (typeof mIdx === 'number' && !meshNameMap.has(mIdx) && nextTrail.length > 0) {
          meshNameMap.set(mIdx, nextTrail[nextTrail.length - 1]);
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const ch of node.children) {
        walkNode(ch, nextTrail);
      }
    }
  };
  if (res.root) walkNode(res.root, []);

  // Measure raw span across all vertices; OCCT already converts explicit STEP units to linearUnit='millimeter'.
  // Only apply unit rescue if NO explicit millimeter/inch unit is declared and span is obviously meters (< 0.8).
  const textSnippetHead = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('latin1');
  const hasExplicitUnit = /SI_UNIT\s*\(\s*\.(MILLI|CENTI|MICRO)\.|CONVERSION_BASED_UNIT\s*\(\s*'(INCH|FOOT|MILLIMETRE|METRE)'/i.test(
    textSnippetHead
  );
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const m of res.meshes) {
    const pos = m?.attributes?.position?.array;
    if (!pos) continue;
    for (let i = 0; i + 2 < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  const rawSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0);
  const unitScale = !hasExplicitUnit && rawSpan > 0 && rawSpan < 0.8 ? 1000 : 1;

  // Group excessively fragmented faces (>36 meshes) by resolved name so Object Mask remains navigable
  const grouped = new Map<string, ParsedCadMeshPart>();
  let totalTriangles = 0;

  res.meshes.forEach((m: any, idx: number) => {
    const posArr = m?.attributes?.position?.array;
    const normArr = m?.attributes?.normal?.array;
    const idxArr = m?.index?.array;
    if (!posArr || posArr.length < 9) return;

    const rawName = (meshNameMap.get(idx) || m.name || `Solid_${idx + 1}`).trim();
    const partKey = res.meshes.length > 36 ? rawName : `${rawName}__${idx}`;

    let entry = grouped.get(partKey);
    if (!entry) {
      entry = {
        name: rawName,
        colorHex: rgbToHex(m.color),
        positions: [],
        normals: [],
        sourceLayer: rawName,
      };
      grouped.set(partKey, entry);
    }

    const pushVertex = (vIdx: number) => {
      const o = vIdx * 3;
      if (o + 2 >= posArr.length) return false;
      const x = posArr[o] * unitScale;
      const yCad = posArr[o + 1] * unitScale;
      const zUp = posArr[o + 2] * unitScale;
      // Map CAD Z-up -> Three.js Y-up: (x, zUp, -yCad)
      entry!.positions.push(x, zUp, -yCad);
      if (normArr && o + 2 < normArr.length) {
        entry!.normals.push(normArr[o], normArr[o + 2], -normArr[o + 1]);
      } else {
        entry!.normals.push(0, 1, 0);
      }
      return true;
    };

    if (idxArr && idxArr.length >= 3) {
      for (let t = 0; t + 2 < idxArr.length; t += 3) {
        const beforeLen = entry.positions.length;
        if (pushVertex(idxArr[t]) && pushVertex(idxArr[t + 1]) && pushVertex(idxArr[t + 2])) {
          totalTriangles++;
        } else {
          entry.positions.length = beforeLen;
          entry.normals.length = beforeLen;
        }
      }
    } else {
      const vCount = Math.floor(posArr.length / 3);
      for (let v = 0; v + 2 < vCount; v += 3) {
        pushVertex(v);
        pushVertex(v + 1);
        pushVertex(v + 2);
        totalTriangles++;
      }
    }
  });

  const meshes = Array.from(grouped.values()).filter((m) => m.positions.length >= 9);
  const textSnippet = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('latin1');
  const headerMatch = /HEADER;([\s\S]*?)ENDSEC;/i.exec(textSnippet);
  const productMatches = Array.from(
    textSnippet.matchAll(/PRODUCT\s*\(\s*'([^']+)'/gi)
  ).map((m) => m[1]);

  return {
    format: 'STEP',
    engine: 'OpenCASCADE (OCCT B-Rep WASM)',
    meshes,
    headerSnippet: (headerMatch?.[1] || textSnippet.slice(0, 4000)).slice(0, 5000),
    extractedTokens: Array.from(new Set(productMatches)).slice(0, 20),
    notes: `STEP B-Rep tesselado fielmente via OpenCASCADE (${meshes.length} componentes · ${totalTriangles.toLocaleString('pt-BR')} triângulos reais)`,
  };
}

// ============================================================================
// Autodesk Inventor (.IPT) OLE2 Compound Document + zlib + ACIS SAT + Mesh Parser
// ============================================================================

function extractReadableTokens(buf: Buffer, maxTokens = 400): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (tok: string) => {
    const clean = tok.replace(/\s+/g, ' ').trim();
    if (clean.length >= 3 && clean.length <= 96 && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };

  let acc = '';
  const limit = Math.min(buf.length, 2_500_000);
  for (let i = 0; i < limit; i++) {
    const b = buf[i];
    if (b >= 32 && b <= 126) acc += String.fromCharCode(b);
    else {
      if (acc.length >= 4 && /[a-zA-Z]{2,}/.test(acc)) add(acc);
      acc = '';
    }
    if (out.length >= maxTokens) break;
  }

  let acc16 = '';
  for (let i = 0; i + 1 < limit; i += 2) {
    const lo = buf[i], hi = buf[i + 1];
    if (hi === 0 && lo >= 32 && lo <= 126) acc16 += String.fromCharCode(lo);
    else {
      if (acc16.length >= 4 && /[a-zA-Z]{2,}/.test(acc16)) add(acc16);
      acc16 = '';
    }
    if (out.length >= maxTokens) break;
  }
  return out;
}

function findEmbeddedZlibStreams(buf: Buffer): Buffer[] {
  const decompressed: Buffer[] = [];
  // Zlib magic headers: 78 9C (default), 78 DA (best), 78 01 (no/low), 78 5E (fast)
  for (let i = 0; i < buf.length - 8 && decompressed.length < 48; i++) {
    if (
      buf[i] === 0x78 &&
      (buf[i + 1] === 0x9c || buf[i + 1] === 0xda || buf[i + 1] === 0x5e || buf[i + 1] === 0x01)
    ) {
      const slice = buf.subarray(i, Math.min(buf.length, i + 4_000_000));
      let out: Buffer | null = null;
      try {
        // Default Z_FINISH stops cleanly at Z_STREAM_END even when trailing OLE bytes follow
        out = zlib.inflateSync(slice);
      } catch {
        try {
          out = zlib.inflateSync(slice, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        } catch {
          out = null;
        }
      }
      if (out && out.length >= 24) {
        decompressed.push(out);
        i += 16;
      }
    }
  }
  return decompressed;
}

function parseAcisSatGeometry(satText: string): {
  positions: number[];
  wireSegments: number[];
  unitScale: number;
  faceCount: number;
} | null {
  const rawLines = satText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length < 5) return null;

  // ACIS line 2 gives scale mm per model unit (Inventor uses 10 mm/cm)
  let unitScale = 1;
  const headerFields = rawLines[1]?.split(/\s+/) ?? [];
  const maybeScale = parseFloat(headerFields[0] ?? '1');
  if (Number.isFinite(maybeScale) && maybeScale > 0 && maybeScale <= 1000) {
    unitScale = maybeScale;
  }

  // Reassemble wrapped multi-line ACIS records terminated by '#'
  const logicalRecords: string[] = [];
  let acc = '';
  for (let i = 3; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line === 'End-of-ACIS-data') break;
    acc = acc ? `${acc} ${line}` : line;
    if (line.endsWith('#')) {
      logicalRecords.push(acc);
      acc = '';
    }
  }
  if (acc) logicalRecords.push(acc);

  const records = new Map<number, { type: string; body: string }>();
  logicalRecords.forEach((line, idx) => {
    const match = /^(-?\d+)\s+([a-zA-Z0-9_-]+)\s+(.*)$/.exec(line);
    if (match) {
      records.set(parseInt(match[1], 10), { type: match[2], body: match[3] });
    } else if (/^[a-zA-Z]/.test(line)) {
      const sp = line.indexOf(' ');
      if (sp > 0) {
        records.set(idx, { type: line.slice(0, sp), body: line.slice(sp + 1) });
      }
    }
  });

  const getPtrs = (body: string): number[] => {
    const out: number[] = [];
    const rx = /\$(-?\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(body)) !== null) out.push(parseInt(m[1], 10));
    return out;
  };

  const getPoint = (idx: number): [number, number, number] | null => {
    const rec = records.get(idx);
    if (!rec || rec.type !== 'point') return null;
    const nums = rec.body
      .replace(/#$/, '')
      .trim()
      .split(/\s+/)
      .slice(-3)
      .map(Number);
    if (nums.length === 3 && nums.every(Number.isFinite)) {
      return [nums[0] * unitScale, nums[2] * unitScale, -nums[1] * unitScale];
    }
    return null;
  };

  const getVertexPoint = (vIdx: number): [number, number, number] | null => {
    const vRec = records.get(vIdx);
    if (!vRec) return null;
    const ptrs = getPtrs(vRec.body);
    for (const p of ptrs) {
      const pt = getPoint(p);
      if (pt) return pt;
    }
    return null;
  };

  const allPoints: [number, number, number][] = [];
  for (const [k, rec] of records.entries()) {
    if (rec.type === 'point') {
      const pt = getPoint(k);
      if (pt) allPoints.push(pt);
    }
  }
  if (allPoints.length < 3) return null;

  const positions: number[] = [];
  const wireSegments: number[] = [];
  let faceCount = 0;

  for (const [, rec] of records.entries()) {
    if (rec.type !== 'loop') continue;
    const loopPtrs = getPtrs(rec.body);
    const firstCoedge = loopPtrs.find((p) => records.get(p)?.type === 'coedge');
    if (firstCoedge === undefined) continue;

    const loopPts: [number, number, number][] = [];
    const visited = new Set<number>();
    let cur: number | undefined = firstCoedge;
    let guard = 0;
    while (cur !== undefined && !visited.has(cur) && guard < 128) {
      visited.add(cur);
      const ce = records.get(cur);
      if (!ce || ce.type !== 'coedge') break;
      const ptrs = getPtrs(ce.body);
      const edgeIdx = ptrs.find((p) => records.get(p)?.type === 'edge');
      if (edgeIdx !== undefined) {
        const edge = records.get(edgeIdx);
        if (edge) {
          const ePtrs = getPtrs(edge.body);
          const verts = ePtrs
            .map((p) => getVertexPoint(p))
            .filter((p): p is [number, number, number] => Boolean(p));
          if (verts.length > 0) loopPts.push(verts[0]);
        }
      }
      cur = ptrs.find((p) => p !== cur && records.get(p)?.type === 'coedge' && !visited.has(p));
      guard++;
    }

    if (loopPts.length >= 3) {
      faceCount++;
      for (let k = 0; k < loopPts.length; k++) {
        const a = loopPts[k];
        const b = loopPts[(k + 1) % loopPts.length];
        wireSegments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      for (let k = 1; k < loopPts.length - 1; k++) {
        positions.push(
          loopPts[0][0], loopPts[0][1], loopPts[0][2],
          loopPts[k][0], loopPts[k][1], loopPts[k][2],
          loopPts[k + 1][0], loopPts[k + 1][1], loopPts[k + 1][2]
        );
      }
    }
  }

  // Fallback for curved/cylindrical ACIS faces (loops with < 3 vertices): multi-slice envelope from ACIS point records
  if (positions.length < 9 && allPoints.length >= 4) {
    const hull = buildMultiSliceEnvelopeFromPoints(allPoints);
    if (hull.positions.length >= 9) {
      return {
        positions: hull.positions,
        wireSegments: wireSegments.length > 0 ? wireSegments : hull.wireSegments,
        unitScale,
        faceCount: Math.max(faceCount, Math.floor(hull.positions.length / 9)),
      };
    }
  }

  return positions.length >= 9 ? { positions, wireSegments, unitScale, faceCount } : null;
}

function scanFloat32MeshOrCloud(buf: Buffer): {
  positions: number[];
  wireSegments: number[];
  mode: 'indexed-mesh' | 'point-cloud';
  pointCount: number;
} | null {
  // Accept valid datum-plane coordinates (0.0) and normal finite CAD range while filtering denormal bit patterns
  const isPlausibleCoord = (v: number) =>
    Number.isFinite(v) && !Number.isNaN(v) && (v === 0 || (Math.abs(v) >= 1e-4 && Math.abs(v) <= 5000));

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // 1) Try to find an explicit indexed float32 mesh block (V vertices followed by T uint32 triangles)
  for (let off = 0; off + 64 < buf.length; off += 4) {
    const vCount = view.getUint32(off, true);
    if (vCount >= 12 && vCount <= 40000 && off + 8 + vCount * 12 < buf.length) {
      let validVerts = true;
      const verts: [number, number, number][] = [];
      let p = off + 4;
      for (let i = 0; i < Math.min(vCount, 12); i++) {
        const x = view.getFloat32(p, true);
        const y = view.getFloat32(p + 4, true);
        const z = view.getFloat32(p + 8, true);
        if (!isPlausibleCoord(x) || !isPlausibleCoord(y) || !isPlausibleCoord(z)) {
          validVerts = false;
          break;
        }
        p += 12;
      }
      if (validVerts) {
        p = off + 4;
        let allValid = true;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < vCount; i++) {
          const x = view.getFloat32(p, true);
          const yCad = view.getFloat32(p + 4, true);
          const zUp = view.getFloat32(p + 8, true);
          if (!isPlausibleCoord(x) || !isPlausibleCoord(yCad) || !isPlausibleCoord(zUp)) {
            allValid = false;
            break;
          }
          const wx = x, wy = zUp, wz = -yCad;
          if (wx < minX) minX = wx;
          if (wy < minY) minY = wy;
          if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx;
          if (wy > maxY) maxY = wy;
          if (wz > maxZ) maxZ = wz;
          verts.push([wx, wy, wz]);
          p += 12;
        }
        if (allValid && p + 4 <= buf.length) {
          const rawSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0);
          const unitScale = rawSpan > 0 && rawSpan < 1.2 ? 1000 : rawSpan >= 1.2 && rawSpan < 26 ? 10 : 1;
          const tCount = view.getUint32(p, true);
          if (tCount >= 4 && tCount <= 120000 && p + 4 + tCount * 12 <= buf.length) {
            const positions: number[] = [];
            let idxOk = true;
            let ip = p + 4;
            for (let t = 0; t < tCount; t++) {
              const a = view.getUint32(ip, true);
              const b = view.getUint32(ip + 4, true);
              const c = view.getUint32(ip + 8, true);
              if (a >= vCount || b >= vCount || c >= vCount || a === b || b === c) {
                idxOk = false;
                break;
              }
              positions.push(
                verts[a][0] * unitScale, verts[a][1] * unitScale, verts[a][2] * unitScale,
                verts[b][0] * unitScale, verts[b][1] * unitScale, verts[b][2] * unitScale,
                verts[c][0] * unitScale, verts[c][1] * unitScale, verts[c][2] * unitScale
              );
              ip += 12;
            }
            if (idxOk && positions.length >= 36) {
              return { positions, wireSegments: [], mode: 'indexed-mesh', pointCount: vCount };
            }
          }
        }
      }
    }
  }

  // 2) Extract contiguous phase-aligned Float64 (ACIS SAB) or Float32 (Inventor Graphics) coordinate runs
  // Preserves datum-plane coordinates (X=0, Y=0, Z=0) while avoiding misaligned cross-float noise!
  const extractBestStridedRun = (elemSize: 8 | 4): [number, number, number][] => {
    const tupleBytes = elemSize * 3;
    const limit = Math.min(buf.length, 600_000);
    let bestPts: [number, number, number][] = [];

    for (let phase = 0; phase < tupleBytes; phase += elemSize) {
      let curRun: [number, number, number][] = [];
      let zeroOriginCount = 0;

      const flushRun = () => {
        if (curRun.length >= 6 && curRun.length > bestPts.length) {
          const nonZeroAxes = curRun.some((p) => p[0] !== 0 || p[1] !== 0 || p[2] !== 0);
          if (nonZeroAxes) bestPts = curRun;
        }
        curRun = [];
        zeroOriginCount = 0;
      };

      for (let off = phase; off + tupleBytes <= limit; off += tupleBytes) {
        const x = elemSize === 8 ? view.getFloat64(off, true) : view.getFloat32(off, true);
        const yCad = elemSize === 8 ? view.getFloat64(off + 8, true) : view.getFloat32(off + 4, true);
        const zUp = elemSize === 8 ? view.getFloat64(off + 16, true) : view.getFloat32(off + 8, true);

        const valid =
          isPlausibleCoord(x) &&
          isPlausibleCoord(yCad) &&
          isPlausibleCoord(zUp) &&
          !(x === 0 && yCad === 0 && zUp === 0 && zeroOriginCount >= 1);

        if (valid) {
          if (x === 0 && yCad === 0 && zUp === 0) zeroOriginCount++;
          curRun.push([x, zUp, -yCad]);
        } else {
          flushRun();
        }
      }
      flushRun();
    }
    return bestPts;
  };

  let collected = extractBestStridedRun(8);
  if (collected.length < 8) {
    collected = extractBestStridedRun(4);
  }

  // Fallback loose scan if points are separated by per-vertex header records inside SAB/Graphics streams
  if (collected.length < 8) {
    const loose: [number, number, number][] = [];
    const limit = Math.min(buf.length, 600_000);
    for (let off = 0; off + 24 <= limit; off += 8) {
      const x = view.getFloat64(off, true);
      const y = view.getFloat64(off + 8, true);
      const z = view.getFloat64(off + 16, true);
      if (isPlausibleCoord(x) && isPlausibleCoord(y) && isPlausibleCoord(z) && Math.abs(x) + Math.abs(y) + Math.abs(z) > 0.1) {
        loose.push([x, z, -y]);
      }
    }
    if (loose.length < 8) {
      for (let off = 0; off + 12 <= limit; off += 4) {
        const x = view.getFloat32(off, true);
        const y = view.getFloat32(off + 4, true);
        const z = view.getFloat32(off + 8, true);
        if (isPlausibleCoord(x) && isPlausibleCoord(y) && isPlausibleCoord(z) && Math.abs(x) + Math.abs(y) + Math.abs(z) > 0.1) {
          loose.push([x, z, -y]);
        }
      }
    }
    collected = loose;
  }

  if (collected.length < 6) return null;

  // Reject random binary noise using median/IQR spatial coherence filter
  const xs = collected.map((p) => p[0]).sort((a, b) => a - b);
  const ys = collected.map((p) => p[1]).sort((a, b) => a - b);
  const zs = collected.map((p) => p[2]).sort((a, b) => a - b);
  const q1 = (arr: number[]) => arr[Math.floor(arr.length * 0.2)];
  const q3 = (arr: number[]) => arr[Math.floor(arr.length * 0.8)];
  const med = (arr: number[]) => arr[Math.floor(arr.length * 0.5)];
  const rx = Math.max(2, (q3(xs) - q1(xs)) * 2.5);
  const ry = Math.max(2, (q3(ys) - q1(ys)) * 2.5);
  const rz = Math.max(2, (q3(zs) - q1(zs)) * 2.5);
  const mx = med(xs), my = med(ys), mz = med(zs);

  const filtered = collected.filter(
    (p) => Math.abs(p[0] - mx) <= rx && Math.abs(p[1] - my) <= ry && Math.abs(p[2] - mz) <= rz
  );
  if (filtered.length < 6) return null;

  // Compute span; Inventor internal database uses cm (typical span 1..30 -> scale * 10 to mm)
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of filtered) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const rawSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = rawSpan > 0 && rawSpan < 1.2 ? 1000 : rawSpan >= 1.2 && rawSpan < 26 ? 10 : 1;
  const scaled = filtered.map((p): [number, number, number] => [p[0] * scale, p[1] * scale, p[2] * scale]);

  const { positions, wireSegments } = buildMultiSliceEnvelopeFromPoints(scaled);
  return { positions, wireSegments, mode: 'point-cloud', pointCount: scaled.length };
}

/**
 * Reconstructs a layered 3D hull mesh from extracted point coordinates (convex XZ hulls across Y slices)
 * so real dimensional silhouette & aspect ratio are preserved instead of placeholder boxes.
 */
export function buildMultiSliceEnvelopeFromPoints(pts: [number, number, number][]): {
  positions: number[];
  wireSegments: number[];
} {
  if (pts.length < 4) return { positions: [], wireSegments: [] };

  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const spanY = Math.max(2, maxY - minY);
  const sliceCount = Math.min(8, Math.max(2, Math.floor(pts.length / 18)));
  const positions: number[] = [];
  const wireSegments: number[] = [];

  const convexHull2D = (points: [number, number][]): [number, number][] => {
    const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    if (sorted.length < 3) return sorted;
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
        lower.pop();
      lower.push(p);
    }
    const upper: [number, number][] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
        upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  for (let s = 0; s < sliceCount; s++) {
    const y0 = minY + (s / sliceCount) * spanY;
    const y1 = minY + ((s + 1) / sliceCount) * spanY;
    const slicePts = pts.filter((p) => p[1] >= y0 - spanY * 0.12 && p[1] <= y1 + spanY * 0.12);
    const source = slicePts.length >= 3 ? slicePts : pts;
    const hull = convexHull2D(source.map((p) => [p[0], p[2]]));
    if (hull.length < 3) continue;

    // Fan-triangulate top & bottom caps and extrude side quad strip
    let cx = 0, cz = 0;
    for (const h of hull) { cx += h[0]; cz += h[1]; }
    cx /= hull.length; cz /= hull.length;

    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      positions.push(cx, y1, cz, a[0], y1, a[1], b[0], y1, b[1]);
      positions.push(cx, y0, cz, b[0], y0, b[1], a[0], y0, a[1]);
      positions.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1]);
      positions.push(a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
      wireSegments.push(a[0], y1, a[1], b[0], y1, b[1]);
      wireSegments.push(a[0], y0, a[1], b[0], y0, b[1]);
    }
  }

  return { positions, wireSegments };
}

export async function parseIptWithOle2(
  buffer: Buffer,
  filename: string
): Promise<ServerParsedCadResult> {
  const isOle2 =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  const allTokens: string[] = [];
  const streamsToInspect: { name: string; data: Buffer }[] = [];

  if (isOle2) {
    const cfb = CFB.read(buffer, { type: 'buffer' });
    for (let i = 0; i < cfb.FileIndex.length; i++) {
      const entry = cfb.FileIndex[i];
      if (!entry || entry.type !== 2 || !entry.content || entry.content.length === 0) continue;
      const rawBuf = Buffer.from(entry.content as Uint8Array);
      streamsToInspect.push({ name: entry.name || `Stream_${i}`, data: rawBuf });
      const inflated = findEmbeddedZlibStreams(rawBuf);
      inflated.forEach((inf, idx) => {
        streamsToInspect.push({ name: `${entry.name}_zlib${idx}`, data: inf });
      });
    }
  } else {
    streamsToInspect.push({ name: 'RawIPT', data: buffer });
    findEmbeddedZlibStreams(buffer).forEach((inf, idx) => {
      streamsToInspect.push({ name: `RawIPT_zlib${idx}`, data: inf });
    });
  }

  const meshes: ParsedCadMeshPart[] = [];
  let extractionEngine = 'Autodesk Inventor OLE2 + zlib';

  for (const st of streamsToInspect) {
    const tokens = extractReadableTokens(st.data, 120);
    for (const t of tokens) {
      if (allTokens.length < 360) allTokens.push(t);
    }

    // 1) Try ACIS SAT ASCII extraction
    const asLatin = st.data.toString('latin1');
    if (
      asLatin.includes('End-of-ACIS-data') ||
      (asLatin.includes('plane-surface') && asLatin.includes('point ')) ||
      (asLatin.includes('face ') && asLatin.includes('edge '))
    ) {
      const sat = parseAcisSatGeometry(asLatin);
      if (sat && sat.positions.length >= 9) {
        const normals: number[] = [];
        for (let i = 0; i + 8 < sat.positions.length; i += 9) {
          const [nx, ny, nz] = computeTriNorm(
            sat.positions[i], sat.positions[i + 1], sat.positions[i + 2],
            sat.positions[i + 3], sat.positions[i + 4], sat.positions[i + 5],
            sat.positions[i + 6], sat.positions[i + 7], sat.positions[i + 8]
          );
          normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }
        meshes.push({
          name: `${st.name} (ACIS B-Rep)`,
          positions: sat.positions,
          normals,
          wireSegments: sat.wireSegments,
          sourceLayer: st.name,
        });
        extractionEngine = 'Inventor OLE2 + ACIS B-Rep';
      }
    }
  }

  // 2) If no ACIS SAT mesh yet, scan Graphics / Result / Model / BRep streams for Float32 indexed meshes or SAB clouds
  if (meshes.length === 0) {
    const prioritized = [...streamsToInspect].sort((a, b) => {
      const score = (n: string) =>
        /graphics|mesh|facet|brep|result|model|zlib/i.test(n) ? 0 : 1;
      return score(a.name) - score(b.name);
    });

    for (const st of prioritized) {
      if (st.data.length < 64) continue;
      const scanned = scanFloat32MeshOrCloud(st.data);
      if (scanned && scanned.positions.length >= 9) {
        const normals: number[] = [];
        for (let i = 0; i + 8 < scanned.positions.length; i += 9) {
          const [nx, ny, nz] = computeTriNorm(
            scanned.positions[i], scanned.positions[i + 1], scanned.positions[i + 2],
            scanned.positions[i + 3], scanned.positions[i + 4], scanned.positions[i + 5],
            scanned.positions[i + 6], scanned.positions[i + 7], scanned.positions[i + 8]
          );
          normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }
        meshes.push({
          name:
            scanned.mode === 'indexed-mesh'
              ? `${st.name} (Malha Inventor)`
              : `${st.name} (Nuvem SAB/B-Rep · ${scanned.pointCount} pts)`,
          positions: scanned.positions,
          normals,
          wireSegments: scanned.wireSegments,
          sourceLayer: st.name,
        });
        extractionEngine =
          scanned.mode === 'indexed-mesh'
            ? 'Inventor OLE2 Display Mesh'
            : 'Inventor OLE2 + SAB Point-Hull';
        if (meshes.length >= 4) break;
      }
    }
  }

  if (meshes.length === 0) {
    throw new Error(
      `O arquivo "${filename}" usa geometria ShapeManager binária compactada proprietária sem malha facetada ou ACIS SAT exposta neste stream OLE2 (${streamsToInspect.length} streams analisados). Exporte em .STEP/.STP no Inventor para tesselação B-Rep completa.`
    );
  }

  const totalTris = meshes.reduce((acc, m) => acc + Math.floor(m.positions.length / 9), 0);
  return {
    format: 'IPT',
    engine: extractionEngine,
    meshes,
    headerSnippet: allTokens.slice(0, 80).join(' · '),
    extractedTokens: allTokens.slice(0, 40),
    notes: `Arquivo Inventor (.IPT) decodificado via ${extractionEngine} (${streamsToInspect.length} streams OLE2/zlib · ${totalTris} triângulos extraídos dos dados reais)`,
  };
}

// ============================================================================
// LLM CAD Briefing Translator (.IPT / .STEP / .STP -> Token-Safe JSON & Brief)
// ============================================================================

export interface CadComponentBrief {
  name: string;
  sourceLayer: string;
  colorHex?: string;
  triangleCount: number;
  proportionPct: number;
  boundingBoxMm: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
    centroid: [number, number, number];
  };
  inferredRole: string;
}

export interface CadLlmBriefing {
  ok: boolean;
  filename: string;
  format: string;
  byteSize: number;
  geometryStatus:
    | 'tessellated'
    | 'metadata_only_asm_encrypted'
    | 'metadata_only_no_solids'
    | 'unreadable';
  engine: string;
  units: 'mm';
  summaryStats: {
    componentCount: number;
    totalTriangles: number;
    totalVertices: number;
    boundingBoxMm: {
      min: [number, number, number];
      max: [number, number, number];
      size: [number, number, number];
      centroid: [number, number, number];
      diagonalMm: number;
    };
    estimatedEnvelopeVolumeCm3: number;
  };
  components: CadComponentBrief[];
  metadata: {
    headerSnippet: string;
    productNames: string[];
    ole2Streams?: string[];
    extractedTokens: string[];
    inferredSegment: string;
    standardHints: string[];
    materialHints: string[];
  };
  diagnostics: {
    rawFileSafeForDirectLlmRead: boolean;
    reason: string;
    recommendedFallbackAction?: string;
  };
  recommendedMcpWorkflow: string[];
  llmSummaryText: string;
  sampleVertices?: [number, number, number][];
}

function roundVec3(v: [number, number, number]): [number, number, number] {
  return [Number(v[0].toFixed(2)), Number(v[1].toFixed(2)), Number(v[2].toFixed(2))];
}

function measurePositionsBox(positions: number[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
      size: [0, 0, 0] as [number, number, number],
      centroid: [0, 0, 0] as [number, number, number],
    };
  }
  return {
    min: roundVec3([minX, minY, minZ]),
    max: roundVec3([maxX, maxY, maxZ]),
    size: roundVec3([maxX - minX, maxY - minY, maxZ - minZ]),
    centroid: roundVec3([(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]),
  };
}

function inferComponentEngineeringRole(
  name: string,
  size: [number, number, number]
): string {
  const lower = name.toLowerCase();
  if (/bolt|screw|nut|washer|parafuso|porca|arruela|pin|pino|rivet/i.test(lower)) {
    return 'Fixador / Parafuso / Pino de Montagem';
  }
  if (/shaft|axle|eixo|spindle|tube|tubo|bengala|canela|rod|haste/i.test(lower)) {
    return 'Eixo / Tubo Cilíndrico / Elemento Linear';
  }
  if (/flange|ring|anel|crown|coroa|bearing|rolamento|collar|bucha/i.test(lower)) {
    return 'Flange / Anel / Coroa / Acoplamento Radial';
  }
  if (/bracket|suporte|plate|chapa|base|cover|tampa|housing|carcaca|frame/i.test(lower)) {
    return 'Suporte Estrutural / Chapa / Carcaça';
  }
  const sorted = [...size].sort((a, b) => a - b);
  const thin = sorted[0];
  const mid = sorted[1];
  const long = sorted[2];
  if (long > 0 && thin / long < 0.14 && mid / long > 0.28) {
    return 'Chapa / Placa / Casca Delgada';
  }
  if (mid > 0 && long / mid > 3.2 && mid / Math.max(0.1, thin) < 1.5) {
    return 'Eixo / Barra / Viga Alongada';
  }
  return 'Corpo Sólido / Bloco Estrutural';
}

function inferMetadataHints(corpus: string) {
  const lower = corpus.toLowerCase();
  let inferredSegment = 'industrial-cnc';
  const standardHints: string[] = [];
  const materialHints: string[] = [];

  if (/rockshox|fork|suspens|bicycle|bike|frame|stem|handlebar|rotor|caliper/i.test(lower)) {
    inferredSegment = 'ciclismo-mobilidade';
    standardHints.push('ISO 4210-6 (Fadiga e Impacto)', 'EN 15194');
  } else if (/bracket|wing|rib|spar|avion|aerospace|turbine|impeller|titanium/i.test(lower)) {
    inferredSegment = 'aeroespacial';
    standardHints.push('AS9100D', 'MIL-STD-810');
  } else if (/brake|chassis|knuckle|piston|engine|automotive|suspension|hub/i.test(lower)) {
    inferredSegment = 'automotivo';
    standardHints.push('IATF 16949', 'ISO 26262');
  } else if (/robot|actuator|gripper|servo|kuka|ur5|joint/i.test(lower)) {
    inferredSegment = 'robotica';
    standardHints.push('ISO 10218-1', 'ISO/TS 15066');
  } else if (/ifc|beam|column|truss|slab|bim|arch/i.test(lower)) {
    inferredSegment = 'arquitetura-bim';
    standardHints.push('ABNT NBR 8800', 'Eurocode 3');
  } else if (/implant|prosthe|medical|orthop|titanium ti-6al-4v/i.test(lower)) {
    inferredSegment = 'medico';
    standardHints.push('ISO 13485', 'ASTM F136');
  } else {
    standardHints.push('ISO 2768-mK (Tolerâncias Gerais)', 'ISO 1101 (GD&T)');
  }

  if (/6061|7075|alumin|alum[ií]nio/i.test(lower)) materialHints.push('Alumínio 6061-T6 / 7075-T6');
  if (/ti-?6al|titanium|tit[aâ]nio/i.test(lower)) materialHints.push('Titânio Ti-6Al-4V');
  if (/316l|304|steel|a[çc]o|stainless|inox|4140|1045/i.test(lower)) materialHints.push('Aço Estrutural / Inox');
  if (/carbon|cfrp|composite|fibra de carbono/i.test(lower)) materialHints.push('Compósito Fibra de Carbono');
  if (/abs|nylon|pa12|peek|pla|poly/i.test(lower)) materialHints.push('Polímero Técnico / Engenharia');

  return { inferredSegment, standardHints, materialHints };
}

function inspectStepHeaderOnly(buffer: Buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 250_000)).toString('latin1');
  const headerMatch = /HEADER;([\s\S]*?)ENDSEC;/i.exec(text);
  const productMatches = Array.from(text.matchAll(/PRODUCT\s*\(\s*'([^']+)'/gi)).map((m) => m[1]);
  const shapeReps = Array.from(
    text.matchAll(/\b(MANIFOLD_SOLID_BREP|ADVANCED_BREP_SHAPE_REPRESENTATION|SHELL_BASED_SURFACE_MODEL|FACETED_BREP)\s*\(\s*'([^']*)'/gi)
  ).map((m) => `${m[1]}:${m[2] || 'unnamed'}`);
  const units = Array.from(
    text.matchAll(/\b(SI_UNIT|CONVERSION_BASED_UNIT)\s*\(([^;]{1,80})\)/gi)
  ).map((m) => `${m[1]}(${m[2].trim()})`);

  return {
    headerSnippet: (headerMatch?.[1] || text.slice(0, 3000)).slice(0, 3500),
    productNames: Array.from(new Set(productMatches)).slice(0, 20),
    extractedTokens: Array.from(new Set([...productMatches, ...shapeReps, ...units])).slice(0, 40),
  };
}

function inspectIptMetadataOnly(buffer: Buffer) {
  const isOle2 =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  const streamNames: string[] = [];
  const tokens: string[] = [];

  if (isOle2) {
    try {
      const cfb = CFB.read(buffer, { type: 'buffer' });
      for (let i = 0; i < cfb.FileIndex.length; i++) {
        const entry = cfb.FileIndex[i];
        if (!entry) continue;
        if (entry.name) streamNames.push(entry.name);
        if (entry.type === 2 && entry.content && entry.content.length > 0) {
          const rawBuf = Buffer.from(entry.content as Uint8Array);
          for (const t of extractReadableTokens(rawBuf, 80)) {
            if (tokens.length < 80 && !tokens.includes(t)) tokens.push(t);
          }
          for (const inf of findEmbeddedZlibStreams(rawBuf).slice(0, 8)) {
            for (const t of extractReadableTokens(inf, 60)) {
              if (tokens.length < 100 && !tokens.includes(t)) tokens.push(t);
            }
          }
        }
      }
    } catch {
      // fallback to raw token extraction
    }
  }

  if (tokens.length === 0) {
    tokens.push(...extractReadableTokens(buffer, 60));
  }

  return {
    isOle2,
    ole2Streams: Array.from(new Set(streamNames)).slice(0, 40),
    extractedTokens: tokens.slice(0, 45),
    headerSnippet: tokens.slice(0, 30).join(' · '),
  };
}

export async function buildCadLlmBriefing(
  buffer: Buffer,
  filename: string,
  options?: { includeSampleVertices?: boolean }
): Promise<CadLlmBriefing> {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower).replace('.', '').toUpperCase() || 'CAD';
  const includeSampleVertices = Boolean(options?.includeSampleVertices);

  let parsed: ServerParsedCadResult | null = null;
  let parseError = '';

  if (/\.(step|stp|igs|iges|brep)$/i.test(lower)) {
    try {
      parsed = await parseStepWithOcct(buffer, filename);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  } else if (lower.endsWith('.ipt')) {
    try {
      parsed = await parseIptWithOle2(buffer, filename);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  if (parsed && parsed.meshes.length > 0) {
    let totalTriangles = 0;
    let totalVertices = 0;
    const allPositions: number[] = [];

    for (const m of parsed.meshes) {
      totalTriangles += Math.floor(m.positions.length / 9);
      totalVertices += Math.floor(m.positions.length / 3);
      for (let i = 0; i < m.positions.length; i++) {
        allPositions.push(m.positions[i]);
      }
    }

    const globalBox = measurePositionsBox(allPositions);
    const diagonalMm = Number(
      Math.hypot(globalBox.size[0], globalBox.size[1], globalBox.size[2]).toFixed(2)
    );
    const envelopeVolCm3 = Number(
      ((globalBox.size[0] * globalBox.size[1] * globalBox.size[2]) / 1000).toFixed(2)
    );

    const components: CadComponentBrief[] = parsed.meshes.slice(0, 40).map((m) => {
      const tris = Math.floor(m.positions.length / 9);
      const box = measurePositionsBox(m.positions);
      return {
        name: m.name,
        sourceLayer: m.sourceLayer,
        colorHex: m.colorHex,
        triangleCount: tris,
        proportionPct:
          totalTriangles > 0 ? Number(((tris / totalTriangles) * 100).toFixed(1)) : 0,
        boundingBoxMm: box,
        inferredRole: inferComponentEngineeringRole(m.name, box.size),
      };
    });

    const corpus = [
      filename,
      parsed.headerSnippet,
      ...parsed.extractedTokens,
      ...components.map((c) => c.name),
    ].join(' ');
    const hints = inferMetadataHints(corpus);

    const recommendedMcpWorkflow = [
      `cad_set_segment_profile({ segment: "${hints.inferredSegment}", partName: "${components[0]?.name || filename}" })`,
      'cad_run_structural_fea({ loadNewtons: 2500, showHeatmap: true })',
      'cad_evaluate_nurbs_metrics({})',
      'cad_get_scoobiii_vuc_proof({})',
    ];

    const sampleVertices: [number, number, number][] | undefined = includeSampleVertices
      ? (() => {
          const pts: [number, number, number][] = [];
          const stride = Math.max(3, Math.floor(allPositions.length / 3 / 24) * 3);
          for (let i = 0; i + 2 < allPositions.length && pts.length < 24; i += stride) {
            pts.push(roundVec3([allPositions[i], allPositions[i + 1], allPositions[i + 2]]));
          }
          return pts;
        })()
      : undefined;

    const llmSummaryText = [
      `CAD ENGINEERING BRIEFING — ${filename} (${parsed.format})`,
      `Motor: ${parsed.engine} | Unidades normalizadas: mm`,
      `Geometria: ${parsed.meshes.length} componente(s), ${totalTriangles.toLocaleString('en-US')} triângulos reais (${totalVertices.toLocaleString('en-US')} vértices omitidos para economia de tokens).`,
      `Dimensões Totais (X × Y × Z): ${globalBox.size[0]} × ${globalBox.size[1]} × ${globalBox.size[2]} mm (Diagonal: ${diagonalMm} mm | Envelope: ${envelopeVolCm3} cm³).`,
      `Segmento sugerido: ${hints.inferredSegment} | Normas: ${hints.standardHints.join(', ')}`,
      hints.materialHints.length > 0 ? `Indícios de material: ${hints.materialHints.join(', ')}` : '',
      `Componentes principais:\n${components
        .slice(0, 8)
        .map(
          (c, idx) =>
            `  ${idx + 1}. ${c.name} [${c.inferredRole}] — ${c.boundingBoxMm.size.join('×')} mm (${c.triangleCount} tris, ${c.proportionPct}%)`
        )
        .join('\n')}`,
      `Fluxo MCP recomendado: ${recommendedMcpWorkflow.join(' -> ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ok: true,
      filename,
      format: parsed.format,
      byteSize: buffer.byteLength,
      geometryStatus: 'tessellated',
      engine: parsed.engine,
      units: 'mm',
      summaryStats: {
        componentCount: parsed.meshes.length,
        totalTriangles,
        totalVertices,
        boundingBoxMm: {
          ...globalBox,
          diagonalMm,
        },
        estimatedEnvelopeVolumeCm3: envelopeVolCm3,
      },
      components,
      metadata: {
        headerSnippet: parsed.headerSnippet.slice(0, 1200),
        productNames: parsed.extractedTokens.slice(0, 15),
        extractedTokens: parsed.extractedTokens.slice(0, 35),
        inferredSegment: hints.inferredSegment,
        standardHints: hints.standardHints,
        materialHints: hints.materialHints,
      },
      diagnostics: {
        rawFileSafeForDirectLlmRead: false,
        reason:
          'Arquivo binário/B-Rep convertido em resumo estrutural compacto sem dump de arrays Float32 de vértices.',
      },
      recommendedMcpWorkflow,
      llmSummaryText,
      ...(sampleVertices ? { sampleVertices } : {}),
    };
  }

  // Fallback path: geometry could not be tessellated (e.g., encrypted Inventor ShapeManager ASM or header-only STEP)
  if (lower.endsWith('.ipt')) {
    const meta = inspectIptMetadataOnly(buffer);
    const hints = inferMetadataHints([filename, ...meta.extractedTokens].join(' '));
    const llmSummaryText = [
      `CAD METADATA BRIEFING — ${filename} (IPT / Inventor OLE2)`,
      `Status: Geometria B-Rep usa ShapeManager binário criptografado sem malha facetada ou ACIS SAT exposto.`,
      `Container OLE2 detectado: ${meta.isOle2 ? 'Sim' : 'Não'} (${meta.ole2Streams.length} streams: ${meta.ole2Streams.slice(0, 10).join(', ')})`,
      `Tokens / iProperties extraídos: ${meta.extractedTokens.slice(0, 16).join(' | ') || 'nenhum token legível'}`,
      `Ação recomendada para o Agente: Solicitar ao usuário exportação .STEP (AP214/AP203) no Autodesk Inventor para tesselação OpenCASCADE completa, ou prosseguir com estimativa paramétrica no segmento ${hints.inferredSegment}.`,
    ].join('\n');

    return {
      ok: false,
      filename,
      format: 'IPT',
      byteSize: buffer.byteLength,
      geometryStatus: 'metadata_only_asm_encrypted',
      engine: 'Inventor OLE2 Metadata Inspector',
      units: 'mm',
      summaryStats: {
        componentCount: 0,
        totalTriangles: 0,
        totalVertices: 0,
        boundingBoxMm: {
          min: [0, 0, 0],
          max: [0, 0, 0],
          size: [0, 0, 0],
          centroid: [0, 0, 0],
          diagonalMm: 0,
        },
        estimatedEnvelopeVolumeCm3: 0,
      },
      components: [],
      metadata: {
        headerSnippet: meta.headerSnippet,
        productNames: meta.extractedTokens.slice(0, 10),
        ole2Streams: meta.ole2Streams,
        extractedTokens: meta.extractedTokens,
        inferredSegment: hints.inferredSegment,
        standardHints: hints.standardHints,
        materialHints: hints.materialHints,
      },
      diagnostics: {
        rawFileSafeForDirectLlmRead: false,
        reason:
          parseError ||
          'Geometria ShapeManager proprietária sem stream ACIS SAT ou malha display exposta.',
        recommendedFallbackAction:
          'Exporte o .IPT como .STEP/.STP no Inventor e reenvie para POST /api/cad/llm-briefing para tesselação B-Rep completa via OpenCASCADE.',
      },
      recommendedMcpWorkflow: [
        `cad_set_segment_profile({ segment: "${hints.inferredSegment}" })`,
      ],
      llmSummaryText,
    };
  }

  // STEP / IGES / BREP without valid solid B-Rep
  const stepMeta = inspectStepHeaderOnly(buffer);
  const hints = inferMetadataHints([filename, stepMeta.headerSnippet, ...stepMeta.extractedTokens].join(' '));
  return {
    ok: false,
    filename,
    format: ext,
    byteSize: buffer.byteLength,
    geometryStatus: /\.(step|stp|igs|iges|brep)$/i.test(lower)
      ? 'metadata_only_no_solids'
      : 'unreadable',
    engine: 'ISO-10303 Header Fallback Inspector',
    units: 'mm',
    summaryStats: {
      componentCount: 0,
      totalTriangles: 0,
      totalVertices: 0,
      boundingBoxMm: {
        min: [0, 0, 0],
        max: [0, 0, 0],
        size: [0, 0, 0],
        centroid: [0, 0, 0],
        diagonalMm: 0,
      },
      estimatedEnvelopeVolumeCm3: 0,
    },
    components: [],
    metadata: {
      headerSnippet: stepMeta.headerSnippet,
      productNames: stepMeta.productNames,
      extractedTokens: stepMeta.extractedTokens,
      inferredSegment: hints.inferredSegment,
      standardHints: hints.standardHints,
      materialHints: hints.materialHints,
    },
    diagnostics: {
      rawFileSafeForDirectLlmRead: false,
      reason:
        parseError ||
        'Arquivo não contém sólidos B-Rep tesseláveis ou formato não suportado por este briefing server-side.',
      recommendedFallbackAction:
        'Verifique se o STEP contém entidades MANIFOLD_SOLID_BREP / SHELL_BASED_SURFACE_MODEL ou envie para importação na aba Arquivos CAD.',
    },
    recommendedMcpWorkflow: [
      `cad_set_segment_profile({ segment: "${hints.inferredSegment}" })`,
    ],
    llmSummaryText: [
      `CAD HEADER BRIEFING — ${filename} (${ext})`,
      `Status: ${parseError || 'Sem sólidos B-Rep tesseláveis detectados.'}`,
      `Produtos STEP detectados: ${stepMeta.productNames.join(', ') || 'nenhum'}`,
      `Entidades/Tokens: ${stepMeta.extractedTokens.slice(0, 15).join(' · ') || 'nenhum'}`,
    ].join('\n'),
  };
}
