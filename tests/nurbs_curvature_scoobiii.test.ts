import { describe, it, expect } from 'vitest';
import {
  buildNurbsSurfaceFromParams,
  evaluateNurbsPoint,
  evaluateNurbsPointAndNormal,
  generateBimWaffleElements,
  generateClampedKnots,
  tessellateNurbsSurface,
} from '../src/kernel/nurbs';
import {
  analyzeCurvatureAndOptimizeWeight,
  sampleNurbsDifferentialGeometry,
} from '../src/kernel/curvatureOptimizer';
import {
  ISO_METRIC_THREADS,
  computeFeatureVolumeAndKt,
  computeScoobiiiVucProof,
  formatScoobiiiVucCertificateMarkdown,
} from '../src/kernel/scoobiiiVuc';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import type {
  CadFeatureOperation,
  FeaSettings,
  ImportedCadModel,
  ParametricDesignParams,
} from '../src/types/cad';

const baseParams: ParametricDesignParams = {
  preset: 'shell',
  spanX: 200,
  spanY: 160,
  archHeight: 50,
  waveAmplitude: 18,
  twistDeg: 15,
  thicknessMm: 6,
  uDivisions: 24,
  vDivisions: 24,
  ribCountU: 4,
  ribCountV: 3,
  ribHeightMm: 14,
  attractorStrength: 10,
};

const baseFeaSettings: FeaSettings = {
  loadNewtons: 4500,
  supportMode: 'edge-clamped',
  loadPattern: 'center-point',
  targetSafetyFactor: 2.0,
};

describe('nurbs kernel', () => {
  it('generates clamped knots and evaluates binary span edges including u=0, u=1 and interior', () => {
    const knots = generateClampedKnots(6, 3);
    expect(knots).toEqual([0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1]);

    const surface = buildNurbsSurfaceFromParams(baseParams);
    const p0 = evaluateNurbsPoint(surface, 0, 0);
    const pMid = evaluateNurbsPoint(surface, 0.5, 0.5);
    const p1 = evaluateNurbsPoint(surface, 1, 1);
    const pInteriorHigh = evaluateNurbsPoint(surface, 0.78, 0.22);
    const pInteriorLow = evaluateNurbsPoint(surface, 0.12, 0.88);
    expect(p0.every(Number.isFinite)).toBe(true);
    expect(pMid.every(Number.isFinite)).toBe(true);
    expect(p1.every(Number.isFinite)).toBe(true);
    expect(pInteriorHigh.every(Number.isFinite)).toBe(true);
    expect(pInteriorLow.every(Number.isFinite)).toBe(true);

    // Zero denominator in basisFunctions / wSum = 0 branch coverage
    const degenerate = {
      ...surface,
      controlPoints: surface.controlPoints.map((row) =>
        row.map((cp) => ({ ...cp, w: 0 }))
      ),
    };
    const degPt = evaluateNurbsPoint(degenerate, 0.5, 0.5);
    expect(degPt.map((n) => n + 0)).toEqual([0, 0, 0]);
  });

  it('builds all presets and tessellates both thick and thin shells + ribCount=1/0 + curvature spectrum', () => {
    for (const preset of ['shell', 'impeller', 'cavity', 'diagrid'] as const) {
      const surface = buildNurbsSurfaceFromParams({
        ...baseParams,
        preset,
        twistDeg: preset === 'cavity' ? 0 : 25,
        attractorStrength: preset === 'diagrid' ? 0 : 12,
        thicknessMm: preset === 'cavity' ? 0.3 : 6,
        waveAmplitude: 40,
        archHeight: 85,
      });
      const mesh = tessellateNurbsSurface(surface, preset === 'cavity' ? 1 : 4, preset === 'cavity' ? 1 : 3, 14);
      expect(mesh.triangleCount).toBeGreaterThan(0);
      expect(mesh.surfaceAreaCm2).toBeGreaterThan(0);
    }

    // Smooth high-relief surfaces calibrated to 0.25..0.5 and 0.5..0.75 bands of curvatureToRgb
    for (const archH of [2800, 5200]) {
      const smoothRamp = buildNurbsSurfaceFromParams({
        ...baseParams,
        preset: 'shell',
        archHeight: archH,
        waveAmplitude: 0,
        attractorStrength: 0,
        uDivisions: 16,
        vDivisions: 16,
      });
      const smoothRampMesh = tessellateNurbsSurface(smoothRamp, 1, 1, 14);
      expect(smoothRampMesh.triangleCount).toBeGreaterThan(0);
    }

    // Default arguments in tessellateNurbsSurface and degenerate zero-normal surface
    const flatSurface = buildNurbsSurfaceFromParams({
      ...baseParams,
      archHeight: 0,
      waveAmplitude: 0,
      twistDeg: 0,
      attractorStrength: 0,
      thicknessMm: 0.2,
    });
    const defaultMesh = tessellateNurbsSurface(flatSurface);
    expect(defaultMesh.bimElements.length).toBe(9);
    const zeroRibs = generateBimWaffleElements(flatSurface, 0, 0, 12);
    expect(zeroRibs).toEqual([]);

    // Trigger degenerate normal (collapsed control points at single point)
    const collapsedSurface = {
      ...flatSurface,
      controlPoints: flatSurface.controlPoints.map((row) =>
        row.map(() => ({ x: 0, y: 10, z: 0, w: 1 }))
      ),
    };
    const degEval = evaluateNurbsPointAndNormal(collapsedSurface, 0.5, 0.5);
    expect(degEval.normal.map((n) => n + 0)).toEqual([0, 0, 0]);
  });
});

describe('curvatureOptimizer kernel', () => {
  it('samples differential geometry and finds weight-saving optimal candidate preserving integrity', () => {
    const profile = resolvePartEngineeringProfile({ preset: 'shell' });
    const params: ParametricDesignParams = {
      ...baseParams,
      thicknessMm: 8,
      archHeight: 45,
      ribCountU: 5,
      ribCountV: 4,
    };
    const surface = buildNurbsSurfaceFromParams(params);
    const mesh = tessellateNurbsSurface(surface, params.ribCountU, params.ribCountV, params.ribHeightMm);
    const fea = evaluateStructuralFea(surface, mesh, params, 'aluminum', baseFeaSettings, 'all', profile);

    const diff = sampleNurbsDifferentialGeometry(surface);
    expect(diff.zones.length).toBe(81);
    expect(diff.doubleCurvatureCoveragePct).toBeGreaterThan(45);

    const report = analyzeCurvatureAndOptimizeWeight({
      surface,
      meshData: mesh,
      designParams: params,
      materialFinish: 'aluminum',
      feaSettings: baseFeaSettings,
      feaResult: fea,
      partProfile: profile,
      isolationTarget: 'all',
      importedModel: null,
    });
    expect(report.integrityPreserved).toBe(true);
    expect(report.weightAfterKg).toBeLessThan(report.weightBeforeKg);
    expect(report.engineeringRationale).toContain('dupla curvatura gaussiana');
  });

  it('handles low-curvature flat surface, zero ribs, importedModel baseline, and fallback relief when integrity cannot pass', () => {
    const profile = resolvePartEngineeringProfile({ preset: 'shell' });
    profile.safetyCriteria.minSafetyFactor = 0; // triggers fallback || feaSettings.targetSafetyFactor
    profile.safetyCriteria.maxDeflectionMm = 0; // triggers fallback || 4.0

    const flatParams: ParametricDesignParams = {
      ...baseParams,
      archHeight: 0,
      waveAmplitude: 0,
      twistDeg: 0,
      attractorStrength: 0,
      thicknessMm: 2,
      ribCountU: 0,
      ribCountV: 0,
    };
    const flatSurface = buildNurbsSurfaceFromParams(flatParams);
    const flatMesh = tessellateNurbsSurface(flatSurface, 0, 0, 14);

    // Huge load forces fallback candidate (!bestCandidate)
    const extremeFeaSettings: FeaSettings = {
      ...baseFeaSettings,
      loadNewtons: 180000,
      targetSafetyFactor: 1.5,
    };
    const fakeImported: ImportedCadModel = {
      id: 'imp-1',
      filename: 'flat.stp',
      format: 'STEP',
      positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      triangleCount: 1,
      entityCount: 1,
      layers: ['0'],
      boundingBox: { min: [0, 0, 0], max: [100, 20, 100], size: [100, 20, 100] },
      notes: '',
    };
    const fea = evaluateStructuralFea(
      flatSurface,
      flatMesh,
      flatParams,
      'matte-plastic',
      extremeFeaSettings,
      'imported',
      profile,
      fakeImported
    );

    const report = analyzeCurvatureAndOptimizeWeight({
      surface: flatSurface,
      meshData: flatMesh,
      designParams: flatParams,
      materialFinish: 'matte-plastic',
      feaSettings: extremeFeaSettings,
      feaResult: fea,
      partProfile: profile,
      isolationTarget: 'all',
      importedModel: fakeImported,
    });
    expect(report.integrityPreserved).toBe(false);
    expect(report.engineeringRationale).toContain('Curvatura média baixa');

    // Also test ribCountU > 2 in fallback branch
    const ribbedFlatParams = { ...flatParams, ribCountU: 4, ribCountV: 4 };
    const ribbedSurface = buildNurbsSurfaceFromParams(ribbedFlatParams);
    const ribbedMesh = tessellateNurbsSurface(ribbedSurface, 4, 4, 14);
    const ribbedFea = evaluateStructuralFea(ribbedSurface, ribbedMesh, ribbedFlatParams, 'matte-plastic', extremeFeaSettings, 'all', profile);
    const ribbedReport = analyzeCurvatureAndOptimizeWeight({
      surface: ribbedSurface,
      meshData: ribbedMesh,
      designParams: ribbedFlatParams,
      materialFinish: 'matte-plastic',
      feaSettings: extremeFeaSettings,
      feaResult: ribbedFea,
      partProfile: profile,
      isolationTarget: 'all',
      importedModel: null,
    });
    expect(ribbedReport.recommendedRibCountU).toBe(3);

    // Sample degenerate collapsed surface for nLen || 1e-6 branch
    const collapsed = {
      ...flatSurface,
      controlPoints: flatSurface.controlPoints.map((row) => row.map(() => ({ x: 1, y: 1, z: 1, w: 1 }))),
    };
    const degDiff = sampleNurbsDifferentialGeometry(collapsed, 2);
    expect(degDiff.maxPrincipalKappa).toBe(0);
  });
});

describe('scoobiiiVuc kernel', () => {
  it('computes feature volumes & Kt for all 5 Magic Pen operations', () => {
    const ops: CadFeatureOperation[] = [
      {
        id: '1',
        kind: 'slot-cutout',
        label: 'Rasgo oblongo',
        targetComponentId: 'shell',
        point: [0, 30, 0],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 28,
        diameterMm: 10,
        depthMm: 8,
        slotProfile: 'oblong',
        createdAt: '00:00:00',
      },
      {
        id: '2',
        kind: 'slot-cutout',
        label: 'Rasgo retangular',
        targetComponentId: 'shell',
        point: [20, 30, 0],
        normal: [0, 1, 0],
        widthMm: 12,
        lengthMm: 20,
        diameterMm: 12,
        depthMm: 8,
        slotProfile: 'rectangular',
        createdAt: '00:00:00',
      },
      {
        id: '3',
        kind: 'through-hole',
        label: 'Furo',
        targetComponentId: 'shell',
        point: [-20, 30, 0],
        normal: [0, 1, 0],
        widthMm: 14,
        lengthMm: 14,
        diameterMm: 14,
        depthMm: 10,
        createdAt: '00:00:00',
      },
      {
        id: '4',
        kind: 'chamfer-fillet',
        label: 'Chanfro',
        targetComponentId: 'shell',
        point: [10, 30, 10],
        normal: [0, 1, 0],
        widthMm: 3,
        lengthMm: 24,
        diameterMm: 3,
        depthMm: 3,
        createdAt: '00:00:00',
      },
      {
        id: '5',
        kind: 'threaded-bolt',
        label: 'Parafuso M8',
        targetComponentId: 'shell',
        point: [0, 30, 15],
        normal: [0, 1, 0],
        widthMm: 13,
        lengthMm: 13,
        diameterMm: 8,
        depthMm: 16,
        threadSpec: 'M8',
        createdAt: '00:00:00',
      },
      {
        id: '6',
        kind: 'threaded-bolt',
        label: 'Parafuso fallback M6',
        targetComponentId: 'shell',
        point: [5, 30, 15],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 10,
        diameterMm: 6,
        depthMm: 4,
        threadSpec: 'M99' as unknown as 'M6',
        createdAt: '00:00:00',
      },
      {
        id: '7',
        kind: 'rib-boss',
        label: 'Nervura',
        targetComponentId: 'shell',
        point: [15, 30, -10],
        normal: [0, 1, 0],
        widthMm: 6,
        lengthMm: 30,
        diameterMm: 6,
        depthMm: 10,
        createdAt: '00:00:00',
      },
    ];
    expect(Object.keys(ISO_METRIC_THREADS)).toEqual(['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12']);
    const impact = computeFeatureVolumeAndKt(ops, 160);
    expect(impact.removedVolumeCm3).toBeGreaterThan(0);
    expect(impact.addedVolumeCm3).toBeGreaterThan(0);
    expect(impact.combinedKt).toBeGreaterThan(1);
    expect(impact.netSectionRatio).toBeLessThan(1);

    // threaded-bolt with undefined threadSpec fallback
    const defaultBolt = computeFeatureVolumeAndKt(
      [
        {
          id: '8',
          kind: 'threaded-bolt',
          label: 'No spec',
          targetComponentId: 'shell',
          point: [0, 0, 0],
          normal: [0, 1, 0],
          widthMm: 10,
          lengthMm: 10,
          diameterMm: 6,
          depthMm: 12,
          createdAt: '00:00:00',
        },
      ],
      100
    );
    expect(defaultBolt.addedVolumeCm3).toBeGreaterThan(0);

    // Unknown Magic Pen operation kind coverage
    const unknownOp = computeFeatureVolumeAndKt(
      [
        {
          id: '9',
          kind: 'unknown-op' as CadFeatureOperation['kind'],
          label: 'Unknown',
          targetComponentId: 'shell',
          point: [0, 0, 0],
          normal: [0, 1, 0],
          widthMm: 10,
          lengthMm: 10,
          diameterMm: 6,
          depthMm: 12,
          createdAt: '00:00:00',
        },
      ],
      100
    );
    expect(unknownOp.removedVolumeCm3).toBe(0);
  });

  it('generates passing and failing SCOOBIII/VUC proofs and formats Markdown certificates', () => {
    const profile = resolvePartEngineeringProfile({ preset: 'shell' });
    const surface = buildNurbsSurfaceFromParams(baseParams);
    const mesh = tessellateNurbsSurface(surface, baseParams.ribCountU, baseParams.ribCountV, baseParams.ribHeightMm);
    const fea = evaluateStructuralFea(surface, mesh, baseParams, 'titanium', baseFeaSettings, 'all', profile);

    const passingReport = computeScoobiiiVucProof({
      surface,
      meshData: mesh,
      designParams: baseParams,
      materialFinish: 'titanium',
      feaSettings: baseFeaSettings,
      feaResult: fea,
      partProfile: profile,
      featureOps: [
        {
          id: 'b1',
          kind: 'threaded-bolt',
          label: 'M6 Pass',
          targetComponentId: 'shell',
          point: [0, 40, 0],
          normal: [0, 1, 0],
          widthMm: 10,
          lengthMm: 10,
          diameterMm: 6,
          depthMm: 12,
          threadSpec: 'M6',
          createdAt: '00:00:00',
        },
      ],
    });
    expect(passingReport.allPassed).toBe(true);
    expect(passingReport.certificateId).toMatch(/^SCOOBIII-VUC-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const mdPass = formatScoobiiiVucCertificateMarkdown(passingReport);
    expect(mdPass).toContain('APROVADO');
    expect(mdPass).toContain('[OK]');

    // Failing variations: unclamped knots (too short, non-monotonic, unclamped end, flat constant), empty vertexCount, importedModel, shallow bolt
    const badKnotsVariants: number[][] = [
      [0, 1], // too short
      [0, 0, 0, 0, 0.7, 0.3, 1, 1, 1, 1], // non-monotonic
      [0, 0, 0, 0.1, 0.5, 0.5, 1, 1, 1, 1], // unclamped start
      [0, 0, 0, 0, 0.5, 0.5, 0.8, 1, 1, 1], // unclamped end
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // last === first
    ];

    for (const badU of badKnotsVariants) {
      const badSurface = { ...surface, knotsU: badU };
      const rep = computeScoobiiiVucProof({
        surface: badSurface,
        meshData: { ...mesh, vertexCount: 0, colors: new Float32Array(0) },
        designParams: baseParams,
        materialFinish: 'unknown' as unknown as 'aluminum',
        feaSettings: { ...baseFeaSettings, loadNewtons: 50000 },
        feaResult: { ...fea, maxStressMpa: 999, safetyFactor: 0.3, maxDeflectionMm: 25 },
        partProfile: {
          ...profile,
          partName: '',
          primaryMaterial: undefined as unknown as 'aluminum',
          certifications: [],
          safetyCriteria: {
            ...profile.safetyCriteria,
            minSafetyFactor: 0,
            maxDeflectionMm: 0,
          },
        },
        featureOps: [
          {
            id: 'b-fail',
            kind: 'threaded-bolt',
            label: 'M12 Short',
            targetComponentId: 'shell',
            point: [0, 40, 0],
            normal: [0, 1, 0],
            widthMm: 18,
            lengthMm: 18,
            diameterMm: 12,
            depthMm: 4, // < 12 -> fails ROSCA_ISO check
            createdAt: '00:00:00',
          },
        ],
        importedModel: {
          id: 'imp',
          filename: 'part.stp',
          format: 'STEP',
          positions: new Float32Array(0),
          normals: new Float32Array(0),
          triangleCount: 0,
          entityCount: 1,
          layers: [],
          boundingBox: { min: [0, 0, 0], max: [200, 40, 120], size: [200, 40, 120] },
          notes: '',
        },
      });
      expect(rep.nurbsProof.clampedKnotsValid).toBe(false);
      expect(rep.allPassed).toBe(false);
      const mdInvalid = formatScoobiiiVucCertificateMarkdown(rep);
      expect(mdInvalid).toContain('INVÁLIDO');
    }

    // Cover coxDeBoor isLast (u === last knot 0.85), empty colors fallback, and invalid threadSpec on bolt check
    const subRangeSurface = {
      ...surface,
      uCount: 2,
      degreeU: 0,
      knotsU: [0, 0.5, 0.85],
    };
    const subRep = computeScoobiiiVucProof({
      surface: subRangeSurface,
      meshData: { ...mesh, vertexCount: 4, colors: new Float32Array(0) },
      designParams: baseParams,
      materialFinish: 'aluminum',
      feaSettings: baseFeaSettings,
      feaResult: fea,
      partProfile: profile,
      featureOps: [
        {
          id: 'b-m99',
          kind: 'threaded-bolt',
          label: 'M99 Fallback',
          targetComponentId: 'shell',
          point: [0, 40, 0],
          normal: [0, 1, 0],
          widthMm: 10,
          lengthMm: 10,
          diameterMm: 6,
          depthMm: 12,
          threadSpec: 'M99' as unknown as 'M6',
          createdAt: '00:00:00',
        },
      ],
    });
    expect(subRep.checks.some((c) => c.domain === 'ROSCA_ISO')).toBe(true);

    // Also test collapsed controlPoints (jacobian = 0) & no partition weight (rationalSum = 0)
    const zeroWeightSurface = {
      ...surface,
      controlPoints: surface.controlPoints.map((row) =>
        row.map(() => ({ x: 5, y: 5, z: 5, w: 0 }))
      ),
    };
    const failRep = computeScoobiiiVucProof({
      surface: zeroWeightSurface,
      meshData: mesh,
      designParams: baseParams,
      materialFinish: 'aluminum',
      feaSettings: baseFeaSettings,
      feaResult: { ...fea, maxStressMpa: 999, safetyFactor: 0.2, maxDeflectionMm: 40 },
      partProfile: profile,
      featureOps: [],
    });
    expect(failRep.allPassed).toBe(false);
    const mdFail = formatScoobiiiVucCertificateMarkdown(failRep);
    expect(mdFail).toContain('REQUER AJUSTE');
    expect(mdFail).toContain('INVÁLIDO'.length ? '[FALHA]' : '[FALHA]');
  });
});
