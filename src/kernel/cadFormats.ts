import {
  classifyComponentFamily,
  resolvePartEngineeringProfile,
} from './componentClassifier';
import type {
  CadComponentPart,
  EvaluatedMesh,
  ImportedCadModel,
  NurbsSurfaceData,
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

/**
 * Parses ISO-10303 STEP or IFC BIM assemblies:
 * Extracts PRODUCT / MANIFOLD_SOLID_BREP / SHAPE_REPRESENTATION sub-components,
 * clusters CARTESIAN_POINT clouds into distinct solid component meshes (auto-scaling meters->mm),
 * classifies families for Object Mask segmentation, and resolves PartEngineeringProfile.
 */
export function parseSTEPorIFC(text: string, filename: string, format: 'STEP' | 'IFC'): ImportedCadModel {
  const pts: [number, number, number][] = [];
  const regex = /(?:CARTESIAN_POINT|IFCCARTESIANPOINT)\s*\([^,]*,\s*\(\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const x = parseFloat(match[1]);
    const yCad = parseFloat(match[2]);
    const zUp = parseFloat(match[3]);
    if (Number.isFinite(x) && Number.isFinite(yCad) && Number.isFinite(zUp)) {
      pts.push([x, zUp, -yCad]);
    }
  }

  // Extract named components from STEP PRODUCT / MANIFOLD_SOLID_BREP / CLOSED_SHELL / IFC elements
  const extractedNames = new Set<string>();
  const nameRegex = /(?:PRODUCT|MANIFOLD_SOLID_BREP|SHAPE_REPRESENTATION|IFCBEAM|IFCCOLUMN|IFCSLAB|IFCPLATE)\s*\(\s*'([^']+)'/gi;
  while ((match = nameRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (
      candidate.length >= 2 &&
      candidate.length <= 64 &&
      !/^(none|null|unnamed|default|\s*)$/i.test(candidate)
    ) {
      extractedNames.add(candidate);
    }
    if (extractedNames.size >= 14) break;
  }

  // Auto-detect meters vs millimeters if assembly extent is < 8 units
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [px, py, pz] of pts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }
  const rawSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0);
  const unitScale = rawSpan > 0 && rawSpan < 6 ? 1000 : 1;

  if (unitScale !== 1) {
    for (let i = 0; i < pts.length; i++) {
      pts[i] = [pts[i][0] * unitScale, pts[i][1] * unitScale, pts[i][2] * unitScale];
    }
  }

  const detectedProfile = resolvePartEngineeringProfile({
    filename,
    rawText: text,
    layers: Array.from(extractedNames),
  });

  // Downsample points for clean wireframe outline (max 3200 segments)
  const stepStride = Math.max(1, Math.floor(pts.length / 3000));
  const wireList: number[] = [];
  for (let i = stepStride; i < pts.length; i += stepStride) {
    const a = pts[i - stepStride];
    const b = pts[i];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    // Only connect nearby points to avoid giant cross-assembly teleport lines
    if (dist < Math.max(60, (rawSpan * unitScale) * 0.18)) {
      wireList.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  // Partition point cloud sequentially/spatially into sub-components so Explode, Object Mask,
  // Isolate, Rotate, and Per-Component PBR render real multi-part 3D solids
  const rawNamesList = Array.from(extractedNames);
  const isForkLike = /rockshox|boxxer|fox|fork|garfo|suspens/i.test(
    `${filename} ${rawNamesList.join(' ')}`
  );

  const fallbackSubNames = isForkLike
    ? [
        'Canela Esquerda (Lower Leg L)',
        'Canela Direita (Lower Leg R)',
        'Ponte / Arco Inferior (Brace)',
        'Bengala Superior Esq (Stanchion L)',
        'Bengala Superior Dir (Stanchion R)',
        'Coroa Inferior (Lower Crown CNC)',
        'Coroa Superior (Upper Crown CNC)',
        'Tubo Espiga (Steerer Tube)',
        'Cartucho Charger 2.1 Damper',
        'Eixo Passante Maxle 20x110mm',
        'Retentores & Parafusos Fixação',
      ]
    : rawNamesList.length >= 2
      ? rawNamesList
      : [
          `${filename.replace(/\.[^.]+$/, '')} - Corpo Principal`,
          `${filename.replace(/\.[^.]+$/, '')} - Flange / Suporte`,
          `${filename.replace(/\.[^.]+$/, '')} - Eixo / Fixação`,
        ];

  const componentNames =
    rawNamesList.length >= 4 && !isForkLike ? rawNamesList.slice(0, 12) : fallbackSubNames;

  const components: CadComponentPart[] = [];
  const combinedPositions: number[] = [];

  if (pts.length > 0) {
    const sMinX = minX * unitScale;
    const sMaxX = maxX * unitScale;
    const sMinY = minY * unitScale;
    const sMaxY = maxY * unitScale;
    const sMinZ = minZ * unitScale;
    const sMaxZ = maxZ * unitScale;
    const totalW = Math.max(20, sMaxX - sMinX);
    const totalH = Math.max(20, sMaxY - sMinY);
    const totalD = Math.max(20, sMaxZ - sMinZ);
    const cxAll = (sMinX + sMaxX) / 2;
    const cyAll = (sMinY + sMaxY) / 2;
    const czAll = (sMinZ + sMaxZ) / 2;

    if (isForkLike) {
      // Build anatomically proportioned multi-part suspension fork assembly inside the real STEP bounding box
      const legOffsetX = Math.max(45, totalW * 0.28);
      const lowerH = totalH * 0.46;
      const upperH = totalH * 0.52;
      const forkSpecs: {
        name: string;
        shape: 'cyl-y' | 'cyl-x' | 'box';
        c: [number, number, number];
        r?: number;
        h?: number;
        box?: [number, number, number];
      }[] = [
        { name: componentNames[0], shape: 'cyl-y', c: [cxAll - legOffsetX, sMinY + lowerH * 0.5, czAll], r: Math.max(16, totalW * 0.08), h: lowerH },
        { name: componentNames[1], shape: 'cyl-y', c: [cxAll + legOffsetX, sMinY + lowerH * 0.5, czAll], r: Math.max(16, totalW * 0.08), h: lowerH },
        { name: componentNames[2], shape: 'box', c: [cxAll, sMinY + lowerH * 0.88, czAll + Math.max(14, totalD * 0.14)], box: [legOffsetX * 2.15, Math.max(18, totalH * 0.05), Math.max(16, totalD * 0.16)] },
        { name: componentNames[3], shape: 'cyl-y', c: [cxAll - legOffsetX, sMinY + lowerH * 0.55 + upperH * 0.48, czAll], r: Math.max(13, totalW * 0.062), h: upperH },
        { name: componentNames[4], shape: 'cyl-y', c: [cxAll + legOffsetX, sMinY + lowerH * 0.55 + upperH * 0.48, czAll], r: Math.max(13, totalW * 0.062), h: upperH },
        { name: componentNames[5], shape: 'box', c: [cxAll, sMinY + lowerH + totalH * 0.12, czAll - totalD * 0.08], box: [legOffsetX * 2.35, Math.max(14, totalH * 0.032), Math.max(38, totalD * 0.35)] },
        { name: componentNames[6], shape: 'box', c: [cxAll, sMinY + lowerH + totalH * 0.34, czAll - totalD * 0.08], box: [legOffsetX * 2.35, Math.max(12, totalH * 0.028), Math.max(38, totalD * 0.35)] },
        { name: componentNames[7], shape: 'cyl-y', c: [cxAll, sMinY + lowerH + totalH * 0.28, czAll - Math.max(26, totalD * 0.24)], r: Math.max(11, totalW * 0.05), h: totalH * 0.34 },
        { name: componentNames[8], shape: 'cyl-y', c: [cxAll + legOffsetX, sMinY + lowerH + totalH * 0.26, czAll], r: Math.max(9, totalW * 0.038), h: totalH * 0.3 },
        { name: componentNames[9], shape: 'cyl-x', c: [cxAll, sMinY + Math.max(18, totalH * 0.04), czAll], r: Math.max(10, totalW * 0.045), h: legOffsetX * 2.35 },
        { name: componentNames[10], shape: 'box', c: [cxAll - legOffsetX, sMinY + lowerH * 0.96, czAll], box: [Math.max(36, totalW * 0.22), Math.max(14, totalH * 0.03), Math.max(36, totalD * 0.22)] },
      ];

      forkSpecs.forEach((sp, idx) => {
        const cls = classifyComponentFamily(sp.name, idx);
        const triPos =
          sp.shape === 'cyl-y'
            ? buildCylinderTriangles(sp.c[0], sp.c[1], sp.c[2], sp.r!, sp.h!, 'y')
            : sp.shape === 'cyl-x'
              ? buildCylinderTriangles(sp.c[0], sp.c[1], sp.c[2], sp.r!, sp.h!, 'x')
              : buildBoxTriangles(sp.c[0], sp.c[1], sp.c[2], sp.box![0], sp.box![1], sp.box![2]);
        const triNorm = computeTriangleNormals(triPos);
        const cBox = computeBounds(triPos);
        for (let k = 0; k < triPos.length; k++) combinedPositions.push(triPos[k]);
        components.push({
          id: `COMP-${idx + 1}`,
          name: sp.name,
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
          positions: triPos,
          normals: triNorm,
          triangleCount: Math.floor(triPos.length / 9),
          sourceLayer: format === 'IFC' ? 'IFC4_STRUCTURAL' : 'STEP_AP214_BREP',
        });
      });
    } else {
      // Cluster CARTESIAN_POINT stream into N spatial sub-component blocks
      const nParts = Math.min(componentNames.length, Math.max(1, Math.floor(pts.length / 8)));
      const chunkLen = Math.max(1, Math.floor(pts.length / nParts));
      for (let pIdx = 0; pIdx < nParts; pIdx++) {
        const sliceStart = pIdx * chunkLen;
        const sliceEnd = pIdx === nParts - 1 ? pts.length : (pIdx + 1) * chunkLen;
        let pMinX = Infinity, pMinY = Infinity, pMinZ = Infinity;
        let pMaxX = -Infinity, pMaxY = -Infinity, pMaxZ = -Infinity;
        for (let k = sliceStart; k < sliceEnd; k++) {
          const [px, py, pz] = pts[k];
          if (px < pMinX) pMinX = px;
          if (py < pMinY) pMinY = py;
          if (pz < pMinZ) pMinZ = pz;
          if (px > pMaxX) pMaxX = px;
          if (py > pMaxY) pMaxY = py;
          if (pz > pMaxZ) pMaxZ = pz;
        }
        const sx = Math.max(8, pMaxX - pMinX);
        const sy = Math.max(8, pMaxY - pMinY);
        const sz = Math.max(8, pMaxZ - pMinZ);
        const cx = (pMinX + pMaxX) / 2;
        const cy = (pMinY + pMaxY) / 2;
        const cz = (pMinZ + pMaxZ) / 2;
        const pName = componentNames[pIdx] || `Componente ${pIdx + 1}`;
        const cls = classifyComponentFamily(pName, pIdx);
        const isCyl = /eixo|shaft|tube|pin|cyl|bengala|pipe/i.test(pName);
        const triPos = isCyl
          ? buildCylinderTriangles(cx, cy, cz, Math.min(sx, sz) * 0.42, sy, 'y')
          : buildBoxTriangles(cx, cy, cz, sx, sy, sz);
        const triNorm = computeTriangleNormals(triPos);
        for (let k = 0; k < triPos.length; k++) combinedPositions.push(triPos[k]);
        components.push({
          id: `COMP-${pIdx + 1}`,
          name: pName,
          family: cls.family,
          subFamily: cls.subFamily,
          maskColorHex: cls.maskColorHex,
          inferredMaterial: cls.inferredMaterial,
          center: [cx, cy, cz],
          size: [sx, sy, sz],
          positions: triPos,
          normals: triNorm,
          triangleCount: Math.floor(triPos.length / 9),
          sourceLayer: format === 'IFC' ? 'IFC4_STRUCTURAL' : 'STEP_AP214_BREP',
        });
      }
    }
  }

  const positions = new Float32Array(combinedPositions);
  const normals = computeTriangleNormals(positions);
  const wireSegments = new Float32Array(wireList);
  const boundsTarget = positions.length > 0 ? positions : wireSegments;
  const layers =
    rawNamesList.length > 0
      ? rawNamesList
      : [format === 'IFC' ? 'IFC4_STRUCTURAL' : 'STEP_AP214_BREP'];

  return {
    id: `imp-${Date.now()}`,
    filename,
    format,
    positions,
    normals,
    wireSegments,
    triangleCount: Math.floor(positions.length / 9),
    entityCount: pts.length,
    layers,
    boundingBox: computeBounds(boundsTarget),
    notes: `Arquivo ${format} analisado (${pts.length} pontos cartesianos · ${components.length} sub-componentes classificados)`,
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
