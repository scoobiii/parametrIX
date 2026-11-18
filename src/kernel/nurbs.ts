import type {
  BimElement,
  ControlPoint4D,
  EvaluatedMesh,
  NurbsSurfaceData,
  ParametricDesignParams,
  PresetId,
} from '../types/cad';

/**
 * Generates a clamped uniform knot vector of length (n + p + 1)
 * where n = numControlPoints, p = degree.
 */
export function generateClampedKnots(numCtrlPts: number, degree: number): number[] {
  const n = numCtrlPts - 1;
  const m = n + degree + 1;
  const knots = new Array<number>(m + 1);
  for (let i = 0; i <= degree; i++) {
    knots[i] = 0;
  }
  const interior = m - 2 * degree;
  for (let i = 1; i < interior; i++) {
    knots[degree + i] = i / interior;
  }
  for (let i = m - degree; i <= m; i++) {
    knots[i] = 1;
  }
  return knots;
}

/**
 * Piegl & Tiller Algorithm A2.1: Find knot span index
 */
function findSpan(n: number, degree: number, u: number, knots: number[]): number {
  if (u >= knots[n + 1]) return n;
  if (u <= knots[degree]) return degree;
  let low = degree;
  let high = n + 1;
  let mid = Math.floor((low + high) / 2);
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) {
      high = mid;
    } else {
      low = mid;
    }
    mid = Math.floor((low + high) / 2);
  }
  return mid;
}

/**
 * Piegl & Tiller Algorithm A2.2: Compute non-vanishing B-spline basis functions
 */
function basisFunctions(span: number, u: number, degree: number, knots: number[]): number[] {
  const N = new Array<number>(degree + 1).fill(0);
  const left = new Array<number>(degree + 1).fill(0);
  const right = new Array<number>(degree + 1).fill(0);
  N[0] = 1.0;
  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0.0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];
      const temp = denom !== 0 ? N[r] / denom : 0;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

/**
 * Evaluates a rational B-spline (NURBS) surface point at (u, v) in [0, 1] x [0, 1].
 * Returns [x, y, z] in Three.js world space (Y-up, mm).
 */
export function evaluateNurbsPoint(
  surface: NurbsSurfaceData,
  u: number,
  v: number
): [number, number, number] {
  const uc = Math.max(0, Math.min(1, u));
  const vc = Math.max(0, Math.min(1, v));
  const nu = surface.uCount - 1;
  const nv = surface.vCount - 1;

  const spanU = findSpan(nu, surface.degreeU, uc, surface.knotsU);
  const spanV = findSpan(nv, surface.degreeV, vc, surface.knotsV);
  const Nu = basisFunctions(spanU, uc, surface.degreeU, surface.knotsU);
  const Nv = basisFunctions(spanV, vc, surface.degreeV, surface.knotsV);

  let wx = 0;
  let wy = 0;
  let wz = 0;
  let wSum = 0;

  for (let l = 0; l <= surface.degreeV; l++) {
    const vIdx = spanV - surface.degreeV + l;
    const nvVal = Nv[l];
    let tempX = 0;
    let tempY = 0;
    let tempZ = 0;
    let tempW = 0;

    for (let k = 0; k <= surface.degreeU; k++) {
      const uIdx = spanU - surface.degreeU + k;
      const cp = surface.controlPoints[uIdx][vIdx];
      const weightBasis = Nu[k] * cp.w;
      tempX += weightBasis * cp.x;
      tempY += weightBasis * cp.y;
      tempZ += weightBasis * cp.z;
      tempW += weightBasis;
    }

    wx += nvVal * tempX;
    wy += nvVal * tempY;
    wz += nvVal * tempZ;
    wSum += nvVal * tempW;
  }

  const invW = wSum !== 0 ? 1 / wSum : 1;
  return [wx * invW, wy * invW, wz * invW];
}

/**
 * Evaluates surface point, unit normal, and normalized curvature metric [0..1]
 */
export function evaluateNurbsPointAndNormal(
  surface: NurbsSurfaceData,
  u: number,
  v: number
): { point: [number, number, number]; normal: [number, number, number]; curvature: number } {
  const eps = 0.0025;
  const u0 = Math.max(0, u - eps);
  const u1 = Math.min(1, u + eps);
  const v0 = Math.max(0, v - eps);
  const v1 = Math.min(1, v + eps);

  const p = evaluateNurbsPoint(surface, u, v);
  const pu0 = evaluateNurbsPoint(surface, u0, v);
  const pu1 = evaluateNurbsPoint(surface, u1, v);
  const pv0 = evaluateNurbsPoint(surface, u, v0);
  const pv1 = evaluateNurbsPoint(surface, u, v1);

  const du: [number, number, number] = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
  const dv: [number, number, number] = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];

  // Cross product dv x du gives +Y normal when u runs +X and v runs +Z
  let nx = dv[1] * du[2] - dv[2] * du[1];
  let ny = dv[2] * du[0] - dv[0] * du[2];
  let nz = dv[0] * du[1] - dv[1] * du[0];

  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  // Second derivative magnitude proxy for curvature visualization
  const d2u = Math.hypot(
    pu1[0] - 2 * p[0] + pu0[0],
    pu1[1] - 2 * p[1] + pu0[1],
    pu1[2] - 2 * p[2] + pu0[2]
  );
  const d2v = Math.hypot(
    pv1[0] - 2 * p[0] + pv0[0],
    pv1[1] - 2 * p[1] + pv0[1],
    pv1[2] - 2 * p[2] + pv0[2]
  );
  const curvature = Math.min(1, (d2u + d2v) * 2.4);

  return { point: p, normal: [nx, ny, nz], curvature };
}

function curvatureToRgb(c: number): [number, number, number] {
  // Cool technical spectrum: deep blue -> cyan -> emerald -> amber -> crimson
  const t = Math.max(0, Math.min(1, c));
  if (t < 0.25) {
    const k = t / 0.25;
    return [0.12, 0.35 + k * 0.45, 0.85 + k * 0.1];
  }
  if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return [0.12 + k * 0.15, 0.8 + k * 0.1, 0.95 - k * 0.5];
  }
  if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return [0.27 + k * 0.68, 0.9 - k * 0.18, 0.45 - k * 0.35];
  }
  const k = (t - 0.75) / 0.25;
  return [0.95, 0.72 - k * 0.5, 0.1 + k * 0.1];
}

/**
 * Generates BIM Waffle Rib Elements along U and V isolines
 */
export function generateBimWaffleElements(
  surface: NurbsSurfaceData,
  ribCountU: number,
  ribCountV: number,
  ribHeightMm: number
): BimElement[] {
  const elements: BimElement[] = [];
  const sampleSteps = 16;

  // U-direction ribs
  for (let i = 0; i < ribCountU; i++) {
    const u = ribCountU === 1 ? 0.5 : 0.06 + (i / (ribCountU - 1)) * 0.88;
    let totalLen = 0;
    let avgX = 0;
    let avgY = 0;
    let avgZ = 0;
    let prev = evaluateNurbsPoint(surface, u, 0);
    const first = prev;
    let last = prev;

    for (let s = 0; s <= sampleSteps; s++) {
      const v = s / sampleSteps;
      const pt = evaluateNurbsPoint(surface, u, v);
      if (s > 0) {
        totalLen += Math.hypot(pt[0] - prev[0], pt[1] - prev[1], pt[2] - prev[2]);
      }
      avgX += pt[0];
      avgY += pt[1];
      avgZ += pt[2];
      prev = pt;
      last = pt;
    }
    const count = sampleSteps + 1;
    avgX /= count;
    avgY /= count;
    avgZ /= count;

    const dx = last[0] - first[0];
    const dz = last[2] - first[2];
    const rotY = Math.atan2(dx, dz);
    const thickness = Math.max(4, Math.min(12, surface.thicknessMm * 0.65));
    // Aluminum / engineered glulam density ~ 0.0027 kg/cm3
    const volumeCm3 = (totalLen * ribHeightMm * thickness) / 1000;

    elements.push({
      id: `BIM-U-${i + 1}`,
      label: `Longarina U-${String(i + 1).padStart(2, '0')}`,
      ifcClass: 'IfcBeam',
      material: 'Alumínio 6061-T6 / Lamelado',
      center: [avgX, Math.max(ribHeightMm * 0.4, avgY - ribHeightMm * 0.55), avgZ],
      size: [thickness, ribHeightMm, totalLen],
      rotationY: rotY,
      lengthMm: totalLen,
      massKg: Number((volumeCm3 * 0.0027).toFixed(2)),
    });
  }

  // V-direction cross ribs
  for (let j = 0; j < ribCountV; j++) {
    const v = ribCountV === 1 ? 0.5 : 0.06 + (j / (ribCountV - 1)) * 0.88;
    let totalLen = 0;
    let avgX = 0;
    let avgY = 0;
    let avgZ = 0;
    let prev = evaluateNurbsPoint(surface, 0, v);
    const first = prev;
    let last = prev;

    for (let s = 0; s <= sampleSteps; s++) {
      const u = s / sampleSteps;
      const pt = evaluateNurbsPoint(surface, u, v);
      if (s > 0) {
        totalLen += Math.hypot(pt[0] - prev[0], pt[1] - prev[1], pt[2] - prev[2]);
      }
      avgX += pt[0];
      avgY += pt[1];
      avgZ += pt[2];
      prev = pt;
      last = pt;
    }
    const count = sampleSteps + 1;
    avgX /= count;
    avgY /= count;
    avgZ /= count;

    const dx = last[0] - first[0];
    const dz = last[2] - first[2];
    const rotY = Math.atan2(dx, dz);
    const thickness = Math.max(4, Math.min(12, surface.thicknessMm * 0.65));
    const volumeCm3 = (totalLen * ribHeightMm * thickness) / 1000;

    elements.push({
      id: `BIM-V-${j + 1}`,
      label: `Travessa V-${String(j + 1).padStart(2, '0')}`,
      ifcClass: 'IfcMember',
      material: 'Alumínio 6061-T6 / Lamelado',
      center: [avgX, Math.max(ribHeightMm * 0.4, avgY - ribHeightMm * 0.55), avgZ],
      size: [thickness, ribHeightMm * 0.85, totalLen],
      rotationY: rotY,
      lengthMm: totalLen,
      massKg: Number((volumeCm3 * 0.0027).toFixed(2)),
    });
  }

  return elements;
}

/**
 * Tessellates a NURBS surface into a solid thickened BufferGeometry dataset
 * + extracts isocurves and computes accurate area, volume, and bounding box.
 */
export function tessellateNurbsSurface(
  surface: NurbsSurfaceData,
  ribCountU = 5,
  ribCountV = 4,
  ribHeightMm = 14
): EvaluatedMesh {
  const uSegs = Math.max(8, Math.min(96, surface.uDivisions));
  const vSegs = Math.max(8, Math.min(96, surface.vDivisions));
  const cols = uSegs + 1;
  const rows = vSegs + 1;
  const layerVerts = cols * rows;
  const hasThickness = surface.thicknessMm > 0.5;
  const totalVerts = hasThickness ? layerVerts * 2 : layerVerts;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let j = 0; j < rows; j++) {
    const v = j / vSegs;
    for (let i = 0; i < cols; i++) {
      const u = i / uSegs;
      const idx = j * cols + i;
      const { point, normal, curvature } = evaluateNurbsPointAndNormal(surface, u, v);
      const [r, g, b] = curvatureToRgb(curvature);

      positions[idx * 3] = point[0];
      positions[idx * 3 + 1] = point[1];
      positions[idx * 3 + 2] = point[2];

      normals[idx * 3] = normal[0];
      normals[idx * 3 + 1] = normal[1];
      normals[idx * 3 + 2] = normal[2];

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;

      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;

      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
      maxZ = Math.max(maxZ, point[2]);

      if (hasThickness) {
        const bIdx = layerVerts + idx;
        const bx = point[0] - normal[0] * surface.thicknessMm;
        const by = point[1] - normal[1] * surface.thicknessMm;
        const bz = point[2] - normal[2] * surface.thicknessMm;

        positions[bIdx * 3] = bx;
        positions[bIdx * 3 + 1] = by;
        positions[bIdx * 3 + 2] = bz;

        normals[bIdx * 3] = -normal[0];
        normals[bIdx * 3 + 1] = -normal[1];
        normals[bIdx * 3 + 2] = -normal[2];

        uvs[bIdx * 2] = u;
        uvs[bIdx * 2 + 1] = v;

        colors[bIdx * 3] = r * 0.75;
        colors[bIdx * 3 + 1] = g * 0.75;
        colors[bIdx * 3 + 2] = b * 0.75;

        minX = Math.min(minX, bx);
        minY = Math.min(minY, by);
        minZ = Math.min(minZ, bz);
        maxX = Math.max(maxX, bx);
        maxY = Math.max(maxY, by);
        maxZ = Math.max(maxZ, bz);
      }
    }
  }

  const topTris = uSegs * vSegs * 2;
  const skirtTris = hasThickness ? (uSegs * 4 + vSegs * 4) : 0;
  const totalTris = hasThickness ? topTris * 2 + skirtTris : topTris;
  const indices = new Uint32Array(totalTris * 3);
  let ptr = 0;

  let surfaceAreaMm2 = 0;

  // Top surface triangles
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = (j + 1) * cols + i;
      const d = c + 1;

      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;

      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;

      // Accumulate surface area
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
      const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
      const dx = positions[d * 3], dy = positions[d * 3 + 1], dz = positions[d * 3 + 2];

      const v1x = cx - ax, v1y = cy - ay, v1z = cz - az;
      const v2x = bx - ax, v2y = by - ay, v2z = bz - az;
      const cross1 = Math.hypot(
        v1y * v2z - v1z * v2y,
        v1z * v2x - v1x * v2z,
        v1x * v2y - v1y * v2x
      );

      const w1x = cx - bx, w1y = cy - by, w1z = cz - bz;
      const w2x = dx - bx, w2y = dy - by, w2z = dz - bz;
      const cross2 = Math.hypot(
        w1y * w2z - w1z * w2y,
        w1z * w2x - w1x * w2z,
        w1x * w2y - w1y * w2x
      );

      surfaceAreaMm2 += 0.5 * (cross1 + cross2);
    }
  }

  if (hasThickness) {
    // Bottom surface (reversed winding)
    for (let j = 0; j < vSegs; j++) {
      for (let i = 0; i < uSegs; i++) {
        const a = layerVerts + j * cols + i;
        const b = a + 1;
        const c = layerVerts + (j + 1) * cols + i;
        const d = c + 1;

        indices[ptr++] = a;
        indices[ptr++] = b;
        indices[ptr++] = c;

        indices[ptr++] = b;
        indices[ptr++] = d;
        indices[ptr++] = c;
      }
    }

    // Perimeter skirts (4 edges)
    // j = 0 edge
    for (let i = 0; i < uSegs; i++) {
      const t0 = i;
      const t1 = i + 1;
      const b0 = layerVerts + t0;
      const b1 = layerVerts + t1;
      indices[ptr++] = t0; indices[ptr++] = t1; indices[ptr++] = b0;
      indices[ptr++] = t1; indices[ptr++] = b1; indices[ptr++] = b0;
    }
    // j = vSegs edge
    for (let i = 0; i < uSegs; i++) {
      const t0 = vSegs * cols + i;
      const t1 = t0 + 1;
      const b0 = layerVerts + t0;
      const b1 = layerVerts + t1;
      indices[ptr++] = t0; indices[ptr++] = b0; indices[ptr++] = t1;
      indices[ptr++] = t1; indices[ptr++] = b0; indices[ptr++] = b1;
    }
    // i = 0 edge
    for (let j = 0; j < vSegs; j++) {
      const t0 = j * cols;
      const t1 = (j + 1) * cols;
      const b0 = layerVerts + t0;
      const b1 = layerVerts + t1;
      indices[ptr++] = t0; indices[ptr++] = b0; indices[ptr++] = t1;
      indices[ptr++] = t1; indices[ptr++] = b0; indices[ptr++] = b1;
    }
    // i = uSegs edge
    for (let j = 0; j < vSegs; j++) {
      const t0 = j * cols + uSegs;
      const t1 = (j + 1) * cols + uSegs;
      const b0 = layerVerts + t0;
      const b1 = layerVerts + t1;
      indices[ptr++] = t0; indices[ptr++] = t1; indices[ptr++] = b0;
      indices[ptr++] = t1; indices[ptr++] = b1; indices[ptr++] = b0;
    }
  }

  // Extract U & V Isocurves
  const isocurves: [number, number, number][][] = [];
  const isoUCount = 7;
  const isoVCount = 7;
  const isoSamples = 36;

  for (let k = 0; k < isoUCount; k++) {
    const u = k / (isoUCount - 1);
    const curve: [number, number, number][] = [];
    for (let s = 0; s <= isoSamples; s++) {
      curve.push(evaluateNurbsPoint(surface, u, s / isoSamples));
    }
    isocurves.push(curve);
  }
  for (let k = 0; k < isoVCount; k++) {
    const v = k / (isoVCount - 1);
    const curve: [number, number, number][] = [];
    for (let s = 0; s <= isoSamples; s++) {
      curve.push(evaluateNurbsPoint(surface, s / isoSamples, v));
    }
    isocurves.push(curve);
  }

  const bimElements = generateBimWaffleElements(surface, ribCountU, ribCountV, ribHeightMm);
  const volumeCm3 = (surfaceAreaMm2 * Math.max(1, surface.thicknessMm)) / 1000;

  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    triangleCount: totalTris,
    vertexCount: totalVerts,
    isocurves,
    bimElements,
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      size: [maxX - minX, maxY - minY, maxZ - minZ],
    },
    surfaceAreaCm2: Number((surfaceAreaMm2 / 100).toFixed(2)),
    volumeCm3: Number(volumeCm3.toFixed(2)),
  };
}

/**
 * Generates a parametric 6x6 NURBS control point grid from engineering presets & parameters
 */
export function buildNurbsSurfaceFromParams(params: ParametricDesignParams): NurbsSurfaceData {
  const uCount = 6;
  const vCount = 6;
  const degreeU = 3;
  const degreeV = 3;
  const knotsU = generateClampedKnots(uCount, degreeU);
  const knotsV = generateClampedKnots(vCount, degreeV);

  const halfX = params.spanX / 2;
  const halfZ = params.spanY / 2;
  const twistRad = (params.twistDeg * Math.PI) / 180;

  const controlPoints: ControlPoint4D[][] = [];

  for (let i = 0; i < uCount; i++) {
    const row: ControlPoint4D[] = [];
    const uNorm = i / (uCount - 1); // 0..1
    const uCentered = uNorm * 2 - 1; // -1..1

    for (let j = 0; j < vCount; j++) {
      const vNorm = j / (vCount - 1); // 0..1
      const vCentered = vNorm * 2 - 1; // -1..1

      let x = uCentered * halfX;
      let z = vCentered * halfZ;
      let y = 18; // base offset above machining bed (mm)
      let w = 1.0;

      if (params.preset === 'shell') {
        const dome = (1 - uCentered * uCentered * 0.72) * (1 - vCentered * vCentered * 0.45);
        const ripple =
          Math.sin(uNorm * Math.PI * 2) * Math.cos(vNorm * Math.PI) * params.waveAmplitude;
        y += dome * params.archHeight + ripple;
        if (i > 0 && i < uCount - 1 && j > 0 && j < vCount - 1) {
          w = 1.35;
        }
      } else if (params.preset === 'impeller') {
        // Aerodynamic twisted hydrofoil / turbine blade surface
        const chordTaper = 1 - uNorm * 0.35;
        z = vCentered * halfZ * chordTaper;
        const camber = (1 - vCentered * vCentered) * params.archHeight * 0.55;
        const localTwist = twistRad * uNorm;
        const ry = camber + Math.sin(uNorm * Math.PI) * params.waveAmplitude * 0.6;
        const rz = z * Math.cos(localTwist) - ry * Math.sin(localTwist);
        const rHeight = z * Math.sin(localTwist) + ry * Math.cos(localTwist);
        z = rz;
        y += 28 + rHeight;
        w = vCentered === 0 ? 1.5 : 1.0;
      } else if (params.preset === 'cavity') {
        // Precision CNC mold cavity block with central NURBS pocket
        const r2 = uCentered * uCentered + vCentered * vCentered;
        const isInterior = i >= 1 && i <= uCount - 2 && j >= 1 && j <= vCount - 2;
        const pocket = isInterior
          ? -params.archHeight * 0.65 * Math.exp(-r2 * 1.4) +
            Math.cos(uCentered * Math.PI) * Math.cos(vCentered * Math.PI) * params.waveAmplitude * 0.4
          : 0;
        y += params.archHeight * 0.55 + pocket;
        w = isInterior ? 1.2 : 1.0;
      } else if (params.preset === 'diagrid') {
        // BIM Parabolic Vault with diagonal wave modulation
        const vault = (1 - uCentered * uCentered) * params.archHeight;
        const diagWave = Math.sin((uNorm + vNorm) * Math.PI * 2) * params.waveAmplitude * 0.7;
        y += vault + diagWave;
        w = 1.15;
      }

      // Apply twist in XZ plane if not impeller
      if (params.preset !== 'impeller' && Math.abs(twistRad) > 0.001) {
        const angle = twistRad * (uCentered * 0.5);
        const nx = x * Math.cos(angle) - z * Math.sin(angle);
        const nz = x * Math.sin(angle) + z * Math.cos(angle);
        x = nx;
        z = nz;
      }

      // Apply attractor deformation if active (via Grasshopper or Plugin)
      if (Math.abs(params.attractorStrength) > 0.01) {
        const dist = Math.hypot(uCentered, vCentered);
        y += Math.exp(-dist * dist * 3.0) * params.attractorStrength;
      }

      row.push({ x, y: Math.max(4, y), z, w });
    }
    controlPoints.push(row);
  }

  const presetNames: Record<PresetId, string> = {
    shell: 'Casca NURBS Dupla Curvatura',
    impeller: 'Pá Aerodinâmica Helicoidal',
    cavity: 'Molde Cavidade CNC 3+2',
    diagrid: 'Abóbada BIM Paramétrica',
  };

  return {
    id: `nurbs-${params.preset}`,
    name: presetNames[params.preset],
    degreeU,
    degreeV,
    knotsU,
    knotsV,
    uCount,
    vCount,
    controlPoints,
    uDivisions: params.uDivisions,
    vDivisions: params.vDivisions,
    thicknessMm: params.thicknessMm,
  };
}
