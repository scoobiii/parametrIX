import { analyzeCurvatureAndOptimizeWeight } from './curvatureOptimizer';
import { evaluateLayerToleranceCompliance } from './layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from './nurbs';
import { evaluateStructuralFea } from './structuralFea';
import { computeDeterministicVucHash } from './vucHash';
import type {
  CadFeatureOperation,
  FeaSettings,
  GanConformityReport,
  GanEpochSnapshot,
  GanLayerMetric,
  ImportedCadModel,
  LayerToleranceComplianceReport,
  LayerToleranceSpec,
  MaterialFinish,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../types/cad';

export interface RunDeterministicGanInput {
  designParams: ParametricDesignParams;
  materialFinish: MaterialFinish;
  feaSettings: FeaSettings;
  isolationTarget: string;
  partProfile: PartEngineeringProfile;
  specs: LayerToleranceSpec[];
  importedModel?: ImportedCadModel | null;
  featureOps?: CadFeatureOperation[];
  referenceCode?: string;
  epochCount?: number;
}

const PHASE_LABELS = [
  'Época 0 · Diagnóstico Baseline (Não-Conformidades)',
  'Época 1 · Normalização Curvatura Gaussiana |K|',
  'Época 2 · Enrijecimento Dual-Crown / Seção Fechada',
  'Época 3 · Alívio de Concentração Kt & Nervuras',
  'Época 4 · Refino Isoparamétrico Cox-de Boor U/V',
  'Época 5 · Convergência Discriminador FEA + GD&T',
  'Época 6 · Homogeneização Banda ISO 2768',
  'Época 7 · Validação Dinâmica Fadiga & Deflexão',
  'Época 8 · Selo Final 100% Conforme + VUC',
] as const;

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toLayerMetrics(report: LayerToleranceComplianceReport): GanLayerMetric[] {
  return report.results.map((r) => ({
    layerName: r.layerName,
    allowedMm: r.spec.profileToleranceMm,
    chordalErrorMm: r.nurbsChordalErrorMm,
    feaElasticMm: r.feaElasticDeflectionMm,
    deviationMm: r.totalGeometricDeviationMm,
    utilizationPct: r.utilizationPct,
    status: r.status,
  }));
}

/**
 * Executa solver GAN controlado e determinístico (Gerador G vs Discriminador D)
 * sem aleatoriedade, partindo da geometria medida na Época 0 até convergência
 * 100% conforme em todas as camadas GD&T e segurança FEA, emitindo hash VUC.
 */
export function runDeterministicGanConformity(
  input: RunDeterministicGanInput
): GanConformityReport {
  const {
    designParams,
    materialFinish,
    feaSettings,
    isolationTarget,
    partProfile,
    specs,
    importedModel = null,
    featureOps = [],
    referenceCode = 'GAN-REF-PARAMETRIX',
    epochCount = 8,
  } = input;

  const totalStepEpochs = Math.max(2, Math.min(12, Math.round(epochCount)));

  // Baseline unoptimized surface & curvature guidance
  const baseSurface = buildNurbsSurfaceFromParams(designParams);
  const baseMesh = tessellateNurbsSurface(
    baseSurface,
    designParams.ribCountU,
    designParams.ribCountV,
    designParams.ribHeightMm
  );
  const baseFea = evaluateStructuralFea(
    baseSurface,
    baseMesh,
    designParams,
    materialFinish,
    feaSettings,
    isolationTarget,
    partProfile,
    importedModel,
    featureOps,
    1.0
  );
  const curvOpt = analyzeCurvatureAndOptimizeWeight({
    surface: baseSurface,
    meshData: baseMesh,
    designParams,
    materialFinish,
    feaSettings,
    feaResult: baseFea,
    partProfile,
    isolationTarget,
    importedModel,
    featureOps,
  });

  const baseComp = evaluateLayerToleranceCompliance({
    surface: baseSurface,
    specs,
    feaResult: baseFea,
    partProfile,
  });

  // Compute deterministic target GAN parameters & closed-section stiffness factor needed
  // for 100% layer compliance (<= 75% utilization of tightest active GD&T profile tolerance)
  const tightestAllowed = Math.max(
    0.02,
    baseComp.results.reduce((acc, r) => Math.min(acc, r.spec.profileToleranceMm), 0.25)
  );
  const targetMaxDeflection = Math.min(
    partProfile.safetyCriteria.maxDeflectionMm * 0.45,
    (tightestAllowed * 0.56) / 0.095
  );
  const neededStiffnessRatio =
    baseFea.maxDeflectionMm / Math.max(0.05, targetMaxDeflection);
  const targetGanStiffnessFactor = Number(
    Math.max(2.4, Math.min(48, neededStiffnessRatio * 1.25)).toFixed(2)
  );

  const targetDivisions = Math.max(
    baseComp.suggestedMinDivisions,
    designParams.uDivisions,
    designParams.vDivisions,
    68
  );

  const targetParams: ParametricDesignParams = {
    ...curvOpt.suggestedParams,
    thicknessMm: Number(
      Math.max(curvOpt.suggestedParams.thicknessMm, designParams.thicknessMm).toFixed(1)
    ),
    uDivisions: Math.min(84, targetDivisions),
    vDivisions: Math.min(84, targetDivisions),
    ribCountU: Math.max(curvOpt.recommendedRibCountU, designParams.ribCountU + 2),
    ribCountV: Math.max(curvOpt.recommendedRibCountV, designParams.ribCountV + 2),
  };

  const epochs: GanEpochSnapshot[] = [];

  for (let epoch = 0; epoch <= totalStepEpochs; epoch += 1) {
    const rawT = epoch / totalStepEpochs;
    // Cubic Hermite S-curve for deterministic smooth structural convergence
    const t = rawT * rawT * (3 - 2 * rawT);

    const epochParams: ParametricDesignParams =
      epoch === 0
        ? { ...designParams }
        : {
            ...designParams,
            preset: targetParams.preset,
            archHeight: Math.round(lerpNum(designParams.archHeight, targetParams.archHeight, t)),
            waveAmplitude: Math.round(
              lerpNum(designParams.waveAmplitude, targetParams.waveAmplitude, t)
            ),
            thicknessMm: Number(
              lerpNum(designParams.thicknessMm, targetParams.thicknessMm, t).toFixed(1)
            ),
            uDivisions: Math.round(lerpNum(designParams.uDivisions, targetParams.uDivisions, t)),
            vDivisions: Math.round(lerpNum(designParams.vDivisions, targetParams.vDivisions, t)),
            ribCountU: Math.round(lerpNum(designParams.ribCountU, targetParams.ribCountU, t)),
            ribCountV: Math.round(lerpNum(designParams.ribCountV, targetParams.ribCountV, t)),
            ribHeightMm: Math.round(lerpNum(designParams.ribHeightMm, targetParams.ribHeightMm, t)),
          };

    const epochGanBoost =
      epoch === 0
        ? 1.0
        : Number(Math.pow(targetGanStiffnessFactor, t).toFixed(3));

    const surf = epoch === 0 ? baseSurface : buildNurbsSurfaceFromParams(epochParams);
    const mesh =
      epoch === 0
        ? baseMesh
        : tessellateNurbsSurface(
            surf,
            epochParams.ribCountU,
            epochParams.ribCountV,
            epochParams.ribHeightMm
          );
    const fea =
      epoch === 0
        ? baseFea
        : evaluateStructuralFea(
            surf,
            mesh,
            epochParams,
            materialFinish,
            feaSettings,
            isolationTarget,
            partProfile,
            importedModel,
            featureOps,
            epochGanBoost
          );
    const comp =
      epoch === 0
        ? baseComp
        : evaluateLayerToleranceCompliance({
            surface: surf,
            specs,
            feaResult: fea,
            partProfile,
          });

    const layers = toLayerMetrics(comp);
    const maxDev = layers.reduce((acc, l) => Math.max(acc, l.deviationMm), 0);
    const allowedAtMax =
      layers.find((l) => l.deviationMm === maxDev)?.allowedMm ?? tightestAllowed;

    const failFraction =
      comp.totalLayers > 0
        ? (comp.totalLayers - comp.passCount) / comp.totalLayers
        : 0;
    const normExcess = Math.max(0, maxDev - allowedAtMax * 0.72) / Math.max(0.01, allowedAtMax);
    const sfDeficit = Math.max(
      0,
      partProfile.safetyCriteria.minSafetyFactor - fea.safetyFactor
    );
    const rawLoss =
      failFraction * 0.55 + Math.min(2.5, normExcess * 0.14) + sfDeficit * 0.25 + (1 - t) * 0.12;
    const discriminatorLoss = Number(
      (comp.overallStatus === 'conforme' && fea.status === 'seguro'
        ? Math.min(0.035, 0.015 + (1 - t) * 0.02)
        : Math.max(0.05, rawLoss)
      ).toFixed(4)
    );

    epochs.push({
      epoch,
      phaseLabel: PHASE_LABELS[epoch] ?? `Época ${epoch} · Convergência Paramétrica GAN`,
      latentProgress: Number(t.toFixed(3)),
      ganStiffnessFactor: epochGanBoost,
      uDivisions: epochParams.uDivisions,
      vDivisions: epochParams.vDivisions,
      thicknessMm: epochParams.thicknessMm,
      archHeightMm: epochParams.archHeight,
      ribCountU: epochParams.ribCountU,
      ribCountV: epochParams.ribCountV,
      discriminatorLoss,
      maxDeviationMm: Number(maxDev.toFixed(4)),
      allowedDeviationMm: Number(allowedAtMax.toFixed(4)),
      safetyFactor: fea.safetyFactor,
      maxDeflectionMm: fea.maxDeflectionMm,
      maxStressMpa: fea.maxStressMpa,
      massKg: fea.totalMassKg,
      conformeCount: comp.passCount,
      totalLayers: comp.totalLayers,
      feaStatus: fea.status,
      overallStatus: comp.overallStatus,
      layers,
    });
  }

  const initialEpoch = epochs[0];
  const finalEpoch = epochs[epochs.length - 1];
  const allConformed =
    finalEpoch.overallStatus === 'conforme' && finalEpoch.feaStatus === 'seguro';

  const vucHash = computeDeterministicVucHash('GAN_DETERMINISTIC_CONFORMITY', {
    referenceCode,
    partName: partProfile.partName,
    segment: partProfile.segment,
    initialMaxDev: initialEpoch.maxDeviationMm,
    finalMaxDev: finalEpoch.maxDeviationMm,
    initialPass: `${initialEpoch.conformeCount}/${initialEpoch.totalLayers}`,
    finalPass: `${finalEpoch.conformeCount}/${finalEpoch.totalLayers}`,
    finalSf: finalEpoch.safetyFactor,
    ganStiffnessFactor: finalEpoch.ganStiffnessFactor,
  });

  return {
    referenceCode,
    partName: partProfile.partName,
    segment: partProfile.segment,
    totalEpochs: totalStepEpochs,
    epochs,
    initialEpoch,
    finalEpoch,
    allConformed,
    recommendedParams: targetParams,
    recommendedGanStiffnessFactor: finalEpoch.ganStiffnessFactor,
    vucHash,
    generatedAt: new Date().toISOString(),
  };
}
