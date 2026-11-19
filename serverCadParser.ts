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

  // Measure raw span across all vertices to detect meter-exported files (< 6 units)
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
  const unitScale = rawSpan > 0 && rawSpan < 6 ? 1000 : 1;

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
    if (buf[i] === 0x78 && (buf[i + 1] === 0x9c || buf[i + 1] === 0xda || buf[i + 1] === 0x5e || buf[i + 1] === 0x01)) {
      try {
        const slice = buf.subarray(i, Math.min(buf.length, i + 4_000_000));
        const out = zlib.inflateSync(slice, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        if (out && out.length >= 32) {
          decompressed.push(out);
          i += 16;
        }
      } catch {
        // Not a valid zlib stream at this offset
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
  const lines = satText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 5) return null;

  // ACIS line 2 gives scale mm per model unit (Inventor uses 10 mm/cm)
  let unitScale = 1;
  const headerFields = lines[1]?.split(/\s+/) ?? [];
  const maybeScale = parseFloat(headerFields[0] ?? '1');
  if (Number.isFinite(maybeScale) && maybeScale > 0 && maybeScale <= 1000) {
    unitScale = maybeScale;
  }

  const records = new Map<number, { type: string; body: string }>();
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'End-of-ACIS-data') break;
    const match = /^(-?\d+)\s+([a-zA-Z0-9_-]+)\s+(.*)$/.exec(line);
    if (match) {
      records.set(parseInt(match[1], 10), { type: match[2], body: match[3] });
    } else if (/^[a-zA-Z]/.test(line)) {
      const sp = line.indexOf(' ');
      if (sp > 0) {
        records.set(i - 3, { type: line.slice(0, sp), body: line.slice(sp + 1) });
      }
    }
  }

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

  // Extract all points directly as fallback point cloud + walk faces/loops
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
      // coedge fields typically: nextCoedge, prevCoedge, partner, edge, sense...
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

  return positions.length >= 9 ? { positions, wireSegments, unitScale, faceCount } : null;
}

function scanFloat32MeshOrCloud(buf: Buffer): {
  positions: number[];
  wireSegments: number[];
  mode: 'indexed-mesh' | 'point-cloud';
  pointCount: number;
} | null {
  // Scan 4-byte aligned IEEE-754 float32 triples (and double float64 triples for ACIS SAB)
  const isPlausibleCoord = (v: number) =>
    Number.isFinite(v) && !Number.isNaN(v) && (v === 0 || (Math.abs(v) >= 1e-4 && Math.abs(v) <= 50000));

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // 1) Try to find an explicit indexed float32 mesh block (V vertices followed by T uint32/uint16 triangles)
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
        for (let i = 0; i < vCount; i++) {
          const x = view.getFloat32(p, true);
          const y = view.getFloat32(p + 4, true);
          const z = view.getFloat32(p + 8, true);
          if (!isPlausibleCoord(x) || !isPlausibleCoord(y) || !isPlausibleCoord(z)) {
            allValid = false;
            break;
          }
          verts.push([x, z, -y]);
          p += 12;
        }
        if (allValid && p + 4 <= buf.length) {
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
              positions.push(...verts[a], ...verts[b], ...verts[c]);
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

  // 2) Extract dense finite Float64 (ACIS SAB) or Float32 (Inventor Graphics) coordinate triples
  const collected: [number, number, number][] = [];
  for (let off = 0; off + 24 <= Math.min(buf.length, 600_000); off += 8) {
    const x = view.getFloat64(off, true);
    const y = view.getFloat64(off + 8, true);
    const z = view.getFloat64(off + 16, true);
    if (
      Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
      Math.abs(x) >= 0.01 && Math.abs(x) <= 2000 &&
      Math.abs(y) >= 0.01 && Math.abs(y) <= 2000 &&
      Math.abs(z) >= 0.01 && Math.abs(z) <= 2000 &&
      Math.abs(x) + Math.abs(y) + Math.abs(z) > 0.2
    ) {
      collected.push([x, z, -y]);
    }
  }

  if (collected.length < 12) {
    for (let off = 0; off + 12 <= Math.min(buf.length, 600_000); off += 4) {
      const x = view.getFloat32(off, true);
      const y = view.getFloat32(off + 4, true);
      const z = view.getFloat32(off + 8, true);
      if (
        Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
        Math.abs(x) >= 0.05 && Math.abs(x) <= 2000 &&
        Math.abs(y) >= 0.05 && Math.abs(y) <= 2000 &&
        Math.abs(z) >= 0.05 && Math.abs(z) <= 2000
      ) {
        collected.push([x, z, -y]);
      }
    }
  }

  if (collected.length < 8) return null;

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
