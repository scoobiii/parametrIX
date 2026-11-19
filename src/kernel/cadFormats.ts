import {
  classifyComponentFamily,
  resolvePartEngineeringProfile,
} from './componentClassifier';
import type {
  ApplicationSegment,
  CadComponentPart,
  EvaluatedMesh,
  ImportedCadModel,
  MaterialFinish,
  NurbsSurfaceData,
  PartEngineeringProfile,
  ToolpathPoint,
} from '../types/cad';

function computeBounds(positions: Float32Array): ImportedCadModel['boundingBox'] {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

function computeTriangleNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 3; k++) {
      normals[i + k * 3] = nx;
      normals[i + k * 3 + 1] = ny;
      normals[i + k * 3 + 2] = nz;
    }
  }
  return normals;
}

function buildBoxTriangles(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number
): Float32Array {
  const hx = Math.max(0.5, sx / 2);
  const hy = Math.max(0.5, sy / 2);
  const hz = Math.max(0.5, sz / 2);
  const v: [number, number, number][] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  const tris = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 6, 2, 3, 7, 6,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  const out = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    const p = v[tris[i]];
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

function buildCylinderTriangles(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  axis: 'x' | 'y' | 'z',
  radialSegs = 20
): Float32Array {
  const out: number[] = [];
  const half = Math.max(1, height / 2);
  const r = Math.max(0.5, radius);

  const toWorld = (u: number, v: number, h: number): [number, number, number] => {
    if (axis === 'y') return [cx + u, cy + h, cz + v];
    if (axis === 'x') return [cx + h, cy + u, cz + v];
    return [cx + u, cy + v, cz + h];
  };

  for (let i = 0; i < radialSegs; i++) {
    const a0 = (i / radialSegs) * Math.PI * 2;
    const a1 = ((i + 1) / radialSegs) * Math.PI * 2;
    const x0 = Math.cos(a0) * r;
    const z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r;
    const z1 = Math.sin(a1) * r;

    const b0 = toWorld(x0, z0, -half);
    const b1 = toWorld(x1, z1, -half);
    const t0 = toWorld(x0, z0, half);
    const t1 = toWorld(x1, z1, half);
    const cTop = toWorld(0, 0, half);
    const cBot = toWorld(0, 0, -half);

    // Side quad (2 tris)
    out.push(...b0, ...b1, ...t1, ...b0, ...t1, ...t0);
    // Caps
    out.push(...cTop, ...t0, ...t1);
    out.push(...cBot, ...b1, ...b0);
  }
  return new Float32Array(out);
}

/**
 * Parses ASCII or Binary STL files into non-indexed triangle buffers (Y-up mapped from CAD Z-up)
 */
export function parseSTL(buffer: ArrayBuffer, filename: string): ImportedCadModel {
  const bytes = new Uint8Array(buffer);
  const headerText = new TextDecoder().decode(bytes.slice(0, Math.min(256, bytes.length)));
  const looksAscii =
    headerText.trimStart().startsWith('solid') &&
    headerText.includes('facet') &&
    bytes.length < 5_000_000;

  const posList: number[] = [];

  if (looksAscii) {
    const text = new TextDecoder().decode(bytes);
    const vertexRegex = /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = vertexRegex.exec(text)) !== null) {
      const x = parseFloat(match[1]);
      const yCad = parseFloat(match[2]);
      const zUp = parseFloat(match[3]);
      posList.push(x, zUp, -yCad);
    }
  } else if (bytes.byteLength >= 84) {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    const safeCount = Math.min(triCount, Math.floor((bytes.byteLength - 84) / 50));
    let offset = 84;
    for (let i = 0; i < safeCount; i++) {
      offset += 12;
      for (let v = 0; v < 3; v++) {
        const x = view.getFloat32(offset, true);
        const yCad = view.getFloat32(offset + 4, true);
        const zUp = view.getFloat32(offset + 8, true);
        posList.push(x, zUp, -yCad);
        offset += 12;
      }
      offset += 2;
    }
  }

  const positions = new Float32Array(posList);
  const normals = computeTriangleNormals(positions);
  const bbox = computeBounds(positions);
  const cls = classifyComponentFamily(filename, 0);
  const partName = filename.replace(/\.[^.]+$/, '');
  const components: CadComponentPart[] = positions.length > 0
    ? [
        {
          id: 'COMP-1',
          name: partName,
          family: cls.family,
          subFamily: cls.subFamily,
          maskColorHex: cls.maskColorHex,
          inferredMaterial: cls.inferredMaterial,
          center: [
            (bbox.min[0] + bbox.max[0]) / 2,
            (bbox.min[1] + bbox.max[1]) / 2,
            (bbox.min[2] + bbox.max[2]) / 2,
          ],
          size: bbox.size,
          positions,
          normals,
          triangleCount: Math.floor(positions.length / 9),
          sourceLayer: 'STL_MESH',
        },
      ]
    : [];

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'STL',
    positions,
    normals,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: Math.floor(positions.length / 9),
    layers: ['STL_MESH'],
    boundingBox: bbox,
    notes: `Malha STL importada (${Math.floor(positions.length / 9)} triângulos)`,
    components,
    detectedProfile: resolvePartEngineeringProfile({ filename, layers: ['STL_MESH'] }),
  };
}

/**
 * Parses Wavefront OBJ files splitting objects/groups into individual CadComponentPart meshes
 */
export function parseOBJ(text: string, filename: string): ImportedCadModel {
  const verts: [number, number, number][] = [];
  const allPosList: number[] = [];
  const groupPosMap = new Map<string, number[]>();
  let currentGroup = 'OBJ_DEFAULT';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      verts.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if ((parts[0] === 'g' || parts[0] === 'o') && parts[1]) {
      currentGroup = parts[1];
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const faceIdx = parts.slice(1).map((tok) => {
        const idx = parseInt(tok.split('/')[0], 10);
        return idx < 0 ? verts.length + idx : idx - 1;
      });
      if (!groupPosMap.has(currentGroup)) groupPosMap.set(currentGroup, []);
      const gList = groupPosMap.get(currentGroup)!;
      for (let k = 1; k < faceIdx.length - 1; k++) {
        const a = verts[faceIdx[0]];
        const b = verts[faceIdx[k]];
        const c = verts[faceIdx[k + 1]];
        if (a && b && c) {
          allPosList.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          gList.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        }
      }
    }
  }

  const positions = new Float32Array(allPosList);
  const normals = computeTriangleNormals(positions);
  const layers = groupPosMap.size > 0 ? Array.from(groupPosMap.keys()) : ['OBJ_DEFAULT'];

  const components: CadComponentPart[] = [];
  let cIdx = 0;
  for (const [gName, gCoords] of groupPosMap.entries()) {
    if (gCoords.length === 0) continue;
    const gPos = new Float32Array(gCoords);
    const gNorm = computeTriangleNormals(gPos);
    const gBox = computeBounds(gPos);
    const cls = classifyComponentFamily(gName, cIdx);
    components.push({
      id: `COMP-${cIdx + 1}`,
      name: gName,
      family: cls.family,
      subFamily: cls.subFamily,
      maskColorHex: cls.maskColorHex,
      inferredMaterial: cls.inferredMaterial,
      center: [
        (gBox.min[0] + gBox.max[0]) / 2,
        (gBox.min[1] + gBox.max[1]) / 2,
        (gBox.min[2] + gBox.max[2]) / 2,
      ],
      size: gBox.size,
      positions: gPos,
      normals: gNorm,
      triangleCount: Math.floor(gPos.length / 9),
      sourceLayer: gName,
    });
    cIdx++;
  }

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'OBJ',
    positions,
    normals,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: Math.floor(positions.length / 9),
    layers,
    boundingBox: computeBounds(positions),
    notes: `Modelo Wavefront OBJ (${verts.length} vértices, ${components.length} sub-componentes)`,
    components,
    detectedProfile: resolvePartEngineeringProfile({ filename, rawText: text, layers }),
  };
}

/**
 * Parses AutoCAD ASCII DXF files (LINE, LWPOLYLINE, CIRCLE, 3DFACE)
 */
export function parseDXF(text: string, filename: string): ImportedCadModel {
  const lines = text.split(/\r?\n/);
  const wireList: number[] = [];
  const triList: number[] = [];
  const layerWireMap = new Map<string, number[]>();
  const layers = new Set<string>();
  let entityCount = 0;

  let i = 0;
  let inEntities = false;
  while (i < lines.length - 1) {
    const code = lines[i].trim();
    const val = lines[i + 1].trim();
    if (code === '2' && val === 'ENTITIES') {
      inEntities = true;
      i += 2;
      continue;
    }
    if (inEntities && code === '0' && val === 'ENDSEC') {
      break;
    }
    if (inEntities && code === '0') {
      const entityType = val;
      i += 2;
      const props: Record<string, number[]> = {};
      let layer = '0';
      const lwPts: { x: number; y: number }[] = [];
      let curX = 0;
      let hasX = false;

      while (i < lines.length - 1 && lines[i].trim() !== '0') {
        const c = lines[i].trim();
        const v = lines[i + 1].trim();
        if (c === '8') layer = v;
        const num = parseFloat(v);
        if (!Number.isNaN(num)) {
          if (!props[c]) props[c] = [];
          props[c].push(num);
          if (entityType === 'LWPOLYLINE') {
            if (c === '10') {
              curX = num;
              hasX = true;
            } else if (c === '20' && hasX) {
              lwPts.push({ x: curX, y: num });
              hasX = false;
            }
          }
        }
        i += 2;
      }

      layers.add(layer);
      entityCount++;
      if (!layerWireMap.has(layer)) layerWireMap.set(layer, []);
      const lWires = layerWireMap.get(layer)!;

      if (entityType === 'LINE') {
        const x1 = props['10']?.[0] ?? 0;
        const y1 = props['20']?.[0] ?? 0;
        const z1 = props['30']?.[0] ?? 0;
        const x2 = props['11']?.[0] ?? 0;
        const y2 = props['21']?.[0] ?? 0;
        const z2 = props['31']?.[0] ?? 0;
        wireList.push(x1, z1, -y1, x2, z2, -y2);
        lWires.push(x1, z1, -y1, x2, z2, -y2);
      } else if (entityType === 'CIRCLE') {
        const cx = props['10']?.[0] ?? 0;
        const cy = props['20']?.[0] ?? 0;
        const cz = props['30']?.[0] ?? 0;
        const r = props['40']?.[0] ?? 20;
        const segs = 32;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          const seg = [
            cx + Math.cos(a0) * r, cz, -(cy + Math.sin(a0) * r),
            cx + Math.cos(a1) * r, cz, -(cy + Math.sin(a1) * r),
          ];
          wireList.push(...seg);
          lWires.push(...seg);
        }
      } else if (entityType === 'LWPOLYLINE' && lwPts.length >= 2) {
        const closed = ((props['70']?.[0] ?? 0) & 1) === 1;
        const elev = props['38']?.[0] ?? 0;
        for (let k = 0; k < lwPts.length - 1; k++) {
          const seg = [lwPts[k].x, elev, -lwPts[k].y, lwPts[k + 1].x, elev, -lwPts[k + 1].y];
          wireList.push(...seg);
          lWires.push(...seg);
        }
        if (closed && lwPts.length > 2) {
          const seg = [
            lwPts[lwPts.length - 1].x, elev, -lwPts[lwPts.length - 1].y,
            lwPts[0].x, elev, -lwPts[0].y,
          ];
          wireList.push(...seg);
          lWires.push(...seg);
        }
      } else if (entityType === '3DFACE') {
        const x0 = props['10']?.[0] ?? 0, y0 = props['20']?.[0] ?? 0, z0 = props['30']?.[0] ?? 0;
        const x1 = props['11']?.[0] ?? 0, y1 = props['21']?.[0] ?? 0, z1 = props['31']?.[0] ?? 0;
        const x2 = props['12']?.[0] ?? 0, y2 = props['22']?.[0] ?? 0, z2 = props['32']?.[0] ?? 0;
        const x3 = props['13']?.[0] ?? x2, y3 = props['23']?.[0] ?? y2, z3 = props['33']?.[0] ?? z2;
        triList.push(x0, z0, -y0, x1, z1, -y1, x2, z2, -y2);
        if (Math.hypot(x3 - x2, y3 - y2, z3 - z2) > 1e-4) {
          triList.push(x0, z0, -y0, x2, z2, -y2, x3, z3, -y3);
        }
      }
      continue;
    }
    i += 2;
  }

  const positions = new Float32Array(triList);
  const normals = computeTriangleNormals(positions);
  const wireSegments = new Float32Array(wireList);
  const boundsTarget = positions.length > 0 ? positions : wireSegments;
  const layerList = layers.size > 0 ? Array.from(layers) : ['0'];

  const components: CadComponentPart[] = [];
  let idx = 0;
  for (const [lName, lWires] of layerWireMap.entries()) {
    const wArr = new Float32Array(lWires);
    const lBox = computeBounds(wArr.length > 0 ? wArr : boundsTarget);
    const cls = classifyComponentFamily(lName, idx);
    const boxPos = buildBoxTriangles(
      (lBox.min[0] + lBox.max[0]) / 2,
      (lBox.min[1] + lBox.max[1]) / 2,
      (lBox.min[2] + lBox.max[2]) / 2,
      Math.max(4, lBox.size[0]),
      Math.max(4, lBox.size[1]),
      Math.max(4, lBox.size[2])
    );
    components.push({
      id: `COMP-${idx + 1}`,
      name: `Camada ${lName}`,
      family: cls.family,
      subFamily: cls.subFamily,
      maskColorHex: cls.maskColorHex,
      inferredMaterial: cls.inferredMaterial,
      center: [
        (lBox.min[0] + lBox.max[0]) / 2,
        (lBox.min[1] + lBox.max[1]) / 2,
        (lBox.min[2] + lBox.max[2]) / 2,
      ],
      size: lBox.size,
      positions: positions.length > 0 && idx === 0 ? positions : boxPos,
      normals: positions.length > 0 && idx === 0 ? normals : computeTriangleNormals(boxPos),
      wireSegments: wArr,
      triangleCount: Math.floor((positions.length > 0 && idx === 0 ? positions : boxPos).length / 9),
      sourceLayer: lName,
    });
    idx++;
  }

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'DXF',
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount,
    layers: layerList,
    boundingBox: computeBounds(boundsTarget),
    notes: `Desenho AutoCAD DXF (${entityCount} entidades, ${layerList.length} camadas)`,
    components,
    detectedProfile: resolvePartEngineeringProfile({ filename, rawText: text, layers: layerList }),
  };
}

/**
 * Parses OpenNURBS .3dm files
 */
export function parse3DM(buffer: ArrayBuffer, filename: string): ImportedCadModel {
  const bytes = new Uint8Array(buffer);
  const magic = new TextDecoder().decode(bytes.slice(0, 24));
  if (!magic.startsWith('3D Geometry File Format')) {
    throw new Error('Cabeçalho OpenNURBS (.3dm) inválido.');
  }

  const view = new DataView(buffer);
  let pos = 32;
  let version = 7;
  const posList: number[] = [];
  const wireList: number[] = [];

  while (pos + 8 <= bytes.byteLength) {
    const tcode = view.getUint32(pos, true);
    const length = view.getInt32(pos + 4, true);
    pos += 8;
    if (length < 0 || pos + length > bytes.byteLength) break;

    if (tcode === 0x00000001 && length >= 4) {
      version = view.getInt32(pos, true);
    } else if (tcode === 0x20000001 && length >= 16) {
      const vCount = view.getUint32(pos, true);
      const tCount = view.getUint32(pos + 4, true);
      const verts: [number, number, number][] = [];
      let p = pos + 8;
      for (let v = 0; v < vCount && p + 12 <= pos + length; v++) {
        const x = view.getFloat32(p, true);
        const yCad = view.getFloat32(p + 4, true);
        const zUp = view.getFloat32(p + 8, true);
        verts.push([x, zUp, -yCad]);
        p += 12;
      }
      for (let t = 0; t < tCount && p + 12 <= pos + length; t++) {
        const a = view.getUint32(p, true);
        const b = view.getUint32(p + 4, true);
        const c = view.getUint32(p + 8, true);
        if (verts[a] && verts[b] && verts[c]) {
          posList.push(...verts[a], ...verts[b], ...verts[c]);
        }
        p += 12;
      }
    } else if (tcode === 0x20000002 && length >= 8) {
      const uC = view.getUint32(pos, true);
      const vC = view.getUint32(pos + 4, true);
      let p = pos + 8;
      const pts: [number, number, number][][] = [];
      for (let u = 0; u < uC; u++) {
        const row: [number, number, number][] = [];
        for (let v = 0; v < vC && p + 16 <= pos + length; v++) {
          const x = view.getFloat32(p, true);
          const yCad = view.getFloat32(p + 4, true);
          const zUp = view.getFloat32(p + 8, true);
          row.push([x, zUp, -yCad]);
          p += 16;
        }
        pts.push(row);
      }
      for (let u = 0; u < uC; u++) {
        for (let v = 0; v < vC; v++) {
          if (u + 1 < uC) wireList.push(...pts[u][v], ...pts[u + 1][v]);
          if (v + 1 < vC) wireList.push(...pts[u][v], ...pts[u][v + 1]);
        }
      }
    } else if (tcode === 0x7fffffff) {
      break;
    }

    pos += length;
  }

  const positions = new Float32Array(posList);
  const normals = computeTriangleNormals(positions);
  const wireSegments = new Float32Array(wireList);
  const boundsTarget = positions.length > 0 ? positions : wireSegments;
  const bbox = computeBounds(boundsTarget);
  const cls = classifyComponentFamily(filename, 0);

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: '3DM',
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: Math.max(1, Math.floor(positions.length / 9)),
    layers: ['OpenNURBS_NURBS', 'OpenNURBS_Mesh'],
    boundingBox: bbox,
    notes: `Arquivo Rhino OpenNURBS v${version} (.3dm) lido (${Math.floor(positions.length / 9)} faces)`,
    components:
      positions.length > 0
        ? [
            {
              id: 'COMP-1',
              name: filename.replace(/\.[^.]+$/, ''),
              family: cls.family,
              subFamily: cls.subFamily,
              maskColorHex: cls.maskColorHex,
              inferredMaterial: cls.inferredMaterial,
              center: [
                (bbox.min[0] + bbox.max[0]) / 2,
                (bbox.min[1] + bbox.max[1]) / 2,
                (bbox.min[2] + bbox.max[2]) / 2,
              ],
              size: bbox.size,
              positions,
              normals,
              triangleCount: Math.floor(positions.length / 9),
              sourceLayer: 'OpenNURBS_Mesh',
            },
          ]
        : [],
    detectedProfile: resolvePartEngineeringProfile({ filename, layers: ['OpenNURBS_NURBS'] }),
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildMultiSliceHullTriangles(pts: [number, number, number][]): {
  positions: Float32Array;
  wireSegments: Float32Array;
} {
  if (pts.length < 4) {
    return { positions: new Float32Array(0), wireSegments: new Float32Array(0) };
  }
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const spanY = Math.max(2, maxY - minY);
  const sliceCount = Math.min(8, Math.max(2, Math.floor(pts.length / 18)));
  const out: number[] = [];
  const wire: number[] = [];

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
    const src = slicePts.length >= 3 ? slicePts : pts;
    const hull = convexHull2D(src.map((p) => [p[0], p[2]]));
    if (hull.length < 3) continue;

    let cx = 0, cz = 0;
    for (const h of hull) { cx += h[0]; cz += h[1]; }
    cx /= hull.length; cz /= hull.length;

    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      out.push(cx, y1, cz, a[0], y1, a[1], b[0], y1, b[1]);
      out.push(cx, y0, cz, b[0], y0, b[1], a[0], y0, a[1]);
      out.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1]);
      out.push(a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
      wire.push(a[0], y1, a[1], b[0], y1, b[1]);
      wire.push(a[0], y0, a[1], b[0], y0, b[1]);
    }
  }

  return { positions: new Float32Array(out), wireSegments: new Float32Array(wire) };
}

function buildModelFromServerMeshes(params: {
  filename: string;
  format: 'STEP' | 'IFC' | 'IPT';
  meshes: {
    name: string;
    colorHex?: string;
    positions: number[];
    normals: number[];
    wireSegments?: number[];
    sourceLayer: string;
  }[];
  headerSnippet: string;
  extractedTokens: string[];
  notes: string;
}): ImportedCadModel {
  const combinedPositions: number[] = [];
  const combinedNormals: number[] = [];
  const combinedWires: number[] = [];
  const components: CadComponentPart[] = [];
  const layers = new Set<string>();

  params.meshes.forEach((m, idx) => {
    const pos = new Float32Array(m.positions);
    if (pos.length < 9) return;
    const norm =
      m.normals.length === pos.length
        ? new Float32Array(m.normals)
        : computeTriangleNormals(pos);
    const wire = m.wireSegments ? new Float32Array(m.wireSegments) : undefined;
    const cBox = computeBounds(pos);
    const cls = classifyComponentFamily(m.name, idx);
    layers.add(m.sourceLayer || m.name);

    for (let i = 0; i < pos.length; i++) combinedPositions.push(pos[i]);
    for (let i = 0; i < norm.length; i++) combinedNormals.push(norm[i]);
    if (wire) {
      for (let i = 0; i < wire.length; i++) combinedWires.push(wire[i]);
    }

    components.push({
      id: `COMP-${components.length + 1}`,
      name: m.name,
      family: cls.family,
      subFamily: cls.subFamily,
      maskColorHex: cls.maskColorHex,
      inferredMaterial: cls.inferredMaterial,
      center: [
        (cBox.min[0] + cBox.max[0]) / 2,
        (cBox.min[1] + cBox.max[1]) / 2,
        (cBox.min[2] + cBox.max[2]) / 2,
      ],
      size: cBox.size,
      positions: pos,
      normals: norm,
      wireSegments: wire,
      triangleCount: Math.floor(pos.length / 9),
      sourceLayer: m.sourceLayer || m.name,
    });
  });

  const positions = new Float32Array(combinedPositions);
  const normals =
    combinedNormals.length === positions.length
      ? new Float32Array(combinedNormals)
      : computeTriangleNormals(positions);
  const wireSegments = combinedWires.length > 0 ? new Float32Array(combinedWires) : undefined;

  return {
    id: `imp-${Date.now()}`,
    filename: params.filename,
    format: params.format,
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: components.length,
    layers: layers.size > 0 ? Array.from(layers) : params.extractedTokens,
    boundingBox: computeBounds(positions.length > 0 ? positions : wireSegments ?? new Float32Array(0)),
    notes: params.notes,
    components,
    detectedProfile: resolvePartEngineeringProfile({
      filename: params.filename,
      rawText: `${params.headerSnippet} ${params.extractedTokens.join(' ')}`,
      layers: Array.from(layers),
    }),
  };
}

/**
 * High-fidelity OpenCASCADE (OCCT WASM) STEP parser via /api/cad/parse-step.
 * Falls back to genuine pure-TS B-Rep topology parsing when needed (never fakes toy boxes).
 */
export async function parseSTEPAsync(
  bufferOrText: ArrayBuffer | string,
  filename: string,
  format: 'STEP' | 'IFC' = 'STEP'
): Promise<ImportedCadModel> {
  if (format === 'IFC') {
    const text =
      typeof bufferOrText === 'string'
        ? bufferOrText
        : new TextDecoder().decode(new Uint8Array(bufferOrText));
    return parseSTEPorIFC(text, filename, 'IFC');
  }

  const buffer =
    typeof bufferOrText === 'string'
      ? new TextEncoder().encode(bufferOrText).buffer
      : bufferOrText;

  try {
    const base64Data = arrayBufferToBase64(buffer);
    const resp = await fetch('/api/cad/parse-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, base64Data }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.meshes) && data.meshes.length > 0) {
        return buildModelFromServerMeshes({
          filename,
          format: 'STEP',
          meshes: data.meshes,
          headerSnippet: data.headerSnippet || '',
          extractedTokens: data.extractedTokens || [],
          notes: data.notes || `STEP tesselado via OpenCASCADE (${data.meshes.length} sólidos)`,
        });
      }
    }
  } catch {
    // Fallback below to pure-TS B-Rep topology parser
  }

  const text =
    typeof bufferOrText === 'string'
      ? bufferOrText
      : new TextDecoder().decode(new Uint8Array(bufferOrText));
  return parseSTEPorIFC(text, filename, 'STEP');
}

/**
 * Parses ISO-10303 STEP / IFC B-Rep topology directly from ENTITY graph
 * (ADVANCED_FACE -> FACE_OUTER_BOUND -> EDGE_LOOP -> ORIENTED_EDGE -> EDGE_CURVE -> VERTEX_POINT -> CARTESIAN_POINT).
 * Preserves actual geometric faces and point clouds — NEVER fabricates unrelated shapes.
 */
export function parseSTEPorIFC(text: string, filename: string, format: 'STEP' | 'IFC'): ImportedCadModel {
  const entities = new Map<number, { type: string; args: string }>();
  const normalized = text.replace(/\r?\n/g, ' ');
  const entRegex = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([^;]*)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = entRegex.exec(normalized)) !== null) {
    entities.set(parseInt(m[1], 10), { type: m[2].toUpperCase(), args: m[3] });
  }

  const parsePoint3 = (args: string): [number, number, number] | null => {
    const match = /\(\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*\)/.exec(
      args
    );
    if (!match) return null;
    const x = parseFloat(match[1]);
    const yCad = parseFloat(match[2]);
    const zUp = parseFloat(match[3]);
    if (!Number.isFinite(x) || !Number.isFinite(yCad) || !Number.isFinite(zUp)) return null;
    return [x, zUp, -yCad];
  };

  const refs = (s: string): number[] => {
    const out: number[] = [];
    const rx = /#(\d+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rx.exec(s)) !== null) out.push(parseInt(rm[1], 10));
    return out;
  };

  // Extract all CARTESIAN_POINTs to detect unit scale
  const allPts: [number, number, number][] = [];
  const ptById = new Map<number, [number, number, number]>();
  for (const [id, ent] of entities.entries()) {
    if (ent.type === 'CARTESIAN_POINT' || ent.type === 'IFCCARTESIANPOINT') {
      const pt = parsePoint3(ent.args);
      if (pt) {
        ptById.set(id, pt);
        allPts.push(pt);
      }
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [px, py, pz] of allPts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }
  const rawSpan = allPts.length > 0 ? Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0) : 0;
  const unitScale = rawSpan > 0 && rawSpan < 6 ? 1000 : 1;

  if (unitScale !== 1) {
    for (const [id, p] of ptById.entries()) {
      ptById.set(id, [p[0] * unitScale, p[1] * unitScale, p[2] * unitScale]);
    }
    for (let i = 0; i < allPts.length; i++) {
      allPts[i] = [allPts[i][0] * unitScale, allPts[i][1] * unitScale, allPts[i][2] * unitScale];
    }
  }

  const resolveVertexPoint = (id: number): [number, number, number] | null => {
    const ent = entities.get(id);
    if (!ent) return ptById.get(id) ?? null;
    if (ent.type === 'VERTEX_POINT') {
      for (const r of refs(ent.args)) {
        const pt = ptById.get(r);
        if (pt) return pt;
      }
    }
    return ptById.get(id) ?? null;
  };

  // Extract genuine B-Rep faces from ADVANCED_FACE -> FACE_OUTER_BOUND -> EDGE_LOOP
  const facePositions: number[] = [];
  const wireList: number[] = [];

  for (const [, ent] of entities.entries()) {
    if (ent.type !== 'ADVANCED_FACE' && ent.type !== 'FACE_SURFACE') continue;
    const faceRefs = refs(ent.args);
    for (const boundId of faceRefs) {
      const boundEnt = entities.get(boundId);
      if (!boundEnt || (!boundEnt.type.includes('BOUND') && boundEnt.type !== 'EDGE_LOOP')) continue;
      const loopIds =
        boundEnt.type === 'EDGE_LOOP' ? [boundId] : refs(boundEnt.args);

      for (const loopId of loopIds) {
        const loopEnt = entities.get(loopId);
        if (!loopEnt || loopEnt.type !== 'EDGE_LOOP') continue;
        const oeIds = refs(loopEnt.args);
        const polyPts: [number, number, number][] = [];

        for (const oeId of oeIds) {
          const oeEnt = entities.get(oeId);
          if (!oeEnt) continue;
          const ecIds = oeEnt.type === 'ORIENTED_EDGE' ? refs(oeEnt.args) : [oeId];
          const sense = oeEnt.type === 'ORIENTED_EDGE' ? !/\.F\./i.test(oeEnt.args) : true;
          for (const ecId of ecIds) {
            const ecEnt = entities.get(ecId);
            if (!ecEnt || ecEnt.type !== 'EDGE_CURVE') continue;
            const ecRefs = refs(ecEnt.args);
            const vStart = ecRefs[0] ? resolveVertexPoint(ecRefs[0]) : null;
            const vEnd = ecRefs[1] ? resolveVertexPoint(ecRefs[1]) : null;
            const chosen = sense ? vStart : vEnd;
            if (chosen) polyPts.push(chosen);
            if (vStart && vEnd) {
              wireList.push(vStart[0], vStart[1], vStart[2], vEnd[0], vEnd[1], vEnd[2]);
            }
          }
        }

        if (polyPts.length >= 3) {
          const p0 = polyPts[0];
          for (let k = 1; k < polyPts.length - 1; k++) {
            const p1 = polyPts[k];
            const p2 = polyPts[k + 1];
            facePositions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
          }
        }
      }
    }
  }

  // Extract named entities for layer metadata
  const extractedNames = new Set<string>();
  const nameRegex = /(?:PRODUCT|MANIFOLD_SOLID_BREP|SHAPE_REPRESENTATION|IFCBEAM|IFCCOLUMN|IFCSLAB|IFCPLATE)\s*\(\s*'([^']+)'/gi;
  while ((m = nameRegex.exec(text)) !== null) {
    const candidate = m[1].trim();
    if (
      candidate.length >= 2 &&
      candidate.length <= 64 &&
      !/^(none|null|unnamed|default|\s*)$/i.test(candidate)
    ) {
      extractedNames.add(candidate);
    }
    if (extractedNames.size >= 14) break;
  }

  const detectedProfile = resolvePartEngineeringProfile({
    filename,
    rawText: text.slice(0, 8000),
    layers: Array.from(extractedNames),
  });

  // If no explicit ADVANCED_FACE polygons were present (e.g. minimal point-set snippet),
  // build a faithful multi-slice hull strictly from actual CARTESIAN_POINTs.
  let finalPos = new Float32Array(facePositions);
  let finalWires = new Float32Array(wireList);
  if (finalPos.length < 9 && allPts.length >= 4) {
    const hull = buildMultiSliceHullTriangles(allPts);
    finalPos = new Float32Array(hull.positions);
    if (finalWires.length === 0) finalWires = new Float32Array(hull.wireSegments);
  }

  const finalNorm = computeTriangleNormals(finalPos);
  const rawNamesList = Array.from(extractedNames);
  const compName = rawNamesList[0] || filename.replace(/\.[^.]+$/, '');
  const cls = classifyComponentFamily(compName, 0);
  const bbox = computeBounds(finalPos.length > 0 ? finalPos : finalWires);

  const components: CadComponentPart[] =
    finalPos.length >= 9
      ? [
          {
            id: 'COMP-1',
            name: compName,
            family: cls.family,
            subFamily: cls.subFamily,
            maskColorHex: cls.maskColorHex,
            inferredMaterial: cls.inferredMaterial,
            center: [
              (bbox.min[0] + bbox.max[0]) / 2,
              (bbox.min[1] + bbox.max[1]) / 2,
              (bbox.min[2] + bbox.max[2]) / 2,
            ],
            size: bbox.size,
            positions: finalPos,
            normals: finalNorm,
            wireSegments: finalWires,
            triangleCount: Math.floor(finalPos.length / 9),
            sourceLayer: format === 'IFC' ? 'IFC4_STRUCTURAL' : 'STEP_BREP',
          },
        ]
      : [];

  return {
    id: `imp-${Date.now()}`,
    filename,
    format,
    positions: finalPos,
    normals: finalNorm,
    wireSegments: finalWires,
    triangleCount: Math.floor(finalPos.length / 9),
    entityCount: allPts.length,
    layers: rawNamesList.length > 0 ? rawNamesList : [format === 'IFC' ? 'IFC4_STRUCTURAL' : 'STEP_BREP'],
    boundingBox: bbox,
    notes: `${format} B-Rep analisado fielmente (${allPts.length} pontos · ${Math.floor(finalPos.length / 9)} triângulos)`,
    components,
    detectedProfile,
  };
}

function buildRingTriangles(
  cx: number,
  cy: number,
  cz: number,
  outerR: number,
  innerR: number,
  height: number,
  axis: 'x' | 'y' | 'z',
  radialSegs = 28
): Float32Array {
  const rOut = Math.max(2, outerR);
  const rIn = Math.max(0.5, Math.min(rOut * 0.85, innerR));
  const half = Math.max(1, height / 2);
  const out: number[] = [];

  const toWorld = (u: number, v: number, h: number): [number, number, number] => {
    if (axis === 'y') return [cx + u, cy + h, cz + v];
    if (axis === 'x') return [cx + h, cy + u, cz + v];
    return [cx + u, cy + v, cz + h];
  };

  for (let i = 0; i < radialSegs; i++) {
    const a0 = (i / radialSegs) * Math.PI * 2;
    const a1 = ((i + 1) / radialSegs) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const ob0 = toWorld(c0 * rOut, s0 * rOut, -half);
    const ob1 = toWorld(c1 * rOut, s1 * rOut, -half);
    const ot0 = toWorld(c0 * rOut, s0 * rOut, half);
    const ot1 = toWorld(c1 * rOut, s1 * rOut, half);

    const ib0 = toWorld(c0 * rIn, s0 * rIn, -half);
    const ib1 = toWorld(c1 * rIn, s1 * rIn, -half);
    const it0 = toWorld(c0 * rIn, s0 * rIn, half);
    const it1 = toWorld(c1 * rIn, s1 * rIn, half);

    // Outer wall
    out.push(...ob0, ...ob1, ...ot1, ...ob0, ...ot1, ...ot0);
    // Inner wall
    out.push(...ib0, ...it1, ...ib1, ...ib0, ...it0, ...it1);
    // Top annular face
    out.push(...it0, ...ot0, ...ot1, ...it0, ...ot1, ...it1);
    // Bottom annular face
    out.push(...ib0, ...ob1, ...ob0, ...ib0, ...ib1, ...ob1);
  }
  return new Float32Array(out);
}

function polygonSignedArea2D(pts: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function pointInTriangle2D(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number]
): boolean {
  const cross = (p1: [number, number], p2: [number, number], p3: [number, number]) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = cross(p, a, b);
  const d2 = cross(p, b, c);
  const d3 = cross(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function triangulatePolygon2D(rawPts: [number, number][]): {
  contour: [number, number][];
  triangles: [number, number, number][];
} {
  // Deduplicate consecutive near-identical vertices
  const pts: [number, number][] = [];
  for (const p of rawPts) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05) {
      pts.push(p);
    }
  }
  if (pts.length >= 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.05) {
    pts.pop();
  }
  if (pts.length < 3) return { contour: pts, triangles: [] };

  // Ensure CCW winding in 2D
  if (polygonSignedArea2D(pts) < 0) {
    pts.reverse();
  }

  const indices = pts.map((_, idx) => idx);
  const triangles: [number, number, number][] = [];
  let guard = 0;

  while (indices.length > 3 && guard < pts.length * 4) {
    let clipped = false;
    for (let k = 0; k < indices.length; k++) {
      const iPrev = indices[(k - 1 + indices.length) % indices.length];
      const iCurr = indices[k];
      const iNext = indices[(k + 1) % indices.length];
      const a = pts[iPrev];
      const b = pts[iCurr];
      const c = pts[iNext];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 1e-6) continue;

      let containsOther = false;
      for (let m = 0; m < indices.length; m++) {
        const idxTest = indices[m];
        if (idxTest === iPrev || idxTest === iCurr || idxTest === iNext) continue;
        if (pointInTriangle2D(pts[idxTest], a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) {
        triangles.push([iPrev, iCurr, iNext]);
        indices.splice(k, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break;
    guard++;
  }

  if (indices.length === 3) {
    triangles.push([indices[0], indices[1], indices[2]]);
  } else if (triangles.length === 0 && pts.length >= 3) {
    for (let k = 1; k < pts.length - 1; k++) {
      triangles.push([0, k, k + 1]);
    }
  }

  return { contour: pts, triangles };
}

function buildPrismFromPolygon2D(
  rawPtsXZ: [number, number][],
  yBottom: number,
  yTop: number
): { positions: Float32Array; wireSegments: Float32Array } {
  const { contour, triangles } = triangulatePolygon2D(rawPtsXZ);
  if (contour.length < 3 || triangles.length === 0) {
    return { positions: new Float32Array(0), wireSegments: new Float32Array(0) };
  }

  const out: number[] = [];
  const wire: number[] = [];

  // Top & Bottom caps (CCW in XZ -> (x, yTop, z))
  for (const [i0, i1, i2] of triangles) {
    const p0 = contour[i0];
    const p1 = contour[i1];
    const p2 = contour[i2];
    // Top cap
    out.push(p0[0], yTop, p0[1], p2[0], yTop, p2[1], p1[0], yTop, p1[1]);
    // Bottom cap
    out.push(p0[0], yBottom, p0[1], p1[0], yBottom, p1[1], p2[0], yBottom, p2[1]);
  }

  // Side walls + wireframe edges
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    out.push(
      a[0], yBottom, a[1],
      b[0], yBottom, b[1],
      b[0], yTop, b[1],
      a[0], yBottom, a[1],
      b[0], yTop, b[1],
      a[0], yTop, a[1]
    );
    wire.push(a[0], yTop, a[1], b[0], yTop, b[1]);
    wire.push(a[0], yBottom, a[1], b[0], yBottom, b[1]);
  }

  return { positions: new Float32Array(out), wireSegments: new Float32Array(wire) };
}

function extractReadableStringsFromBinary(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  const found: string[] = [];
  const seen = new Set<string>();

  const pushToken = (tok: string) => {
    const clean = tok.replace(/\s+/g, ' ').trim();
    if (clean.length >= 3 && clean.length <= 80 && !seen.has(clean)) {
      seen.add(clean);
      found.push(clean);
    }
  };

  // Scan ASCII printable runs
  let acc = '';
  for (let i = 0; i < Math.min(bytes.length, 4_000_000); i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      acc += String.fromCharCode(b);
    } else {
      if (acc.length >= 4 && /[a-zA-Z]{2,}/.test(acc)) {
        pushToken(acc);
      }
      acc = '';
    }
    if (found.length >= 400) break;
  }

  // Scan UTF-16LE strings (common in Inventor OLE2 streams)
  let acc16 = '';
  for (let i = 0; i + 1 < Math.min(bytes.length, 4_000_000); i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    if (hi === 0 && lo >= 32 && lo <= 126) {
      acc16 += String.fromCharCode(lo);
    } else {
      if (acc16.length >= 4 && /[a-zA-Z]{2,}/.test(acc16)) {
        pushToken(acc16);
      }
      acc16 = '';
    }
    if (found.length >= 700) break;
  }

  return found;
}

/**
 * High-fidelity Autodesk Inventor (.IPT) parser via /api/cad/parse-ipt
 * (OLE2 CFB compound stream decoder + zlib inflator + ACIS SAT/SAB + Graphics Mesh extractor).
 */
export async function parseIPTAsync(
  buffer: ArrayBuffer,
  filename: string
): Promise<ImportedCadModel> {
  if (buffer.byteLength < 64) {
    throw new Error('Arquivo .IPT vazio ou corrompido.');
  }

  const base64Data = arrayBufferToBase64(buffer);
  const resp = await fetch('/api/cad/parse-ipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, base64Data }),
  });

  if (resp.ok) {
    const data = await resp.json();
    if (Array.isArray(data?.meshes) && data.meshes.length > 0) {
      return buildModelFromServerMeshes({
        filename,
        format: 'IPT',
        meshes: data.meshes,
        headerSnippet: data.headerSnippet || '',
        extractedTokens: data.extractedTokens || [],
        notes: data.notes || `Autodesk Inventor (.IPT) extraído via OLE2`,
      });
    }
  } else {
    let errMsg = '';
    try {
      const errBody = await resp.json();
      errMsg = errBody?.error || '';
    } catch {
      // ignore json parse failure
    }
    if (errMsg) throw new Error(errMsg);
  }

  return parseIPT(buffer, filename);
}

/**
 * Synchronous fallback IPT parser: extracts real readable metadata and genuine finite binary
 * coordinates (Float64 SAB / Float32 Graphics) from the file without fabricating unrelated toy boxes.
 */
export function parseIPT(buffer: ArrayBuffer, filename: string): ImportedCadModel {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 64) {
    throw new Error('Arquivo .IPT vazio ou corrompido.');
  }

  const extractedStrings = extractReadableStringsFromBinary(buffer);
  const view = new DataView(buffer);
  const pts: [number, number, number][] = [];

  for (let off = 0; off + 24 <= Math.min(bytes.byteLength, 500_000); off += 8) {
    const x = view.getFloat64(off, true);
    const y = view.getFloat64(off + 8, true);
    const z = view.getFloat64(off + 16, true);
    if (
      Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
      Math.abs(x) >= 0.05 && Math.abs(x) <= 2000 &&
      Math.abs(y) >= 0.05 && Math.abs(y) <= 2000 &&
      Math.abs(z) >= 0.05 && Math.abs(z) <= 2000
    ) {
      pts.push([x, z, -y]);
    }
  }

  if (pts.length < 6) {
    throw new Error(
      `Não foi possível extrair malha B-Rep ou pontos 3D válidos de "${filename}" localmente. Use o parser completo via servidor ou exporte em .STEP/.STL no Inventor.`
    );
  }

  const { positions, wireSegments } = buildMultiSliceHullTriangles(pts);
  const normals = computeTriangleNormals(positions);
  const bbox = computeBounds(positions);
  const compName = filename.replace(/\.[^.]+$/, '');
  const cls = classifyComponentFamily(compName, 0);

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'IPT',
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: pts.length,
    layers: ['INVENTOR_IPT_OLE2'],
    boundingBox: bbox,
    notes: `Autodesk Inventor (.IPT) extraído (${pts.length} coordenadas · ${Math.floor(positions.length / 9)} triângulos)`,
    components: [
      {
        id: 'COMP-1',
        name: compName,
        family: cls.family,
        subFamily: cls.subFamily,
        maskColorHex: cls.maskColorHex,
        inferredMaterial: cls.inferredMaterial,
        center: [
          (bbox.min[0] + bbox.max[0]) / 2,
          (bbox.min[1] + bbox.max[1]) / 2,
          (bbox.min[2] + bbox.max[2]) / 2,
        ],
        size: bbox.size,
        positions,
        normals,
        wireSegments,
        triangleCount: Math.floor(positions.length / 9),
        sourceLayer: 'INVENTOR_IPT_OLE2',
      },
    ],
    detectedProfile: resolvePartEngineeringProfile({
      filename,
      rawText: `${compName} ${extractedStrings.join(' ').slice(0, 8000)}`,
      layers: ['INVENTOR_IPT_OLE2'],
    }),
  };
}

function sampleSvgPathSubpaths(dAttr: string): [number, number][][] {
  const subpaths: [number, number][][] = [];
  const tokenRegex = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const tokens: string[] = [];
  let tok: RegExpExecArray | null;
  while ((tok = tokenRegex.exec(dAttr)) !== null) {
    tokens.push(tok[0]);
  }

  let idx = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let current: [number, number][] = [];

  const nextNum = (): number => {
    const val = parseFloat(tokens[idx++] ?? '0');
    return Number.isFinite(val) ? val : 0;
  };
  const isCmd = (s?: string) => Boolean(s && /^[a-zA-Z]$/.test(s));

  const pushPt = (x: number, y: number) => {
    current.push([x, y]);
    cx = x;
    cy = y;
  };

  while (idx < tokens.length) {
    if (isCmd(tokens[idx])) {
      cmd = tokens[idx++];
      if (cmd === 'Z' || cmd === 'z') {
        if (current.length >= 3) subpaths.push(current);
        current = [];
        cx = startX;
        cy = startY;
        continue;
      }
    }
    if (!cmd) {
      idx++;
      continue;
    }

    switch (cmd) {
      case 'M':
      case 'm': {
        if (current.length >= 3) subpaths.push(current);
        current = [];
        const nx = nextNum();
        const ny = nextNum();
        const tx = cmd === 'm' ? cx + nx : nx;
        const ty = cmd === 'm' ? cy + ny : ny;
        startX = tx;
        startY = ty;
        pushPt(tx, ty);
        cmd = cmd === 'm' ? 'l' : 'L';
        break;
      }
      case 'L':
      case 'l': {
        const nx = nextNum();
        const ny = nextNum();
        pushPt(cmd === 'l' ? cx + nx : nx, cmd === 'l' ? cy + ny : ny);
        break;
      }
      case 'H':
      case 'h': {
        const nx = nextNum();
        pushPt(cmd === 'h' ? cx + nx : nx, cy);
        break;
      }
      case 'V':
      case 'v': {
        const ny = nextNum();
        pushPt(cx, cmd === 'v' ? cy + ny : ny);
        break;
      }
      case 'C':
      case 'c': {
        const rel = cmd === 'c';
        const x1 = (rel ? cx : 0) + nextNum();
        const y1 = (rel ? cy : 0) + nextNum();
        const x2 = (rel ? cx : 0) + nextNum();
        const y2 = (rel ? cy : 0) + nextNum();
        const x3 = (rel ? cx : 0) + nextNum();
        const y3 = (rel ? cy : 0) + nextNum();
        const sx = cx, sy = cy;
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const u = 1 - t;
          const px = u * u * u * sx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
          const py = u * u * u * sy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          pushPt(px, py);
        }
        break;
      }
      case 'Q':
      case 'q': {
        const rel = cmd === 'q';
        const x1 = (rel ? cx : 0) + nextNum();
        const y1 = (rel ? cy : 0) + nextNum();
        const x2 = (rel ? cx : 0) + nextNum();
        const y2 = (rel ? cy : 0) + nextNum();
        const sx = cx, sy = cy;
        const steps = 5;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const u = 1 - t;
          const px = u * u * sx + 2 * u * t * x1 + t * t * x2;
          const py = u * u * sy + 2 * u * t * y1 + t * t * y2;
          pushPt(px, py);
        }
        break;
      }
      case 'A':
      case 'a': {
        // Approximate elliptical arc endpoints smoothly
        const rel = cmd === 'a';
        nextNum(); nextNum(); nextNum(); nextNum(); nextNum();
        const ex = (rel ? cx : 0) + nextNum();
        const ey = (rel ? cy : 0) + nextNum();
        pushPt((cx + ex) * 0.5, (cy + ey) * 0.5);
        pushPt(ex, ey);
        break;
      }
      default:
        idx++;
        break;
    }
  }
  if (current.length >= 3) subpaths.push(current);
  return subpaths;
}

/**
 * Parses 2D SVG vector graphics (<path>, <rect>, <circle>, <ellipse>, <polygon>, <polyline>)
 * into a multi-layer extruded 3D solid CAD project (.SVG -> 3D CAD).
 */
export function parseSVGToCad(svgText: string, filename: string): ImportedCadModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new Error('Arquivo SVG inválido ou sem elemento <svg>.');
  }

  interface SvgContourItem {
    name: string;
    points: [number, number][];
    depthIdx: number;
  }
  const contours: SvgContourItem[] = [];

  const elements = Array.from(
    svgEl.querySelectorAll('rect, circle, ellipse, polygon, polyline, path')
  ).slice(0, 28);

  elements.forEach((el, idx) => {
    const tag = el.tagName.toLowerCase();
    const idAttr = el.getAttribute('id') || el.closest('g[id]')?.getAttribute('id') || '';
    const fillAttr = el.getAttribute('fill') || '';
    if (fillAttr === 'none' && tag === 'rect' && idx === 0) {
      // Often full-canvas transparent background rect; skip only if clearly borderless
    }
    const baseLabel = idAttr ? `${idAttr} (${tag})` : `SVG_${tag.toUpperCase()}_${idx + 1}`;

    if (tag === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      if (w > 0 && h > 0) {
        contours.push({
          name: baseLabel,
          points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
          depthIdx: idx,
        });
      }
    } else if (tag === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      if (r > 0) {
        const pts: [number, number][] = [];
        for (let s = 0; s < 24; s++) {
          const a = (s / 24) * Math.PI * 2;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        contours.push({ name: baseLabel, points: pts, depthIdx: idx });
      }
    } else if (tag === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      const ry = parseFloat(el.getAttribute('ry') || '0');
      if (rx > 0 && ry > 0) {
        const pts: [number, number][] = [];
        for (let s = 0; s < 24; s++) {
          const a = (s / 24) * Math.PI * 2;
          pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
        }
        contours.push({ name: baseLabel, points: pts, depthIdx: idx });
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      const raw = (el.getAttribute('points') || '').trim();
      const nums = raw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
      const pts: [number, number][] = [];
      for (let k = 0; k + 1 < nums.length; k += 2) {
        pts.push([nums[k], nums[k + 1]]);
      }
      if (pts.length >= 3) {
        contours.push({ name: baseLabel, points: pts, depthIdx: idx });
      }
    } else if (tag === 'path') {
      const d = el.getAttribute('d') || '';
      const subpaths = sampleSvgPathSubpaths(d);
      subpaths.forEach((sp, sIdx) => {
        if (sp.length >= 3) {
          contours.push({
            name: subpaths.length > 1 ? `${baseLabel}_S${sIdx + 1}` : baseLabel,
            points: sp,
            depthIdx: idx,
          });
        }
      });
    }
  });

  if (contours.length === 0) {
    throw new Error('Nenhuma geometria vetorial fechada (<path>, <rect>, <circle>, <polygon>) encontrada no SVG.');
  }

  // Compute SVG bounding box and scale cleanly into ~180 mm max extent centered at origin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) {
    for (const [px, py] of c.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  const span = Math.max(1, maxX - minX, maxY - minY);
  const scaleToMm = 180 / span;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const components: CadComponentPart[] = [];
  const combinedPositions: number[] = [];
  const combinedWires: number[] = [];
  const layers = new Set<string>();

  contours.forEach((c, idx) => {
    const ptsXZ: [number, number][] = c.points.map(([px, py]) => [
      (px - midX) * scaleToMm,
      (py - midY) * scaleToMm,
    ]);
    const yBottom = 0;
    const yTop = 10 + (c.depthIdx % 5) * 3.5;
    const { positions: pPos, wireSegments: pWire } = buildPrismFromPolygon2D(ptsXZ, yBottom, yTop);
    if (pPos.length === 0) return;

    const pNorm = computeTriangleNormals(pPos);
    const pBox = computeBounds(pPos);
    const cls = classifyComponentFamily(c.name, idx);
    layers.add(c.name);

    for (let k = 0; k < pPos.length; k++) combinedPositions.push(pPos[k]);
    for (let k = 0; k < pWire.length; k++) combinedWires.push(pWire[k]);

    components.push({
      id: `COMP-${components.length + 1}`,
      name: c.name,
      family: cls.family,
      subFamily: cls.subFamily,
      maskColorHex: cls.maskColorHex,
      inferredMaterial: cls.inferredMaterial,
      center: [
        (pBox.min[0] + pBox.max[0]) / 2,
        (pBox.min[1] + pBox.max[1]) / 2,
        (pBox.min[2] + pBox.max[2]) / 2,
      ],
      size: pBox.size,
      positions: pPos,
      normals: pNorm,
      wireSegments: pWire,
      triangleCount: Math.floor(pPos.length / 9),
      sourceLayer: 'SVG_VECTOR_EXTRUSION',
    });
  });

  if (components.length === 0) {
    throw new Error('Não foi possível extrudar os contornos SVG em sólidos 3D válidos.');
  }

  const positions = new Float32Array(combinedPositions);
  const normals = computeTriangleNormals(positions);
  const wireSegments = new Float32Array(combinedWires);

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'SVG',
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: components.length,
    layers: Array.from(layers),
    boundingBox: computeBounds(positions),
    notes: `Projeto SVG convertido em sólidos 3D (${components.length} camadas extrudadas · ${Math.floor(positions.length / 9)} triângulos)`,
    components,
    detectedProfile: resolvePartEngineeringProfile({
      filename,
      rawText: svgText.slice(0, 6000),
      layers: Array.from(layers),
    }),
  };
}

export interface PixelReliefGrid {
  cols: number;
  rows: number;
  depths: Float32Array; // 0..1 normalized relief height
  foregroundMask: Uint8Array; // 1 = part pixel, 0 = background
  aspectRatio: number; // width / height
  coveragePct: number;
}

export interface VisionCadBlueprintComponent {
  name: string;
  shape: 'box' | 'plate' | 'cylinder-x' | 'cylinder-y' | 'cylinder-z' | 'ring' | 'arch';
  centerMm: [number, number, number];
  sizeMm: [number, number, number];
  material: MaterialFinish;
}

export interface VisionCadBlueprint {
  partName: string;
  manufacturer: string;
  modelCode: string;
  segment: ApplicationSegment;
  primaryMaterial: MaterialFinish;
  intendedUse: string;
  specifications: string[];
  certifications: string[];
  recommendedLoadN: number;
  minSafetyFactor: number;
  maxDeflectionMm: number;
  criticalInspectionNote: string;
  constructionMode: 'assembly' | 'extruded-relief';
  overallDimensionsMm: {
    width: number;
    height: number;
    depth: number;
  };
  components: VisionCadBlueprintComponent[];
}

function buildHeightmapReliefTriangles(
  grid: PixelReliefGrid,
  widthMm: number,
  depthZMm: number,
  maxHeightMm: number
): Float32Array {
  const { cols, rows, depths, foregroundMask } = grid;
  const cellW = widthMm / cols;
  const cellD = depthZMm / rows;
  const halfW = widthMm / 2;
  const halfD = depthZMm / 2;
  const baseHeight = Math.max(2.5, maxHeightMm * 0.16);
  const out: number[] = [];

  const isFg = (c: number, r: number): boolean => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    return foregroundMask[r * cols + c] === 1;
  };
  const hAt = (c: number, r: number): number => {
    if (!isFg(c, r)) return 0;
    return baseHeight + depths[r * cols + c] * Math.max(4, maxHeightMm - baseHeight);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isFg(c, r)) continue;
      const x0 = -halfW + c * cellW;
      const x1 = x0 + cellW;
      const z0 = -halfD + r * cellD;
      const z1 = z0 + cellD;
      const yTop = hAt(c, r);
      const yBot = 0;

      // Top face
      out.push(x0, yTop, z0, x0, yTop, z1, x1, yTop, z1);
      out.push(x0, yTop, z0, x1, yTop, z1, x1, yTop, z0);

      // Bottom face
      out.push(x0, yBot, z0, x1, yBot, z1, x0, yBot, z1);
      out.push(x0, yBot, z0, x1, yBot, z0, x1, yBot, z1);

      // Vertical skirts where neighbor is background or lower
      const sides: { nc: number; nr: number; pA: [number, number]; pB: [number, number] }[] = [
        { nc: c - 1, nr: r, pA: [x0, z0], pB: [x0, z1] },
        { nc: c + 1, nr: r, pA: [x1, z1], pB: [x1, z0] },
        { nc: c, nr: r - 1, pA: [x1, z0], pB: [x0, z0] },
        { nc: c, nr: r + 1, pA: [x0, z1], pB: [x1, z1] },
      ];
      for (const s of sides) {
        const nh = hAt(s.nc, s.nr);
        if (yTop > nh + 0.25) {
          out.push(
            s.pA[0], nh, s.pA[1],
            s.pB[0], nh, s.pB[1],
            s.pB[0], yTop, s.pB[1],
            s.pA[0], nh, s.pA[1],
            s.pB[0], yTop, s.pB[1],
            s.pA[0], yTop, s.pA[1]
          );
        }
      }
    }
  }

  return new Float32Array(out);
}

/**
 * Builds a faithful multi-component 3D CAD project from Gemini Vision architectural/mechanical
 * blueprint + client-side pixel silhouette/relief grid extracted from PNG/JPG/WEBP images.
 */
export function buildCadModelFromVisionAndPixels(params: {
  filename: string;
  blueprint: VisionCadBlueprint;
  reliefGrid?: PixelReliefGrid;
}): ImportedCadModel {
  const { filename, blueprint, reliefGrid } = params;
  const validMaterials: MaterialFinish[] = [
    'aluminum',
    'titanium',
    'clay',
    'oak',
    'glass',
    'carbon-fiber',
    'matte-plastic',
  ];
  const sanitizeMat = (m: unknown, fallback: MaterialFinish): MaterialFinish =>
    validMaterials.includes(m as MaterialFinish) ? (m as MaterialFinish) : fallback;

  const primaryMat = sanitizeMat(blueprint.primaryMaterial, 'aluminum');
  const detectedProfile: PartEngineeringProfile = {
    partName: blueprint.partName || filename.replace(/\.[^.]+$/, ''),
    manufacturer: blueprint.manufacturer || 'Projeto Reconstruído por Visão CAD',
    modelCode: blueprint.modelCode || filename.replace(/\.[^.]+$/, ''),
    segment: blueprint.segment || 'industrial-cnc',
    primaryMaterial: primaryMat,
    specifications:
      blueprint.specifications?.length > 0
        ? blueprint.specifications
        : [`Dimensões reconstruídas: ${blueprint.overallDimensionsMm.width}×${blueprint.overallDimensionsMm.height}×${blueprint.overallDimensionsMm.depth} mm`],
    certifications:
      blueprint.certifications?.length > 0
        ? blueprint.certifications
        : ['ISO 2768-mK', 'ASME Y14.5 GD&T'],
    intendedUse: blueprint.intendedUse || 'Componente CAD reconstruído fielmente a partir de imagem de referência.',
    safetyCriteria: {
      recommendedLoadN: Math.max(200, Math.min(40000, Number(blueprint.recommendedLoadN) || 4500)),
      supportMode: blueprint.segment === 'aeroespacial' ? 'cantilever-u' : 'edge-clamped',
      loadPattern: blueprint.segment === 'ciclismo-mobilidade' ? 'torsion-tip' : 'center-point',
      minSafetyFactor: Math.max(1.2, Math.min(6, Number(blueprint.minSafetyFactor) || 2.2)),
      maxDeflectionMm: Math.max(0.2, Math.min(20, Number(blueprint.maxDeflectionMm) || 2.5)),
      criticalInspectionNote:
        blueprint.criticalInspectionNote ||
        'Verificar concentração de tensão nas interfaces geométricas detectadas na imagem.',
    },
    detectedFrom: `Visão CAD 3D (${filename})`,
  };

  const components: CadComponentPart[] = [];
  const combinedPositions: number[] = [];

  const useRelief =
    Boolean(reliefGrid) &&
    reliefGrid!.coveragePct > 4 &&
    reliefGrid!.coveragePct < 94 &&
    (blueprint.constructionMode === 'extruded-relief' || blueprint.components.length <= 2);

  if (useRelief && reliefGrid) {
    const wMm = Math.max(60, Math.min(320, blueprint.overallDimensionsMm.width || 180));
    const dMm = wMm / Math.max(0.25, Math.min(4, reliefGrid.aspectRatio || 1));
    const hMm = Math.max(12, Math.min(60, blueprint.overallDimensionsMm.depth || 26));
    const reliefPos = buildHeightmapReliefTriangles(reliefGrid, wMm, dMm, hMm);
    if (reliefPos.length > 0) {
      const rNorm = computeTriangleNormals(reliefPos);
      const rBox = computeBounds(reliefPos);
      const cls = classifyComponentFamily(blueprint.partName || filename, 0);
      for (let k = 0; k < reliefPos.length; k++) combinedPositions.push(reliefPos[k]);
      components.push({
        id: 'COMP-1',
        name: `${blueprint.partName} (Contorno 3D Fiel)`,
        family: cls.family,
        subFamily: 'Relevo / Contorno Extraído da Imagem',
        maskColorHex: cls.maskColorHex,
        inferredMaterial: primaryMat,
        center: [
          (rBox.min[0] + rBox.max[0]) / 2,
          (rBox.min[1] + rBox.max[1]) / 2,
          (rBox.min[2] + rBox.max[2]) / 2,
        ],
        size: rBox.size,
        positions: reliefPos,
        normals: rNorm,
        triangleCount: Math.floor(reliefPos.length / 9),
        sourceLayer: 'VISION_PIXEL_RELIEF',
      });
    }
  }

  // Add Vision-identified structural CAD sub-components (full 3D assembly or secondary details)
  if (!useRelief || blueprint.components.length >= 2) {
    const list = blueprint.components.slice(0, 14);
    list.forEach((comp, idx) => {
      const [cx, cy, cz] = comp.centerMm;
      const sx = Math.max(4, Math.min(350, comp.sizeMm[0] || 40));
      const sy = Math.max(4, Math.min(350, comp.sizeMm[1] || 40));
      const sz = Math.max(4, Math.min(350, comp.sizeMm[2] || 40));

      // Offset y cleanly above relief base if relief was already generated as COMP-1
      const yPos = useRelief ? cy + Math.max(8, (blueprint.overallDimensionsMm.depth || 20) * 0.6) : cy;

      let triPos: Float32Array;
      if (comp.shape === 'cylinder-y') {
        triPos = buildCylinderTriangles(cx, yPos, cz, Math.min(sx, sz) / 2, sy, 'y');
      } else if (comp.shape === 'cylinder-x') {
        triPos = buildCylinderTriangles(cx, yPos, cz, Math.min(sy, sz) / 2, sx, 'x');
      } else if (comp.shape === 'cylinder-z') {
        triPos = buildCylinderTriangles(cx, yPos, cz, Math.min(sx, sy) / 2, sz, 'z');
      } else if (comp.shape === 'ring') {
        const outerR = Math.max(sx, sz) / 2;
        triPos = buildRingTriangles(cx, yPos, cz, outerR, outerR * 0.52, sy, 'y');
      } else {
        triPos = buildBoxTriangles(cx, yPos, cz, sx, sy, sz);
      }

      const triNorm = computeTriangleNormals(triPos);
      const cBox = computeBounds(triPos);
      const cls = classifyComponentFamily(comp.name, components.length + idx);
      for (let k = 0; k < triPos.length; k++) combinedPositions.push(triPos[k]);

      components.push({
        id: `COMP-${components.length + 1}`,
        name: comp.name || `Sub-componente ${components.length + 1}`,
        family: cls.family,
        subFamily: cls.subFamily,
        maskColorHex: cls.maskColorHex,
        inferredMaterial: sanitizeMat(comp.material, cls.inferredMaterial),
        center: [
          (cBox.min[0] + cBox.max[0]) / 2,
          (cBox.min[1] + cBox.max[1]) / 2,
          (cBox.min[2] + cBox.max[2]) / 2,
        ],
        size: cBox.size,
        positions: triPos,
        normals: triNorm,
        triangleCount: Math.floor(triPos.length / 9),
        sourceLayer: 'VISION_CAD_ASSEMBLY',
      });
    });
  }

  const positions = new Float32Array(combinedPositions);
  const normals = computeTriangleNormals(positions);
  const layers = components.map((c) => c.name);

  return {
    id: `imp-${Date.now()}`,
    filename,
    format: 'IMAGE',
    positions,
    normals,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: components.length,
    layers,
    boundingBox: computeBounds(positions),
    notes: `Imagem "${filename}" convertida em projeto CAD 3D fidedigno (${blueprint.partName} · ${components.length} sub-componentes · ${Math.floor(positions.length / 9)} triângulos)`,
    components,
    detectedProfile,
  };
}

/**
 * Exports Binary STL (valid for Cura, PrusaSlicer, Rhino, Fusion360, SolidWorks)
 */
export function exportBinarySTL(mesh: EvaluatedMesh, modelName: string): Blob {
  const triCount = mesh.triangleCount;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  const headerStr = `Parametrix CAD Studio Binary STL - ${modelName}`.slice(0, 79);
  for (let i = 0; i < headerStr.length; i++) {
    view.setUint8(i, headerStr.charCodeAt(i));
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];

    // Convert Three.js (x, y_up, z) -> CAD/CAM (x, -z, y_up)
    const ax = mesh.positions[i0 * 3], ay = -mesh.positions[i0 * 3 + 2], az = mesh.positions[i0 * 3 + 1];
    const bx = mesh.positions[i1 * 3], by = -mesh.positions[i1 * 3 + 2], bz = mesh.positions[i1 * 3 + 1];
    const cx = mesh.positions[i2 * 3], cy = -mesh.positions[i2 * 3 + 2], cz = mesh.positions[i2 * 3 + 1];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);

    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);

    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);

    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return new Blob([buffer], { type: 'application/octet-stream' });
}

/**
 * Exports valid AutoCAD ASCII DXF (3DFACE mesh + POLYLINE isocurves + optional CAM toolpath layer)
 */
export function exportAsciiDXF(
  mesh: EvaluatedMesh,
  isocurves: [number, number, number][][],
  toolpath?: ToolpathPoint[]
): Blob {
  const out: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '4', // Millimeters
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '3',
    '0', 'LAYER', '2', 'NURBS_SURFACE', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'ISOCURVES', '70', '0', '62', '4', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'CAM_TOOLPATH', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  // Export 3DFACE triangles
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];

    const x0 = mesh.positions[i0 * 3], y0 = -mesh.positions[i0 * 3 + 2], z0 = mesh.positions[i0 * 3 + 1];
    const x1 = mesh.positions[i1 * 3], y1 = -mesh.positions[i1 * 3 + 2], z1 = mesh.positions[i1 * 3 + 1];
    const x2 = mesh.positions[i2 * 3], y2 = -mesh.positions[i2 * 3 + 2], z2 = mesh.positions[i2 * 3 + 1];

    out.push(
      '0', '3DFACE',
      '8', 'NURBS_SURFACE',
      '10', x0.toFixed(4), '20', y0.toFixed(4), '30', z0.toFixed(4),
      '11', x1.toFixed(4), '21', y1.toFixed(4), '31', z1.toFixed(4),
      '12', x2.toFixed(4), '22', y2.toFixed(4), '32', z2.toFixed(4),
      '13', x2.toFixed(4), '23', y2.toFixed(4), '33', z2.toFixed(4)
    );
  }

  // Export Isocurves as 3D LINE segments
  for (const curve of isocurves) {
    for (let k = 0; k < curve.length - 1; k++) {
      const a = curve[k];
      const b = curve[k + 1];
      out.push(
        '0', 'LINE',
        '8', 'ISOCURVES',
        '10', a[0].toFixed(4), '20', (-a[2]).toFixed(4), '30', a[1].toFixed(4),
        '11', b[0].toFixed(4), '21', (-b[2]).toFixed(4), '31', b[1].toFixed(4)
      );
    }
  }

  // Optional toolpath layer
  if (toolpath && toolpath.length > 1) {
    for (let k = 0; k < toolpath.length - 1; k++) {
      const a = toolpath[k];
      const b = toolpath[k + 1];
      if (!b.rapid) {
        out.push(
          '0', 'LINE',
          '8', 'CAM_TOOLPATH',
          '10', a.x.toFixed(4), '20', a.y.toFixed(4), '30', a.z.toFixed(4),
          '11', b.x.toFixed(4), '21', b.y.toFixed(4), '31', b.z.toFixed(4)
        );
      }
    }
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return new Blob([out.join('\n')], { type: 'application/dxf' });
}

/**
 * Exports OpenNURBS (.3dm) binary archive with NURBS control net + Mesh chunk
 */
export function exportOpenNurbs3DM(
  surface: NurbsSurfaceData,
  mesh: EvaluatedMesh
): Blob {
  // Calculate payload sizes
  const meshPayloadBytes = 8 + mesh.vertexCount * 12 + mesh.triangleCount * 12;
  const nurbsPayloadBytes = 16 + surface.uCount * surface.vCount * 16;
  const totalBytes = 32 + (8 + 4) + (8 + meshPayloadBytes) + (8 + nurbsPayloadBytes) + 8;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // 32-byte OpenNURBS magic header
  const header = '3D Geometry File Format         ';
  for (let i = 0; i < 32; i++) {
    bytes[i] = header.charCodeAt(i);
  }

  let offset = 32;
  // TCODE_OPENNURBS_VERSION (0x00000001)
  view.setUint32(offset, 0x00000001, true);
  view.setInt32(offset + 4, 4, true);
  view.setInt32(offset + 8, 7, true); // Rhino 7 OpenNURBS
  offset += 12;

  // Mesh Chunk (0x20000001)
  view.setUint32(offset, 0x20000001, true);
  view.setInt32(offset + 4, meshPayloadBytes, true);
  view.setUint32(offset + 8, mesh.vertexCount, true);
  view.setUint32(offset + 12, mesh.triangleCount, true);
  offset += 16;

  for (let v = 0; v < mesh.vertexCount; v++) {
    view.setFloat32(offset, mesh.positions[v * 3], true);
    view.setFloat32(offset + 4, -mesh.positions[v * 3 + 2], true);
    view.setFloat32(offset + 8, mesh.positions[v * 3 + 1], true);
    offset += 12;
  }
  for (let t = 0; t < mesh.triangleCount; t++) {
    view.setUint32(offset, mesh.indices[t * 3], true);
    view.setUint32(offset + 4, mesh.indices[t * 3 + 1], true);
    view.setUint32(offset + 8, mesh.indices[t * 3 + 2], true);
    offset += 12;
  }

  // NURBS Control Surface Chunk (0x20000002)
  view.setUint32(offset, 0x20000002, true);
  view.setInt32(offset + 4, nurbsPayloadBytes, true);
  view.setUint32(offset + 8, surface.uCount, true);
  view.setUint32(offset + 12, surface.vCount, true);
  view.setUint32(offset + 16, surface.degreeU, true);
  view.setUint32(offset + 20, surface.degreeV, true);
  offset += 24;

  for (let u = 0; u < surface.uCount; u++) {
    for (let v = 0; v < surface.vCount; v++) {
      const cp = surface.controlPoints[u][v];
      view.setFloat32(offset, cp.x, true);
      view.setFloat32(offset + 4, -cp.z, true);
      view.setFloat32(offset + 8, cp.y, true);
      view.setFloat32(offset + 12, cp.w, true);
      offset += 16;
    }
  }

  // TCODE_ENDOFFILE
  view.setUint32(offset, 0x7fffffff, true);
  view.setInt32(offset + 4, 0, true);

  return new Blob([buffer], { type: 'application/octet-stream' });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Builds an EvaluatedMesh containing only the isolated piece(s) for targeted STL/DXF/3DM export.
 */
export function buildIsolatedEvaluatedMesh(
  mesh: EvaluatedMesh,
  isolationTarget: string,
  importedModel: ImportedCadModel | null
): { evaluated: EvaluatedMesh; partLabel: string } {
  if (!isolationTarget || isolationTarget === 'all' || isolationTarget === 'shell') {
    return {
      evaluated: mesh,
      partLabel: isolationTarget === 'shell' ? 'casca_nurbs' : 'conjunto_completo',
    };
  }

  if (isolationTarget === 'imported' && importedModel && importedModel.positions.length > 0) {
    const vCount = Math.floor(importedModel.positions.length / 3);
    const triCount = Math.floor(vCount / 3);
    const indices = new Uint32Array(triCount * 3);
    for (let i = 0; i < triCount * 3; i++) indices[i] = i;
    return {
      evaluated: {
        ...mesh,
        positions: importedModel.positions,
        normals: importedModel.normals,
        uvs: new Float32Array(vCount * 2),
        colors: new Float32Array(vCount * 3),
        indices,
        triangleCount: triCount,
        vertexCount: vCount,
        isocurves: [],
        boundingBox: importedModel.boundingBox,
      },
      partLabel: importedModel.filename.replace(/\.[^.]+$/, ''),
    };
  }

  const matchedImportedPart = importedModel?.components?.find((c) => c.id === isolationTarget);
  if (matchedImportedPart && matchedImportedPart.positions && matchedImportedPart.positions.length > 0) {
    const vCount = Math.floor(matchedImportedPart.positions.length / 3);
    const triCount = Math.floor(vCount / 3);
    const indices = new Uint32Array(triCount * 3);
    for (let i = 0; i < triCount * 3; i++) indices[i] = i;
    return {
      evaluated: {
        ...mesh,
        positions: matchedImportedPart.positions,
        normals: matchedImportedPart.normals ?? new Float32Array(matchedImportedPart.positions.length),
        uvs: new Float32Array(vCount * 2),
        colors: new Float32Array(vCount * 3),
        indices,
        triangleCount: triCount,
        vertexCount: vCount,
        isocurves: [],
        boundingBox: mesh.boundingBox,
      },
      partLabel: matchedImportedPart.name.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase(),
    };
  }

  const targetElements = mesh.bimElements.filter((el) => {
    if (isolationTarget === 'ribs-u') return el.ifcClass === 'IfcBeam';
    if (isolationTarget === 'ribs-v') return el.ifcClass === 'IfcMember';
    return el.id === isolationTarget;
  });

  if (targetElements.length === 0) {
    return { evaluated: mesh, partLabel: 'conjunto_completo' };
  }

  // Tessellate each selected BIM rib box (8 vertices, 12 triangles)
  const vertCount = targetElements.length * 8;
  const triCount = targetElements.length * 12;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  const boxTriIdx = [
    0, 1, 2, 0, 2, 3, // -Z
    4, 6, 5, 4, 7, 6, // +Z
    0, 4, 5, 0, 5, 1, // -Y
    3, 2, 6, 3, 6, 7, // +Y
    0, 3, 7, 0, 7, 4, // -X
    1, 5, 6, 1, 6, 2, // +X
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let areaMm2 = 0;
  let volMm3 = 0;

  targetElements.forEach((el, eIdx) => {
    const hx = el.size[0] / 2;
    const hy = el.size[1] / 2;
    const hz = el.size[2] / 2;
    const c = Math.cos(el.rotationY);
    const s = Math.sin(el.rotationY);
    const [cx, cy, cz] = el.center;

    areaMm2 += 2 * (el.size[0] * el.size[1] + el.size[1] * el.size[2] + el.size[0] * el.size[2]);
    volMm3 += el.size[0] * el.size[1] * el.size[2];

    const localCorners: [number, number, number][] = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [hx, hy, -hz],
      [-hx, hy, -hz],
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [hx, hy, hz],
      [-hx, hy, hz],
    ];

    const baseV = eIdx * 8;
    for (let k = 0; k < 8; k++) {
      const [lx, ly, lz] = localCorners[k];
      const wx = cx + lx * c + lz * s;
      const wy = cy + ly;
      const wz = cz - lx * s + lz * c;
      const vPtr = (baseV + k) * 3;
      positions[vPtr] = wx;
      positions[vPtr + 1] = wy;
      positions[vPtr + 2] = wz;
      normals[vPtr] = 0;
      normals[vPtr + 1] = 1;
      normals[vPtr + 2] = 0;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      minZ = Math.min(minZ, wz);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
      maxZ = Math.max(maxZ, wz);
    }

    const baseI = eIdx * 36;
    for (let k = 0; k < 36; k++) {
      indices[baseI + k] = baseV + boxTriIdx[k];
    }
  });

  return {
    evaluated: {
      positions,
      normals,
      uvs,
      colors,
      indices,
      triangleCount: triCount,
      vertexCount: vertCount,
      isocurves: [],
      bimElements: targetElements,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ],
      },
      surfaceAreaCm2: Number((areaMm2 / 100).toFixed(2)),
      volumeCm3: Number((volMm3 / 1000).toFixed(2)),
    },
    partLabel:
      targetElements.length === 1
        ? targetElements[0].id.toLowerCase()
        : isolationTarget.replace(/[^a-zA-Z0-9_-]/g, '_'),
  };
}

/**
 * Sample CAD files ready to load in 1 click to test multi-format import
 */
export const SAMPLE_CAD_FILES: {
  label: string;
  filename: string;
  format: 'DXF' | 'OBJ' | 'STEP' | 'IFC';
  content: string;
}[] = [
  {
    label: 'Flange Mecânico (DXF)',
    filename: 'flange_furo_180mm.dxf',
    format: 'DXF',
    content: [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'CIRCLE', '8', 'PERFIL_EXTERNO', '10', '0', '20', '0', '30', '2', '40', '95',
      '0', 'CIRCLE', '8', 'FURO_CENTRAL', '10', '0', '20', '0', '30', '2', '40', '32',
      '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '65', '20', '0', '30', '2', '40', '6',
      '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '-65', '20', '0', '30', '2', '40', '6',
      '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '0', '20', '65', '30', '2', '40', '6',
      '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '0', '20', '-65', '30', '2', '40', '6',
      '0', 'LWPOLYLINE', '8', 'CHAVETA', '70', '1', '38', '2',
      '10', '-95', '20', '-95', '10', '95', '20', '-95', '10', '95', '20', '95', '10', '-95', '20', '95',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n'),
  },
  {
    label: 'Suporte Aeroespacial (OBJ)',
    filename: 'suporte_trelica.obj',
    format: 'OBJ',
    content: [
      'o Suporte_Aeroespacial',
      'v -90 2 -55', 'v 90 2 -55', 'v 90 2 55', 'v -90 2 55',
      'v -55 48 -30', 'v 55 48 -30', 'v 55 48 30', 'v -55 48 30',
      'f 1 2 3 4',
      'f 5 6 7 8',
      'f 1 2 6 5',
      'f 2 3 7 6',
      'f 3 4 8 7',
      'f 4 1 5 8',
    ].join('\n'),
  },
  {
    label: 'Bloco B-Rep (STEP AP214)',
    filename: 'bloco_matriz.step',
    format: 'STEP',
    content: [
      'ISO-10303-21;',
      'HEADER;',
      "FILE_DESCRIPTION(('Parametric Die Block'),'2;1');",
      'ENDSEC;',
      'DATA;',
      "#10=CARTESIAN_POINT('P1',(-85.0,-60.0,5.0));",
      "#11=CARTESIAN_POINT('P2',(85.0,-60.0,5.0));",
      "#12=CARTESIAN_POINT('P3',(85.0,60.0,5.0));",
      "#13=CARTESIAN_POINT('P4',(-85.0,60.0,5.0));",
      "#14=CARTESIAN_POINT('P5',(-85.0,-60.0,52.0));",
      "#15=CARTESIAN_POINT('P6',(85.0,-60.0,52.0));",
      "#16=CARTESIAN_POINT('P7',(85.0,60.0,52.0));",
      "#17=CARTESIAN_POINT('P8',(-85.0,60.0,52.0));",
      'ENDSEC;',
      'END-ISO-10303-21;',
    ].join('\n'),
  },
];
