import { describe, expect, it } from 'vitest';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import { calculateCarbonFootprint } from '../src/kernel/carbonFootprint';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import type {
  CadFeatureOperation,
  CamSettings,
  ImportedCadModel,
  MaterialFinish,
  ParametricDesignParams,
} from '../src/types/cad';

const PARAMS: ParametricDesignParams = {
  preset: 'shell',
  spanX: 160,
  spanY: 120,
  archHeight: 35,
  waveAmplitude: 5,
  twistDeg: 0,
  thicknessMm: 8,
  uDivisions: 14,
  vDivisions: 14,
  ribCountU: 2,
  ribCountV: 2,
  ribHeightMm: 10,
  attractorStrength: 0,
};

describe('carbonFootprint kernel', () => {
  const surface = buildNurbsSurfaceFromParams(PARAMS);
  const mesh = tessellateNurbsSurface(surface, 2, 2, 10);
  const baseCam: CamSettings = {
    machineType: 'cnc-5axis',
    strategy: 'isoparm',
    toolId: 'tool-ball-8',
    stepoverPct: 25,
    stepdownMm: 2,
    stockMarginMm: 1.5,
    safeZMm: 25,
    cutSpeedMultiplier: 1,
    postFormat: 'fanuc-nc',
  };
  const baseToolpath = generateCamToolpath(surface, mesh, baseCam);

  it('covers featureOps (slot-cutout, through-hole, rib-boss, chamfer-fillet), importedModel, and robot-6axis ecoGrade paths', () => {
    const features: CadFeatureOperation[] = [
      {
        id: 'f1',
        kind: 'slot-cutout',
        label: 'Slot',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 20,
        diameterMm: 10,
        depthMm: 5,
        createdAt: 't',
      },
      {
        id: 'f2',
        kind: 'through-hole',
        label: 'Hole',
        targetComponentId: 'shell',
        point: [10, 0, 0],
        normal: [0, 1, 0],
        widthMm: 8,
        lengthMm: 8,
        diameterMm: 8,
        depthMm: 6,
        createdAt: 't',
      },
      {
        id: 'f3',
        kind: 'rib-boss',
        label: 'Rib',
        targetComponentId: 'shell',
        point: [20, 0, 0],
        normal: [0, 1, 0],
        widthMm: 8,
        lengthMm: 25,
        diameterMm: 8,
        depthMm: 10,
        createdAt: 't',
      },
      {
        id: 'f4',
        kind: 'chamfer-fillet',
        label: 'Chamfer',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 2,
        lengthMm: 10,
        diameterMm: 2,
        depthMm: 2,
        createdAt: 't',
      },
      {
        id: 'f5',
        kind: 'blender-boolean-mod',
        label: 'BooleanExact',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 12,
        lengthMm: 16,
        diameterMm: 12,
        depthMm: 6,
        createdAt: 't',
      },
      {
        id: 'f6',
        kind: 'bim-ifc-beam',
        label: 'IfcBeam',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 14,
        lengthMm: 40,
        diameterMm: 14,
        depthMm: 16,
        createdAt: 't',
      },
    ];

    const imported: ImportedCadModel = {
      id: 'imp-carbon-1',
      filename: 'block.stl',
      format: 'STL',
      positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      triangleCount: 1,
      entityCount: 1,
      boundingBox: { min: [0, 0, 0], max: [120, 40, 100], size: [120, 40, 100] },
      layers: ['DEFAULT'],
      notes: '',
    };

    const repTi = calculateCarbonFootprint({
      materialFinish: 'titanium',
      meshData: mesh,
      importedModel: imported,
      camSettings: { ...baseCam, stockMarginMm: 8 },
      toolpath: baseToolpath,
      featureOps: features,
      gridEmissionFactorKgPerKwh: 0.45,
    });
    expect(repTi.totalCo2Kg).toBeGreaterThan(0);
    expect(repTi.optimizationTips.length).toBeGreaterThanOrEqual(2);

    // Trigger A+ ecoGrade (clay + robot-6axis + low margin)
    const robotCam: CamSettings = {
      ...baseCam,
      machineType: 'robot-6axis',
      stockMarginMm: 0.1,
      stepdownMm: 0.4,
    };
    const robotTp = generateCamToolpath(surface, mesh, robotCam);
    const repOak = calculateCarbonFootprint({
      materialFinish: 'oak',
      meshData: {
        ...mesh,
        volumeCm3: 250,
        boundingBox: { min: [0, 0, 0], max: [60, 40, 60], size: [60, 40, 60] },
      },
      importedModel: null,
      camSettings: robotCam,
      toolpath: { ...robotTp, removedVolumeCm3: 40, estimatedMinutes: 1 },
      gridEmissionFactorKgPerKwh: 0.02,
    });
    expect(repOak.ecoGrade).toBe('A+');
    expect(repOak.optimizationTips[0]).toContain('alta eficiência');

    // Cover remaining ecoGrades (A, B, C, D, E) and fallback specs
    const repA = calculateCarbonFootprint({
      materialFinish: 'matte-plastic',
      meshData: { ...mesh, volumeCm3: 180 },
      importedModel: null,
      camSettings: { ...robotCam, stockMarginMm: 0.5 },
      toolpath: { ...robotTp, removedVolumeCm3: 10 },
    });
    expect(['A+', 'A', 'B']).toContain(repA.ecoGrade);

    const repCarbon = calculateCarbonFootprint({
      materialFinish: 'carbon-fiber',
      meshData: mesh,
      importedModel: null,
      camSettings: { ...baseCam, stockMarginMm: 10 },
      toolpath: { ...baseToolpath, removedVolumeCm3: 5000, estimatedMinutes: 120 },
      gridEmissionFactorKgPerKwh: 0.9,
    });
    expect(['C', 'D', 'E']).toContain(repCarbon.ecoGrade);

    // Explicit E grade via huge waste vs small net mass
    const repE = calculateCarbonFootprint({
      materialFinish: 'titanium',
      meshData: { ...mesh, volumeCm3: 8, boundingBox: { min: [0, 0, 0], max: [200, 120, 200], size: [200, 120, 200] } },
      importedModel: null,
      camSettings: { ...baseCam, stockMarginMm: 20 },
      toolpath: { ...baseToolpath, removedVolumeCm3: 12000, estimatedMinutes: 300 },
      gridEmissionFactorKgPerKwh: 1.0,
    });
    expect(repE.ecoGrade).toBe('E');

    // Cover C and D explicitly + unknown material/machine fallbacks
    const repFallback = calculateCarbonFootprint({
      materialFinish: 'unknown' as MaterialFinish,
      meshData: mesh,
      importedModel: null,
      camSettings: { ...baseCam, machineType: 'unknown' as CamSettings['machineType'] },
      toolpath: baseToolpath,
    });
    expect(repFallback.materialName).toContain('Alumínio');

    // Cover ecoGrade 'A', 'B', 'C', 'D' deterministically by tuning waste volume
    const calcWithWaste = (removedVolumeCm3: number, mat: MaterialFinish = 'aluminum') =>
      calculateCarbonFootprint({
        materialFinish: mat,
        meshData: {
          ...mesh,
          volumeCm3: 100,
          boundingBox: { min: [0, 0, 0], max: [50, 40, 50], size: [50, 40, 50] },
        },
        importedModel: null,
        camSettings: { ...robotCam, stockMarginMm: 0.5 },
        toolpath: { ...robotTp, removedVolumeCm3, estimatedMinutes: 5 },
        gridEmissionFactorKgPerKwh: 0.08,
      }).ecoGrade;

    expect(calcWithWaste(20, 'aluminum')).toBe('A');
    expect(calcWithWaste(300, 'aluminum')).toBe('B');
    expect(calcWithWaste(800, 'aluminum')).toBe('C');
    expect(calcWithWaste(1800, 'aluminum')).toBe('D');
  });
});
