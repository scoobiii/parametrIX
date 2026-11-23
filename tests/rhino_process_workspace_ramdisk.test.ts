import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  RHINO_COMMAND_CATALOG,
  buildRhinoFrostbiteRackObj,
  buildRhinoRockShoxForkObj,
  parseRhinoCommandPrompt,
} from '../src/kernel/rhinoGeometryEngine';
import {
  applyMaterialProcessesToComponents,
  resolveComponentManufacturingProcess,
} from '../src/kernel/componentClassifier';
import { parseVoiceCommand } from '../src/kernel/voiceCommandParser';
import { executeMcpToolCall, type McpRuntimeContext } from '../src/kernel/mcpServer';
import { computeFeatureVolumeAndKt } from '../src/kernel/scoobiiiVuc';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { ParametrixSqliteStore } from '../src/server/sqliteStore';
import {
  assertInsideDirectory,
  buildUserFolderSlug,
  deleteUserProjectFile,
  ensureUserProjectFolder,
  listUserProjectFiles,
  resolveProjectsRoot,
  sanitizeProjectFilename,
  writeUserProjectFile,
} from '../src/server/projectWorkspaceManager';
import {
  buildColabGcloudMcpScript,
  getRamdiskMcpStatus,
  inspectDevShmStatus,
  setColabBridgeUrl,
  startRamdiskMcpWorker,
  stopRamdiskMcpWorker,
} from '../src/server/ramdiskMcpAccelerator';
import type {
  CadComponentPart,
  CadFeatureOperation,
  CamSettings,
  FeaSettings,
  ParametricDesignParams,
  PartEngineeringProfile,
  ViewportDisplayState,
} from '../src/types/cad';

function buildDummyMcpContext(): McpRuntimeContext {
  const designParams: ParametricDesignParams = {
    preset: 'shell',
    spanX: 160,
    spanY: 120,
    archHeight: 40,
    waveAmplitude: 8,
    twistDeg: 0,
    thicknessMm: 6,
    uDivisions: 16,
    vDivisions: 16,
    ribCountU: 2,
    ribCountV: 2,
    ribHeightMm: 10,
    attractorStrength: 0,
  };
  const surface = buildNurbsSurfaceFromParams(designParams);
  const meshData = tessellateNurbsSurface(surface, 2, 2, 10);
  const camSettings: CamSettings = {
    machineType: 'cnc-5axis',
    strategy: 'contour',
    toolId: 'tool-ball-8',
    stepoverPct: 20,
    stepdownMm: 2,
    stockMarginMm: 0.1,
    safeZMm: 25,
    cutSpeedMultiplier: 1,
    postFormat: 'fanuc-nc',
  };
  const toolpath = generateCamToolpath(surface, meshData, camSettings);
  const display: ViewportDisplayState = {
    mode: 'component-pbr',
    materialFinish: 'aluminum',
    showIsocurves: false,
    showControlCage: false,
    showBimRibs: false,
    showToolpath: true,
    showMachine: true,
    showImportedOverlay: true,
    cameraPreset: 'isometric',
    cameraTrigger: 0,
    fitViewTrigger: 0,
    isolationTarget: 'all',
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
    perComponentPbr: true,
    transformMode: 'none',
  };
  const feaSettings: FeaSettings = {
    loadNewtons: 3200,
    supportMode: 'edge-clamped',
    loadPattern: 'center-point',
    targetSafetyFactor: 2.0,
  };
  const feaResult = evaluateStructuralFea(surface, meshData, designParams, 'aluminum', feaSettings);
  const partProfile: PartEngineeringProfile = {
    partName: 'Peça Teste Rhino',
    manufacturer: 'Parametric Forge',
    modelCode: 'PX-TEST',
    segment: 'industrial-cnc',
    primaryMaterial: 'aluminum',
    specifications: [],
    certifications: ['ISO 2768-f'],
    intendedUse: 'Teste',
    safetyCriteria: {
      recommendedLoadN: 3200,
      supportMode: 'edge-clamped',
      loadPattern: 'center-point',
      minSafetyFactor: 2.0,
      maxDeflectionMm: 5.0,
      criticalInspectionNote: 'OK',
    },
    detectedFrom: 'test',
  };

  return {
    designParams,
    surface,
    meshData,
    camSettings,
    toolpath,
    display,
    feaSettings,
    feaResult,
    feaComparison: null,
    activeSegment: 'industrial-cnc',
    partProfile,
    components: [],
    featureOps: [],
    scoobiiiProof: {
      certificateId: 'SCOOBIII-VUC-TEST',
      timestamp: '00:00:00',
      modelTitle: 'Test',
      segmentLabel: 'industrial-cnc',
      nurbsProof: {
        degreeU: 3,
        degreeV: 3,
        controlGrid: '6x6',
        clampedKnotsValid: true,
        maxPartitionUnityResidual: 0,
        minJacobian: 1,
        maxJacobian: 10,
        gaussianCurvatureRange: [0, 0.1],
        nurbsIntegralAreaCm2: 100,
        meshAreaCm2: 100,
        grossVolumeCm3: 50,
        featureRemovedVolumeCm3: 0,
        featureAddedVolumeCm3: 0,
        netVolumeCm3: 50,
      },
      physicsProof: {
        materialName: 'Al 7075',
        youngsModulusGpa: 71,
        yieldStrengthMpa: 450,
        poissonRatio: 0.33,
        loadNewtons: 3200,
        effectiveInertiaMm4: 1000,
        sectionModulusMm3: 200,
        stressConcentrationKt: 1,
        netSectionRatio: 1,
        vonMisesMaxMpa: 25,
        allowableStressMpa: 225,
        deflectionMm: 0.2,
        safetyFactor: 18,
        netMassKg: 0.2,
      },
      checks: [],
      allPassed: true,
      verdict: 'OK',
    },
    sessionSeconds: 10,
    deliverables: [],
    onUpdateDesignParams: vi.fn(),
    onUpdateDisplay: vi.fn(),
    onUpdateCamSettings: vi.fn(),
    onSetSegment: vi.fn(),
    onUpdatePartProfile: vi.fn(),
    onAddFeatureOp: vi.fn((op) => ({
      ...op,
      id: 'feat-test',
      createdAt: '2026-11-22T00:00:00.000Z',
    })),
    onRunFea: vi.fn(() => feaResult),
    onGenerateOptimizedGeometry: vi.fn(),
    onExportFormat: vi.fn(() => 'test.stl'),
    onRegisterAndRunPlugin: vi.fn(),
  };
}

describe('rhinoGeometryEngine kernel', () => {
  it('exposes 20 Rhinoceros commands and parses commands, numbers, axes, and fallbacks', () => {
    expect(RHINO_COMMAND_CATALOG).toHaveLength(20);
    expect(parseRhinoCommandPrompt('   ').matched).toBe(false);
    expect(parseRhinoCommandPrompt('comando desconhecido xyz').matched).toBe(false);

    for (const entry of RHINO_COMMAND_CATALOG) {
      const res = parseRhinoCommandPrompt(entry.syntaxExample);
      expect(res.matched).toBe(true);
      expect(res.kind).toBe(entry.kind);
      expect(res.rhinoCommand).toBe(entry.command);
    }

    const rExtrude = parseRhinoCommandPrompt('extrudar 24,5 eixo x');
    expect(rExtrude.kind).toBe('rhino-extrude-crv');
    expect(rExtrude.depthMm).toBe(24.5);
    expect(rExtrude.axis).toBe('x');

    const rPolar = parseRhinoCommandPrompt('ArrayPolar 8 r=20');
    expect(rPolar.count).toBe(8);
    expect(rPolar.radiusMm).toBe(20);

    const rShell = parseRhinoCommandPrompt('Shell 4');
    expect(rShell.wallThicknessMm).toBe(4);

    const rBend = parseRhinoCommandPrompt('Bend 55');
    expect(rBend.angleDeg).toBe(55);

    const rFillet = parseRhinoCommandPrompt('FilletEdge 5 axis: z');
    expect(rFillet.radiusMm).toBe(5);
    expect(rFillet.widthMm).toBe(10);
    expect(rFillet.axis).toBe('z');

    const rOverflow = parseRhinoCommandPrompt(`ExtrudeCrv h=${'9'.repeat(400)}`);
    expect(rOverflow.depthMm).toBe(120);
  });

  it('generates smooth lathe/chamfer OBJ meshes for RockShox fork and Frostbite rack without flat box artifacts', () => {
    const forkObj = buildRhinoRockShoxForkObj();
    expect(forkObj).toContain('o Canela_Esquerda_Lower_Leg_L');
    expect(forkObj).toContain('o Coroa_Inferior_CNC');
    expect(forkObj).toContain('o Eixo_Passante_Maxle_20x110');
    expect(forkObj.split('\n').filter((l) => l.startsWith('v ')).length).toBeGreaterThan(500);

    const rackObj = buildRhinoFrostbiteRackObj();
    expect(rackObj).toContain('o Barramento_Principal_800VDC_Busbar');
    expect(rackObj).toContain('o Rack_FrostbiteEngine_7nm_CMOS_Tiles');
    expect(rackObj).toContain('o Trocador_Calor_HVAC_800VDC_Coolant');
  });
});

describe('componentClassifier manufacturing process resolution', () => {
  it('detects authentic processes per material & component without printing metal suspension parts', () => {
    expect(resolveComponentManufacturingProcess('Seal Wiper', 'Retentor', 'matte-plastic').processCategory).toBe('moldagem-polimero');
    expect(resolveComponentManufacturingProcess('Manifold Visor', 'Capa', 'glass').processCategory).toBe('aditiva-sla');
    expect(resolveComponentManufacturingProcess('Deck Carapaça', 'Madeira', 'oak').processCategory).toBe('usinagem-cnc');
    expect(resolveComponentManufacturingProcess('Brace Monocoque', 'Estrutura', 'carbon-fiber').processCategory).toBe('usinagem-cnc');
    expect(resolveComponentManufacturingProcess('Suporte_Trelixa LPBF', 'Estrutura', 'titanium').processCategory).toBe('aditiva-lpbf');
    expect(resolveComponentManufacturingProcess('Prótese Ortopédica', 'Implante', 'titanium', 'medico').processCategory).toBe('aditiva-lpbf');
    expect(resolveComponentManufacturingProcess('Bengala_Superior', 'Stanchion', 'aluminum').processCategory).toBe('estiramento-anodizacao');
    expect(resolveComponentManufacturingProcess('Canela_Esquerda', 'Lower Leg', 'aluminum').processCategory).toBe('fundicao-cnc');
    expect(resolveComponentManufacturingProcess('Eixo_Passante Maxle', 'Axle', 'titanium').processCategory).toBe('torneamento-cnc');
    expect(resolveComponentManufacturingProcess('Coroa_Inferior', 'Crown Clamp', 'aluminum').processCategory).toBe('forjamento-cnc');
    expect(resolveComponentManufacturingProcess('Bloco Coldplate', 'Bloco', 'aluminum').processCategory).toBe('usinagem-cnc');

    const comps: CadComponentPart[] = [
      {
        id: 'C1',
        name: 'Coroa_Superior',
        family: 'Coroa',
        subFamily: 'Crown',
        maskColorHex: '#38bdf8',
        inferredMaterial: 'aluminum',
        center: [0, 0, 0],
        size: [20, 20, 20],
        triangleCount: 24,
        sourceLayer: 'C1',
      },
      {
        id: 'C2',
        name: 'Suporte',
        family: 'Suporte',
        subFamily: 'Support',
        maskColorHex: '#f59e0b',
        inferredMaterial: undefined as unknown as CadComponentPart['inferredMaterial'],
        center: [0, 0, 0],
        size: [10, 10, 10],
        triangleCount: 12,
        sourceLayer: 'C2',
      },
    ];

    const updated = applyMaterialProcessesToComponents(comps, { C1: 'matte-plastic' }, 'titanium', 'medico');
    expect(updated[0].inferredMaterial).toBe('matte-plastic');
    expect(updated[0].manufacturingProcess?.processCategory).toBe('aditiva-sla');
    expect(updated[1].inferredMaterial).toBe('titanium');
    expect(updated[1].manufacturingProcess?.processCategory).toBe('aditiva-lpbf');
  });
});

describe('voiceCommandParser, mcpServer & scoobiiiVuc Rhino + Reset extensions', () => {
  it('parses Rhino commands and Resetar Peça intents in voice/chat input', () => {
    const vReset = parseVoiceCommand('resetar peça e limpar base de produção');
    expect(vReset.action).toBe('reset-part');
    expect(vReset.matched).toBe(true);

    const vRhino = parseVoiceCommand('executar ExtrudeCrv 18mm na tampa');
    expect(vRhino.action).toBe('rhino-command');
    expect(vRhino.param).toContain('ExtrudeCrv');
    expect(vRhino.matched).toBe(true);
  });

  it('executes cad_magic_pen_feature, cad_rhino_command, and cad_reset_part_baseline in MCP server', () => {
    const ctx = buildDummyMcpContext();

    const r1 = executeMcpToolCall('cad_magic_pen_feature', {
      kind: 'rhino-pipe',
      point: [1, 2, 3],
      normal: [0, 1, 0],
      radiusMm: 7,
      axis: 'x',
      rhinoCommand: 'CustomPipe',
      label: 'Tubo Custom',
    }, ctx);
    expect(r1.status).toBe('ok');
    expect(r1.responseJson).toContain('Tubo Custom');

    const rAlias = executeMcpToolCall('cad_magic_pen_operation', {
      kind: 'rhino-array-polar',
      count: 6,
      angleDeg: 180,
      wallThicknessMm: 2,
    }, ctx);
    expect(rAlias.status).toBe('ok');

    const rRhinoOk = executeMcpToolCall('cad_rhino_command', {
      command: 'ArrayPolar 6 r=14',
      point: [4, 5, 6],
      normal: [0, 0, 1],
    }, ctx);
    expect(rRhinoOk.status).toBe('ok');

    const rRhinoFallback = executeMcpToolCall('cad_rhino_command', {
      command: 'Loft h=20',
    }, ctx);
    expect(rRhinoFallback.status).toBe('ok');

    const rRhinoEmpty = executeMcpToolCall('cad_rhino_command', {}, ctx);
    expect(rRhinoEmpty.status).toBe('error');

    const rRhinoErr = executeMcpToolCall('cad_rhino_command', {
      command: 'comando invalido rhino',
    }, ctx);
    expect(rRhinoErr.status).toBe('error');

    const rResetFallback = executeMcpToolCall('cad_reset_part_baseline', {}, ctx);
    expect(rResetFallback.status).toBe('ok');
    expect(ctx.onUpdateDisplay).toHaveBeenCalled();

    const onResetPartBaseline = vi.fn();
    const rResetCb = executeMcpToolCall('cad_reset_part_baseline', {}, { ...ctx, onResetPartBaseline });
    expect(rResetCb.status).toBe('ok');
    expect(onResetPartBaseline).toHaveBeenCalledTimes(1);
  });

  it('computes volume delta and Kt for subtractive and additive Rhino features in scoobiiiVuc', () => {
    const ops: CadFeatureOperation[] = [
      {
        id: 'op1',
        kind: 'rhino-boolean-diff',
        label: 'Cut',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 20,
        diameterMm: 10,
        depthMm: 8,
        createdAt: 'now',
      },
      {
        id: 'op2',
        kind: 'rhino-array-polar',
        label: 'Polar',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 10,
        lengthMm: 10,
        diameterMm: 10,
        depthMm: 6,
        count: 4,
        createdAt: 'now',
      },
      {
        id: 'op3',
        kind: 'rhino-extrude-crv',
        label: 'Extrude',
        targetComponentId: 'shell',
        point: [0, 0, 0],
        normal: [0, 1, 0],
        widthMm: 12,
        lengthMm: 12,
        diameterMm: 12,
        depthMm: 10,
        createdAt: 'now',
      },
    ];
    const res = computeFeatureVolumeAndKt(ops, 100);
    expect(res.removedVolumeCm3).toBeGreaterThan(0);
    expect(res.addedVolumeCm3).toBeGreaterThan(0);
  });
});

describe('sqliteStore CAM baseline reset', () => {
  it('clears all CAM service jobs and records CAM_BASELINE_RESET VUC proof', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px-sqlite-reset-'));
    const store = new ParametrixSqliteStore(path.join(tmpDir, 'test.sqlite'));
    try {
      expect(store.listCamServiceJobs().length).toBeGreaterThan(0);
      const resetRes = store.resetCamServiceJobs();
      expect(resetRes.clearedCount).toBeGreaterThan(0);
      expect(resetRes.jobs).toHaveLength(0);
      expect(resetRes.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);
      expect(store.listCamServiceJobs()).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('projectWorkspaceManager per-login isolation & path confinement', () => {
  it('creates isolated per-login folders, enforces path confinement, lists, writes, and deletes files', () => {
    const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px-proj-root-'));
    try {
      expect(buildUserFolderSlug('', 'Marcos@Example.com')).toMatch(/^marcos-example-com-[0-9a-f]{8}$/);
      expect(buildUserFolderSlug('uid_123')).toMatch(/^uid_123-[0-9a-f]{8}$/);
      expect(buildUserFolderSlug('   ')).toMatch(/^local-operator-[0-9a-f]{8}$/);
      expect(buildUserFolderSlug('@@@')).toMatch(/^user-[0-9a-f]{8}$/);

      expect(sanitizeProjectFilename('../weird name!!.step')).toBe('weird-name-.step');
      expect(() => sanitizeProjectFilename('...')).toThrow();
      expect(() => ensureUserProjectFolder('!!!', baseRoot)).toThrow();
      expect(() => assertInsideDirectory(path.join(baseRoot, 'a'), path.join(baseRoot, 'b'))).toThrow();
      expect(resolveProjectsRoot(baseRoot)).toBe(path.resolve(baseRoot, 'data', 'projects'));

      const slug = buildUserFolderSlug('u1', 'eng@parametrix.io');
      const folder = ensureUserProjectFolder(slug, baseRoot);
      expect(fs.existsSync(folder.folderPath)).toBe(true);

      // Subdirectory inside user folder must be skipped by listUserProjectFiles
      fs.mkdirSync(path.join(folder.folderPath, 'subdir'), { recursive: true });

      const f1 = writeUserProjectFile(slug, 'peca_a.json', '{"v":1}', baseRoot);
      const f2 = writeUserProjectFile(slug, 'peca_b.json', '{"v":2}', baseRoot);
      expect(f1.sha256).toHaveLength(64);
      expect(f2.sizeBytes).toBe(7);

      const list = listUserProjectFiles(slug, baseRoot);
      expect(list.map((f) => f.name).sort()).toEqual(['peca_a.json', 'peca_b.json']);

      expect(deleteUserProjectFile(slug, 'peca_a.json', baseRoot)).toBe(true);
      expect(deleteUserProjectFile(slug, 'nao_existe.json', baseRoot)).toBe(false);
    } finally {
      fs.rmSync(baseRoot, { recursive: true, force: true });
    }
  });
});

describe('ramdiskMcpAccelerator ephemeral worker & Colab/GCloud bridge', () => {
  it('inspects shm status, starts/queries/stops local tmpfs worker, handles failures, and generates Colab script', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px-shm-test-'));
    try {
      const missingShm = inspectDevShmStatus(path.join(tmpRoot, 'does-not-exist'));
      expect(missingShm.available).toBe(false);
      expect(missingShm.mountPath).toBe(os.tmpdir());

      const validShm = inspectDevShmStatus(tmpRoot);
      expect(validShm.available).toBe(true);
      expect(validShm.totalMb).toBeGreaterThanOrEqual(0);

      const spyStatfs = vi.spyOn(fs, 'statfsSync').mockImplementationOnce(() => {
        throw new Error('statfs error');
      });
      const errShm = inspectDevShmStatus(tmpRoot);
      expect(errShm.available).toBe(false);
      spyStatfs.mockRestore();

      setColabBridgeUrl('  https://colab-bridge.example.run.app  ');
      const idleStatus = getRamdiskMcpStatus(undefined, tmpRoot);
      expect(idleStatus.colabBridgeUrl).toBe('https://colab-bridge.example.run.app');
      expect(idleStatus.workerActive).toBe(false);
      setColabBridgeUrl(undefined);

      // Start real ephemeral worker subprocess
      const activeSt = await startRamdiskMcpWorker('Eng Marcos!', tmpRoot);
      expect(activeSt.workerActive).toBe(true);
      expect(activeSt.workerUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      // Idempotent second call while worker is running
      const secondSt = await startRamdiskMcpWorker('!!!', tmpRoot);
      expect(secondSt.workerPid).toBe(activeSt.workerPid);

      // Verify real HTTP endpoints on worker (/health, /render-rhino, 404)
      const healthResp = await fetch(`${activeSt.workerUrl}/health`);
      expect(healthResp.ok).toBe(true);
      const healthJson = (await healthResp.json()) as { ok: boolean };
      expect(healthJson.ok).toBe(true);

      const renderResp = await fetch(`${activeSt.workerUrl}/render-rhino`, {
        method: 'POST',
        body: JSON.stringify({ command: 'ExtrudeCrv', depthMm: 18 }),
      });
      expect(renderResp.ok).toBe(true);
      const renderJson = (await renderResp.json()) as { ok: boolean; sha256: string };
      expect(renderJson.sha256).toHaveLength(64);

      const emptyRenderResp = await fetch(`${activeSt.workerUrl}/render-rhino`, { method: 'POST', body: '' });
      expect(emptyRenderResp.ok).toBe(true);

      const notFoundResp = await fetch(`${activeSt.workerUrl}/unknown`);
      expect(notFoundResp.status).toBe(404);

      // Stop gracefully and verify idempotent stop when idle
      const stopped = await stopRamdiskMcpWorker(tmpRoot);
      expect(stopped.workerActive).toBe(false);
      const stoppedAgain = await stopRamdiskMcpWorker(tmpRoot);
      expect(stoppedAgain.workerActive).toBe(false);

      // Error handling: premature exit + non-JSON & ready=false stdout chunks
      await expect(
        startRamdiskMcpWorker('fail-fast', tmpRoot, {
          workerScriptOverride: 'console.log("warmup-non-json"); console.log(JSON.stringify({ready:false})); setTimeout(() => process.exit(2), 30);',
        })
      ).rejects.toThrow(/encerrrou|encerrou/i);

      // Post-ready self-exit clears activeWorker automatically + covers 'local' slug & tmpdir fallback
      const shortWorker = await startRamdiskMcpWorker('!!!', path.join(tmpRoot, 'no-shm-fallback'), {
        workerScriptOverride: 'console.log(JSON.stringify({ready:true,port:41234})); setTimeout(() => process.exit(0), 40);',
      });
      expect(shortWorker.workerActive).toBe(true);
      await new Promise((r) => setTimeout(r, 120));
      expect(getRamdiskMcpStatus(undefined, tmpRoot).workerActive).toBe(false);

      // Error handling: startup timeout
      await expect(
        startRamdiskMcpWorker('timeout-worker', tmpRoot, {
          workerScriptOverride: 'process.stdout.write("partial-no-newline"); setTimeout(() => {}, 5000);',
          readyTimeoutMs: 60,
        })
      ).rejects.toThrow(/Timeout/);

      const script = buildColabGcloudMcpScript();
      expect(script).toContain('/dev/shm/parametrix-colab-mcp');
      expect(script).toContain('uvicorn bridge_app:app');
    } finally {
      await stopRamdiskMcpWorker(tmpRoot);
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }, 15000);
});
