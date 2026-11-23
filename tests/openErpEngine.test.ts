import { describe, expect, it } from 'vitest';
import { calculateCarbonFootprint } from '../src/kernel/carbonFootprint';
import { evaluateLayerToleranceCompliance, inferDefaultLayerSpecs } from '../src/kernel/layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import {
  buildLiveErpWorkspaceSnapshot,
  isFrostbiteInternalArchitecture,
  type ErpTaxRegime,
} from '../src/kernel/openErpEngine';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import type {
  CadFeatureOperation,
  CamSettings,
  FeaSettings,
  ImportedCadModel,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../src/types/cad';

function makeBaseFixtures(overrides?: {
  segment?: PartEngineeringProfile['segment'];
  partName?: string;
  modelCode?: string;
  manufacturer?: string;
  machineType?: CamSettings['machineType'];
  materialFinish?: 'aluminum' | 'titanium' | 'carbon-fiber' | 'glass';
  taxRegime?: ErpTaxRegime;
  presetId?: string;
  withImported?: boolean;
  withBolts?: boolean;
  loadNewtons?: number;
}) {
  const segment = overrides?.segment ?? 'industrial-cnc';
  const materialFinish = overrides?.materialFinish ?? 'aluminum';
  const machineType = overrides?.machineType ?? 'cnc-5axis';
  const designParams: ParametricDesignParams = {
    preset: 'shell',
    spanX: 180,
    spanY: 130,
    archHeight: 42,
    waveAmplitude: 8,
    twistDeg: 10,
    thicknessMm: 8,
    uDivisions: 16,
    vDivisions: 16,
    ribCountU: 3,
    ribCountV: 3,
    ribHeightMm: 14,
    attractorStrength: 0,
  };
  const surface = buildNurbsSurfaceFromParams(designParams);
  const meshData = tessellateNurbsSurface(surface, 3, 3, 14);
  const partProfile: PartEngineeringProfile = {
    segment,
    partName: overrides?.partName ?? 'Engrenagem Cilíndrica M2 Z24',
    manufacturer: overrides?.manufacturer ?? 'Parametrix Industrial',
    modelCode: overrides?.modelCode ?? 'PX-GEAR-M2-Z24',
    primaryMaterial: materialFinish,
    specifications: ['Módulo 2', '24 dentes'],
    certifications: ['ISO 53', 'ISO 2768-m'],
    intendedUse: 'Transmissão industrial CNC',
    detectedFrom: 'test-fixture',
    safetyCriteria: {
      minSafetyFactor: 2.0,
      maxDeflectionMm: 0.4,
      recommendedLoadN: 2400,
      supportMode: 'edge-clamped',
      loadPattern: 'center-point',
      criticalInspectionNote: 'Checar furo H7',
    },
  };
  const feaSettings: FeaSettings = {
    loadNewtons: overrides?.loadNewtons ?? 1800,
    supportMode: 'edge-clamped',
    loadPattern: 'center-point',
    targetSafetyFactor: 2.0,
  };
  const camSettings: CamSettings = {
    machineType,
    strategy: 'contour',
    toolId: 'tool-ball-8',
    stepoverPct: 22,
    stepdownMm: 2,
    stockMarginMm: 0.15,
    safeZMm: 25,
    cutSpeedMultiplier: 1,
    postFormat: machineType === 'resin-sla' ? 'sla-resin' : machineType === 'powder-metal' ? 'slm-powder' : 'fanuc-nc',
  };
  const importedModel: ImportedCadModel | null = overrides?.withImported
    ? {
        id: 'imp-test-1',
        filename: 'peca_importada.step',
        format: 'STEP',
        positions: meshData.positions,
        normals: meshData.normals,
        triangleCount: meshData.triangleCount,
        entityCount: 1,
        boundingBox: meshData.boundingBox,
        layers: ['LAYER_1'],
        notes: 'Fixture STEP',
      }
    : null;
  const featureOps: CadFeatureOperation[] = overrides?.withBolts
    ? [
        {
          id: 'b-1',
          kind: 'threaded-bolt',
          label: 'M6',
          targetComponentId: 'COMP-1',
          point: [0, 0, 0],
          normal: [0, 1, 0],
          widthMm: 10,
          lengthMm: 10,
          diameterMm: 6,
          depthMm: 14,
          threadSpec: 'M6',
          createdAt: '00:00',
        },
      ]
    : overrides?.withImported
      ? []
      : [
          {
            id: 's-1',
            kind: 'slot-cutout',
            label: 'Rasgo',
            targetComponentId: 'COMP-1',
            point: [0, 0, 0],
            normal: [0, 1, 0],
            widthMm: 8,
            lengthMm: 18,
            diameterMm: 8,
            depthMm: 8,
            createdAt: '00:00',
          },
        ];

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
  const toolpath = generateCamToolpath(surface, meshData, camSettings);
  const carbonReport = calculateCarbonFootprint({
    meshData,
    importedModel,
    materialFinish,
    camSettings,
    toolpath,
    featureOps,
  });
  const specs = inferDefaultLayerSpecs({
    importedModel,
    components: [],
    partProfile,
  });
  const layerComplianceReport = evaluateLayerToleranceCompliance({
    surface,
    specs,
    feaResult,
    partProfile,
  });

  return buildLiveErpWorkspaceSnapshot({
    surface,
    meshData,
    importedModel,
    featureOps,
    materialFinish,
    partProfile,
    feaResult,
    feaSettings,
    layerComplianceReport,
    carbonReport,
    camSettings,
    toolpath,
    camServiceJobs: [],
    remoteMachines: overrides?.withImported
      ? [
          {
            id: 'rm-1',
            name: 'Haas 5X',
            machineType,
            protocol: 'OPC-UA',
            endpointUrl: 'opc.tcp://127.0.0.1:4840',
            status: 'online',
            lastJobVuc: 'VUC-TEST-RM1',
            updatedAt: '2026-11-23T00:00:00Z',
          },
        ]
      : [],
    taxRegime: overrides?.taxRegime,
    presetId: overrides?.presetId,
  });
}

describe('openErpEngine', () => {
  it('computes real-time BOM, routing, logistics, taxes, market price and CRM leads for industrial presets', () => {
    const snap = makeBaseFixtures({
      segment: 'industrial-cnc',
      withBolts: true,
      taxRegime: 'presumido',
    });
    expect(snap.pricingAndRoi.commercialDisclosureBlocked).toBe(false);
    expect(snap.pricingAndRoi.frostbiteNotice).toBeNull();
    expect(snap.pricingAndRoi.parametrixPriceUnitBrl).toBeGreaterThan(snap.pricingAndRoi.totalCostUnitBrl);
    expect(snap.pricingAndRoi.marketPriceUnitBrl).toBeGreaterThan(snap.pricingAndRoi.parametrixPriceUnitBrl);
    expect(snap.pricingAndRoi.roiPct).toBeGreaterThan(0);
    expect(snap.bomLines.some((l) => l.category === 'fixacao-iso')).toBe(true);
    expect(snap.correlatedAreas.map((a) => a.area)).toEqual(['CAD', 'CAE', 'CAM']);
    expect(snap.crmLeads.length).toBeGreaterThan(0);
    expect(snap.vucHash.startsWith('VUC-')).toBe(true);
  });

  it('handles simples and real tax regimes, additive consumables and imported CAD models', () => {
    const simplesSnap = makeBaseFixtures({
      segment: 'aeroespacial',
      materialFinish: 'titanium',
      machineType: 'powder-metal',
      taxRegime: 'simples',
      withImported: true,
    });
    expect(simplesSnap.taxBreakdown.regime).toBe('simples');
    expect(simplesSnap.taxBreakdown.ipiBrl).toBe(0);
    expect(simplesSnap.bomLines.some((l) => l.name.includes('Argônio'))).toBe(true);

    const realSnap = makeBaseFixtures({
      segment: 'medico',
      materialFinish: 'glass',
      machineType: 'resin-sla',
      taxRegime: 'real',
      loadNewtons: 24000,
    });
    expect(realSnap.taxBreakdown.regime).toBe('real');
    expect(realSnap.bomLines.some((l) => l.name.includes('IPA'))).toBe(true);
    expect(realSnap.correlatedAreas.find((a) => a.area === 'CAE')?.status).toBe('alerta');
  });

  it('covers all segment lead catalogs cleanly', () => {
    const segments: PartEngineeringProfile['segment'][] = [
      'ciclismo-mobilidade',
      'arquitetura-bim',
      'robotica',
      'automotivo',
    ];
    for (const seg of segments) {
      const snap = makeBaseFixtures({ segment: seg });
      expect(snap.crmLeads[0].vertical).toBe(seg);
    }
  });

  it('enforces FrostbiteEngine pre-silicon guard against public CAPEX/OPEX/ROI/suppliers', () => {
    expect(
      isFrostbiteInternalArchitecture(
        {
          partName: 'Rack #FrostbiteEngine 1MW',
          modelCode: 'FB-7NM-1MW',
          manufacturer: 'Frostbite Research',
        },
        'preset-frostbite-rack'
      )
    ).toBe(true);

    const snap = makeBaseFixtures({
      segment: 'robotica',
      partName: 'Rack #FrostbiteEngine 1 MW 800VDC Busbar + HVAC',
      modelCode: 'FB-7NM-1MW-800VDC',
      presetId: 'preset-frostbite-rack',
    });
    expect(snap.pricingAndRoi.commercialDisclosureBlocked).toBe(true);
    expect(snap.pricingAndRoi.marketPriceUnitBrl).toBeNull();
    expect(snap.pricingAndRoi.savingsVsMarketPct).toBeNull();
    expect(snap.pricingAndRoi.roiPct).toBeNull();
    expect(snap.pricingAndRoi.paybackBatches).toBeNull();
    expect(snap.pricingAndRoi.frostbiteNotice).toContain('7nm');
    expect(snap.crmLeads[0].id).toBe('crm-internal-dc');
  });

  it('covers mid and low technical readiness stages with non-compliant GD&T and empty toolpath', () => {
    const surface = buildNurbsSurfaceFromParams({
      preset: 'shell',
      spanX: 160,
      spanY: 120,
      archHeight: 36,
      waveAmplitude: 6,
      twistDeg: 0,
      thicknessMm: 6,
      uDivisions: 12,
      vDivisions: 12,
      ribCountU: 2,
      ribCountV: 2,
      ribHeightMm: 10,
      attractorStrength: 0,
    });
    const meshData = tessellateNurbsSurface(surface, 2, 2, 10);
    const partProfile: PartEngineeringProfile = {
      segment: 'industrial-cnc',
      partName: 'Suporte Teste CRM',
      manufacturer: 'Parametrix',
      modelCode: 'PX-TST',
      primaryMaterial: 'aluminum',
      specifications: ['Teste CRM'],
      certifications: ['ISO 2768-m'],
      intendedUse: 'Teste',
      detectedFrom: 'test-fixture',
      safetyCriteria: {
        minSafetyFactor: 2.0,
        maxDeflectionMm: 0.4,
        recommendedLoadN: 1500,
        supportMode: 'edge-clamped',
        loadPattern: 'center-point',
        criticalInspectionNote: 'OK',
      },
    };
    const feaSettings: FeaSettings = {
      loadNewtons: 18000,
      supportMode: 'cantilever-u',
      loadPattern: 'torsion-tip',
      targetSafetyFactor: 2.0,
    };
    const camSettings: CamSettings = {
      machineType: 'cnc-3axis',
      strategy: 'contour',
      toolId: 'tool-flat-12',
      stepoverPct: 25,
      stepdownMm: 2,
      stockMarginMm: 0.2,
      safeZMm: 20,
      cutSpeedMultiplier: 1,
      postFormat: 'fanuc-nc',
    };
    const feaResult = evaluateStructuralFea(
      surface,
      meshData,
      {
        preset: 'shell',
        spanX: 160,
        spanY: 120,
        archHeight: 36,
        waveAmplitude: 6,
        twistDeg: 0,
        thicknessMm: 6,
        uDivisions: 12,
        vDivisions: 12,
        ribCountU: 2,
        ribCountV: 2,
        ribHeightMm: 10,
        attractorStrength: 0,
      },
      'aluminum',
      feaSettings,
      'all',
      partProfile,
      null,
      []
    );
    const toolpath = generateCamToolpath(surface, meshData, camSettings);
    const carbonReport = calculateCarbonFootprint({
      meshData,
      importedModel: null,
      materialFinish: 'aluminum',
      camSettings,
      toolpath,
      featureOps: [],
    });
    const specs = inferDefaultLayerSpecs({ importedModel: null, components: [], partProfile });
    const layerOk = evaluateLayerToleranceCompliance({ surface, specs, feaResult, partProfile });

    const midSnap = buildLiveErpWorkspaceSnapshot({
      surface,
      meshData,
      importedModel: null,
      featureOps: [],
      materialFinish: 'aluminum',
      partProfile,
      feaResult: { ...feaResult, status: 'critico' },
      feaSettings,
      layerComplianceReport: { ...layerOk, overallStatus: 'conforme' },
      carbonReport,
      camSettings,
      toolpath,
      camServiceJobs: [],
      remoteMachines: [],
    });
    expect(midSnap.crmLeads[0].stage).toBe('cotacao-tecnica');

    const highSnap = buildLiveErpWorkspaceSnapshot({
      surface,
      meshData,
      importedModel: null,
      featureOps: [],
      materialFinish: 'aluminum',
      partProfile,
      feaResult: { ...feaResult, status: 'seguro' },
      feaSettings,
      layerComplianceReport: { ...layerOk, overallStatus: 'conforme' },
      carbonReport,
      camSettings,
      toolpath,
      camServiceJobs: [],
      remoteMachines: [],
    });
    expect(highSnap.crmLeads[0].stage).toBe('aprovacao-vuc');
    expect(highSnap.correlatedAreas.find((a) => a.area === 'CAE')?.status).toBe('sincronizado');

    const safeFeaFailedGdtSnap = buildLiveErpWorkspaceSnapshot({
      surface,
      meshData,
      importedModel: null,
      featureOps: [],
      materialFinish: 'aluminum',
      partProfile,
      feaResult: { ...feaResult, status: 'seguro' },
      feaSettings,
      layerComplianceReport: { ...layerOk, overallStatus: 'nao-conforme' },
      carbonReport,
      camSettings,
      toolpath,
      camServiceJobs: [],
      remoteMachines: [],
    });
    expect(safeFeaFailedGdtSnap.correlatedAreas.find((a) => a.area === 'CAE')?.status).toBe('alerta');

    const lowSnap = buildLiveErpWorkspaceSnapshot({
      surface,
      meshData,
      importedModel: null,
      featureOps: [],
      materialFinish: 'aluminum',
      partProfile,
      feaResult: { ...feaResult, status: 'critico' },
      feaSettings,
      layerComplianceReport: { ...layerOk, overallStatus: 'nao-conforme' },
      carbonReport,
      camSettings,
      toolpath: { ...toolpath, points: [] },
      camServiceJobs: [],
      remoteMachines: [],
    });
    expect(lowSnap.crmLeads[0].stage).toBe('prospeccao');
    expect(lowSnap.correlatedAreas.find((a) => a.area === 'CAE')?.status).toBe('alerta');
  });
});
