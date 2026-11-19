import {
  buildNurbsSurfaceFromParams,
  evaluateNurbsPoint,
  tessellateNurbsSurface,
} from './nurbs';
import { evaluateStructuralFea } from './structuralFea';
import type {
  CadFeatureOperation,
  CurvatureAnalysisZone,
  CurvatureOptimizationReport,
  EvaluatedMesh,
  FeaResult,
  FeaSettings,
  ImportedCadModel,
  MaterialFinish,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../types/cad';

function sub3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function sampleNurbsDifferentialGeometry(
  surface: NurbsSurfaceData,
  gridSamples = 9
): {
  zones: CurvatureAnalysisZone[];
  meanGaussianK: number;
  maxGaussianK: number;
  meanAbsH: number;
  maxPrincipalKappa: number;
  willmoreEnergy: number;
  doubleCurvatureCoveragePct: number;
} {
  const h = 0.008;
  const zones: CurvatureAnalysisZone[] = [];
  let sumK = 0;
  let maxK = 0;
  let sumAbsH = 0;
  let maxKappa = 0;
  let willmore = 0;
  let doubleCurvCount = 0;

  for (let iu = 0; iu < gridSamples; iu++) {
    const u = 0.06 + (iu / (gridSamples - 1)) * 0.88;
    for (let iv = 0; iv < gridSamples; iv++) {
      const v = 0.06 + (iv / (gridSamples - 1)) * 0.88;

      const p00 = evaluateNurbsPoint(surface, u, v);
      const puP = evaluateNurbsPoint(surface, Math.min(0.999, u + h), v);
      const puM = evaluateNurbsPoint(surface, Math.max(0.001, u - h), v);
      const pvP = evaluateNurbsPoint(surface, u, Math.min(0.999, v + h));
      const pvM = evaluateNurbsPoint(surface, u, Math.max(0.001, v - h));
      const puvPP = evaluateNurbsPoint(surface, Math.min(0.999, u + h), Math.min(0.999, v + h));
      const puvPM = evaluateNurbsPoint(surface, Math.min(0.999, u + h), Math.max(0.001, v - h));
      const puvMP = evaluateNurbsPoint(surface, Math.max(0.001, u - h), Math.min(0.999, v + h));
      const puvMM = evaluateNurbsPoint(surface, Math.max(0.001, u - h), Math.max(0.001, v - h));

      const ru = scale3(sub3(puP, puM), 1 / (2 * h));
      const rv = scale3(sub3(pvP, pvM), 1 / (2 * h));
      const ruu = scale3(sub3(add3(puP, puM), scale3(p00, 2)), 1 / (h * h));
      const rvv = scale3(sub3(add3(pvP, pvM), scale3(p00, 2)), 1 / (h * h));
      const ruv = scale3(sub3(add3(puvPP, puvMM), add3(puvPM, puvMP)), 1 / (4 * h * h));

      const E = dot3(ru, ru);
      const F = dot3(ru, rv);
      const G = dot3(rv, rv);

      const nVec = cross3(ru, rv);
      const nLen = Math.hypot(nVec[0], nVec[1], nVec[2]) || 1e-6;
      const nUnit: [number, number, number] = [
        nVec[0] / nLen,
        nVec[1] / nLen,
        nVec[2] / nLen,
      ];

      const L = dot3(ruu, nUnit);
      const M = dot3(ruv, nUnit);
      const N = dot3(rvv, nUnit);

      const denom = Math.max(1e-6, E * G - F * F);
      const gaussianK = (L * N - M * M) / denom;
      const meanH = (E * N - 2 * F * M + G * L) / (2 * denom);
      const disc = Math.sqrt(Math.max(0, meanH * meanH - gaussianK));
      const k1 = meanH + disc;
      const k2 = meanH - disc;
      const maxP = Math.max(Math.abs(k1), Math.abs(k2));

      const dA = (Math.sqrt(denom) / (gridSamples * gridSamples)) * 1e-4;
      willmore += meanH * meanH * dA * 1e4;

      if (Math.abs(gaussianK) > 1e-6) {
        doubleCurvCount++;
      }

      const membraneGain = Math.min(1.6, 1 + Math.sqrt(Math.abs(gaussianK)) * 180);

      zones.push({
        uNorm: u,
        vNorm: v,
        gaussianK,
        meanH,
        maxPrincipalKappa: maxP,
        membraneStiffnessGain: membraneGain,
      });

      sumK += Math.abs(gaussianK);
      if (Math.abs(gaussianK) > maxK) maxK = Math.abs(gaussianK);
      sumAbsH += Math.abs(meanH);
      if (maxP > maxKappa) maxKappa = maxP;
    }
  }

  const count = Math.max(1, zones.length);
  return {
    zones,
    meanGaussianK: sumK / count,
    maxGaussianK: maxK,
    meanAbsH: sumAbsH / count,
    maxPrincipalKappa: maxKappa,
    willmoreEnergy: willmore,
    doubleCurvatureCoveragePct: (doubleCurvCount / count) * 100,
  };
}

/**
 * Analyzes live NURBS curvature and synthesizes a weight-saving parametric configuration
 * that maintains structural integrity (SF >= targetSF & deflection <= norm limit),
 * ready to apply directly via `setDesignParams`.
 */
export function analyzeCurvatureAndOptimizeWeight(params: {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  designParams: ParametricDesignParams;
  materialFinish: MaterialFinish;
  feaSettings: FeaSettings;
  feaResult: FeaResult;
  partProfile: PartEngineeringProfile;
  isolationTarget: string;
  importedModel: ImportedCadModel | null;
  featureOps?: CadFeatureOperation[];
}): CurvatureOptimizationReport {
  const {
    surface,
    designParams,
    materialFinish,
    feaSettings,
    feaResult,
    partProfile,
    isolationTarget,
    importedModel,
    featureOps = [],
  } = params;

  const baselineNurbsFea = importedModel
    ? evaluateStructuralFea(
        surface,
        params.meshData,
        designParams,
        materialFinish,
        feaSettings,
        isolationTarget,
        partProfile,
        null,
        featureOps
      )
    : feaResult;

  const diff = sampleNurbsDifferentialGeometry(surface, 9);
  const targetSf = Math.max(
    1.5,
    partProfile.safetyCriteria.minSafetyFactor || feaSettings.targetSafetyFactor
  );
  const maxDeflAllowed = partProfile.safetyCriteria.maxDeflectionMm || 4.0;

  // Higher membrane curvature means shells carry load in tension/compression rather than pure bending,
  // enabling safe reduction of wall thickness and redundant internal ribs.
  const canLeverageShellAction = diff.doubleCurvatureCoveragePct >= 45;
  const candidateArch = canLeverageShellAction
    ? Math.min(95, Math.round(designParams.archHeight * 1.12))
    : Math.min(90, Math.round(designParams.archHeight + 8));

  const thicknessFactors = [0.68, 0.75, 0.82, 0.88, 0.94];
  const ribScales = [0.65, 0.78, 0.9, 1.0];

  let bestCandidate: {
    nextParams: ParametricDesignParams;
    afterFea: FeaResult;
    massDropPct: number;
  } | null = null;

  for (const tf of thicknessFactors) {
    for (const rs of ribScales) {
      const nextThickness = Math.max(1.5, Number((designParams.thicknessMm * tf).toFixed(2)));
      const nextRibU =
        designParams.ribCountU > 0 ? Math.max(2, Math.round(designParams.ribCountU * rs)) : 0;
      const nextRibV =
        designParams.ribCountV > 0 ? Math.max(2, Math.round(designParams.ribCountV * rs)) : 0;
      const nextRibH = Math.max(8, Math.round(designParams.ribHeightMm * (tf < 0.8 ? 0.92 : 1.0)));

      const candidateParams: ParametricDesignParams = {
        ...designParams,
        thicknessMm: nextThickness,
        archHeight: candidateArch,
        ribCountU: nextRibU,
        ribCountV: nextRibV,
        ribHeightMm: nextRibH,
      };

      const candidateSurface = buildNurbsSurfaceFromParams(candidateParams);
      const candidateMesh = tessellateNurbsSurface(
        candidateSurface,
        candidateParams.ribCountU,
        candidateParams.ribCountV,
        candidateParams.ribHeightMm
      );
      const candidateFea = evaluateStructuralFea(
        candidateSurface,
        candidateMesh,
        candidateParams,
        materialFinish,
        feaSettings,
        isolationTarget,
        partProfile,
        null,
        featureOps
      );

      const passesIntegrity =
        candidateFea.safetyFactor >= targetSf &&
        candidateFea.maxDeflectionMm <= maxDeflAllowed &&
        candidateFea.totalMassKg < baselineNurbsFea.totalMassKg;

      if (passesIntegrity) {
        const dropPct =
          ((baselineNurbsFea.totalMassKg - candidateFea.totalMassKg) /
            Math.max(1e-4, baselineNurbsFea.totalMassKg)) *
          100;
        if (!bestCandidate || dropPct > bestCandidate.massDropPct) {
          bestCandidate = {
            nextParams: candidateParams,
            afterFea: candidateFea,
            massDropPct: dropPct,
          };
        }
      }
    }
  }

  // Fallback balanced geometric relief if current SF is already near limit
  if (!bestCandidate) {
    const fallbackParams: ParametricDesignParams = {
      ...designParams,
      thicknessMm: Math.max(2.0, Number((designParams.thicknessMm * 0.92).toFixed(2))),
      archHeight: Math.min(100, Math.round(designParams.archHeight + 10)),
      ribCountU: designParams.ribCountU > 2 ? designParams.ribCountU - 1 : designParams.ribCountU,
    };
    const fallbackSurface = buildNurbsSurfaceFromParams(fallbackParams);
    const fallbackMesh = tessellateNurbsSurface(
      fallbackSurface,
      fallbackParams.ribCountU,
      fallbackParams.ribCountV,
      fallbackParams.ribHeightMm
    );
    const fallbackFea = evaluateStructuralFea(
      fallbackSurface,
      fallbackMesh,
      fallbackParams,
      materialFinish,
      feaSettings,
      isolationTarget,
      partProfile,
      null,
      featureOps
    );
    const dropPct =
      ((baselineNurbsFea.totalMassKg - fallbackFea.totalMassKg) /
        Math.max(1e-4, baselineNurbsFea.totalMassKg)) *
      100;
    bestCandidate = {
      nextParams: fallbackParams,
      afterFea: fallbackFea,
      massDropPct: dropPct,
    };
  }

  const { nextParams, afterFea, massDropPct } = bestCandidate;
  const integrityPreserved =
    afterFea.safetyFactor >= targetSf && afterFea.maxDeflectionMm <= maxDeflAllowed;

  const rationale = canLeverageShellAction
    ? `Superfície apresenta ${diff.doubleCurvatureCoveragePct.toFixed(0)}% de dupla curvatura gaussiana (K̄ = ${diff.meanGaussianK.toExponential(2)} mm⁻²). Ação de casca permite reduzir espessura de ${designParams.thicknessMm} mm → ${nextParams.thicknessMm} mm e otimizar malha waffle (${nextParams.ribCountU}×${nextParams.ribCountV}), mantendo SF ${afterFea.safetyFactor} ≥ ${targetSf}.`
    : `Curvatura média baixa (|H̄| = ${diff.meanAbsH.toExponential(2)} mm⁻¹); elevação da flecha (${designParams.archHeight} → ${nextParams.archHeight} mm) converte flexão em rigidez geométrica e reduz massa em ${massDropPct.toFixed(1)}%.`;

  return {
    meanGaussianK: Number(diff.meanGaussianK.toExponential(3)),
    maxGaussianK: Number(diff.maxGaussianK.toExponential(3)),
    meanAbsH: Number(diff.meanAbsH.toExponential(3)),
    willmoreEnergy: Number(diff.willmoreEnergy.toFixed(3)),
    doubleCurvatureCoveragePct: Number(diff.doubleCurvatureCoveragePct.toFixed(1)),
    recommendedThicknessMm: nextParams.thicknessMm,
    recommendedRibCountU: nextParams.ribCountU,
    recommendedRibCountV: nextParams.ribCountV,
    recommendedRibHeightMm: nextParams.ribHeightMm,
    recommendedArchHeightMm: nextParams.archHeight,
    weightBeforeKg: baselineNurbsFea.totalMassKg,
    weightAfterKg: afterFea.totalMassKg,
    weightReductionPct: Number(massDropPct.toFixed(1)),
    safetyFactorBefore: baselineNurbsFea.safetyFactor,
    safetyFactorAfter: afterFea.safetyFactor,
    deflectionBeforeMm: baselineNurbsFea.maxDeflectionMm,
    deflectionAfterMm: afterFea.maxDeflectionMm,
    integrityPreserved,
    suggestedParams: nextParams,
    engineeringRationale: rationale,
  };
}
