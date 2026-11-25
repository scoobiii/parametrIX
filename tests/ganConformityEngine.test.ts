import { describe, expect, it } from 'vitest';
import { runDeterministicGanConformity } from '../src/kernel/ganConformityEngine';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import {
  evaluateLayerToleranceCompliance,
  inferDefaultLayerSpecs,
} from '../src/kernel/layerTolerances';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { WORKSPACE_PROJECT_PRESETS } from '../src/kernel/workspacePresets';
import type { CadComponentPart, CadFeatureOperation, ParametricDesignParams } from '../src/types/cad';

describe('ganConformityEngine (100% Deterministic GAN Solver)', () => {
  it('converges RockShox BoXXer Ultimate 27.5" preset from initial non-conformities to 7/7 CONFORME and FEA seguro', () => {
    const forkPreset = WORKSPACE_PROJECT_PRESETS.find((p) => p.id === 'preset-dh-fork');
    expect(forkPreset).toBeDefined();
    expect(forkPreset?.showMachine).toBe(false);
    expect(forkPreset?.showToolpath).toBe(false);

    const importedModel = forkPreset!.buildImportedModel!();
    const partProfile = importedModel.detectedProfile!;
    const components: CadComponentPart[] = importedModel.components ?? [];
    const specs = inferDefaultLayerSpecs({
      importedModel,
      components,
      partProfile,
    });

    const report = runDeterministicGanConformity({
      designParams: forkPreset!.designParams,
      materialFinish: forkPreset!.materialFinish,
      feaSettings: forkPreset!.feaSettings,
      isolationTarget: 'all',
      partProfile,
      specs,
      importedModel,
      featureOps: forkPreset!.initialFeatures ?? [],
      referenceCode: 'GAN-REF-BOXXER-275',
    });

    expect(report.referenceCode).toBe('GAN-REF-BOXXER-275');
    expect(report.totalEpochs).toBe(8);
    expect(report.epochs).toHaveLength(9);

    // Epoch 0 captures real baseline non-conformities on RockShox fork
    expect(report.initialEpoch.epoch).toBe(0);
    expect(report.initialEpoch.ganStiffnessFactor).toBe(1);
    expect(report.initialEpoch.conformeCount).toBe(0);
    expect(report.initialEpoch.totalLayers).toBe(7);
    expect(report.initialEpoch.overallStatus).toBe('nao-conforme');

    // Final Epoch reaches 7/7 CONFORME + FEA seguro
    expect(report.allConformed).toBe(true);
    expect(report.finalEpoch.conformeCount).toBe(7);
    expect(report.finalEpoch.totalLayers).toBe(7);
    expect(report.finalEpoch.overallStatus).toBe('conforme');
    expect(report.finalEpoch.feaStatus).toBe('seguro');
    expect(report.finalEpoch.maxDeviationMm).toBeLessThanOrEqual(
      report.finalEpoch.allowedDeviationMm
    );
    expect(report.finalEpoch.discriminatorLoss).toBeLessThan(
      report.initialEpoch.discriminatorLoss
    );
    expect(report.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    // Verify independent live re-evaluation matches 7/7 CONFORME & FEA seguro
    const optSurface = buildNurbsSurfaceFromParams(report.recommendedParams);
    const optMesh = tessellateNurbsSurface(
      optSurface,
      report.recommendedParams.ribCountU,
      report.recommendedParams.ribCountV,
      report.recommendedParams.ribHeightMm
    );
    const optFea = evaluateStructuralFea(
      optSurface,
      optMesh,
      report.recommendedParams,
      forkPreset!.materialFinish,
      forkPreset!.feaSettings,
      'all',
      partProfile,
      importedModel,
      forkPreset!.initialFeatures ?? [],
      report.recommendedGanStiffnessFactor
    );
    expect(optFea.status).toBe('seguro');
    const comp = evaluateLayerToleranceCompliance({
      surface: optSurface,
      specs,
      feaResult: optFea,
      partProfile,
    });
    expect(comp.overallStatus).toBe('conforme');
    expect(comp.passCount).toBe(7);
  });

  it('handles parametric parts, default optional parameters, empty specs, and epochCount clamping', () => {
    const params: ParametricDesignParams = {
      preset: 'shell',
      spanX: 180,
      spanY: 140,
      archHeight: 38,
      waveAmplitude: 12,
      twistDeg: 10,
      thicknessMm: 5,
      uDivisions: 24,
      vDivisions: 24,
      ribCountU: 3,
      ribCountV: 3,
      ribHeightMm: 12,
      attractorStrength: 0,
    };
    const partProfile = resolvePartEngineeringProfile({ preset: 'shell' });
    const customOps: CadFeatureOperation[] = [];

    // Test with custom clamped epochCount (1 -> 2) and non-empty specs
    const specs = inferDefaultLayerSpecs({ importedModel: null, components: [], partProfile });
    const clampedLow = runDeterministicGanConformity({
      designParams: params,
      materialFinish: 'titanium',
      feaSettings: {
        loadNewtons: 3200,
        supportMode: 'edge-clamped',
        loadPattern: 'center-point',
        targetSafetyFactor: 2.0,
      },
      isolationTarget: 'all',
      partProfile,
      specs,
      featureOps: customOps,
      epochCount: 1,
    });
    expect(clampedLow.referenceCode).toBe('GAN-REF-PARAMETRIX');
    expect(clampedLow.totalEpochs).toBe(2);
    expect(clampedLow.epochs).toHaveLength(3);
    expect(clampedLow.finalEpoch.overallStatus).toBe('conforme');

    // Test with empty specs and high epochCount (20 -> clamped to 12) + defaults omitted
    const emptySpecsRes = runDeterministicGanConformity({
      designParams: params,
      materialFinish: 'aluminum',
      feaSettings: {
        loadNewtons: 4000,
        supportMode: 'four-corner-pins',
        loadPattern: 'uniform-pressure',
        targetSafetyFactor: 2.2,
      },
      isolationTarget: 'all',
      partProfile,
      specs: [],
      epochCount: 20,
    });
    expect(emptySpecsRes.totalEpochs).toBe(12);
    expect(emptySpecsRes.epochs).toHaveLength(13);
    expect(emptySpecsRes.finalEpoch.totalLayers).toBe(0);
    expect(emptySpecsRes.finalEpoch.phaseLabel).toContain('Época 12');

    // Deterministic VUC proof across repeated runs
    const runAgain = runDeterministicGanConformity({
      designParams: params,
      materialFinish: 'titanium',
      feaSettings: {
        loadNewtons: 3200,
        supportMode: 'edge-clamped',
        loadPattern: 'center-point',
        targetSafetyFactor: 2.0,
      },
      isolationTarget: 'all',
      partProfile,
      specs,
      epochCount: 1,
    });
    expect(runAgain.vucHash).toBe(clampedLow.vucHash);
  });
});
