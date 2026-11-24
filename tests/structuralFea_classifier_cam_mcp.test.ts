import { describe, it, expect, vi } from 'vitest';
import {
  MATERIAL_MECHANICAL_SPECS,
  buildFeaComparisonReport,
  evaluateStructuralFea,
  stressRatioToRgb,
  synthesizeOptimizedParams,
} from '../src/kernel/structuralFea';
import {
  buildParametricComponentParts,
  classifyComponentFamily,
  resolvePartEngineeringProfile,
} from '../src/kernel/componentClassifier';
import {
  CAM_TOOLS,
  computeCuttingParameters,
  generateCamToolpath,
  getDefaultAdditiveSettings,
  resolveAdditiveSettings,
  solveRobot6AxisIK,
} from '../src/kernel/camRobotics';
import {
  MCP_TOOLS_CATALOG,
  buildLocalIcsCalendarBlob,
  executeMcpToolCall,
  type McpRuntimeContext,
} from '../src/kernel/mcpServer';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { computeScoobiiiVucProof } from '../src/kernel/scoobiiiVuc';
import type {
  ApplicationSegment,
  CadFeatureOperation,
  CamSettings,
  FeaSettings,
  ImportedCadModel,
  ParametricDesignParams,
  ViewportDisplayState,
} from '../src/types/cad';

const baseParams: ParametricDesignParams = {
  preset: 'shell',
  spanX: 200,
  spanY: 160,
  archHeight: 50,
  waveAmplitude: 16,
  twistDeg: 18,
  thicknessMm: 6,
  uDivisions: 24,
  vDivisions: 24,
  ribCountU: 4,
  ribCountV: 3,
  ribHeightMm: 14,
  attractorStrength: 0,
};

const baseFeaSettings: FeaSettings = {
  loadNewtons: 4200,
  supportMode: 'edge-clamped',
  loadPattern: 'center-point',
  targetSafetyFactor: 2.0,
};

describe('componentClassifier kernel', () => {
  it('classifies all 8 component families, sub-variants, and default cyclic fallback', () => {
    expect(classifyComponentFamily('Upper Damper Stanchion', 0).family).toContain('Suspensão');
    expect(classifyComponentFamily('Tubo Bengala Superior', 1).subFamily).toContain('Stanchion');
    expect(classifyComponentFamily('Arch Brace Lower', 2).subFamily).toContain('Ponte');
    expect(classifyComponentFamily('Canela Direita', 3).subFamily).toContain('Canela');
    expect(classifyComponentFamily('Steerer Espiga', 4).subFamily).toContain('Espiga');
    expect(classifyComponentFamily('Double Crown Clamp', 5).subFamily).toContain('Coroa');
    expect(classifyComponentFamily('Through Axle Spindle', 6).family).toContain('Eixo');
    expect(classifyComponentFamily('Wiper Seal Retentor', 7).subFamily).toContain('Retentor');
    expect(classifyComponentFamily('Bolt M6 Screw', 8).subFamily).toContain('Parafuso');
    expect(classifyComponentFamily('Fender Guard Casca', 9).family).toContain('Casca');
    expect(classifyComponentFamily('BIM-U-1 Longarina', 10).family).toContain('BIM U');
    expect(classifyComponentFamily('BIM-V-1 Travessa', 11).family).toContain('BIM V');
    const cyc0 = classifyComponentFamily('Widget Alpha', 0);
    const cyc1 = classifyComponentFamily('Widget Beta', 1);
    expect(cyc0.subFamily).toBe('Sub-conjunto A');
    expect(cyc1.subFamily).toBe('Sub-conjunto B');
  });

  it('resolves part engineering profiles across RockShox, FOX/Ohlins/Marzocchi, Flange, Impeller, STEP headers, and presets', () => {
    const rs = resolvePartEngineeringProfile({ filename: 'Boxxer_275.stp' });
    expect(rs.manufacturer).toBe('RockShox / SRAM LLC');
    expect(resolvePartEngineeringProfile({ rawText: 'rockshox', filename: '' }).modelCode).toContain('BoXXer');

    expect(resolvePartEngineeringProfile({ filename: 'Fox_40_Factory.stp' }).manufacturer).toBe('FOX Racing Shox');
    expect(resolvePartEngineeringProfile({ rawText: 'ohlins dh fork' }).manufacturer).toBe('Öhlins');
    expect(resolvePartEngineeringProfile({ rawText: 'marzocchi bomber' }).manufacturer).toBe('Marzocchi');

    expect(resolvePartEngineeringProfile({ filename: 'flange_chaveta.dxf' }).segment).toBe('industrial-cnc');
    expect(resolvePartEngineeringProfile({ rawText: 'engrenagem' }).partName).toContain('Flange / Eixo');

    expect(resolvePartEngineeringProfile({ filename: 'turbine_blade.stp' }).segment).toBe('aeroespacial');
    expect(resolvePartEngineeringProfile({ rawText: 'impeller_test' }).partName).toContain('Rotor');

    const stepOrg = resolvePartEngineeringProfile({
      rawText: "HEADER; FILE_NAME('part.stp','2026',('Eng'),('ACME Precision Mfg')); PRODUCT('P-01','Suporte Especial','');",
      filename: 'suporte.stp',
    });
    expect(stepOrg.manufacturer).toBe('ACME Precision Mfg');
    expect(stepOrg.partName).toBe('Suporte Especial');

    const stepProdFirst = resolvePartEngineeringProfile({
      rawText: "FILE_NAME('p.stp','2026',('A'),('X')); PRODUCT('ONLY-CODE','','');",
    });
    expect(stepProdFirst.partName).toBe('ONLY-CODE');
    expect(stepProdFirst.manufacturer).toBe('Parametrix Engineering Studio');

    expect(resolvePartEngineeringProfile({ preset: 'diagrid' }).segment).toBe('arquitetura-bim');
    expect(resolvePartEngineeringProfile({ preset: 'impeller' }).segment).toBe('aeroespacial');
    expect(resolvePartEngineeringProfile({ preset: 'cavity' }).segment).toBe('industrial-cnc');
    expect(resolvePartEngineeringProfile({ segmentOverride: 'unknown-seg' as unknown as ApplicationSegment }).segment).toBe('unknown-seg');
    expect(resolvePartEngineeringProfile({ surfaceName: 'Minha Casca', segmentOverride: 'ciclismo-mobilidade' }).safetyCriteria.loadPattern).toBe('torsion-tip');
    expect(resolvePartEngineeringProfile({}).partName).toBe('Conjunto Paramétrico NURBS + BIM');

    const surf = buildNurbsSurfaceFromParams(baseParams);
    const mesh = tessellateNurbsSurface(surf, 2, 2, 12);
    const parts = buildParametricComponentParts(surf, mesh, rs);
    expect(parts.length).toBe(5);
  });
});

describe('structuralFea kernel', () => {
  it('maps stressRatioToRgb across all colormap segments', () => {
    expect(stressRatioToRgb(-0.2)[2]).toBeGreaterThan(0.8);
    expect(stressRatioToRgb(0.1).length).toBe(3);
    expect(stressRatioToRgb(0.35).length).toBe(3);
    expect(stressRatioToRgb(0.6).length).toBe(3);
    expect(stressRatioToRgb(0.95)[0]).toBe(0.97);
  });

  it('evaluates FEA across support modes, load patterns, isolation scopes, Magic Pen ops, and imported meshes', () => {
    const surface = buildNurbsSurfaceFromParams(baseParams);
    const mesh = tessellateNurbsSurface(surface, 3, 2, 14);
    const profile = resolvePartEngineeringProfile({ preset: 'shell' });

    const ops: CadFeatureOperation[] = [
      {
        id: 'f1',
        kind: 'slot-cutout',
        label: 'Slot',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 25,
        lengthMm: 45,
        diameterMm: 20,
        depthMm: 8,
        createdAt: '00:00:00',
      },
      {
        id: 'f2',
        kind: 'threaded-bolt',
        label: 'Bolt',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 10,
        diameterMm: 8,
        depthMm: 14,
        createdAt: '00:00:00',
      },
      {
        id: 'f3',
        kind: 'rib-boss',
        label: 'Rib',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 30,
        diameterMm: 10,
        depthMm: 12,
        createdAt: '00:00:00',
      },
      {
        id: 'f4',
        kind: 'chamfer-fillet',
        label: 'Chamfer',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 20,
        lengthMm: 20,
        diameterMm: 20,
        depthMm: 2,
        createdAt: '00:00:00',
      },
      {
        id: 'f5',
        kind: 'blender-boolean-mod',
        label: 'BooleanExact',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 16,
        lengthMm: 20,
        diameterMm: 16,
        depthMm: 12,
        createdAt: '00:00:00',
      },
      {
        id: 'f6',
        kind: 'bim-ifc-beam',
        label: 'IfcBeam',
        targetComponentId: 'shell',
        point: [mesh.positions[0], mesh.positions[1], mesh.positions[2]],
        normal: [0, 1, 0],
        widthMm: 14,
        lengthMm: 60,
        diameterMm: 14,
        depthMm: 18,
        createdAt: '00:00:00',
      },
    ];

    // 1. four-corner-pins + torsion-tip + shell isolation + Seguro
    const res1 = evaluateStructuralFea(
      surface,
      mesh,
      baseParams,
      'titanium',
      { loadNewtons: 1500, supportMode: 'four-corner-pins', loadPattern: 'torsion-tip', targetSafetyFactor: 1.5 },
      'shell',
      { ...profile, safetyCriteria: { ...profile.safetyCriteria, minSafetyFactor: 1.5, maxDeflectionMm: 10 } },
      null,
      ops
    );
    expect(res1.status).toBe('seguro');

    // 2. cantilever-u + uniform-pressure + BIM-U-1 isolation + Alerta/Critico
    const resAlert = evaluateStructuralFea(
      surface,
      mesh,
      baseParams,
      'aluminum',
      { loadNewtons: 1800, supportMode: 'cantilever-u', loadPattern: 'uniform-pressure', targetSafetyFactor: 20 },
      'BIM-U-1',
      { ...profile, primaryMaterial: 'aluminum', safetyCriteria: { ...profile.safetyCriteria, minSafetyFactor: 95, maxDeflectionMm: 50 } },
      null,
      ops
    );
    expect(resAlert.status).toBe('alerta');

    const resCrit = evaluateStructuralFea(
      surface,
      mesh,
      baseParams,
      'clay',
      { loadNewtons: 25000, supportMode: 'cantilever-u', loadPattern: 'uniform-pressure', targetSafetyFactor: 2.0 },
      'BIM-UNKNOWN',
      { ...profile, primaryMaterial: 'clay' },
      null,
      []
    );
    expect(resCrit.status).toBe('critico');

    // 3. Zero-vertex mesh + zero bbox width -> covers mHalfX/Infinity minStress fallback
    const emptyMesh = {
      ...mesh,
      vertexCount: 0,
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      boundingBox: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number], size: [0, 0, 0] as [number, number, number] },
    };
    const resEmpty = evaluateStructuralFea(surface, emptyMesh, baseParams, 'invalid' as unknown as 'aluminum', baseFeaSettings);
    expect(resEmpty.minStressMpa).toBe(0);

    // 4. Imported model variants: valid closed tetrahedron mesh vs zero-volume/empty components
    const tetraPos = new Float32Array([
      0, 0, 0, 40, 0, 0, 0, 40, 0,
      0, 0, 0, 0, 40, 0, 0, 0, 40,
      0, 0, 0, 0, 0, 40, 40, 0, 0,
      40, 0, 0, 0, 0, 40, 0, 40, 0,
    ]);
    const impWithComps: ImportedCadModel = {
      id: 'imp-comp',
      filename: 'fork.stp',
      format: 'STEP',
      positions: tetraPos,
      normals: new Float32Array(tetraPos.length),
      triangleCount: 4,
      entityCount: 2,
      layers: ['CROWN', 'TUBE'],
      boundingBox: { min: [0, 0, 0], max: [120, 80, 100], size: [120, 80, 100] },
      notes: '',
      components: [
        {
          id: 'COMP-1',
          name: 'Coroa Superior Crown',
          family: 'Coroa',
          subFamily: 'Coroa / Bloco',
          maskColorHex: '#a855f7',
          inferredMaterial: 'aluminum',
          center: [0, 0, 0],
          size: [100, 20, 50],
          positions: tetraPos,
          triangleCount: 4,
          sourceLayer: 'CROWN',
        },
        {
          id: 'COMP-2',
          name: 'Tubo Lateral',
          family: 'Suspensão',
          subFamily: 'Tubo',
          maskColorHex: '#f59e0b',
          inferredMaterial: 'bad' as unknown as 'aluminum',
          center: [20, 0, 0],
          size: [20, 20, 20],
          positions: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), // zero volume fallback
          triangleCount: 1,
          sourceLayer: 'TUBE',
        },
        {
          id: 'COMP-3',
          name: 'Parafuso Sem Pos',
          family: 'Fixação',
          subFamily: 'Parafuso',
          maskColorHex: '#ef4444',
          inferredMaterial: 'titanium',
          center: [0, 0, 0],
          size: [5, 5, 5],
          triangleCount: 0,
          sourceLayer: 'FIX',
        },
      ],
    };
    const resComp = evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings, 'COMP-1', profile, impWithComps);
    expect(resComp.elementStresses.length).toBe(3);

    // COMP-MISSING & isolation='all' with components & meshData empty colors + components: undefined
    expect(evaluateStructuralFea(surface, { ...mesh, colors: new Float32Array(0) }, baseParams, 'aluminum', baseFeaSettings, 'COMP-MISSING', profile, impWithComps).elementStresses.length).toBe(3);
    expect(evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings, 'all', profile, impWithComps).elementStresses.length).toBe(3);
    expect(evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings, 'all', profile, { ...impWithComps, components: undefined }).elementStresses.length).toBe(mesh.bimElements.length);

    // COMP-999 missing + degenerate root mesh fallback (no components, root positions < 9 -> sz fallback)
    const impFallbackBox: ImportedCadModel = {
      ...impWithComps,
      positions: new Float32Array([0, 0, 0]),
      components: [],
    };
    const resBoxFallback = evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings, 'imported', undefined, impFallbackBox);
    expect(resBoxFallback.totalMassKg).toBeGreaterThanOrEqual(0.02);

    const impRootVol: ImportedCadModel = {
      ...impWithComps,
      positions: tetraPos,
      components: [],
    };
    const resRootVol = evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings, 'imported', profile, impRootVol);
    expect(resRootVol.elementStresses.length).toBe(mesh.bimElements.length);
  });

  it('synthesizes optimizations for all 3 objectives and builds before/after comparison reports', () => {
    const surface = buildNurbsSurfaceFromParams({ ...baseParams, preset: 'cavity' });
    const mesh = tessellateNurbsSurface(surface, 3, 2, 14);
    const beforeLowSf = { ...evaluateStructuralFea(surface, mesh, baseParams, 'aluminum', baseFeaSettings), safetyFactor: 1.1 };
    const beforeHighSf = { ...beforeLowSf, safetyFactor: 3.5 };

    const optStressLow = synthesizeOptimizedParams({ ...baseParams, preset: 'cavity' }, beforeLowSf, 'minimize-stress', 2.5);
    expect(optStressLow.nextParams.preset).toBe('diagrid');
    const optStressHigh = synthesizeOptimizedParams(baseParams, beforeHighSf, 'minimize-stress', 2.0);
    expect(optStressHigh.nextParams.thicknessMm).toBe(8.5);

    const optMass = synthesizeOptimizedParams(baseParams, beforeLowSf, 'minimize-mass', 2.0);
    expect(optMass.nextParams.thicknessMm).toBeLessThan(baseParams.thicknessMm);

    const optBalLow = synthesizeOptimizedParams(baseParams, beforeLowSf, 'balanced', 2.5);
    expect(optBalLow.nextParams.thicknessMm).toBe(8);
    const optBalHigh = synthesizeOptimizedParams(baseParams, beforeHighSf, 'balanced', 2.0);
    expect(optBalHigh.nextParams.thicknessMm).toBe(6.8);

    const repWithProf = buildFeaComparisonReport(
      beforeLowSf,
      beforeHighSf,
      baseParams,
      optStressLow.nextParams,
      optStressLow.strategySummary,
      resolvePartEngineeringProfile({ preset: 'shell' })
    );
    expect(repWithProf.safetyFactorDeltaPct).toBeGreaterThan(0);

    const repZeroBase = buildFeaComparisonReport(
      { ...beforeLowSf, maxStressMpa: 0, maxDeflectionMm: 0, safetyFactor: 0, totalMassKg: 0 },
      beforeHighSf,
      baseParams,
      optBalHigh.nextParams,
      optBalHigh.strategySummary
    );
    expect(repZeroBase.stressDeltaPct).toBe(0);
    expect(Object.keys(MATERIAL_MECHANICAL_SPECS).length).toBe(7);
  });
});

describe('camRobotics kernel', () => {
  it('generates toolpaths across strategies, machine types, post formats (>220 points & <=220), and fallback tools', () => {
    const surface = buildNurbsSurfaceFromParams(baseParams);
    const mesh = tessellateNurbsSurface(surface, 2, 2, 12);
    expect(CAM_TOOLS.length).toBe(6);
    expect(computeCuttingParameters(CAM_TOOLS[0], 1).spindleRpm).toBeGreaterThan(1000);

    // 1. High point count (> 220) with kuka-krl & fanuc 5-axis
    const cam5x: CamSettings = {
      machineType: 'cnc-5axis',
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 12,
      stepdownMm: 1.5,
      stockMarginMm: 0.4,
      safeZMm: 20,
      cutSpeedMultiplier: 1.1,
      postFormat: 'fanuc-nc',
    };
    const r5x = generateCamToolpath(surface, mesh, cam5x);
    expect(r5x.points.length).toBeGreaterThan(220);
    expect(r5x.postCode).toContain('BLOCOS INCLUÍDOS');
    expect(r5x.postCode).toContain(' A');

    const rKuka = generateCamToolpath(surface, mesh, { ...cam5x, machineType: 'robot-6axis', postFormat: 'kuka-krl' });
    expect(rKuka.postCode).toContain('pontos LIN no arquivo exportado completo');

    // 2. Contour + cnc-3axis + abb-rapid + <=220 pts + unknown toolId
    const rAbb = generateCamToolpath(surface, mesh, {
      ...cam5x,
      machineType: 'cnc-3axis',
      strategy: 'contour',
      toolId: 'unknown-tool',
      stepoverPct: 50,
      postFormat: 'abb-rapid',
    });
    expect(rAbb.postCode).toContain('MODULE ParametrixJob');

    // 3. Raster + manual-sheet + empty-points fanuc fallback check via high stepover <=220 points
    const rManual = generateCamToolpath(surface, mesh, {
      ...cam5x,
      machineType: 'manual',
      strategy: 'raster',
      stepoverPct: 55,
      postFormat: 'manual-sheet',
    });
    expect(rManual.postCode).toContain('FOLHA DE PROCESSO');

    const compactMesh = {
      ...mesh,
      boundingBox: { min: [-20, 0, -20] as [number, number, number], max: [20, 20, 20] as [number, number, number], size: [40, 20, 40] as [number, number, number] },
    };
    const r3xNc = generateCamToolpath(surface, compactMesh, {
      ...cam5x,
      machineType: 'cnc-3axis',
      strategy: 'raster',
      toolId: 'tool-robot-spindle',
      stepoverPct: 60,
      postFormat: 'fanuc-nc',
    });
    expect(r3xNc.points.length).toBeLessThanOrEqual(220);
    expect(r3xNc.postCode).not.toContain('BLOCOS INCLUÍDOS');

    // contour + cnc-5axis
    const rContour5x = generateCamToolpath(surface, compactMesh, {
      ...cam5x,
      machineType: 'cnc-5axis',
      strategy: 'contour',
      toolId: 'tool-robot-spindle',
      stepoverPct: 60,
      postFormat: 'kuka-krl',
    });
    expect(rContour5x.points.length).toBeGreaterThan(220);

    // raster + compactMesh gives <=220 pts for kuka-krl branch
    const rRasterKukaShort = generateCamToolpath(surface, compactMesh, {
      ...cam5x,
      machineType: 'robot-6axis',
      strategy: 'raster',
      toolId: 'tool-robot-spindle',
      stepoverPct: 60,
      postFormat: 'kuka-krl',
    });
    expect(rRasterKukaShort.points.length).toBeLessThanOrEqual(220);
    expect(rRasterKukaShort.postCode).not.toContain('pontos LIN no arquivo exportado completo');

    // Additive defaults, support anchors, empty-normals branch, none support, and sintering cycles
    const defSlm = getDefaultAdditiveSettings('powder-metal');
    const defSla = getDefaultAdditiveSettings('resin-sla');
    expect(defSlm.atmosphere).toBe('argon');
    expect(defSla.atmosphere).toBe('uv-chamber');
    expect(resolveAdditiveSettings({ ...cam5x, machineType: 'powder-metal' }).layerThicknessUm).toBe(30);

    const meshWithDownNormals = {
      ...compactMesh,
      normals: new Float32Array([0, -1, 0, 0, 1, 0, 0, -0.95, 0]),
    };
    const rSlm = generateCamToolpath(surface, meshWithDownNormals, {
      ...cam5x,
      machineType: 'powder-metal',
      strategy: 'raster',
      stepoverPct: 60,
      postFormat: 'slm-powder',
      additiveConfig: {
        ...defSlm,
        supportPattern: 'lattice-grid',
        supportDensityPct: 24,
        atmosphere: 'vacuum',
      },
    });
    expect(rSlm.postCode).toContain('LPBF METAL POWDER 400W');
    expect(rSlm.postCode).toContain('ADDITIVE_SUPPORT: lattice-grid');
    expect(rSlm.additiveSummary?.supportVolumeCm3).toBeGreaterThan(0);
    expect(rSlm.additiveSummary?.atmosphereLabel).toContain('Vácuo');
    expect(rSlm.manualSteps[0].operation).toContain('LPBF');

    const rSla = generateCamToolpath(surface, { ...compactMesh, normals: new Float32Array(0) }, {
      ...cam5x,
      machineType: 'resin-sla',
      strategy: 'raster',
      stepoverPct: 60,
      postFormat: 'sla-resin',
      additiveConfig: {
        ...defSla,
        supportPattern: 'none',
        supportDensityPct: 0,
        atmosphere: 'nitrogen',
      },
    });
    expect(rSla.postCode).toContain('SLA UV RESIN 405NM');
    expect(rSla.additiveSummary?.supportVolumeCm3).toBe(0);
    expect(rSla.additiveSummary?.overhangAreaRatioPct).toBe(12);
    expect(rSla.manualSteps[0].operation).toContain('SLA 405nm');

    const rWeld = generateCamToolpath(surface, compactMesh, { ...cam5x, machineType: 'robot-weld', strategy: 'raster', stepoverPct: 60, postFormat: 'weld-tig-mig' });
    expect(rWeld.postCode).toContain('ROBOTIC WIRE ARC MIG/TIG 195A');
    expect(rWeld.additiveSummary).toBeUndefined();

    const rLaser = generateCamToolpath(surface, compactMesh, { ...cam5x, machineType: 'laser-cut', strategy: 'raster', stepoverPct: 60, postFormat: 'laser-g' });
    expect(rLaser.postCode).toContain('FIBER LASER 4KW');
  });

  it('solves 6-axis robot inverse kinematics for reachable and unreachable targets', () => {
    const ok = solveRobot6AxisIK(0, 60, 20, [0, 1, 0]);
    expect(ok.reachable).toBe(true);
    const far = solveRobot6AxisIK(600, 300, 200, [0, 1, 0]);
    expect(far.reachable).toBe(false);
  });
});

describe('mcpServer kernel', () => {
  function makeMockContext(isolation = 'all'): { ctx: McpRuntimeContext; spies: Record<string, ReturnType<typeof vi.fn>> } {
    const surface = buildNurbsSurfaceFromParams(baseParams);
    const meshData = tessellateNurbsSurface(surface, 3, 2, 14);
    const camSettings: CamSettings = {
      machineType: 'cnc-3axis',
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 24,
      stepdownMm: 2,
      stockMarginMm: 0.5,
      safeZMm: 25,
      cutSpeedMultiplier: 1.0,
      postFormat: 'fanuc-nc',
    };
    const toolpath = generateCamToolpath(surface, meshData, camSettings);
    const partProfile = resolvePartEngineeringProfile({ preset: 'shell' });
    const feaResult = evaluateStructuralFea(surface, meshData, baseParams, 'aluminum', baseFeaSettings, isolation, partProfile);
    const scoobiiiProof = computeScoobiiiVucProof({
      surface,
      meshData,
      designParams: baseParams,
      materialFinish: 'aluminum',
      feaSettings: baseFeaSettings,
      feaResult,
      partProfile,
      featureOps: [],
    });

    const display: ViewportDisplayState = {
      mode: 'solid',
      materialFinish: 'aluminum',
      showIsocurves: true,
      showControlCage: false,
      showBimRibs: true,
      showToolpath: false,
      showMachine: false,
      showImportedOverlay: true,
      cameraPreset: 'isometric',
      cameraTrigger: 0,
      fitViewTrigger: 0,
      isolationTarget: isolation,
      stressComparisonView: 'current',
      explodeFactor: 0,
      autoRotate: false,
      sectionEnabled: false,
      sectionAxis: 'y',
      sectionFlipped: false,
      sectionRatio: 0.5,
      selectedComponentId: null,
      hiddenComponentIds: [],
      componentMaterials: {},
      componentRotations: {},
      assemblyRotationDeg: [0, 0, 0],
      perComponentPbr: false,
      transformMode: 'none',
    };

    const spies = {
      onUpdateDesignParams: vi.fn(),
      onUpdateDisplay: vi.fn(),
      onUpdateCamSettings: vi.fn(),
      onSetSegment: vi.fn(),
      onUpdatePartProfile: vi.fn(),
      onAddFeatureOp: vi.fn((op: Omit<CadFeatureOperation, 'id' | 'createdAt'>) => ({
        ...op,
        id: 'feat-1',
        createdAt: '00:00:00',
      })),
      onRunFea: vi.fn(() => feaResult),
      onGenerateOptimizedGeometry: vi.fn(() =>
        buildFeaComparisonReport(feaResult, feaResult, baseParams, baseParams, 'Mock opt', partProfile)
      ),
      onExportFormat: vi.fn((fmt: string, scope?: string) => `export-${scope ?? 'assembly'}.${fmt}`),
      onRegisterAndRunPlugin: vi.fn(),
    };

    const ctx: McpRuntimeContext = {
      designParams: baseParams,
      surface,
      meshData,
      camSettings,
      toolpath,
      display,
      feaSettings: baseFeaSettings,
      feaResult,
      feaComparison: null,
      activeSegment: 'arquitetura-bim',
      partProfile,
      components: [
        {
          id: 'COMP-1',
          name: 'Coroa Superior',
          family: 'Coroa',
          subFamily: 'Mesa CNC',
          maskColorHex: '#a855f7',
          inferredMaterial: 'aluminum',
          center: [0, 20, 0],
          size: [80, 20, 40],
          triangleCount: 120,
          sourceLayer: 'CROWN',
        },
      ],
      featureOps: [],
      scoobiiiProof,
      sessionSeconds: 185,
      deliverables: [
        { id: 'd1', filename: 'peca.stl', kind: 'STL', timestamp: '10:00', summary: 'Malha 3D' },
      ],
      ...spies,
    };
    return { ctx, spies };
  }

  it('executes every cataloged MCP tool, fallback arguments, and error handlers', () => {
    expect(MCP_TOOLS_CATALOG.length).toBeGreaterThanOrEqual(16);
    const { ctx, spies } = makeMockContext('all');

    expect(executeMcpToolCall('tools/list', {}, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_detect_part_context', {}, ctx).status).toBe('ok');

    // cad_set_segment_profile with full metadata & empty args
    expect(
      executeMcpToolCall(
        'cad_set_segment_profile',
        { segment: 'aeroespacial', partName: 'Asa', manufacturer: 'Aero', intendedUse: 'Voo' },
        ctx
      ).status
    ).toBe('ok');
    expect(executeMcpToolCall('cad_set_segment_profile', {}, ctx).status).toBe('ok');

    // explode
    expect(executeMcpToolCall('cad_explode_assembly', { explodeFactor: 0.5 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_explode_assembly', {}, ctx).status).toBe('ok');

    // rotate assembly, specific component, empty string, missing arg
    expect(executeMcpToolCall('cad_rotate_component', { componentId: 'assembly', rx: 10, ry: 20, rz: 30 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rotate_component', { componentId: 'COMP-1', ry: 45 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rotate_component', { componentId: '  ' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rotate_component', {}, ctx).status).toBe('ok');

    // set component material
    expect(executeMcpToolCall('cad_set_component_material', { componentId: 'all', materialFinish: 'titanium', mode: 'solid' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_set_component_material', { componentId: 'COMP-1' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_set_component_material', { componentId: '   ' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_set_component_material', {}, ctx).status).toBe('ok');

    // set parametric params
    expect(
      executeMcpToolCall(
        'cad_set_parametric_params',
        {
          preset: 'impeller',
          spanX: 220,
          spanY: 170,
          archHeight: 55,
          waveAmplitude: 12,
          twistDeg: 30,
          thicknessMm: 7,
          ribCountU: 5,
          ribCountV: 4,
          ribHeightMm: 16,
        },
        ctx
      ).status
    ).toBe('ok');
    expect(executeMcpToolCall('cad_set_parametric_params', {}, ctx).status).toBe('ok');

    // isolate part: COMP-1 by id, name, subFamily, BIM rib, shell, all, unknown, blank
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'COMP-1' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'Coroa' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'Mesa CNC' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'BIM-U-1' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'shell' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'all' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: 'NON_EXISTENT' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', { partId: '   ' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_isolate_part', {}, ctx).status).toBe('ok');

    // evaluate metrics
    expect(executeMcpToolCall('cad_evaluate_nurbs_metrics', { includeBimBom: false }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_evaluate_nurbs_metrics', {}, ctx).status).toBe('ok');

    // set material finish
    expect(executeMcpToolCall('cad_set_material_finish', { materialFinish: 'glass', mode: 'xray' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_set_material_finish', {}, ctx).status).toBe('ok');

    // run structural fea
    expect(
      executeMcpToolCall(
        'cad_run_structural_fea',
        { loadNewtons: 5500, supportMode: 'four-corner-pins', loadPattern: 'torsion-tip', showHeatmap: false },
        ctx
      ).status
    ).toBe('ok');
    expect(executeMcpToolCall('cad_run_structural_fea', {}, ctx).status).toBe('ok');

    // optimize geometry
    expect(executeMcpToolCall('cad_generate_optimized_geometry', { objective: 'minimize-stress', targetSafetyFactor: 2.5 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_generate_optimized_geometry', {}, ctx).status).toBe('ok');

    // cam toolpath across machine types
    expect(executeMcpToolCall('cad_generate_cam_toolpath', { machineType: 'robot-6axis', strategy: 'isoparm', stepoverPct: 20 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_generate_cam_toolpath', { machineType: 'manual' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_generate_cam_toolpath', { machineType: 'cnc-3axis' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_generate_cam_toolpath', {}, ctx).status).toBe('ok');

    // export deliverable: explicit scope, default 'assembly' when isolation='all', default 'isolated' when isolated
    expect(executeMcpToolCall('cad_export_deliverable', { format: 'stl', scope: 'assembly' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_export_deliverable', {}, ctx).status).toBe('ok');
    const isolatedCtx = makeMockContext('COMP-1').ctx;
    expect(executeMcpToolCall('cad_export_deliverable', { format: 'nc' }, isolatedCtx).status).toBe('ok');

    // plugin script: valid + empty code error + non-Error throw coverage
    expect(executeMcpToolCall('cad_run_plugin_script', { name: 'P1', code: 'return {};' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_run_plugin_script', {}, ctx).status).toBe('error');
    spies.onRegisterAndRunPlugin.mockImplementationOnce(() => {
      throw 'string error thrown';
    });
    expect(executeMcpToolCall('cad_run_plugin_script', { code: 'return {};' }, ctx).status).toBe('error');

    // magic pen features: all 5 kinds + explicit/fallback coordinates & profiles
    expect(
      executeMcpToolCall(
        'cad_magic_pen_feature',
        { kind: 'threaded-bolt', threadSpec: 'm8', headStyle: 'hex', depthMm: 18, point: [10, 40, 10], normal: [0, 1, 0], targetComponentId: 'COMP-1' },
        ctx
      ).status
    ).toBe('ok');
    expect(
      executeMcpToolCall(
        'cad_magic_pen_feature',
        { kind: 'threaded-bolt', threadSpec: 'M99', point: [NaN, 1, 2], normal: [1] },
        ctx
      ).status
    ).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'slot-cutout', slotProfile: 'oblong' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'through-hole', diameterMm: 14 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'rib-boss', widthMm: 8, lengthMm: 24 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'chamfer-fillet', widthMm: 3 }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'blender-subsurf', axis: 'y' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', { kind: 'bim-ifc-beam' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_magic_pen_feature', {}, { ...ctx, display: { ...ctx.display, selectedComponentId: 'COMP-1' } }).status).toBe('ok');

    // cad_rhino_command with Rhino, Blender, BIM/IFC, explicit/invalid points & unknown command
    expect(executeMcpToolCall('cad_rhino_command', { command: 'ExtrudeCrv 12mm', point: [1, 2, 3], normal: [0, 1, 0] }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rhino_command', { command: 'Subsurf 3' }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rhino_command', { command: 'IfcBeam 20mm', point: [NaN], normal: [1] }, ctx).status).toBe('ok');
    expect(executeMcpToolCall('cad_rhino_command', { command: 'unknown_command_zzz' }, ctx).status).toBe('error');

    // scoobiii proof + session summary + unknown tool
    expect(executeMcpToolCall('cad_get_scoobiii_vuc_proof', {}, ctx).status).toBe('ok');
    expect(executeMcpToolCall('session_get_deliverables_summary', {}, ctx).status).toBe('ok');
    expect(executeMcpToolCall('session_get_deliverables_summary', {}, { ...ctx, partProfile: { ...ctx.partProfile, partName: '' } }).status).toBe('ok');
    expect(executeMcpToolCall('non_existent_tool', {}, ctx).status).toBe('error');
  });

  it('builds valid .ics calendar blobs both with and without deliverables', async () => {
    const blobEmpty = buildLocalIcsCalendarBlob(30, 'Casca', []);
    const textEmpty = await blobEmpty.text();
    expect(textEmpty).toContain('Nenhum artefato exportado');

    const blobFull = buildLocalIcsCalendarBlob(600, 'Casca', [
      { id: '1', filename: 'model.stl', kind: 'STL', timestamp: '10:00', summary: 'OK' },
    ]);
    const textFull = await blobFull.text();
    expect(textFull).toContain('model.stl');
  });
});
