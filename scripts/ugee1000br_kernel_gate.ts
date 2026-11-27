import fs from 'node:fs';
import path from 'node:path';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { analyzeCurvatureAndOptimizeWeight } from '../src/kernel/curvatureOptimizer';
import { evaluateLayerToleranceCompliance, inferDefaultLayerSpecs } from '../src/kernel/layerTolerances';
import { computeScoobiiiVucProof } from '../src/kernel/scoobiiiVuc';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import { calculateCarbonFootprint } from '../src/kernel/carbonFootprint';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import { WORKSPACE_PROJECT_PRESETS } from '../src/kernel/workspacePresets';
import { sha256Hex } from '../src/server/vucFormalProof';

const preset = WORKSPACE_PROJECT_PRESETS.find((entry) => entry.id === 'preset-aero-titanium');
if (!preset) throw new Error('Preset aeroespacial provisional não encontrado.');
const designParams = { ...preset.designParams, thicknessMm: 16 };

const surface = buildNurbsSurfaceFromParams(designParams);
const mesh = tessellateNurbsSurface(
  surface,
  designParams.ribCountU,
  designParams.ribCountV,
  designParams.ribHeightMm
);
const importedModel = preset.buildImportedModel ? preset.buildImportedModel() : null;
const profile = resolvePartEngineeringProfile({
  filename: importedModel?.filename,
  layers: importedModel?.layers,
  preset: designParams.preset,
  segmentOverride: preset.segment,
  surfaceName: surface.name,
});
const fea = evaluateStructuralFea(
  surface,
  mesh,
  designParams,
  preset.materialFinish,
  preset.feaSettings,
  'all',
  profile,
  importedModel,
  preset.initialFeatures ?? []
);
const optimized = analyzeCurvatureAndOptimizeWeight({
  surface,
  meshData: mesh,
  designParams,
  materialFinish: preset.materialFinish,
  feaSettings: preset.feaSettings,
  feaResult: fea,
  partProfile: profile,
  isolationTarget: 'all',
  importedModel,
  featureOps: preset.initialFeatures ?? [],
});
const cam = generateCamToolpath(surface, mesh, preset.camSettings);
const carbon = calculateCarbonFootprint({
  meshData: mesh,
  importedModel,
  materialFinish: preset.materialFinish,
  camSettings: preset.camSettings,
  toolpath: cam,
  featureOps: preset.initialFeatures ?? [],
});
const layers = inferDefaultLayerSpecs({
  importedModel,
  components: importedModel?.components ?? [],
  partProfile: profile,
});
const tolerance = evaluateLayerToleranceCompliance({ surface, specs: layers, feaResult: fea, partProfile: profile });
const vuc = computeScoobiiiVucProof({
  surface,
  meshData: mesh,
  designParams,
  materialFinish: preset.materialFinish,
  feaSettings: preset.feaSettings,
  feaResult: fea,
  partProfile: profile,
  featureOps: preset.initialFeatures ?? [],
  importedModel,
});

const gates = {
  cad: mesh.triangleCount > 0 && Number.isFinite(mesh.volumeCm3),
  cae: Number.isFinite(fea.maxStressMpa) && Number.isFinite(fea.safetyFactor) && vuc.nurbsProof.maxPartitionUnityResidual < 1e-10,
  cam: cam.points.length > 0 && cam.cuttingLengthMm > 0 && cam.estimatedMinutes > 0,
  optimization: optimized.weightReductionPct > 0,
  toleranceKernel: tolerance.totalLayers > 0,
};
const status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';
const output = {
  schema: 'parametrix-ugee1000br-kernel-gate/0.1',
  projectId: 'ugee1000br-rotor-1mw-ethanol',
  status,
  scope: 'KERNEL_PROTOTYPE_ONLY',
  sourceProfile: preset.id,
  disclaimer: 'PASS significa que o kernel determinístico executou e satisfez seus invariantes computacionais; não é certificação aeronáutica, validação de turbomáquina, ensaio físico, FreeCAD B-Rep ou aprovação normativa.',
  gates,
  cad: { triangles: mesh.triangleCount, volumeCm3: mesh.volumeCm3, bboxMm: mesh.boundingBox.size },
  cae: { maxStressMpa: fea.maxStressMpa, safetyFactor: fea.safetyFactor, maxDeflectionMm: fea.maxDeflectionMm, meanStressMpa: fea.meanStressMpa },
  cam: { machineType: preset.camSettings.machineType, points: cam.points.length, cuttingLengthMm: cam.cuttingLengthMm, estimatedMinutes: cam.estimatedMinutes, spindleRpm: cam.spindleRpm, feedRateMmMin: cam.feedRateMmMin },
  vuc: { certificateId: vuc.certificateId, maxPartitionUnityResidual: vuc.nurbsProof.maxPartitionUnityResidual, allPassed: vuc.allPassed },
  optimization: { weightReductionPct: optimized.weightReductionPct, safetyFactorAfter: optimized.safetyFactorAfter },
  carbonKg: carbon.totalCo2Kg,
  inputsHash: sha256Hex(JSON.stringify({ preset: preset.id, designParams, feaSettings: preset.feaSettings, camSettings: preset.camSettings })),
};
const outPath = path.join(process.cwd(), 'projects/ugee1000br/ugee1000br.kernel-gate.json');
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
if (status !== 'PASS') process.exitCode = 1;
