import { ShapeUtils, Vector2 } from 'three';
import { computeBounds, computeTriangleNormals } from './cadFormats';
import type {
  CadComponentPart,
  ImportedCadModel,
  PartEngineeringProfile,
} from '../types/cad';

/**
 * Engrenagem cilíndrica de dentes retos com perfil de evolvente.
 *
 * Referências normativas usadas apenas para as fórmulas geométricas:
 * - ISO 53:1998  — perfil de referência (addendum 1·m, dedendum 1,25·m)
 * - ISO 21771:2007 — geometria de engrenagens cilíndricas
 *
 * Todas as dimensões abaixo são DERIVADAS do módulo, do número de dentes e do
 * ângulo de pressão. Nenhuma dimensão é estimada ou arredondada para "ficar bonita".
 */

const TAU = Math.PI * 2;
/** Densidade nominal do alumínio 7075-T6 (2,81 g/cm³). */
export const ALUMINUM_7075_T6_DENSITY_KG_M3 = 2810;
const HOLE_SEGMENTS = 32;

export type Vec2 = [number, number];

export interface SpurGearSpec {
  /** Módulo normal em mm (ISO 54 série I). */
  moduleMm: number;
  /** Número de dentes (inteiro). */
  teeth: number;
  /** Ângulo de pressão de referência em graus. */
  pressureAngleDeg: number;
  /** Largura de face em mm. */
  faceWidthMm: number;
  /** Diâmetro do furo central em mm. */
  boreDiameterMm: number;
  /** Quantidade de alívios circulares (0 desativa). */
  lighteningHoleCount: number;
  /** Diâmetro dos alívios em mm. */
  lighteningHoleDiameterMm: number;
  /** Raio do círculo primitivo dos alívios em mm (PCD/2). */
  lighteningHolePitchRadiusMm: number;
  /** Amostras por flanco de evolvente (>= 2). */
  flankSamples: number;
  /** Densidade do material em kg/m³. */
  densityKgM3: number;
}

export interface SpurGearMetrics {
  moduleMm: number;
  teeth: number;
  pressureAngleDeg: number;
  pitchDiameterMm: number;
  baseDiameterMm: number;
  tipDiameterMm: number;
  rootDiameterMm: number;
  addendumMm: number;
  dedendumMm: number;
  circularPitchMm: number;
  toothThicknessAtPitchMm: number;
  tipToothThicknessMm: number;
  faceWidthMm: number;
  boreDiameterMm: number;
  lighteningHoleCount: number;
  lighteningHoleDiameterMm: number;
  lighteningHolePitchRadiusMm: number;
  faceAreaMm2: number;
  volumeMm3: number;
  massKg: number;
  surfaceAreaMm2: number;
  densityKgM3: number;
}

export interface SpurGearHole {
  kind: 'bore' | 'lightening';
  center: Vec2;
  radiusMm: number;
  points: Vec2[];
}

export interface SpurGearMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  volumeMm3: number;
  surfaceAreaMm2: number;
  profile: Vec2[];
  holes: SpurGearHole[];
  metrics: SpurGearMetrics;
}

export const SPUR_GEAR_SPEC: SpurGearSpec = {
  moduleMm: 2,
  teeth: 24,
  pressureAngleDeg: 20,
  faceWidthMm: 12,
  boreDiameterMm: 12,
  lighteningHoleCount: 4,
  lighteningHoleDiameterMm: 8,
  lighteningHolePitchRadiusMm: 14,
  flankSamples: 14,
  densityKgM3: ALUMINUM_7075_T6_DENSITY_KG_M3,
};

function requirePositive(value: number, field: string): void {
  if (!(value > 0)) {
    throw new Error(`Parâmetro inválido: ${field} deve ser maior que zero (recebido ${value}).`);
  }
}

function requireIntegerAtLeast(value: number, min: number, field: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Parâmetro inválido: ${field} deve ser inteiro >= ${min} (recebido ${value}).`);
  }
}

function requireOpenRange(value: number, min: number, max: number, field: string): void {
  if (!(value > min && value < max)) {
    throw new Error(
      `Parâmetro inválido: ${field} deve estar entre ${min} e ${max} (recebido ${value}).`
    );
  }
}

interface SpurGearCore {
  alphaRad: number;
  pitchRadiusMm: number;
  baseRadiusMm: number;
  tipRadiusMm: number;
  rootRadiusMm: number;
  involuteAtTip: number;
  halfToothAngleRad: number;
  thetaBaseRad: number;
  thetaTipRad: number;
}

function involuteOf(alphaRad: number): number {
  return Math.tan(alphaRad) - alphaRad;
}

function gearCore(spec: SpurGearSpec): SpurGearCore {
  const alphaRad = (spec.pressureAngleDeg * Math.PI) / 180;
  const pitchRadiusMm = (spec.moduleMm * spec.teeth) / 2;
  const baseRadiusMm = pitchRadiusMm * Math.cos(alphaRad);
  const tipRadiusMm = pitchRadiusMm + spec.moduleMm;
  const rootRadiusMm = pitchRadiusMm - 1.25 * spec.moduleMm;
  const alphaTip = Math.acos(baseRadiusMm / tipRadiusMm);
  const halfToothAngleRad = Math.PI / (2 * spec.teeth);
  const thetaBaseRad = halfToothAngleRad + involuteOf(alphaRad);
  const thetaTipRad = thetaBaseRad - involuteOf(alphaTip);
  return {
    alphaRad,
    pitchRadiusMm,
    baseRadiusMm,
    tipRadiusMm,
    rootRadiusMm,
    involuteAtTip: Math.tan(alphaTip) - alphaTip,
    halfToothAngleRad,
    thetaBaseRad,
    thetaTipRad,
  };
}

/**
 * Valida os parâmetros e as condições de existência do perfil (sem raiz negativa,
 * sem ponta de dente negativa e sem alívios que invadam o furo ou a raiz).
 */
export function validateSpurGearSpec(spec: SpurGearSpec): void {
  requirePositive(spec.moduleMm, 'moduleMm');
  requireIntegerAtLeast(spec.teeth, 6, 'teeth');
  requireOpenRange(spec.pressureAngleDeg, 5, 45, 'pressureAngleDeg');
  requirePositive(spec.faceWidthMm, 'faceWidthMm');
  requirePositive(spec.boreDiameterMm, 'boreDiameterMm');
  requireIntegerAtLeast(spec.flankSamples, 2, 'flankSamples');
  requirePositive(spec.densityKgM3, 'densityKgM3');
  requireIntegerAtLeast(spec.lighteningHoleCount, 0, 'lighteningHoleCount');

  const core = gearCore(spec);
  if (!(core.rootRadiusMm > spec.boreDiameterMm / 2 + 0.5)) {
    throw new Error(
      `Parâmetro inválido: furo Ø${spec.boreDiameterMm} não deixa parede entre o furo e a raiz Ø${(core.rootRadiusMm * 2).toFixed(3)}.`
    );
  }
  if (!(core.thetaTipRad > 0)) {
    throw new Error(
      `Parâmetro inválido: ponta de dente inexistente (m=${spec.moduleMm}, z=${spec.teeth}, α=${spec.pressureAngleDeg}°).`
    );
  }

  if (spec.lighteningHoleCount > 0) {
    requirePositive(spec.lighteningHoleDiameterMm, 'lighteningHoleDiameterMm');
    requirePositive(spec.lighteningHolePitchRadiusMm, 'lighteningHolePitchRadiusMm');
    const holeRadius = spec.lighteningHoleDiameterMm / 2;
    const boreRadius = spec.boreDiameterMm / 2;
    if (!(spec.lighteningHolePitchRadiusMm - holeRadius > boreRadius + 0.5)) {
      throw new Error('Parâmetro inválido: alívios colidem com o furo central.');
    }
    if (!(spec.lighteningHolePitchRadiusMm + holeRadius < core.rootRadiusMm - 0.5)) {
      throw new Error('Parâmetro inválido: alívios invadem a raiz dos dentes.');
    }
    const adjacentChord =
      2 * spec.lighteningHolePitchRadiusMm * Math.sin(Math.PI / spec.lighteningHoleCount);
    if (!(adjacentChord > spec.lighteningHoleDiameterMm + 0.5)) {
      throw new Error('Parâmetro inválido: alívios adjacentes se sobrepõem.');
    }
  }
}

function polarPoint(radiusMm: number, angleRad: number): Vec2 {
  return [radiusMm * Math.cos(angleRad), radiusMm * Math.sin(angleRad)];
}

function involuteRadius(baseRadiusMm: number, t: number): number {
  return baseRadiusMm * Math.sqrt(1 + t * t);
}

/**
 * Contorno externo fechado (anti-horário) com flancos de evolvente, arco de topo
 * e arco de raiz. A raiz é modelada sem filete trocoidal (documentado no relatório).
 */
export function buildSpurGearProfile(spec: SpurGearSpec = SPUR_GEAR_SPEC): Vec2[] {
  validateSpurGearSpec(spec);
  const core = gearCore(spec);
  const tTip = Math.sqrt((core.tipRadiusMm / core.baseRadiusMm) ** 2 - 1);
  const tipArcSegments = Math.max(4, Math.round(spec.flankSamples / 3));
  const rootArcSegments = tipArcSegments;
  const toothStep = TAU / spec.teeth;
  const points: Vec2[] = [];

  for (let tooth = 0; tooth < spec.teeth; tooth++) {
    const center = tooth * toothStep;
    points.push(polarPoint(core.rootRadiusMm, center - core.thetaBaseRad));
    points.push(polarPoint(core.baseRadiusMm, center - core.thetaBaseRad));

    for (let sample = 1; sample <= spec.flankSamples; sample++) {
      const t = (tTip * sample) / spec.flankSamples;
      const angle = center - (core.thetaBaseRad - involuteOf(Math.atan(t)));
      points.push(polarPoint(involuteRadius(core.baseRadiusMm, t), angle));
    }

    for (let sample = 1; sample <= tipArcSegments; sample++) {
      const angle =
        center - core.thetaTipRad + (2 * core.thetaTipRad * sample) / tipArcSegments;
      points.push(polarPoint(core.tipRadiusMm, angle));
    }

    for (let sample = spec.flankSamples - 1; sample >= 0; sample--) {
      const t = (tTip * sample) / spec.flankSamples;
      const angle = center + (core.thetaBaseRad - involuteOf(Math.atan(t)));
      points.push(polarPoint(involuteRadius(core.baseRadiusMm, t), angle));
    }

    points.push(polarPoint(core.rootRadiusMm, center + core.thetaBaseRad));

    for (let sample = 1; sample < rootArcSegments; sample++) {
      const angle =
        center +
        core.thetaBaseRad +
        ((toothStep - 2 * core.thetaBaseRad) * sample) / rootArcSegments;
      points.push(polarPoint(core.rootRadiusMm, angle));
    }
  }

  return points;
}

function circlePoints(centerX: number, centerY: number, radiusMm: number): Vec2[] {
  // Sentido horário: os furos são contornos internos do material.
  const points: Vec2[] = [];
  for (let segment = 0; segment < HOLE_SEGMENTS; segment++) {
    const angle = (-TAU * segment) / HOLE_SEGMENTS;
    points.push([centerX + radiusMm * Math.cos(angle), centerY + radiusMm * Math.sin(angle)]);
  }
  return points;
}

/** Furo central mais os alívios, todos fechados no sentido horário (para o furo). */
export function buildSpurGearHoles(spec: SpurGearSpec = SPUR_GEAR_SPEC): SpurGearHole[] {
  validateSpurGearSpec(spec);
  const boreRadius = spec.boreDiameterMm / 2;
  const holes: SpurGearHole[] = [
    {
      kind: 'bore',
      center: [0, 0],
      radiusMm: boreRadius,
      points: circlePoints(0, 0, boreRadius),
    },
  ];
  if (spec.lighteningHoleCount > 0) {
    const holeRadius = spec.lighteningHoleDiameterMm / 2;
    for (let index = 0; index < spec.lighteningHoleCount; index++) {
      const angle = (TAU * index) / spec.lighteningHoleCount + Math.PI / spec.teeth;
      const cx = spec.lighteningHolePitchRadiusMm * Math.cos(angle);
      const cy = spec.lighteningHolePitchRadiusMm * Math.sin(angle);
      holes.push({
        kind: 'lightening',
        center: [cx, cy],
        radiusMm: holeRadius,
        points: circlePoints(cx, cy, holeRadius),
      });
    }
  }
  return holes;
}

/** Área assinada (positiva se o polígono estiver anti-horário). */
function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function polygonPerimeter(points: Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    sum += Math.hypot(x1 - x0, y1 - y0);
  }
  return sum;
}

export function computeSpurGearMetrics(
  spec: SpurGearSpec = SPUR_GEAR_SPEC
): SpurGearMetrics {
  validateSpurGearSpec(spec);
  const core = gearCore(spec);
  const profile = buildSpurGearProfile(spec);
  const holes = buildSpurGearHoles(spec);
  const outlineArea = Math.abs(polygonArea(profile));
  const holesArea = holes.reduce((sum, hole) => sum + Math.abs(polygonArea(hole.points)), 0);
  const faceAreaMm2 = outlineArea - holesArea;
  const volumeMm3 = faceAreaMm2 * spec.faceWidthMm;
  const perimeter = polygonPerimeter(profile);
  const holesPerimeter = holes.reduce((sum, hole) => sum + polygonPerimeter(hole.points), 0);
  const surfaceAreaMm2 = 2 * faceAreaMm2 + (perimeter + holesPerimeter) * spec.faceWidthMm;
  const tipToothThicknessMm = 2 * core.tipRadiusMm * core.thetaTipRad;

  return {
    moduleMm: spec.moduleMm,
    teeth: spec.teeth,
    pressureAngleDeg: spec.pressureAngleDeg,
    pitchDiameterMm: core.pitchRadiusMm * 2,
    baseDiameterMm: core.baseRadiusMm * 2,
    tipDiameterMm: core.tipRadiusMm * 2,
    rootDiameterMm: core.rootRadiusMm * 2,
    addendumMm: spec.moduleMm,
    dedendumMm: 1.25 * spec.moduleMm,
    circularPitchMm: Math.PI * spec.moduleMm,
    toothThicknessAtPitchMm: (Math.PI * spec.moduleMm) / 2,
    tipToothThicknessMm,
    faceWidthMm: spec.faceWidthMm,
    boreDiameterMm: spec.boreDiameterMm,
    lighteningHoleCount: spec.lighteningHoleCount,
    lighteningHoleDiameterMm: spec.lighteningHoleDiameterMm,
    lighteningHolePitchRadiusMm: spec.lighteningHolePitchRadiusMm,
    faceAreaMm2,
    volumeMm3,
    massKg: volumeMm3 * 1e-9 * spec.densityKgM3,
    surfaceAreaMm2,
    densityKgM3: spec.densityKgM3,
  };
}

function triangleSignedVolume(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
  return (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
}

/**
 * Malha triangular fechada da engrenagem, no referencial CAD Z-up convertido para
 * Three.js Y-up (x, z, -y). A espessura corre ao longo de +Y.
 */
export function buildSpurGearMesh(spec: SpurGearSpec = SPUR_GEAR_SPEC): SpurGearMesh {
  validateSpurGearSpec(spec);
  const profile = buildSpurGearProfile(spec);
  const holes = buildSpurGearHoles(spec);
  const metrics = computeSpurGearMetrics(spec);

  const contour = profile.map(([x, y]) => new Vector2(x, y));
  const holePaths = holes.map((hole) => hole.points.map(([x, y]) => new Vector2(x, y)));
  const capTriangles = ShapeUtils.triangulateShape(contour, holePaths);
  const capVertices: Vec2[] = profile.concat(...holes.map((hole) => hole.points));

  const positions: number[] = [];
  const pushTriangle = (a: Vec2, b: Vec2, c: Vec2, height: number): void => {
    // CAD (x, y, z) -> Three.js (x, z, -y)
    positions.push(a[0], height, -a[1], b[0], height, -b[1], c[0], height, -c[1]);
  };

  const thickness = spec.faceWidthMm;
  for (const [i, j, k] of capTriangles) {
    // Tampo superior (+Y) mantém o sentido anti-horário vindo da triangulação 2D.
    pushTriangle(capVertices[i], capVertices[j], capVertices[k], thickness);
    // Tampo inferior (-Y) é o mesmo triângulo com o sentido invertido.
    pushTriangle(capVertices[k], capVertices[j], capVertices[i], 0);
  }

  const loops = [profile, ...holes.map((hole) => hole.points)];
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index++) {
      const [x0, y0] = loop[index];
      const [x1, y1] = loop[(index + 1) % loop.length];
      positions.push(x0, 0, -y0, x1, 0, -y1, x1, thickness, -y1);
      positions.push(x0, 0, -y0, x1, thickness, -y1, x0, thickness, -y0);
    }
  }

  const positionArray = new Float32Array(positions);
  const vertexCount = positionArray.length / 3;
  const indices = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index++) {
    indices[index] = index;
  }

  let meshVolumeMm3 = 0;
  let meshSurfaceAreaMm2 = 0;
  for (let index = 0; index < positionArray.length; index += 9) {
    const ax = positionArray[index];
    const ay = positionArray[index + 1];
    const az = positionArray[index + 2];
    const bx = positionArray[index + 3];
    const by = positionArray[index + 4];
    const bz = positionArray[index + 5];
    const cx = positionArray[index + 6];
    const cy = positionArray[index + 7];
    const cz = positionArray[index + 8];
    meshVolumeMm3 += triangleSignedVolume(ax, ay, az, bx, by, bz, cx, cy, cz);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    meshSurfaceAreaMm2 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }

  return {
    positions: positionArray,
    normals: computeTriangleNormals(positionArray),
    indices,
    triangleCount: Math.floor(positionArray.length / 9),
    volumeMm3: meshVolumeMm3,
    surfaceAreaMm2: meshSurfaceAreaMm2,
    profile,
    holes,
    metrics,
  };
}

function formatBr(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits).replace('.', ',');
}

/**
 * Modelo importável consumido pelo Parametrix CAD Studio.
 */
export function buildSpurGearModel(spec: SpurGearSpec = SPUR_GEAR_SPEC): ImportedCadModel {
  const mesh = buildSpurGearMesh(spec);
  const metrics = mesh.metrics;
  const boundingBox = computeBounds(mesh.positions);
  const component: CadComponentPart = {
    id: 'COMP-1',
    name: 'Engrenagem Cilíndrica de Dentes Retos (corpo único)',
    family: 'Transmissão Mecânica',
    subFamily: 'Engrenagem cilíndrica de dentes retos',
    maskColorHex: '#38bdf8',
    inferredMaterial: 'aluminum',
    center: [
      (boundingBox.min[0] + boundingBox.max[0]) / 2,
      (boundingBox.min[1] + boundingBox.max[1]) / 2,
      (boundingBox.min[2] + boundingBox.max[2]) / 2,
    ],
    size: boundingBox.size,
    positions: mesh.positions,
    normals: mesh.normals,
    triangleCount: mesh.triangleCount,
    sourceLayer: 'CORPO_ENGRENAGEM',
  };

  const detectedProfile: PartEngineeringProfile = {
    partName: 'Engrenagem Cilíndrica de Dentes Retos M2 Z24',
    manufacturer: 'Scoobiii / Parametrix',
    modelCode: 'PX-GEAR-M2-Z24-20PA',
    segment: 'industrial-cnc',
    primaryMaterial: 'aluminum',
    specifications: [
      `Módulo m = ${formatBr(metrics.moduleMm, 3)} mm (ISO 54 / ISO 53)`,
      `Número de dentes z = ${metrics.teeth}`,
      `Ângulo de pressão α = ${formatBr(metrics.pressureAngleDeg, 3)}°`,
      `Diâmetro primitivo d = ${formatBr(metrics.pitchDiameterMm, 3)} mm`,
      `Diâmetro externo da = ${formatBr(metrics.tipDiameterMm, 3)} mm`,
      `Diâmetro de raiz df = ${formatBr(metrics.rootDiameterMm, 3)} mm`,
      `Diâmetro de base db = ${formatBr(metrics.baseDiameterMm, 3)} mm`,
      `Passo circular p = ${formatBr(metrics.circularPitchMm, 4)} mm`,
      `Espessura do dente no primitivo s = ${formatBr(metrics.toothThicknessAtPitchMm, 4)} mm`,
      `Largura de face b = ${formatBr(metrics.faceWidthMm, 3)} mm`,
      `Furo central Ø${formatBr(metrics.boreDiameterMm, 3)} mm`,
      `Alívios: ${metrics.lighteningHoleCount} × Ø${formatBr(metrics.lighteningHoleDiameterMm, 3)} mm em PCD ${formatBr(metrics.lighteningHolePitchRadiusMm * 2, 3)} mm`,
      `Volume da malha = ${formatBr(mesh.volumeMm3 / 1000, 3)} cm³`,
      `Massa estimada = ${formatBr(metrics.massKg * 1000, 2)} g (${formatBr(metrics.densityKgM3, 0)} kg/m³)`,
    ],
    certifications: [
      'ISO 53:1998 — perfil de referência',
      'ISO 21771:2007 — geometria de engrenagens cilíndricas',
      'ISO 2768-mK — tolerâncias gerais',
    ],
    intendedUse:
      'Transmissão de rotação em redutor de baixa rotação; peça de referência para usinagem CNC 3 eixos e inspeção dimensional.',
    safetyCriteria: {
      recommendedLoadN: 1200,
      supportMode: 'edge-clamped',
      loadPattern: 'center-point',
      minSafetyFactor: 2.0,
      maxDeflectionMm: 0.1,
      criticalInspectionNote:
        'Inspecionar espessura de dente no primitivo, batimento do furo Ø12 H7 e posição dos 4 alívios.',
    },
    detectedFrom: 'Kernel paramétrico spurGear.ts — dimensões derivadas (ISO 53 / ISO 21771)',
  };

  return {
    id: 'imp-gear-m2-z24',
    filename: 'Engrenagem_M2_Z24_20PA.stl',
    format: 'STL',
    positions: mesh.positions,
    normals: mesh.normals,
    triangleCount: mesh.triangleCount,
    entityCount: mesh.triangleCount,
    layers: ['CORPO_ENGRENAGEM'],
    boundingBox,
    notes: `Engrenagem cilíndrica reta gerada por kernel: malha fechada com ${mesh.triangleCount.toLocaleString('pt-BR')} triângulos, volume ${formatBr(mesh.volumeMm3 / 1000, 3)} cm³ e massa ${formatBr(metrics.massKg * 1000, 2)} g. Perfil de evolvente com ${spec.teeth} dentes, módulo ${formatBr(spec.moduleMm, 2)} mm e ângulo de pressão ${formatBr(spec.pressureAngleDeg, 1)}°.`,
    components: [component],
    detectedProfile,
  };
}

/**
 * DXF 2D do perfil (contorno fechado + furos) para corte a laser/waterjet ou
 * conferência em CAD. Unidades em milímetros ($INSUNITS = 4).
 */
export function buildSpurGearDxf(spec: SpurGearSpec = SPUR_GEAR_SPEC): string {
  validateSpurGearSpec(spec);
  const profile = buildSpurGearProfile(spec);
  const holes = buildSpurGearHoles(spec);
  const lines: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  lines.push('0', 'LWPOLYLINE', '8', 'CONTORNO', '90', String(profile.length), '70', '1');
  for (const [x, y] of profile) {
    lines.push('10', x.toFixed(4), '20', y.toFixed(4));
  }

  for (const hole of holes) {
    const layer = hole.kind === 'bore' ? 'FURO_CENTRAL' : 'ALIVIO';
    lines.push(
      '0', 'CIRCLE',
      '8', layer,
      '10', hole.center[0].toFixed(4),
      '20', hole.center[1].toFixed(4),
      '30', '0',
      '40', hole.radiusMm.toFixed(4)
    );
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}
