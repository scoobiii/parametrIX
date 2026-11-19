import { describe, expect, it } from 'vitest';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import {
  evaluateLayerToleranceCompliance,
  inferDefaultLayerSpecs,
  ISO_2768_CLASS_DEFAULTS,
} from '../src/kernel/layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import type {
  CadComponentPart,
  ImportedCadModel,
  LayerToleranceSpec,
  ParametricDesignParams,
} from '../src/types/cad';

const PARAMS: ParametricDesignParams = {
  preset: 'shell',
  spanX: 200,
  spanY: 140,
  archHeight: 50,
  waveAmplitude: 10,
  twistDeg: 0,
  thicknessMm: 6,
  uDivisions: 20,
  vDivisions: 20,
  ribCountU: 4,
  ribCountV: 3,
  ribHeightMm: 14,
  attractorStrength: 0,
};

describe('layerTolerances kernel', () => {
  it('infers default specs across segments, imported layers, components, existing specs, and fallback defaults', () => {
    const imported: ImportedCadModel = {
      id: 'imp-tol-1',
      filename: 'fork.stp',
      format: 'STEP',
      positions: new Float32Array(9),
      normals: new Float32Array(9),
      triangleCount: 1,
      entityCount: 1,
      boundingBox: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] },
      layers: ['SHAFT_MAIN', 'CASCA_GERAL', 'BASE_FLAT_PLATE'],
      notes: '',
    };
    const components: CadComponentPart[] = [
      {
        id: 'c1',
        name: 'Coroa Superior',
        family: 'Coroa',
        subFamily: 'Coroa',
        maskColorHex: '#fff',
        inferredMaterial: 'aluminum',
        center: [0, 0, 0],
        size: [10, 10, 10],
        triangleCount: 10,
        sourceLayer: 'CROWN_CNC',
      },
      {
        id: 'c2',
        name: 'SemLayerNome',
        family: 'Estrutura',
        subFamily: 'Sub',
        maskColorHex: '#000',
        inferredMaterial: 'aluminum',
        center: [0, 0, 0],
        size: [10, 10, 10],
        triangleCount: 10,
        sourceLayer: '',
      },
    ];
    const savedSpec: LayerToleranceSpec = {
      layerName: 'CASCA_GERAL',
      toleranceClass: 'v',
      linearToleranceMm: 1,
      profileToleranceMm: 1.5,
      flatnessMm: 1,
      criticalGdtSymbol: 'flatness',
      enabled: true,
    };

    const aeroSpecs = inferDefaultLayerSpecs({
      importedModel: imported,
      components,
      partProfile: resolvePartEngineeringProfile({ segmentOverride: 'aeroespacial' }),
      existingSpecs: { CASCA_GERAL: savedSpec },
    });
    expect(aeroSpecs.find((s) => s.layerName === 'CASCA_GERAL')).toBe(savedSpec);
    expect(aeroSpecs.find((s) => s.layerName === 'SHAFT_MAIN')?.toleranceClass).toBe('f');
    expect(aeroSpecs.find((s) => s.layerName === 'BASE_FLAT_PLATE')?.criticalGdtSymbol).toBe('flatness');
    expect(aeroSpecs.find((s) => s.layerName === 'SemLayerNome')?.toleranceClass).toBe('f');

    const bimSpecs = inferDefaultLayerSpecs({
      importedModel: null,
      components: [],
      partProfile: resolvePartEngineeringProfile({ segmentOverride: 'arquitetura-bim' }),
    });
    expect(bimSpecs.map((s) => s.layerName)).toEqual([
      'NURBS_SURFACE',
      'BIM_IFCBEAM_U',
      'BIM_IFCMEMBER_V',
    ]);
    expect(bimSpecs[0].toleranceClass).toBe('c');

    const cncSpecs = inferDefaultLayerSpecs({
      importedModel: null,
      components: [components[1]],
      partProfile: resolvePartEngineeringProfile({ segmentOverride: 'industrial-cnc' }),
    });
    expect(cncSpecs[0].toleranceClass).toBe('m');
    expect(ISO_2768_CLASS_DEFAULTS.m.linearMm).toBe(0.15);
  });

  it('evaluates conforme, atencao, and nao-conforme statuses including rib/bore multipliers and empty certifications fallback', () => {
    const surface = buildNurbsSurfaceFromParams(PARAMS);
    const mesh = tessellateNurbsSurface(surface, 3, 2, 12);
    const profile = resolvePartEngineeringProfile({ segmentOverride: 'industrial-cnc' });
    const fea = evaluateStructuralFea(
      surface,
      mesh,
      PARAMS,
      'aluminum',
      { loadNewtons: 3000, supportMode: 'edge-clamped', loadPattern: 'center-point', targetSafetyFactor: 2 },
      'all',
      profile
    );

    // 1. Trigger nao-conforme via ultra-tight tolerance
    const tightSpecs: LayerToleranceSpec[] = [
      {
        layerName: 'BIM_WAFFLE_RIB',
        toleranceClass: 'f',
        linearToleranceMm: 0.01,
        profileToleranceMm: 0.01,
        flatnessMm: 0.01,
        criticalGdtSymbol: 'profile',
        enabled: true,
      },
      {
        layerName: 'DISABLED_LAYER',
        toleranceClass: 'm',
        linearToleranceMm: 0.15,
        profileToleranceMm: 0.25,
        flatnessMm: 0.15,
        criticalGdtSymbol: 'flatness',
        enabled: false,
      },
    ];
    const failReport = evaluateLayerToleranceCompliance({
      surface,
      specs: tightSpecs,
      feaResult: fea,
      partProfile: { ...profile, certifications: [] },
    });
    expect(failReport.overallStatus).toBe('nao-conforme');
    expect(failReport.totalLayers).toBe(1);
    expect(failReport.activeStandards).toEqual(['ISO 2768-mK', 'ASME Y14.5 GD&T']);

    // 2. Trigger atencao (utilization between 78% and 100%) on bore + general layers
    const warnBase = evaluateLayerToleranceCompliance({
      surface,
      specs: [
        {
          layerName: 'FURO_M8_HOLE',
          toleranceClass: 'f',
          linearToleranceMm: 0.05,
          profileToleranceMm: 0.5,
          flatnessMm: 0.05,
          criticalGdtSymbol: 'position',
          enabled: true,
        },
        {
          layerName: 'CASCA_EXTERNA',
          toleranceClass: 'm',
          linearToleranceMm: 0.15,
          profileToleranceMm: 5.0,
          flatnessMm: 0.15,
          criticalGdtSymbol: 'profile',
          enabled: true,
        },
      ],
      feaResult: fea,
      partProfile: profile,
    });
    const holeDev = warnBase.results[0].totalGeometricDeviationMm;
    const warnReport = evaluateLayerToleranceCompliance({
      surface,
      specs: [
        {
          layerName: 'FURO_M8_HOLE',
          toleranceClass: 'f',
          linearToleranceMm: 0.05,
          profileToleranceMm: holeDev / 0.85,
          flatnessMm: 0.05,
          criticalGdtSymbol: 'position',
          enabled: true,
        },
      ],
      feaResult: fea,
      partProfile: profile,
    });
    expect(warnReport.overallStatus).toBe('atencao');

    // 3. Trigger conforme across loose tolerance
    const passReport = evaluateLayerToleranceCompliance({
      surface,
      specs: [
        {
          layerName: 'CASCA_GERAL',
          toleranceClass: 'v',
          linearToleranceMm: 2,
          profileToleranceMm: 20,
          flatnessMm: 2,
          criticalGdtSymbol: 'flatness',
          enabled: true,
        },
      ],
      feaResult: fea,
      partProfile: { ...profile, certifications: [''] },
    });
    expect(passReport.overallStatus).toBe('conforme');
    expect(passReport.results[0].normReference).toBe('ISO 2768-2');
    expect(passReport.passCount).toBe(1);
  });
});
