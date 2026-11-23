import { calculateCarbonFootprint } from './carbonFootprint';
import { generateCamToolpath } from './camRobotics';
import { resolvePartEngineeringProfile } from './componentClassifier';
import { evaluateLayerToleranceCompliance, inferDefaultLayerSpecs } from './layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from './nurbs';
import { computeScoobiiiVucProof } from './scoobiiiVuc';
import { MATERIAL_MECHANICAL_SPECS, evaluateStructuralFea } from './structuralFea';
import { computeDeterministicVucHash } from './vucHash';
import { WORKSPACE_PROJECT_PRESETS } from './workspacePresets';
import type {
  ApplicationSegment,
  CadFeatureOperation,
  CamServiceJob,
  CamSettings,
  CarbonFootprintReport,
  ComputeShareNode,
  ErpCrmRecord,
  FeaResult,
  FeaSettings,
  ImportedCadModel,
  LayerToleranceComplianceReport,
  LogisticsTelemetryNode,
  MachineType,
  MaterialFinish,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
  RemoteMachineTarget,
  ScoobiiiVucProofReport,
  ToolpathResult,
  VucLedgerEntry,
} from '../types/cad';

export const MATERIAL_UNIT_PRICE_BRL_PER_KG: Record<MaterialFinish, number> = {
  aluminum: 68.5,
  titanium: 640.0,
  'carbon-fiber': 420.0,
  'matte-plastic': 54.0,
  glass: 42.0,
  oak: 28.0,
  clay: 16.0,
};

export const MACHINE_HOURLY_RATE_BRL: Record<MachineType, number> = {
  manual: 145.0,
  'cnc-3axis': 230.0,
  'cnc-5axis': 410.0,
  'robot-6axis': 320.0,
  'powder-metal': 560.0,
  'resin-sla': 195.0,
  'robot-weld': 265.0,
  'laser-cut': 340.0,
};

export const PARAMETRIC_UV_SWEEP_GRID: readonly [number, number][] = [
  [6, 6],
  [8, 8],
  [10, 10],
  [12, 12],
  [16, 16],
  [20, 20],
  [24, 24],
  [28, 28],
  [32, 32],
  [36, 36],
  [40, 40],
  [48, 48],
];

export type ScatterSeriesKind = 'sweep-uv' | 'active-uv' | 'preset-cad-cae-cam';

export interface ScoobiiiScatterPoint {
  id: string;
  label: string;
  series: ScatterSeriesKind;
  domainTag: 'CAD' | 'CAE' | 'CAM' | 'FINANCEIRO';
  uDivisions: number;
  vDivisions: number;
  subdivisionComplexity: number;
  failureRatePct: number;
  failedChecks: number;
  totalChecks: number;
  scoobiiiChecksPassed: number;
  scoobiiiChecksTotal: number;
  gdtLayersPassed: number;
  gdtLayersTotal: number;
  camValid: boolean;
  maxChordalErrorMm: number;
  maxStressMpa: number;
  safetyFactor: number;
  totalCo2Kg: number;
  camCycleMinutes: number;
  unitTotalCostBrl: number;
  suggestedSalePriceBrl: number;
  grossMarginPct: number;
  vucCertificateId: string;
}

export interface CorrelationRegressionStats {
  sampleCount: number;
  pearsonR: number;
  rSquared: number;
  slope: number;
  intercept: number;
  meanComplexity: number;
  meanFailureRatePct: number;
  optimalMinSubdivisions: number;
  interpretation: string;
}

export interface UnitFinancialBreakdown {
  materialBrl: number;
  machiningBrl: number;
  engineeringCertBrl: number;
  carbonShadowBrl: number;
  totalUnitCostBrl: number;
  suggestedSalePriceBrl: number;
  grossProfitBrl: number;
  grossMarginPct: number;
  breakEvenBatchUnits: number;
  deterministicVucHash: string;
}

export interface DomainProofOverview {
  domain: 'CAD' | 'CAE' | 'CAM' | 'FINANCEIRO' | 'VUC';
  label: string;
  passed: number;
  total: number;
  coveragePct: number;
  status: 'CONFORME' | 'ALERTA';
  highlight: string;
}

export interface ScoobiiiFullTelemetry {
  scatterPoints: ScoobiiiScatterPoint[];
  correlation: CorrelationRegressionStats;
  domainOverviews: DomainProofOverview[];
  cadSummary: {
    modelTitle: string;
    segment: ApplicationSegment;
    subdivisionsLabel: string;
    subdivisionComplexity: number;
    maxPartitionUnityResidual: number;
    minJacobian: number;
    netVolumeCm3: number;
    gdtPassCount: number;
    gdtTotalLayers: number;
    maxChordalErrorMm: number;
    featureOpsCount: number;
    importedFormat: string;
    importedFilename: string;
  };
  caeSummary: {
    materialName: string;
    vonMisesMaxMpa: number;
    allowableStressMpa: number;
    safetyFactor: number;
    maxDeflectionMm: number;
    stressConcentrationKt: number;
    ecoGrade: string;
    totalCo2Kg: number;
    buyToFlyRatio: number;
    energyKwh: number;
  };
  camSummary: {
    machineType: MachineType;
    postFormat: string;
    cuttingLengthMm: number;
    estimatedMinutes: number;
    spindleRpm: number;
    feedRateMmMin: number;
    serviceJobsCount: number;
    completedServiceJobsCount: number;
    remoteMachinesCount: number;
    serviceJobs: CamServiceJob[];
    remoteMachines: RemoteMachineTarget[];
  };
  financialSummary: {
    unitCost: UnitFinancialBreakdown;
    totalPipelineBrl: number;
    openOrdersCount: number;
    completedOrdersCount: number;
    activeCouriersCount: number;
    activeComputeNodesCount: number;
    computeTflopsTotal: number;
    erpRecords: ErpCrmRecord[];
    byErpKind: Array<{
      kind: ErpCrmRecord['kind'];
      count: number;
      totalBrl: number;
    }>;
  };
  vucAuditSummary: {
    totalLedgerEntries: number;
    overallProofPct: number;
    scoobiiiCertificateId: string;
    latestServerVucHex: string | null;
    ledgerEntries: VucLedgerEntry[];
  };
}

export function estimateUnitManufacturingFinancials(params: {
  materialFinish: MaterialFinish;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  carbonReport: CarbonFootprintReport;
  failureRatePct: number;
}): UnitFinancialBreakdown {
  const { materialFinish, camSettings, toolpath, carbonReport, failureRatePct } = params;
  const matPricePerKg = MATERIAL_UNIT_PRICE_BRL_PER_KG[materialFinish];
  const hourlyRate = MACHINE_HOURLY_RATE_BRL[camSettings.machineType];

  // Raw billet weight minus partial 35% scrap credit recovery value
  const netRawBrl = carbonReport.billetRawMassKg * matPricePerKg;
  const scrapCreditBrl = carbonReport.wasteMassKg * matPricePerKg * 0.22;
  const materialBrl = Number(Math.max(4.5, netRawBrl - scrapCreditBrl).toFixed(2));

  // Cycle time plus setup amortized across small batch (5 units) + yield risk
  const cycleHours = Math.max(0.04, toolpath.estimatedMinutes / 60);
  const setupAmortizedBrl = (hourlyRate * 0.35) / 5;
  const scrapRiskMultiplier = 1 + Math.min(0.4, failureRatePct / 200);
  const machiningBrl = Number(
    ((cycleHours * hourlyRate + setupAmortizedBrl) * scrapRiskMultiplier).toFixed(2)
  );

  // Engineering QA + SCOOBIII VUC mathematical verification provision
  const engineeringCertBrl = Number(
    (18.0 + (camSettings.machineType === 'cnc-5axis' || camSettings.machineType === 'powder-metal' ? 24.0 : 12.0)).toFixed(2)
  );

  // ESG carbon shadow cost (BRL ~ 0.48 per kgCO2e)
  const carbonShadowBrl = Number((carbonReport.totalCo2Kg * 0.48).toFixed(2));

  const totalUnitCostBrl = Number(
    (materialBrl + machiningBrl + engineeringCertBrl + carbonShadowBrl).toFixed(2)
  );

  // Target industrial B2B commercial pricing with standard 34% markup above direct cost
  const suggestedSalePriceBrl = Number((totalUnitCostBrl * 1.48).toFixed(2));
  const grossProfitBrl = Number((suggestedSalePriceBrl - totalUnitCostBrl).toFixed(2));
  const grossMarginPct = Number(((grossProfitBrl / suggestedSalePriceBrl) * 100).toFixed(1));
  const batchSetupFixedBrl = hourlyRate * 0.35 + engineeringCertBrl * 3;
  const breakEvenBatchUnits = Math.max(1, Math.ceil(batchSetupFixedBrl / Math.max(5, grossProfitBrl)));

  const deterministicVucHash = computeDeterministicVucHash('COMMERCIAL_UNIT_COST', {
    materialFinish,
    machineType: camSettings.machineType,
    totalUnitCostBrl,
    suggestedSalePriceBrl,
    grossMarginPct,
  });

  return {
    materialBrl,
    machiningBrl,
    engineeringCertBrl,
    carbonShadowBrl,
    totalUnitCostBrl,
    suggestedSalePriceBrl,
    grossProfitBrl,
    grossMarginPct,
    breakEvenBatchUnits,
    deterministicVucHash,
  };
}

export function computePearsonCorrelation(
  points: ReadonlyArray<{ x: number; y: number }>
): CorrelationRegressionStats {
  const n = points.length;
  if (n === 0) {
    return {
      sampleCount: 0,
      pearsonR: 0,
      rSquared: 0,
      slope: 0,
      intercept: 0,
      meanComplexity: 0,
      meanFailureRatePct: 0,
      optimalMinSubdivisions: 0,
      interpretation: 'Sem amostras paramétricas U×V para calcular correlação.',
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  const pearsonR = denom > 1e-12 ? Number((num / denom).toFixed(4)) : 0;
  const rSquared = Number((pearsonR * pearsonR).toFixed(4));
  const slope = denX > 1e-12 ? Number((num / denX).toFixed(6)) : 0;
  const intercept = Number((meanY - slope * meanX).toFixed(3));

  const zeroFailCandidates = points
    .filter((p) => p.y === 0)
    .sort((a, b) => a.x - b.x);
  const maxComplexity = points.reduce((m, p) => Math.max(m, p.x), 0);
  const optimalMinSubdivisions =
    zeroFailCandidates.length > 0 ? zeroFailCandidates[0].x : maxComplexity;

  let interpretation =
    'Correlação neutra entre densidade de subdivisão U×V e taxa de falha SCOOBIII.';
  if (pearsonR <= -0.35) {
    interpretation = `Correlação negativa forte (r=${pearsonR}): aumentar subdivisões U×V reduz o erro cordal e derruba a taxa de falha SCOOBIII até 0% a partir de ${optimalMinSubdivisions} células.`;
  } else if (pearsonR < 0) {
    interpretation = `Correlação negativa moderada (r=${pearsonR}): malhas U×V mais densas reduzem desvios geométricos GD&T e aproximam a taxa de falha de zero.`;
  } else if (pearsonR > 0.25) {
    interpretation = `Correlação positiva (r=${pearsonR}): falhas estruturais (Von Mises/Flecha) dominam o regime atual mesmo sob refinamento U×V elevado.`;
  }

  return {
    sampleCount: n,
    pearsonR,
    rSquared,
    slope,
    intercept,
    meanComplexity: Number(meanX.toFixed(1)),
    meanFailureRatePct: Number(meanY.toFixed(2)),
    optimalMinSubdivisions,
    interpretation,
  };
}

function evaluateSingleConfigurationPoint(params: {
  id: string;
  label: string;
  series: ScatterSeriesKind;
  domainTag: ScoobiiiScatterPoint['domainTag'];
  designParams: ParametricDesignParams;
  materialFinish: MaterialFinish;
  feaSettings: FeaSettings;
  camSettings: CamSettings;
  partProfile: PartEngineeringProfile;
  featureOps: CadFeatureOperation[];
  importedModel?: ImportedCadModel | null;
}): ScoobiiiScatterPoint {
  const {
    id,
    label,
    series,
    domainTag,
    designParams,
    materialFinish,
    feaSettings,
    camSettings,
    partProfile,
    featureOps,
    importedModel,
  } = params;

  const surface = buildNurbsSurfaceFromParams(designParams);
  const meshData = tessellateNurbsSurface(
    surface,
    designParams.ribCountU,
    designParams.ribCountV,
    designParams.ribHeightMm
  );
  const feaResult = evaluateStructuralFea(
    surface,
    meshData,
    designParams,
    materialFinish,
    feaSettings,
    'all',
    partProfile,
    importedModel,
    featureOps
  );
  const scoobiii = computeScoobiiiVucProof({
    surface,
    meshData,
    designParams,
    materialFinish,
    feaSettings,
    feaResult,
    partProfile,
    featureOps,
    importedModel,
  });
  const layerSpecs = inferDefaultLayerSpecs({
    importedModel: importedModel ?? null,
    components: importedModel?.components ?? [],
    partProfile,
  });
  const gdtReport = evaluateLayerToleranceCompliance({
    surface,
    specs: layerSpecs,
    feaResult,
    partProfile,
  });
  const toolpath = generateCamToolpath(surface, meshData, camSettings);
  const carbon = calculateCarbonFootprint({
    meshData,
    importedModel: importedModel ?? null,
    materialFinish,
    camSettings,
    toolpath,
    featureOps,
  });

  const scoobiiiPassed = scoobiii.checks.filter((c) => c.passed).length;
  const scoobiiiTotal = scoobiii.checks.length;
  const gdtPassed = gdtReport.passCount;
  const gdtTotal = gdtReport.totalLayers;
  const camValid =
    toolpath.points.length > 0 &&
    toolpath.cuttingLengthMm > 0 &&
    toolpath.estimatedMinutes > 0 &&
    camSettings.stockMarginMm >= 0;

  const totalChecks = scoobiiiTotal + gdtTotal + 1;
  const passedChecks = scoobiiiPassed + gdtPassed + (camValid ? 1 : 0);
  const failedChecks = totalChecks - passedChecks;
  const failureRatePct = Number(((failedChecks / totalChecks) * 100).toFixed(2));
  const maxChordalErrorMm = Number(
    gdtReport.results
      .reduce((m, r) => Math.max(m, r.nurbsChordalErrorMm), 0)
      .toFixed(4)
  );

  const unitFinance = estimateUnitManufacturingFinancials({
    materialFinish,
    camSettings,
    toolpath,
    carbonReport: carbon,
    failureRatePct,
  });

  return {
    id,
    label,
    series,
    domainTag,
    uDivisions: designParams.uDivisions,
    vDivisions: designParams.vDivisions,
    subdivisionComplexity: designParams.uDivisions * designParams.vDivisions,
    failureRatePct,
    failedChecks,
    totalChecks,
    scoobiiiChecksPassed: scoobiiiPassed,
    scoobiiiChecksTotal: scoobiiiTotal,
    gdtLayersPassed: gdtPassed,
    gdtLayersTotal: gdtTotal,
    camValid,
    maxChordalErrorMm,
    maxStressMpa: feaResult.maxStressMpa,
    safetyFactor: feaResult.safetyFactor,
    totalCo2Kg: carbon.totalCo2Kg,
    camCycleMinutes: toolpath.estimatedMinutes,
    unitTotalCostBrl: unitFinance.totalUnitCostBrl,
    suggestedSalePriceBrl: unitFinance.suggestedSalePriceBrl,
    grossMarginPct: unitFinance.grossMarginPct,
    vucCertificateId: scoobiii.certificateId,
  };
}

let cachedPresetBenchmarkPoints: ScoobiiiScatterPoint[] | null = null;

export function getPresetBenchmarkScatterPoints(): ScoobiiiScatterPoint[] {
  if (cachedPresetBenchmarkPoints) {
    return cachedPresetBenchmarkPoints;
  }

  cachedPresetBenchmarkPoints = WORKSPACE_PROJECT_PRESETS.map((preset) => {
    const imported = preset.buildImportedModel ? preset.buildImportedModel() : null;
    const baseProfile = imported?.detectedProfile
      ? imported.detectedProfile
      : resolvePartEngineeringProfile({
          filename: imported?.filename,
          layers: imported?.layers,
          preset: preset.designParams.preset,
          segmentOverride: preset.segment,
        });
    const partProfile = {
      ...baseProfile,
      ...(preset.partProfileOverride ?? {}),
      segment: preset.segment,
    };
    const domainTag: ScoobiiiScatterPoint['domainTag'] =
      preset.camSettings.machineType === 'powder-metal' ||
      preset.camSettings.machineType === 'resin-sla' ||
      preset.camSettings.machineType === 'robot-6axis'
        ? 'CAM'
        : preset.segment === 'aeroespacial'
          ? 'CAE'
          : 'CAD';

    return evaluateSingleConfigurationPoint({
      id: `preset-${preset.id}`,
      label: preset.title,
      series: 'preset-cad-cae-cam',
      domainTag,
      designParams: preset.designParams,
      materialFinish: preset.materialFinish,
      feaSettings: preset.feaSettings,
      camSettings: preset.camSettings,
      partProfile,
      featureOps: preset.initialFeatures ?? [],
      importedModel: imported,
    });
  });

  return cachedPresetBenchmarkPoints;
}

export function buildScoobiiiFullTelemetry(input: {
  designParams: ParametricDesignParams;
  surface: NurbsSurfaceData;
  materialFinish: MaterialFinish;
  feaSettings: FeaSettings;
  feaResult: FeaResult;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  carbonReport: CarbonFootprintReport;
  layerComplianceReport: LayerToleranceComplianceReport;
  partProfile: PartEngineeringProfile;
  featureOps: CadFeatureOperation[];
  scoobiiiProof: ScoobiiiVucProofReport;
  importedModel?: ImportedCadModel | null;
  erpRecords?: ErpCrmRecord[];
  camServiceJobs?: CamServiceJob[];
  remoteMachines?: RemoteMachineTarget[];
  logisticsNodes?: LogisticsTelemetryNode[];
  computeNodes?: ComputeShareNode[];
  vucLedger?: VucLedgerEntry[];
  lastServerVucHex?: string | null;
}): ScoobiiiFullTelemetry {
  const {
    designParams,
    materialFinish,
    feaSettings,
    feaResult,
    camSettings,
    toolpath,
    carbonReport,
    layerComplianceReport,
    partProfile,
    featureOps,
    scoobiiiProof,
    importedModel = null,
    erpRecords = [],
    camServiceJobs = [],
    remoteMachines = [],
    logisticsNodes = [],
    computeNodes = [],
    vucLedger = [],
    lastServerVucHex = null,
  } = input;

  // 1. Live U x V Subdivision Sweep over active project geometry + loads
  const sweepPoints = PARAMETRIC_UV_SWEEP_GRID.map(([uDiv, vDiv]) => {
    const isSameAsActive =
      uDiv === designParams.uDivisions && vDiv === designParams.vDivisions;
    return evaluateSingleConfigurationPoint({
      id: isSameAsActive ? 'active-uv-point' : `sweep-${uDiv}x${vDiv}`,
      label: isSameAsActive
        ? `Projeto Ativo (${uDiv}×${vDiv})`
        : `Varredura NURBS ${uDiv}×${vDiv}`,
      series: isSameAsActive ? 'active-uv' : 'sweep-uv',
      domainTag: 'CAD',
      designParams: {
        ...designParams,
        uDivisions: uDiv,
        vDivisions: vDiv,
      },
      materialFinish,
      feaSettings,
      camSettings,
      partProfile,
      featureOps,
      importedModel,
    });
  });

  const hasExactActivePoint = sweepPoints.some((p) => p.series === 'active-uv');
  if (!hasExactActivePoint) {
    sweepPoints.push(
      evaluateSingleConfigurationPoint({
        id: 'active-uv-point',
        label: `Projeto Ativo (${designParams.uDivisions}×${designParams.vDivisions})`,
        series: 'active-uv',
        domainTag: 'CAD',
        designParams,
        materialFinish,
        feaSettings,
        camSettings,
        partProfile,
        featureOps,
        importedModel,
      })
    );
  }

  // 2. Preset Benchmark Points across CAD / CAE / CAM + Commercial ERP points
  const presetPoints = getPresetBenchmarkScatterPoints();
  const erpFinancialPoints: ScoobiiiScatterPoint[] = erpRecords.map((rec, idx) => {
    const basePreset = presetPoints[idx % presetPoints.length];
    return {
      ...basePreset,
      id: `erp-fin-${rec.id}`,
      label: `ERP ${rec.kind.toUpperCase()}: ${rec.title}`,
      series: 'preset-cad-cae-cam',
      domainTag: 'FINANCEIRO',
      unitTotalCostBrl: Number((rec.amountBrl * 0.66).toFixed(2)),
      suggestedSalePriceBrl: rec.amountBrl,
      grossMarginPct: 34.0,
      vucCertificateId: rec.vucHash.slice(0, 22),
    };
  });

  const scatterPoints: ScoobiiiScatterPoint[] = [
    ...sweepPoints,
    ...presetPoints,
    ...erpFinancialPoints,
  ];

  // Calculate Pearson correlation specifically across the parametric sweep points
  // (where U x V directly varies over the exact same physical CAD/CAE/CAM model)
  const correlation = computePearsonCorrelation(
    sweepPoints.map((p) => ({
      x: p.subdivisionComplexity,
      y: p.failureRatePct,
    }))
  );

  // 3. Domain Overviews (100% of CAD, CAE, CAM, Commercial/Financial, VUC)
  const activePoint = sweepPoints.find((p) => p.series === 'active-uv')!;
  const camValidCount =
    (toolpath.points.length > 0 ? 1 : 0) +
    camServiceJobs.filter((j) => j.status === 'concluido' || j.vucHash.startsWith('VUC-')).length +
    remoteMachines.filter((m) => m.lastJobVuc.startsWith('VUC-')).length;
  const camTotalCount = 1 + camServiceJobs.length + remoteMachines.length;

  const erpVucValidCount = erpRecords.filter((r) => r.vucHash.startsWith('VUC-')).length;
  const erpTotalCount = erpRecords.length;
  const finPassed = 1 + erpVucValidCount;
  const finTotal = 1 + erpTotalCount;

  const cadPassed =
    (scoobiiiProof.nurbsProof.clampedKnotsValid ? 1 : 0) +
    (scoobiiiProof.nurbsProof.minJacobian > 0 ? 1 : 0) +
    layerComplianceReport.passCount;
  const cadTotal = 2 + layerComplianceReport.totalLayers;

  const caeChecks = scoobiiiProof.checks.filter(
    (c) => c.domain === 'FISICA' || c.domain === 'NORMA' || c.domain === 'ROSCA_ISO'
  );
  const caePassed = caeChecks.filter((c) => c.passed).length + (carbonReport.totalCo2Kg > 0 ? 1 : 0);
  const caeTotal = caeChecks.length + 1;

  const vucPassed =
    (scoobiiiProof.allPassed ? 1 : 0) +
    vucLedger.filter((v) => v.vucHash.startsWith('VUC-')).length;
  const vucTotal = 1 + vucLedger.length;

  const toPct = (p: number, t: number) => Number(((p / Math.max(1, t)) * 100).toFixed(1));

  const unitCost = estimateUnitManufacturingFinancials({
    materialFinish,
    camSettings,
    toolpath,
    carbonReport,
    failureRatePct: activePoint.failureRatePct,
  });

  const totalPipelineBrl = Number(
    erpRecords.reduce((acc, r) => acc + r.amountBrl, 0).toFixed(2)
  );

  const kindOrder: ErpCrmRecord['kind'][] = ['order', 'lead', 'inventory', 'shipment', 'invoice'];
  const byErpKind = kindOrder
    .map((kind) => {
      const items = erpRecords.filter((r) => r.kind === kind);
      return {
        kind,
        count: items.length,
        totalBrl: Number(items.reduce((s, r) => s + r.amountBrl, 0).toFixed(2)),
      };
    })
    .filter((entry) => entry.count > 0);

  const domainOverviews: DomainProofOverview[] = [
    {
      domain: 'CAD',
      label: 'CAD · NURBS & GD&T',
      passed: cadPassed,
      total: cadTotal,
      coveragePct: toPct(cadPassed, cadTotal),
      status: cadPassed === cadTotal ? 'CONFORME' : 'ALERTA',
      highlight: `${designParams.uDivisions}×${designParams.vDivisions} · ${layerComplianceReport.passCount}/${layerComplianceReport.totalLayers} camadas`,
    },
    {
      domain: 'CAE',
      label: 'CAE · FEA & Carbono LCA',
      passed: caePassed,
      total: caeTotal,
      coveragePct: toPct(caePassed, caeTotal),
      status: caePassed === caeTotal ? 'CONFORME' : 'ALERTA',
      highlight: `SF ${feaResult.safetyFactor}× · Eco ${carbonReport.ecoGrade}`,
    },
    {
      domain: 'CAM',
      label: 'CAM · CNC / Robôs / MQTT',
      passed: camValidCount,
      total: camTotalCount,
      coveragePct: toPct(camValidCount, camTotalCount),
      status: camValidCount === camTotalCount ? 'CONFORME' : 'ALERTA',
      highlight: `${camSettings.machineType} · ${toolpath.estimatedMinutes.toFixed(1)} min`,
    },
    {
      domain: 'FINANCEIRO',
      label: 'Comercial & Financeiro (ERP)',
      passed: finPassed,
      total: finTotal,
      coveragePct: toPct(finPassed, finTotal),
      status: finPassed === finTotal ? 'CONFORME' : 'ALERTA',
      highlight: `Custo R$ ${unitCost.totalUnitCostBrl.toFixed(0)} · Margem ${unitCost.grossMarginPct}%`,
    },
    {
      domain: 'VUC',
      label: 'VUC · Ledger SHA-256/Ed25519',
      passed: vucPassed,
      total: vucTotal,
      coveragePct: toPct(vucPassed, vucTotal),
      status: vucPassed === vucTotal ? 'CONFORME' : 'ALERTA',
      highlight: `${vucLedger.length} registros criptográficos`,
    },
  ];

  const sumPassed = domainOverviews.reduce((s, d) => s + d.passed, 0);
  const sumTotal = domainOverviews.reduce((s, d) => s + d.total, 0);

  const completedServiceJobsCount = camServiceJobs.filter((j) => j.status === 'concluido').length;
  const openOrdersCount = erpRecords.filter((r) => r.status !== 'concluido').length;
  const completedOrdersCount = erpRecords.filter((r) => r.status === 'concluido').length;
  const activeCouriersCount = logisticsNodes.filter((n) => n.status !== 'entregue').length;
  const activeCompute = computeNodes.filter((n) => n.active);
  const computeTflopsTotal = Number(
    activeCompute
      .reduce((acc, n) => acc + (n.tflopsEst * n.sharePct) / 100, 0)
      .toFixed(2)
  );

  return {
    scatterPoints,
    correlation,
    domainOverviews,
    cadSummary: {
      modelTitle: scoobiiiProof.modelTitle,
      segment: partProfile.segment,
      subdivisionsLabel: `${designParams.uDivisions}×${designParams.vDivisions}`,
      subdivisionComplexity: designParams.uDivisions * designParams.vDivisions,
      maxPartitionUnityResidual: scoobiiiProof.nurbsProof.maxPartitionUnityResidual,
      minJacobian: scoobiiiProof.nurbsProof.minJacobian,
      netVolumeCm3: scoobiiiProof.nurbsProof.netVolumeCm3,
      gdtPassCount: layerComplianceReport.passCount,
      gdtTotalLayers: layerComplianceReport.totalLayers,
      maxChordalErrorMm: activePoint.maxChordalErrorMm,
      featureOpsCount: featureOps.length,
      importedFormat: importedModel ? importedModel.format : 'NURBS',
      importedFilename: importedModel ? importedModel.filename : 'Superfície Paramétrica Nativa',
    },
    caeSummary: {
      materialName: MATERIAL_MECHANICAL_SPECS[materialFinish].name,
      vonMisesMaxMpa: feaResult.maxStressMpa,
      allowableStressMpa: scoobiiiProof.physicsProof.allowableStressMpa,
      safetyFactor: feaResult.safetyFactor,
      maxDeflectionMm: feaResult.maxDeflectionMm,
      stressConcentrationKt: scoobiiiProof.physicsProof.stressConcentrationKt,
      ecoGrade: carbonReport.ecoGrade,
      totalCo2Kg: carbonReport.totalCo2Kg,
      buyToFlyRatio: carbonReport.buyToFlyRatio,
      energyKwh: carbonReport.energyKwh,
    },
    camSummary: {
      machineType: camSettings.machineType,
      postFormat: camSettings.postFormat,
      cuttingLengthMm: toolpath.cuttingLengthMm,
      estimatedMinutes: toolpath.estimatedMinutes,
      spindleRpm: toolpath.spindleRpm,
      feedRateMmMin: toolpath.feedRateMmMin,
      serviceJobsCount: camServiceJobs.length,
      completedServiceJobsCount,
      remoteMachinesCount: remoteMachines.length,
      serviceJobs: camServiceJobs,
      remoteMachines,
    },
    financialSummary: {
      unitCost,
      totalPipelineBrl,
      openOrdersCount,
      completedOrdersCount,
      activeCouriersCount,
      activeComputeNodesCount: activeCompute.length,
      computeTflopsTotal,
      erpRecords,
      byErpKind,
    },
    vucAuditSummary: {
      totalLedgerEntries: vucLedger.length,
      overallProofPct: toPct(sumPassed, sumTotal),
      scoobiiiCertificateId: scoobiiiProof.certificateId,
      latestServerVucHex: lastServerVucHex,
      ledgerEntries: vucLedger,
    },
  };
}
