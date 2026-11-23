import { describe, expect, it } from 'vitest';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import { calculateCarbonFootprint } from '../src/kernel/carbonFootprint';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import { evaluateLayerToleranceCompliance, inferDefaultLayerSpecs } from '../src/kernel/layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { computeScoobiiiVucProof } from '../src/kernel/scoobiiiVuc';
import {
  buildScoobiiiFullTelemetry,
  computePearsonCorrelation,
  estimateUnitManufacturingFinancials,
  getPresetBenchmarkScatterPoints,
} from '../src/kernel/scoobiiiProofTelemetry';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { WORKSPACE_PROJECT_PRESETS } from '../src/kernel/workspacePresets';
import type {
  CamServiceJob,
  CamSettings,
  ComputeShareNode,
  ErpCrmRecord,
  FeaSettings,
  LogisticsTelemetryNode,
  ParametricDesignParams,
  RemoteMachineTarget,
  VucLedgerEntry,
} from '../src/types/cad';

function makeWorkspaceInput(overrides?: {
  uDivisions?: number;
  vDivisions?: number;
  loadNewtons?: number;
  thicknessMm?: number;
  machineType?: CamSettings['machineType'];
  useImported?: boolean;
}) {
  const preset = WORKSPACE_PROJECT_PRESETS[0];
  const importedModel = overrides?.useImported ? preset.buildImportedModel!() : null;
  const designParams: ParametricDesignParams = {
    preset: 'shell',
    spanX: 210,
    spanY: 145,
    archHeight: 52,
    waveAmplitude: 16,
    twistDeg: 18,
    thicknessMm: overrides?.thicknessMm ?? 6,
    uDivisions: overrides?.uDivisions ?? 34,
    vDivisions: overrides?.vDivisions ?? 34,
    ribCountU: 5,
    ribCountV: 4,
    ribHeightMm: 14,
    attractorStrength: 0,
  };
  const camSettings: CamSettings = {
    ...preset.camSettings,
    machineType: overrides?.machineType ?? 'cnc-5axis',
  };
  const feaSettings: FeaSettings = {
    loadNewtons: overrides?.loadNewtons ?? 3200,
    supportMode: 'edge-clamped',
    loadPattern: 'uniform-pressure',
    targetSafetyFactor: 2.0,
  };
  const partProfile = resolvePartEngineeringProfile({
    filename: importedModel?.filename,
    layers: importedModel?.layers,
    preset: designParams.preset,
    segmentOverride: 'industrial-cnc',
    surfaceName: 'ShellParametrica',
  });
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
    'aluminum',
    feaSettings,
    'all',
    partProfile,
    importedModel,
    []
  );
  const layerSpecs = inferDefaultLayerSpecs({
    importedModel,
    components: importedModel?.components ?? [],
    partProfile,
  });
  const layerComplianceReport = evaluateLayerToleranceCompliance({
    surface,
    specs: layerSpecs,
    feaResult,
    partProfile,
  });
  const toolpath = generateCamToolpath(surface, meshData, camSettings);
  const carbonReport = calculateCarbonFootprint({
    meshData,
    importedModel,
    materialFinish: 'aluminum',
    camSettings,
    toolpath,
    featureOps: [],
  });
  const scoobiiiProof = computeScoobiiiVucProof({
    surface,
    meshData,
    designParams,
    materialFinish: 'aluminum',
    feaSettings,
    feaResult,
    partProfile,
    featureOps: [],
    importedModel,
  });

  return {
    designParams,
    surface,
    materialFinish: 'aluminum' as const,
    feaSettings,
    feaResult,
    camSettings,
    toolpath,
    carbonReport,
    layerComplianceReport,
    partProfile,
    featureOps: [],
    scoobiiiProof,
    importedModel,
  };
}

describe('SCOOBIII/VUC Multi-Domain Proof Telemetry & D3 Correlation Kernel', () => {
  it('computes Pearson correlation across empty, negative strong, negative moderate, positive, and neutral datasets', () => {
    const empty = computePearsonCorrelation([]);
    expect(empty.sampleCount).toBe(0);
    expect(empty.pearsonR).toBe(0);

    const strongNeg = computePearsonCorrelation([
      { x: 36, y: 50 },
      { x: 100, y: 30 },
      { x: 400, y: 10 },
      { x: 1024, y: 0 },
      { x: 2304, y: 0 },
    ]);
    expect(strongNeg.pearsonR).toBeLessThanOrEqual(-0.35);
    expect(strongNeg.optimalMinSubdivisions).toBe(1024);
    expect(strongNeg.interpretation).toContain('negativa forte');

    const modNeg = computePearsonCorrelation([
      { x: 10, y: 20 },
      { x: 20, y: 10 },
      { x: 30, y: 25 },
      { x: 40, y: 12 },
    ]);
    expect(modNeg.pearsonR).toBeLessThan(0);
    expect(modNeg.pearsonR).toBeGreaterThan(-0.35);
    expect(modNeg.optimalMinSubdivisions).toBe(40);
    expect(modNeg.interpretation).toContain('negativa moderada');

    const pos = computePearsonCorrelation([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);
    expect(pos.pearsonR).toBeGreaterThan(0.25);
    expect(pos.interpretation).toContain('Correlação positiva');

    const neutral = computePearsonCorrelation([
      { x: 10, y: 15 },
      { x: 20, y: 15 },
      { x: 30, y: 15 },
    ]);
    expect(neutral.pearsonR).toBe(0);
    expect(neutral.slope).toBe(0);
    expect(neutral.interpretation).toContain('Correlação neutra');

    const zeroVarX = computePearsonCorrelation([
      { x: 10, y: 15 },
      { x: 10, y: 25 },
    ]);
    expect(zeroVarX.pearsonR).toBe(0);
    expect(zeroVarX.slope).toBe(0);
  });

  it('estimates unit manufacturing financials deterministically for CNC 5-axis, LPBF, and 3-axis', () => {
    const ws = makeWorkspaceInput({ machineType: 'cnc-5axis' });
    const fin5x = estimateUnitManufacturingFinancials({
      materialFinish: 'titanium',
      camSettings: ws.camSettings,
      toolpath: ws.toolpath,
      carbonReport: ws.carbonReport,
      failureRatePct: 0,
    });
    expect(fin5x.engineeringCertBrl).toBe(42);
    expect(fin5x.totalUnitCostBrl).toBeGreaterThan(fin5x.materialBrl);
    expect(fin5x.suggestedSalePriceBrl).toBeGreaterThan(fin5x.totalUnitCostBrl);
    expect(fin5x.grossMarginPct).toBeCloseTo(32.4, 0);
    expect(fin5x.deterministicVucHash.startsWith('VUC-')).toBe(true);

    const fin3x = estimateUnitManufacturingFinancials({
      materialFinish: 'aluminum',
      camSettings: { ...ws.camSettings, machineType: 'cnc-3axis' },
      toolpath: ws.toolpath,
      carbonReport: ws.carbonReport,
      failureRatePct: 12.5,
    });
    expect(fin3x.engineeringCertBrl).toBe(30);
    expect(fin3x.breakEvenBatchUnits).toBeGreaterThanOrEqual(1);
  });

  it('caches and evaluates all 10 CAD/CAE/CAM presets across SCOOBIII, GD&T, CAM, and CO2', () => {
    const first = getPresetBenchmarkScatterPoints();
    const second = getPresetBenchmarkScatterPoints();
    expect(first).toBe(second);
    expect(first.length).toBe(WORKSPACE_PROJECT_PRESETS.length);
    for (const pt of first) {
      expect(pt.subdivisionComplexity).toBeGreaterThan(0);
      expect(pt.totalChecks).toBeGreaterThan(0);
      expect(pt.vucCertificateId.startsWith('SCOOBIII-VUC-')).toBe(true);
    }
  });

  it('builds 100% CAD/CAE/CAM/Financial/VUC telemetry for custom U×V (34×34) and sweep grid U×V (32×32)', () => {
    const baseCustom = makeWorkspaceInput({ uDivisions: 34, vDivisions: 34, useImported: false });
    const erpRecords: ErpCrmRecord[] = [
      {
        id: 'erp-1',
        kind: 'order',
        title: 'Ordem Teste 1',
        status: 'em-producao',
        partyName: 'Cliente A',
        segment: 'industrial-cnc',
        amountBrl: 15000,
        ownerRole: 'cam_provider',
        vucHash: 'VUC-11112222333344445555666677778888',
        updatedAt: '2026-11-22T12:00:00Z',
      },
      {
        id: 'erp-2',
        kind: 'invoice',
        title: 'Fatura Concluída',
        status: 'concluido',
        partyName: 'Cliente B',
        segment: 'aeroespacial',
        amountBrl: 9000,
        ownerRole: 'client',
        vucHash: 'BAD-HASH',
        updatedAt: '2026-11-22T12:00:00Z',
      },
    ];
    const camServiceJobs: CamServiceJob[] = [
      {
        id: 'job-1',
        title: 'Job CAM 1',
        targetCategory: 'datacenter',
        programId: 'prog-1',
        sourceKind: 'catalog',
        sourceRef: 'ref',
        filename: 'part.nc',
        machineType: 'cnc-5axis',
        postFormat: 'fanuc-nc',
        status: 'concluido',
        progressPct: 100,
        restartCount: 0,
        estimatedMinutes: 12,
        cuttingLengthMm: 450,
        postCodeSnippet: 'G01',
        geometrySummary: 'ok',
        vucHash: 'VUC-AABBCCDD',
        createdAt: '2026-11-22T12:00:00Z',
        updatedAt: '2026-11-22T12:00:00Z',
      },
      {
        id: 'job-2',
        title: 'Job CAM 2',
        targetCategory: 'humanoid',
        programId: 'prog-2',
        sourceKind: 'api',
        sourceRef: 'ref2',
        filename: 'arm.nc',
        machineType: 'robot-6axis',
        postFormat: 'kuka-krl',
        status: 'em-fila',
        progressPct: 0,
        restartCount: 0,
        estimatedMinutes: 18,
        cuttingLengthMm: 600,
        postCodeSnippet: 'PTP',
        geometrySummary: 'ok',
        vucHash: 'PENDING',
        createdAt: '2026-11-22T12:00:00Z',
        updatedAt: '2026-11-22T12:00:00Z',
      },
    ];
    const remoteMachines: RemoteMachineTarget[] = [
      {
        id: 'rm-1',
        name: 'DMG Mori 5X',
        machineType: 'cnc-5axis',
        protocol: 'OPC-UA',
        endpointUrl: 'opc.tcp://localhost:4840',
        status: 'online',
        lastJobVuc: 'VUC-1234',
        updatedAt: '2026-11-22T12:00:00Z',
      },
    ];
    const logisticsNodes: LogisticsTelemetryNode[] = [
      {
        id: 'log-1',
        driverName: 'Entregador 1',
        serviceTag: '99',
        modal: 'road',
        lat: -23.5,
        lng: -46.6,
        status: 'em-rota',
        routeLabel: 'Hub -> Cliente',
        speedKmh: 50,
        updatedAt: '2026-11-22T12:00:00Z',
      },
      {
        id: 'log-2',
        driverName: 'Entregador 2',
        serviceTag: 'iFood',
        modal: 'road',
        lat: -23.5,
        lng: -46.6,
        status: 'entregue',
        routeLabel: 'Concluída',
        speedKmh: 0,
        updatedAt: '2026-11-22T12:00:00Z',
      },
    ];
    const computeNodes: ComputeShareNode[] = [
      {
        id: 'cn-1',
        userId: 'u1',
        label: 'Node 1',
        osName: 'Linux',
        cpuCores: 16,
        gpuName: 'GPU',
        sharePct: 20,
        tflopsEst: 25,
        active: true,
        updatedAt: '2026-11-22T12:00:00Z',
      },
      {
        id: 'cn-2',
        userId: 'u2',
        label: 'Node Inactive',
        osName: 'Linux',
        cpuCores: 8,
        gpuName: 'CPU',
        sharePct: 20,
        tflopsEst: 5,
        active: false,
        updatedAt: '2026-11-22T12:00:00Z',
      },
    ];
    const vucLedger: VucLedgerEntry[] = [
      {
        vucHash: 'VUC-ABCD1234',
        domain: 'ERP_CRM',
        summary: 'Ordem Teste 1',
        payloadJson: '{}',
        sha256Hex: 'DEADBEEF',
        createdAt: '2026-11-22T12:00:00Z',
      },
    ];

    const customTelemetry = buildScoobiiiFullTelemetry({
      ...baseCustom,
      erpRecords,
      camServiceJobs,
      remoteMachines,
      logisticsNodes,
      computeNodes,
      vucLedger,
      lastServerVucHex: 'VUC-ED25519-TEST',
    });

    // 12 sweep points + 1 distinct 34x34 active point + 10 presets + 2 ERP points = 25
    expect(customTelemetry.scatterPoints.length).toBe(25);
    expect(customTelemetry.domainOverviews.length).toBe(5);
    expect(customTelemetry.cadSummary.subdivisionsLabel).toBe('34×34');
    expect(customTelemetry.financialSummary.totalPipelineBrl).toBe(24000);
    expect(customTelemetry.financialSummary.byErpKind.map((k) => k.kind)).toEqual(['order', 'invoice']);
    expect(customTelemetry.financialSummary.computeTflopsTotal).toBe(5);
    expect(customTelemetry.vucAuditSummary.latestServerVucHex).toBe('VUC-ED25519-TEST');

    // Test exact sweep match (32x32) + importedModel + invalid CAM stockMargin + zero CO2 branch
    const baseSweepMatch = makeWorkspaceInput({
      uDivisions: 32,
      vDivisions: 32,
      loadNewtons: 85000,
      thicknessMm: 1.5,
      useImported: true,
    });
    const sweepTelemetry = buildScoobiiiFullTelemetry({
      ...baseSweepMatch,
      camSettings: { ...baseSweepMatch.camSettings, stockMarginMm: -0.5 },
      toolpath: { ...baseSweepMatch.toolpath, points: [] },
      carbonReport: { ...baseSweepMatch.carbonReport, totalCo2Kg: 0 },
      scoobiiiProof: {
        ...baseSweepMatch.scoobiiiProof,
        allPassed: false,
        nurbsProof: {
          ...baseSweepMatch.scoobiiiProof.nurbsProof,
          clampedKnotsValid: false,
          minJacobian: 0,
        },
      },
    });
    expect(sweepTelemetry.scatterPoints.length).toBe(22);
    expect(sweepTelemetry.domainOverviews.some((d) => d.status === 'ALERTA')).toBe(true);
    expect(sweepTelemetry.cadSummary.importedFormat).toBe('OBJ');

    // Test 100% CAM CONFORME branch (valid toolpath + valid remote VUC)
    const camConformeTelemetry = buildScoobiiiFullTelemetry({
      ...baseCustom,
      remoteMachines,
      camServiceJobs: [camServiceJobs[0]],
    });
    const camOverview = camConformeTelemetry.domainOverviews.find((d) => d.domain === 'CAM');
    expect(camOverview?.status).toBe('CONFORME');
  });
});
