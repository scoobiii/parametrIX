import { sampleNurbsDifferentialGeometry } from './curvatureOptimizer';
import type {
  CadComponentPart,
  FeaResult,
  ImportedCadModel,
  LayerToleranceCheckResult,
  LayerToleranceClass,
  LayerToleranceComplianceReport,
  LayerToleranceSpec,
  NurbsSurfaceData,
  PartEngineeringProfile,
} from '../types/cad';

export const ISO_2768_CLASS_DEFAULTS: Record<
  Exclude<LayerToleranceClass, 'custom'>,
  { label: string; linearMm: number; profileMm: number; flatnessMm: number }
> = {
  f: { label: 'f (Fina · ISO 2768-fH)', linearMm: 0.05, profileMm: 0.08, flatnessMm: 0.05 },
  m: { label: 'm (Média · ISO 2768-mK)', linearMm: 0.15, profileMm: 0.25, flatnessMm: 0.15 },
  c: { label: 'c (Grossa · ISO 2768-cL)', linearMm: 0.4, profileMm: 0.65, flatnessMm: 0.4 },
  v: { label: 'v (Muito Grossa · BIM)', linearMm: 1.0, profileMm: 1.5, flatnessMm: 1.0 },
};

export function inferDefaultLayerSpecs(params: {
  importedModel: ImportedCadModel | null;
  components: CadComponentPart[];
  partProfile: PartEngineeringProfile;
  existingSpecs?: Record<string, LayerToleranceSpec>;
}): LayerToleranceSpec[] {
  const { importedModel, components, partProfile, existingSpecs = {} } = params;

  const layerNames = new Set<string>();
  if (importedModel && importedModel.layers.length > 0) {
    importedModel.layers.slice(0, 14).forEach((l) => layerNames.add(l));
  }
  components.slice(0, 14).forEach((c) => {
    layerNames.add(c.sourceLayer || c.name);
  });
  if (layerNames.size === 0) {
    layerNames.add('NURBS_SURFACE');
    layerNames.add('BIM_IFCBEAM_U');
    layerNames.add('BIM_IFCMEMBER_V');
  }

  const defaultClass: Exclude<LayerToleranceClass, 'custom'> =
    partProfile.segment === 'aeroespacial' || partProfile.segment === 'medico'
      ? 'f'
      : partProfile.segment === 'arquitetura-bim'
        ? 'c'
        : 'm';

  const preset = ISO_2768_CLASS_DEFAULTS[defaultClass];

  return Array.from(layerNames).map((layerName) => {
    const saved = existingSpecs[layerName];
    if (saved) return saved;
    const isCriticalBoreOrShaft = /eixo|shaft|hole|fur|mancal|stanchion|coroa|crown|flange/i.test(
      layerName
    );
    const chosenClass: Exclude<LayerToleranceClass, 'custom'> = isCriticalBoreOrShaft
      ? 'f'
      : defaultClass;
    const chosenPreset = ISO_2768_CLASS_DEFAULTS[chosenClass];
    return {
      layerName,
      toleranceClass: chosenClass,
      linearToleranceMm: chosenPreset.linearMm,
      profileToleranceMm: chosenPreset.profileMm,
      flatnessMm: chosenPreset.flatnessMm,
      criticalGdtSymbol: isCriticalBoreOrShaft ? 'position' : preset === chosenPreset ? 'profile' : 'flatness',
      enabled: true,
    };
  });
}

/**
 * Evaluates GD&T layer tolerances against live NURBS Cox-de Boor chordal sagitta error
 * e_chord = (h_max^2 * |kappa_max|) / 8, FEA deflection under service load, and active norms.
 */
export function evaluateLayerToleranceCompliance(params: {
  surface: NurbsSurfaceData;
  specs: LayerToleranceSpec[];
  feaResult: FeaResult;
  partProfile: PartEngineeringProfile;
}): LayerToleranceComplianceReport {
  const { surface, specs, feaResult, partProfile } = params;

  const diff = sampleNurbsDifferentialGeometry(surface, 7);
  const spanX = Math.max(40, Math.abs(surface.controlPoints[surface.uCount - 1][0].x - surface.controlPoints[0][0].x));
  const spanZ = Math.max(40, Math.abs(surface.controlPoints[0][surface.vCount - 1].z - surface.controlPoints[0][0].z));
  const hU = spanX / Math.max(6, surface.uDivisions);
  const hV = spanZ / Math.max(6, surface.vDivisions);
  const hMax = Math.max(hU, hV);

  // Chordal approximation error of bicubic NURBS tessellation: e = (h^2 * kappa_max) / 8
  const baseChordalMm = Math.max(0.004, (hMax * hMax * Math.max(1e-4, diff.maxPrincipalKappa)) / 8);
  const normList =
    partProfile.certifications.length > 0
      ? partProfile.certifications
      : ['ISO 2768-mK', 'ASME Y14.5 GD&T'];

  const results: LayerToleranceCheckResult[] = specs
    .filter((s) => s.enabled)
    .map((spec, idx) => {
      // Layer-specific multiplier based on structural zone (stanchions/flanges/ribs)
      const isRibOrBeam = /bim|rib|beam|member|waffle/i.test(spec.layerName);
      const isBoreOrMating = /furo|hole|eixo|shaft|flange|crown|coroa|bolt/i.test(spec.layerName);

      const chordalErr = isRibOrBeam
        ? baseChordalMm * 0.45
        : isBoreOrMating
          ? baseChordalMm * 0.85
          : baseChordalMm;

      // Elastic contribution from FEA (normalized to 10% working deflection stability)
      const feaElastic = feaResult.maxDeflectionMm * (isBoreOrMating ? 0.045 : 0.085) * (1 + (idx % 3) * 0.05);
      const totalDeviation = Number((chordalErr + feaElastic).toFixed(4));
      const allowed = Math.max(0.01, spec.profileToleranceMm);
      const utilPct = (totalDeviation / allowed) * 100;

      let status: LayerToleranceCheckResult['status'] = 'conforme';
      if (utilPct > 100) status = 'nao-conforme';
      else if (utilPct > 78) status = 'atencao';

      const normRef = normList[idx % normList.length] || 'ISO 2768-2';
      let recommendation = `Dentro da banda ${spec.toleranceClass.toUpperCase()} (${totalDeviation.toFixed(3)} ≤ ${allowed.toFixed(3)} mm).`;
      if (status === 'nao-conforme') {
        const neededDiv = Math.min(
          84,
          Math.ceil(
            Math.max(surface.uDivisions, surface.vDivisions) *
              Math.sqrt(totalDeviation / Math.max(0.01, allowed))
          )
        );
        recommendation = `Excede limite ${normRef}. Eleve subdivisão NURBS para ≥ ${neededDiv}×${neededDiv} ou aumente espessura para conter deflexão FEA.`;
      } else if (status === 'atencao') {
        recommendation = `Margem estreita (${utilPct.toFixed(0)}%) frente a ${normRef}. Considere refinar passos CAM/NURBS.`;
      }

      return {
        layerName: spec.layerName,
        toleranceClass: spec.toleranceClass,
        spec,
        nurbsChordalErrorMm: Number(chordalErr.toFixed(4)),
        feaElasticDeflectionMm: Number(feaElastic.toFixed(4)),
        totalGeometricDeviationMm: totalDeviation,
        utilizationPct: Number(utilPct.toFixed(1)),
        status,
        normReference: normRef,
        recommendation,
      };
    });

  const passCount = results.filter((r) => r.status === 'conforme').length;
  const hasFail = results.some((r) => r.status === 'nao-conforme');
  const hasWarn = results.some((r) => r.status === 'atencao');

  // Minimum NURBS u/v division count required to satisfy the tightest active profile tolerance
  const tightestProfile = results.reduce(
    (acc, r) => Math.min(acc, r.spec.profileToleranceMm),
    1.0
  );
  const reqStepH = Math.sqrt((8 * Math.max(0.02, tightestProfile * 0.7)) / Math.max(1e-4, diff.maxPrincipalKappa));
  const suggestedMinDivisions = Math.max(
    surface.uDivisions,
    Math.min(72, Math.ceil(Math.max(spanX, spanZ) / Math.max(2.5, reqStepH)))
  );

  return {
    segmentLabel: partProfile.segment,
    activeStandards: normList,
    evaluatedAt: new Date().toLocaleTimeString('pt-BR'),
    overallStatus: hasFail ? 'nao-conforme' : hasWarn ? 'atencao' : 'conforme',
    passCount,
    totalLayers: results.length,
    suggestedMinDivisions,
    results,
  };
}
