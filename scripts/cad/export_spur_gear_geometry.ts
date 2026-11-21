import fs from 'node:fs';
import path from 'node:path';
import { exportBinarySTL } from '../../src/kernel/cadFormats';
import {
  buildSpurGearDxf,
  buildSpurGearMesh,
  buildSpurGearModel,
  SPUR_GEAR_SPEC,
} from '../../src/kernel/spurGear';
import type { EvaluatedMesh } from '../../src/types/cad';

/**
 * Exporta a geometria da engrenagem gerada pelo kernel para o pipeline CAD:
 * - profile.json  (contorno + furos usados pelo FreeCAD para o STEP B-Rep)
 * - .dxf          (perfil 2D para corte/inspeção)
 * - _kernel.stl   (malha do kernel, conferência independente)
 * - _metricas_kernel.json
 */
const outDir = path.resolve(process.cwd(), 'deliverables', 'engrenagem_m2_z24');
fs.mkdirSync(outDir, { recursive: true });

const mesh = buildSpurGearMesh();
const model = buildSpurGearModel();
const metrics = mesh.metrics;

const profilePayload = {
  partName: model.detectedProfile?.partName,
  modelCode: model.detectedProfile?.modelCode,
  spec: SPUR_GEAR_SPEC,
  thicknessMm: SPUR_GEAR_SPEC.faceWidthMm,
  outline: mesh.profile,
  holes: mesh.holes.map((hole) => ({
    kind: hole.kind,
    center: hole.center,
    radiusMm: hole.radiusMm,
    points: hole.points,
  })),
  metrics,
};
fs.writeFileSync(
  path.join(outDir, 'profile.json'),
  `${JSON.stringify(profilePayload, null, 2)}\n`,
  'utf8'
);

fs.writeFileSync(path.join(outDir, 'engrenagem_m2_z24.dxf'), buildSpurGearDxf(), 'utf8');

const evaluated: EvaluatedMesh = {
  positions: mesh.positions,
  normals: mesh.normals,
  uvs: new Float32Array(0),
  colors: new Float32Array(0),
  indices: mesh.indices,
  triangleCount: mesh.triangleCount,
  vertexCount: mesh.positions.length / 3,
  isocurves: [],
  bimElements: [],
  boundingBox: model.boundingBox,
  surfaceAreaCm2: mesh.surfaceAreaMm2 / 100,
  volumeCm3: mesh.volumeMm3 / 1000,
};
const stlBlob = exportBinarySTL(evaluated, 'Engrenagem_M2_Z24_20PA_kernel');
fs.writeFileSync(
  path.join(outDir, 'engrenagem_m2_z24_kernel.stl'),
  Buffer.from(await stlBlob.arrayBuffer())
);

fs.writeFileSync(
  path.join(outDir, 'engrenagem_m2_z24_metricas_kernel.json'),
  `${JSON.stringify(
    {
      source: 'src/kernel/spurGear.ts',
      spec: SPUR_GEAR_SPEC,
      metrics,
      mesh: {
        triangleCount: mesh.triangleCount,
        volumeMm3: mesh.volumeMm3,
        surfaceAreaMm2: mesh.surfaceAreaMm2,
      },
      boundingBox: model.boundingBox,
    },
    null,
    2
  )}\n`,
  'utf8'
);

console.log(`DIR=${outDir}`);
console.log(`TRIANGULOS=${mesh.triangleCount}`);
console.log(`VOLUME_MM3=${mesh.volumeMm3.toFixed(3)}`);
console.log(`MASSA_G=${(metrics.massKg * 1000).toFixed(3)}`);
console.log(`DENTES=${metrics.teeth} MODULO=${metrics.moduleMm} DA=${metrics.tipDiameterMm}`);
