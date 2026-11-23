import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CAM_PRODUCTION_PROGRAMS,
  PROCESS_LABELS,
  buildToolChangeSequence,
  evaluateCamProcessVisualState,
  getCamProductionProgram,
  listCamProductionPrograms,
} from '../src/kernel/camProcessEngine';
import { generateCamToolpath } from '../src/kernel/camRobotics';
import {
  ECOSYSTEM_ROLE_DEFINITIONS,
  aggregateComputeSharePool,
  buildUserProfileWithRole,
  createDefaultAgentForRole,
  estimateMultimodalLogisticsRoute,
  summarizeErpCrmPipeline,
} from '../src/kernel/ecosystemErpLogistics';
import {
  AGENT_PROVIDER_CATALOG,
  createMcpEyeEvent,
  selectOptimalLocalLlm,
} from '../src/kernel/llmBootstrap';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import {
  evaluateChipCamProfile,
  evaluateFrostbiteDatacenterState,
  evaluateRackComparison,
} from '../src/kernel/rackFrostbiteEngine';
import {
  PARAMETRIX_SYSTEM_INSTRUCTION_CORE,
  buildCamAgentSystemInstruction,
  buildDeterministicCamAgentReply,
} from '../src/kernel/camAgentSystemInstruction';
import { parseVoiceCommand } from '../src/kernel/voiceCommandParser';
import {
  buildVucExecutionProof,
  canonicalSerialize,
  computeDeterministicVucHash,
} from '../src/kernel/vucHash';
import { ParametrixSqliteStore } from '../src/server/sqliteStore';
import {
  createFormalVucCertificate,
  getSafeGitCommit,
  sha256Hex,
  verifyFormalVucCertificate,
} from '../src/server/vucFormalProof';
import type {
  AuthProviderKind,
  CamSettings,
  ComputeShareNode,
  EcosystemRole,
  ParametricDesignParams,
} from '../src/types/cad';

const TEST_PARAMS: ParametricDesignParams = {
  preset: 'shell',
  spanX: 180,
  spanY: 130,
  archHeight: 42,
  waveAmplitude: 10,
  twistDeg: 10,
  thicknessMm: 5,
  uDivisions: 16,
  vDivisions: 16,
  ribCountU: 3,
  ribCountV: 2,
  ribHeightMm: 12,
  attractorStrength: 0,
};

describe('vucHash kernel', () => {
  it('canonicalizes primitives, arrays, nested objects, undefined keys, and computes deterministic 64-hex VUC hash', () => {
    expect(canonicalSerialize(null)).toBe('null');
    expect(canonicalSerialize(42)).toBe('42');
    expect(canonicalSerialize([3, 'a', true])).toBe('[3,"a",true]');
    expect(canonicalSerialize({ b: 2, skip: undefined, a: 1 })).toBe('{"a":1,"b":2}');

    const h1 = computeDeterministicVucHash('TEST', { b: 2, a: 1 });
    const h2 = computeDeterministicVucHash('TEST', { a: 1, b: 2 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^VUC-[0-9A-F]{64}$/);

    const pWithTs = buildVucExecutionProof('D1', 'Summary 1', { x: 1 }, '2026-01-01T00:00:00.000Z');
    expect(pWithTs.timestamp).toBe('2026-01-01T00:00:00.000Z');
    const pAuto = buildVucExecutionProof('D1', 'Summary 2', { x: 2 });
    expect(pAuto.vucHash).not.toBe(pWithTs.vucHash);
  });
});

describe('rackFrostbiteEngine kernel', () => {
  it('evaluates Rack @nvidia vs Rack #FrostbiteEngine 1MW 800VDC with pre-silicon disclosures and VUC proof', () => {
    const rep = evaluateRackComparison({
      inputPowerMw: 1.0,
      busVoltageVdc: 800,
      ambientTempC: 24,
    });
    expect(rep.frostbiteRack.nodeProcess).toContain('7 nm');
    expect(rep.frostbiteRack.clockMhz).toBe(500);
    expect(rep.frostbiteRack.isPreSiliconResearch).toBe(true);
    expect(rep.frostbiteRack.isOpticalOrQuantum).toBe(false);
    expect(rep.frostbiteRack.publicVendorDataAvailable).toBe(false);
    expect(rep.frostbiteRack.missingPublicDataFields.length).toBe(3);
    expect(rep.netComputeGainRatio).toBeGreaterThan(4.5);
    expect(rep.hvacSavingKw).toBeGreaterThan(0);
    expect(rep.vucProof.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    // Cover fallback bounds (zero/NaN inputs)
    const fallbackRep = evaluateRackComparison({
      inputPowerMw: 0,
      busVoltageVdc: 0,
      ambientTempC: 0,
      frostbitePerfMultiplier: 5.0,
    });
    expect(fallbackRep.busVoltageVdc).toBe(800);
    expect(fallbackRep.inputPowerMw).toBe(1);
  });

  it('evaluates Chip/SoC CAM across silicon-cmos, optical-photonic, and hybrid-soc', () => {
    const cmos = evaluateChipCamProfile('silicon-cmos');
    expect(cmos.opticalCouplersCount).toBe(0);
    expect(cmos.diesPerWafer).toBeGreaterThan(100);

    const opt = evaluateChipCamProfile('optical-photonic', 14, 250);
    expect(opt.opticalCouplersCount).toBe(1024);

    const hyb = evaluateChipCamProfile('hybrid-soc', 5, 500);
    expect(hyb.opticalCouplersCount).toBe(512);
    expect(hyb.tileCount).toBe(256);
    expect(hyb.vucProof.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);
  });

  it('evaluates functional liquid-cooling Frostbite Datacenter with humanoid crew and NO mechanical arm', () => {
    const baseDc = evaluateFrostbiteDatacenterState({
      inputPowerMw: 1.0,
      busVoltageVdc: 800,
      ambientTempC: 24,
    });
    expect(baseDc.operationalStatus).toBe('pronto-funcional');
    expect(baseDc.hasMechanicalArm).toBe(false);
    expect(baseDc.liquidCooling.cdusActive).toBe(2);
    expect(baseDc.humanoidCrew).toHaveLength(3);
    expect(baseDc.vucProof.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    const highLoadDc = evaluateFrostbiteDatacenterState({
      inputPowerMw: 1.8,
      busVoltageVdc: 800,
      ambientTempC: 28,
      maintenanceCycle: 2,
    });
    expect(highLoadDc.liquidCooling.cdusActive).toBe(4);
    expect(highLoadDc.maintenanceCycle).toBe(2);

    const fallbackDc = evaluateFrostbiteDatacenterState({
      inputPowerMw: 0,
      busVoltageVdc: 0,
      ambientTempC: 0,
      maintenanceCycle: 1,
    });
    expect(fallbackDc.inputPowerMw).toBe(1);
    expect(fallbackDc.busVoltageVdc).toBe(800);
  });
});

describe('camProcessEngine kernel', () => {
  it('evaluates ATC tool changes, visible beams/wire/arc/powder/UV and VUC proofs for all machine processes', () => {
    const surface = buildNurbsSurfaceFromParams(TEST_PARAMS);
    const mesh = tessellateNurbsSurface(surface, 3, 2, 12);
    const baseCam: CamSettings = {
      machineType: 'cnc-5axis',
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 35,
      stepdownMm: 2,
      stockMarginMm: 0.4,
      safeZMm: 25,
      cutSpeedMultiplier: 1,
      postFormat: 'fanuc-nc',
    };
    const tp = generateCamToolpath(surface, mesh, baseCam);

    expect(Object.keys(PROCESS_LABELS)).toHaveLength(8);
    expect(buildToolChangeSequence('powder-metal', tp)).toHaveLength(3);
    expect(buildToolChangeSequence('resin-sla', tp)).toHaveLength(3);
    expect(buildToolChangeSequence('robot-weld', tp)).toHaveLength(3);
    expect(buildToolChangeSequence('laser-cut', tp)).toHaveLength(2);
    expect(buildToolChangeSequence('cnc-5axis', tp)).toHaveLength(3);

    const powderRecoat = evaluateCamProcessVisualState({ ...baseCam, machineType: 'powder-metal' }, tp, 0.1, 1);
    expect(powderRecoat.showPowderCone).toBe(true);
    expect(powderRecoat.showLaserRay).toBe(false);

    const powderFuse = evaluateCamProcessVisualState(
      {
        ...baseCam,
        machineType: 'powder-metal',
        additiveConfig: {
          layerThicknessUm: 45,
          supportPattern: 'linear-fin',
          supportDensityPct: 30,
          overhangAngleDeg: 40,
          sinterLaserPowerW: 450,
          sinterScanSpeedMmS: 1000,
          sinterTempC: 1200,
          sinterHoldMinutes: 120,
          atmosphere: 'argon',
          hatchSpacingMm: 0.12,
        },
      },
      tp,
      0.5,
      2
    );
    expect(powderFuse.showLaserRay).toBe(true);
    expect(powderFuse.showPowderCone).toBe(false);
    expect(powderFuse.activeToolEvent.toolName).toContain('450W');

    const slaUv = evaluateCamProcessVisualState({ ...baseCam, machineType: 'resin-sla' }, tp, 0.6, 1);
    expect(slaUv.showResinUvBeam).toBe(true);

    const weldArc = evaluateCamProcessVisualState({ ...baseCam, machineType: 'robot-weld' }, tp, 0.5, 3);
    expect(weldArc.showWeldWireAndArc).toBe(true);

    const laserBeam = evaluateCamProcessVisualState({ ...baseCam, machineType: 'laser-cut' }, tp, 0.5, 1);
    expect(laserBeam.showLaserRay).toBe(true);

    const cncFinish = evaluateCamProcessVisualState(baseCam, tp, 0.9, 1);
    expect(cncFinish.activeToolEvent.toolNumber).toBe('T03');
    expect(cncFinish.vucProof.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    // Datacenter & Humanoid Robot pre-programmed CAM catalog
    expect(CAM_PRODUCTION_PROGRAMS).toHaveLength(9);
    expect(listCamProductionPrograms()).toHaveLength(9);
    expect(listCamProductionPrograms('datacenter')).toHaveLength(5);
    expect(listCamProductionPrograms('humanoid')).toHaveLength(4);
    expect(getCamProductionProgram('dc-coldplate')?.category).toBe('datacenter');
    expect(getCamProductionProgram('hum-actuator')?.category).toBe('humanoid');
    expect(getCamProductionProgram('missing-program')).toBeUndefined();
  });
});

describe('llmBootstrap & voiceCommandParser kernels', () => {
  it('selects optimal local LLM across all 4 hardware/user load tiers and creates MCP Eye events', () => {
    expect(AGENT_PROVIDER_CATALOG).toHaveLength(8);

    const ultraLight = selectOptimalLocalLlm({
      cpuCores: 2,
      cpuLoadPct: 88,
      totalRamGb: 4,
      freeRamGb: 1.2,
      gpuTier: 'none',
      gpuName: 'CPU',
      osPlatform: 'linux',
      networkMbps: 20,
      loggedInUsers: 4,
    });
    expect(ultraLight.tier).toBe('ultra-light');

    const compact = selectOptimalLocalLlm({
      cpuCores: 8,
      cpuLoadPct: 30,
      totalRamGb: 16,
      freeRamGb: 5.0,
      gpuTier: 'integrated',
      gpuName: 'Iris Xe',
      osPlatform: 'linux',
      networkMbps: 100,
      loggedInUsers: 1,
    });
    expect(compact.tier).toBe('compact');

    const balanced = selectOptimalLocalLlm({
      cpuCores: 12,
      cpuLoadPct: 25,
      totalRamGb: 32,
      freeRamGb: 12,
      gpuTier: 'dedicated-mid',
      gpuName: 'RTX 4060',
      osPlatform: 'linux',
      networkMbps: 300,
      loggedInUsers: 1,
    });
    expect(balanced.tier).toBe('balanced');

    const workstation = selectOptimalLocalLlm({
      cpuCores: 32,
      cpuLoadPct: 12,
      totalRamGb: 128,
      freeRamGb: 96,
      gpuTier: 'datacenter',
      gpuName: 'H100',
      osPlatform: 'linux',
      networkMbps: 1000,
      loggedInUsers: 1,
    });
    expect(workstation.tier).toBe('workstation');

    const eye = createMcpEyeEvent('cam-output', 'CAM.test', 'Reinício concluído', { ok: true });
    expect(eye.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);
  });

  it('parses all voice command branches in PT-BR/EN', () => {
    expect(parseVoiceCommand('').matched).toBe(false);
    expect(parseVoiceCommand('reiniciar cam').action).toBe('restart-cam');
    expect(parseVoiceCommand('pausar simulacao').action).toBe('pause-cam');
    expect(parseVoiceCommand('simular cam agora').action).toBe('play-cam');
    expect(parseVoiceCommand('ativar po metalico lpbf').param).toBe('powder-metal');
    expect(parseVoiceCommand('trocar para resina uv sla').param).toBe('resin-sla');
    expect(parseVoiceCommand('robo de solda mig').param).toBe('robot-weld');
    expect(parseVoiceCommand('corte a laser').param).toBe('laser-cut');
    expect(parseVoiceCommand('abrir rack frostbite 800v').param).toBe('frostbite');
    expect(parseVoiceCommand('ecossistema logistica erp').param).toBe('ecosystem');
    expect(parseVoiceCommand('novo projeto do zero').action).toBe('start-wizard');
    expect(parseVoiceCommand('rodar analise fea').action).toBe('run-fea');
    expect(parseVoiceCommand('otimizar curvatura').action).toBe('optimize-curvature');
    expect(parseVoiceCommand('vista explodida').action).toBe('toggle-explode');
    expect(parseVoiceCommand('exportar stl').action).toBe('export-stl');
    expect(parseVoiceCommand('carregar soc hibrido optico').param).toBe('preset-soc-hybrid');
    expect(parseVoiceCommand('coldplate liquid cooling').param).toBe('dc-coldplate');
    expect(parseVoiceCommand('manifold engate rapido').param).toBe('dc-manifold');
    expect(parseVoiceCommand('torso humanoide').param).toBe('hum-torso');
    expect(parseVoiceCommand('atuador harmonico').param).toBe('hum-actuator');
    expect(parseVoiceCommand('cnc 5 eixos').param).toBe('cnc-5axis');
    expect(parseVoiceCommand('fresadora 3 eixos').param).toBe('cnc-3axis');
    expect(parseVoiceCommand('robo kuka 6 eixos').param).toBe('robot-6axis');
    expect(parseVoiceCommand('usinagem manual dro').param).toBe('manual');
    expect(parseVoiceCommand('enviar codigo g mqtt').action).toBe('dispatch-remote');
    expect(parseVoiceCommand('gerar prova vuc ed25519').action).toBe('verify-vuc');
    expect(parseVoiceCommand('agente qual a sinterizacao atual?').action).toBe('agent-query');
    expect(parseVoiceCommand('falar sobre clima amanha').action).toBe('unknown');
  });

  it('builds CAM system instructions, grounded agent replies, and formal SHA-256 + Ed25519 VUC certificates', () => {
    expect(PARAMETRIX_SYSTEM_INSTRUCTION_CORE).toContain('FrostbiteEngine');

    const emptyInst = buildCamAgentSystemInstruction({});
    expect(emptyInst).toContain('Manufatura Aditiva: processo subtrativo/robótico');
    expect(emptyInst).toContain('Nenhum evento MCP Eye');

    const richInst = buildCamAgentSystemInstruction({
      agentId: 'claude',
      roleLabel: 'cam_provider',
      cadSummary: {
        partName: 'Cold-Plate',
        activeSegment: 'industrial-cnc',
        machineType: 'powder-metal',
        processLabel: 'Impressão Pó Metálico',
        activeTool: 'T11 Laser',
        postFormat: 'slm-powder',
        estimatedMinutes: 35,
        cuttingLengthMm: 4100,
        camRestartCount: 2,
        safetyFactor: 2.6,
        remoteMachinesCount: 4,
        vucHash: 'VUC-ABCD',
        additiveConfig: {
          layerThicknessUm: 40,
          sinterTempC: 1220,
          supportPattern: 'tree-branch',
          supportDensityPct: 35,
          atmosphere: 'argon',
        },
      },
      eyeEvents: [
        { direction: 'cam-output', source: 'CAM', summary: 'Reinício #2' },
        {},
      ],
    });
    expect(richInst).toContain('camada=40 µm');
    expect(richInst).toContain('Reinício #2');

    // Also test additiveConfig with undefined inner properties
    const partialAddInst = buildCamAgentSystemInstruction({
      cadSummary: { additiveConfig: {} },
    });
    expect(partialAddInst).toContain('camada=n/d µm');

    // Deterministic CAM Agent Reply across all 5 branches + missing optional fields
    const rFrost = buildDeterministicCamAgentReply({
      agentId: 'gemini',
      userMessage: 'Qual o CAPEX e ROI do Frostbite 7nm?',
      vucHash: 'VUC-111122223333444455',
    });
    expect(rFrost).toContain('NÃO óptico e NÃO quântico');

    const rAddFull = buildDeterministicCamAgentReply({
      agentId: 'deepseek',
      userMessage: 'Qual a temperatura de sinterização e camada?',
      cadSummary: {
        partName: 'Manifold',
        processLabel: 'LPBF',
        activeTool: 'T11',
        additiveConfig: { layerThicknessUm: 45, sinterTempC: 1240, supportPattern: 'lattice-grid', supportDensityPct: 40 },
      },
      vucHash: 'VUC-111122223333444455',
    });
    expect(rAddFull).toContain('1240 °C');

    const rAddFallback = buildDeterministicCamAgentReply({
      agentId: 'qwen',
      userMessage: 'Parametro resina SLA suporte?',
      cadSummary: { additiveConfig: { supportPattern: 'linear-fin' } },
      vucHash: 'VUC-111122223333444455',
    });
    expect(rAddFallback).toContain('linear-fin (35%)');

    const rAddEmpty = buildDeterministicCamAgentReply({
      agentId: 'meta',
      userMessage: 'Camada po metalico?',
      vucHash: 'VUC-111122223333444455',
    });
    expect(rAddEmpty).toContain('configurável');

    const rVuc = buildDeterministicCamAgentReply({
      agentId: 'grok',
      userMessage: 'Gerar certificado prova VUC Ed25519',
      vucHash: 'VUC-111122223333444455',
    });
    expect(rVuc).toContain('Ed25519');

    const rMqtt = buildDeterministicCamAgentReply({
      agentId: 'manus',
      userMessage: 'Despachar código G para máquina remota MQTT',
      vucHash: 'VUC-111122223333444455',
    });
    expect(rMqtt).toContain('máquinas remotas');

    const rGeneral = buildDeterministicCamAgentReply({
      agentId: 'local-llm',
      userMessage: 'Qual o ciclo desta peça?',
      eyeEvents: [{ summary: 'ATC T03 ativo' }],
      vucHash: 'VUC-111122223333444455',
    });
    expect(rGeneral).toContain('ATC T03 ativo');

    const rGeneralEmpty = buildDeterministicCamAgentReply({
      agentId: 'local-llm',
      userMessage: 'status geral',
      cadSummary: { partName: 'Eixo', machineType: 'cnc-3axis', activeTool: 'T02', estimatedMinutes: 12, safetyFactor: 2.1 },
      vucHash: 'VUC-111122223333444455',
    });
    expect(rGeneralEmpty).toContain('Eixo');

    // Formal SHA-256 + Ed25519 VUC Proof tests
    expect(sha256Hex('abc')).toHaveLength(64);
    const gitTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parametrix-git-'));
    expect(getSafeGitCommit('no-git-fallback', gitTmp)).toBe('no-git-fallback');
    execSync(
      'git init && git config user.email "t@local" && git config user.name "t" && touch a.txt && git add a.txt && git commit -m "init"',
      { cwd: gitTmp, stdio: 'ignore' }
    );
    expect(getSafeGitCommit('no-git-fallback', gitTmp).length).toBeGreaterThanOrEqual(4);
    fs.rmSync(gitTmp, { recursive: true, force: true });

    const prevGh = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = 'true';
    const certBuf = createFormalVucCertificate({
      domain: 'TEST_BUFFER',
      status: 'PASS',
      inputPayload: Buffer.from('step-in'),
      outputPayload: Buffer.from('gcode-out'),
      durationMs: 42,
    });
    expect(certBuf.runner).toBe('github-actions-ubuntu');
    expect(verifyFormalVucCertificate(certBuf, Buffer.from('step-in'), Buffer.from('gcode-out')).valid).toBe(true);
    expect(verifyFormalVucCertificate(certBuf, Buffer.from('wrong-in')).valid).toBe(false);
    expect(verifyFormalVucCertificate(certBuf, Buffer.from('step-in'), Buffer.from('wrong-out')).valid).toBe(false);

    delete process.env.GITHUB_ACTIONS;
    const certJson = createFormalVucCertificate({
      domain: 'TEST_JSON',
      status: 'PASS',
      inputPayload: { a: 1 },
      outputPayload: { b: 2 },
      durationMs: 10,
      commitSha: 'deadbeef',
    });
    expect(certJson.runner).toBe('local-sandbox');
    expect(verifyFormalVucCertificate(certJson, { a: 1 }, { b: 2 }).valid).toBe(true);
    expect(verifyFormalVucCertificate({ ...certJson, hash_input: '0'.repeat(64) }).valid).toBe(false);
    expect(verifyFormalVucCertificate({ ...certJson, public_key_pem: 'INVALID-PEM' }).valid).toBe(false);
    if (prevGh !== undefined) process.env.GITHUB_ACTIONS = prevGh;
  });
});

describe('ecosystemErpLogistics & ParametrixSqliteStore', () => {
  it('builds role profiles, estimates all 4 multimodal logistics routes, compute pool 20%, and ERP summary', () => {
    const roles: EcosystemRole[] = ['client', 'cam_provider', 'logistics', 'supplier', 'compute_node'];
    for (const r of roles) {
      expect(ECOSYSTEM_ROLE_DEFINITIONS[r].capabilities.length).toBe(3);
      const prof = buildUserProfileWithRole(
        { id: `u-${r}`, email: `${r}@local`, displayName: r, provider: 'proprietary', offlineMode: true },
        r,
        { handleAt: '', phone: '', address: '' }
      );
      expect(prof.handleAt).toBe(ECOSYSTEM_ROLE_DEFINITIONS[r].defaultHandle);
      expect(createDefaultAgentForRole(r).agentName).toBe(ECOSYSTEM_ROLE_DEFINITIONS[r].agentDefaultName);
    }

    for (const modal of ['road', 'rail', 'air', 'river'] as const) {
      const est = estimateMultimodalLogisticsRoute(modal, 250, 20);
      expect(est.vucHash).toMatch(/^VUC-/);
      expect(est.costBrl).toBeGreaterThan(0);
    }
    const clampedRoute = estimateMultimodalLogisticsRoute('road', 0, 0);
    expect(clampedRoute.distanceKm).toBe(10);

    const nodes: ComputeShareNode[] = [
      { id: '1', userId: 'u1', label: 'A', osName: 'Linux', cpuCores: 10, gpuName: 'G1', sharePct: 20, tflopsEst: 10, active: true, updatedAt: 't' },
      { id: '2', userId: 'u2', label: 'B', osName: 'Linux', cpuCores: 8, gpuName: 'G2', sharePct: 20, tflopsEst: 5, active: false, updatedAt: 't' },
    ];
    const pool = aggregateComputeSharePool(nodes);
    expect(pool.activeCount).toBe(1);
    expect(pool.totalCoresContributed).toBe(2);

    const erpSum = summarizeErpCrmPipeline(
      [
        { id: 'e1', kind: 'order', title: 'A', status: 'aberto', partyName: 'P1', segment: 'robotica', amountBrl: 1000, ownerRole: 'client', vucHash: 'V', updatedAt: 't' },
        { id: 'e2', kind: 'invoice', title: 'B', status: 'concluido', partyName: 'P2', segment: 'robotica', amountBrl: 500, ownerRole: 'client', vucHash: 'V', updatedAt: 't' },
      ],
      [
        { id: 'l1', driverName: 'D1', serviceTag: 'iFood', modal: 'road', lat: 0, lng: 0, status: 'em-rota', routeLabel: 'R', speedKmh: 40, updatedAt: 't' },
        { id: 'l2', driverName: 'D2', serviceTag: '99', modal: 'road', lat: 0, lng: 0, status: 'entregue', routeLabel: 'R', speedKmh: 0, updatedAt: 't' },
      ]
    );
    expect(erpSum).toEqual({
      totalPipelineBrl: 1500,
      openOrders: 1,
      completedOrders: 1,
      activeCouriers: 1,
    });
  });

  it('persists SQLite auth (proprietary + all offline providers), projects, ERP, chat, GPS, compute share, remote machines & VUC ledger', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parametrix-db-'));
    const fileDbPath = path.join(tmpDir, 'test.sqlite');
    const store = new ParametrixSqliteStore(fileDbPath);

    // Invalid email rejection
    expect(() => store.loginOrRegister({ email: 'invalid', provider: 'proprietary' })).toThrow();

    // Proprietary registration + valid & invalid password login
    const uProp = store.loginOrRegister({
      email: 'eng@parametrix.local',
      displayName: 'Engenheiro Chefe',
      provider: 'proprietary',
      password: 'secret',
      role: 'cam_provider',
      offlineMode: true,
    });
    expect(uProp.displayName).toBe('Engenheiro Chefe');
    expect(uProp.role).toBe('cam_provider');
    expect(() =>
      store.loginOrRegister({ email: 'eng@parametrix.local', provider: 'proprietary', password: 'wrong' })
    ).toThrow('Senha incorreta');

    const uRelogin = store.loginOrRegister({
      email: 'eng@parametrix.local',
      provider: 'proprietary',
      password: 'secret',
      offlineMode: true,
    });
    expect(uRelogin.id).toBe(uProp.id);

    const uReloginNoPass = store.loginOrRegister({
      email: 'eng@parametrix.local',
      provider: 'proprietary',
      offlineMode: true,
    });
    expect(uReloginNoPass.id).toBe(uProp.id);

    // Email provider password check + timingSafeEqual length mismatch / empty hash fallback
    const uEmailPass = store.loginOrRegister({
      email: 'mailpass@parametrix.local',
      provider: 'email',
      password: 'secret-email',
      offlineMode: true,
    });
    expect(uEmailPass.provider).toBe('email');
    expect(() =>
      store.loginOrRegister({ email: 'mailpass@parametrix.local', provider: 'email', password: 'wrong' })
    ).toThrow('Senha incorreta');
    store.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run('', uEmailPass.id);
    expect(() =>
      store.loginOrRegister({ email: 'mailpass@parametrix.local', provider: 'email', password: 'secret-email' })
    ).toThrow('Senha incorreta');

    // Empty localpart / defaults + offline providers
    const providers: AuthProviderKind[] = ['google', 'microsoft', 'oracle', 'zoho', 'apple', 'email'];
    for (const prov of providers) {
      const prof = store.loginOrRegister({
        email: `${prov}@offline.local`,
        provider: prov,
        offlineMode: true,
      });
      expect(prof.provider).toBe(prov);
    }
    const edgeHandleUser = store.loginOrRegister({
      email: '@offline.local',
      provider: 'email',
      role: 'logistics',
    });
    expect(edgeHandleUser.displayName).toBe('Engenheiro Parametrix');
    expect(edgeHandleUser.handleAt.startsWith('@')).toBe(true);

    const customHandleUser = store.loginOrRegister({
      email: 'custom@offline.local',
      displayName: '   ',
      handleAt: '@custom.handle',
      provider: 'email',
      role: 'client',
    });
    expect(customHandleUser.handleAt).toBe('@custom.handle');

    const nonAlnumDisplay = store.loginOrRegister({
      email: 'nonalnum@offline.local',
      displayName: '!!!',
      provider: 'email',
      role: 'supplier',
    });
    expect(nonAlnumDisplay.handleAt).toBe('@fornecedor');

    // Update user profile (existing & missing)
    expect(
      store.updateUserProfile({
        userId: 'non-existent',
        role: 'client',
        handleAt: '@x',
        phone: '1',
        address: 'A',
        computeSharePct: 20,
        agentConfig: uProp.agentConfig,
      })
    ).toBeNull();

    const updated = store.updateUserProfile({
      userId: uProp.id,
      role: 'supplier',
      handleAt: '@novo.handle',
      phone: '+55 11 99999-0000',
      address: 'Campinas Hub',
      computeSharePct: 0,
      agentConfig: { ...uProp.agentConfig, handleAt: '@novo.handle' },
    });
    expect(updated?.computeSharePct).toBe(20);
    expect(store.getUserCount()).toBeGreaterThanOrEqual(8);

    // Projects (auto id + explicit upsert id)
    const p1 = store.saveProject({
      ownerId: uProp.id,
      name: 'Frostbite 800V Rack',
      presetId: 'preset-frostbite-rack',
      segment: 'robotica',
      paramsJson: '{}',
      camJson: '{}',
    });
    store.saveProject({
      id: p1.id,
      ownerId: uProp.id,
      name: 'Frostbite 800V Rack v2',
      presetId: 'preset-frostbite-rack',
      segment: 'robotica',
      paramsJson: '{}',
      camJson: '{}',
    });
    expect(store.listProjects().some((p) => p.name === 'Frostbite 800V Rack v2')).toBe(true);

    // ERP & nullable modal fallback branch
    const erpNew = store.createErpRecord({
      kind: 'order',
      title: 'Tubo Titânio',
      status: 'aberto',
      partyName: 'Fornecedor X',
      segment: 'aeroespacial',
      amountBrl: 3400,
      ownerRole: 'supplier',
    });
    expect(erpNew.vucHash).toMatch(/^VUC-/);
    store.db.prepare('UPDATE erp_records SET modal = NULL WHERE id = ?').run(erpNew.id);
    const listedErp = store.listErpRecords();
    expect(listedErp.find((r) => r.id === erpNew.id)?.modal).toBe('road');

    // Chat (with and without lat/lng, room filter vs all)
    const chatAll = store.appendChatMessage({
      room: 'logistica',
      senderId: uProp.id,
      senderName: 'Operador',
      senderRole: 'logistics',
      isAgent: false,
      content: 'Chegando no hub ferroviário.',
      lat: -23.5,
      lng: -46.6,
    });
    expect(chatAll.lat).toBe(-23.5);
    expect(store.listChatMessages('logistica')).toHaveLength(1);
    expect(store.listChatMessages().length).toBeGreaterThanOrEqual(2);

    // Logistics GPS upsert
    const gps = store.upsertLogisticsNode({
      id: 'gps-test-1',
      driverName: 'Autônomo 99',
      serviceTag: '99',
      modal: 'road',
      lat: -23.1,
      lng: -46.2,
      status: 'em-rota',
      routeLabel: 'Jundiaí -> SP',
      speedKmh: 55,
    });
    expect(gps.serviceTag).toBe('99');
    expect(store.listLogisticsNodes().some((n) => n.id === 'gps-test-1')).toBe(true);

    // Compute nodes (inactive node path)
    store.upsertComputeNode({
      id: 'node-inactive',
      userId: uProp.id,
      label: 'Dormant',
      osName: 'Linux',
      cpuCores: 4,
      gpuName: 'None',
      sharePct: 20,
      tflopsEst: 1,
      active: false,
    });
    expect(store.listComputeNodes().some((n) => n.id === 'node-inactive' && !n.active)).toBe(true);

    // Remote machines dispatch (valid + unknown id)
    expect(store.dispatchRemoteMachineJob('unknown-mach', 'X', 'G01')).toBeNull();
    const dispatched = store.dispatchRemoteMachineJob('mach-lpbf-1', 'Blade LPBF', 'G21\nG01 X10');
    expect(dispatched?.status).toBe('executando');
    expect(store.listRemoteMachines().some((m) => m.id === 'mach-lpbf-1' && m.status === 'executando')).toBe(true);

    // Remote machines upsert (validation, auto-id MQTT enabled QoS 2, explicit id QoS 0, update with defaults)
    expect(() =>
      store.upsertRemoteMachine({
        name: '   ',
        machineType: 'cnc-5axis',
        protocol: 'MQTT',
        endpointUrl: 'mqtt://broker.local:1883/gcode',
      })
    ).toThrow(/obrigatórios/i);
    expect(() =>
      store.upsertRemoteMachine({
        name: 'Fresa MQTT',
        machineType: 'cnc-5axis',
        protocol: 'MQTT',
        endpointUrl: '  ',
      })
    ).toThrow(/obrigatórios/i);

    const createdAuto = store.upsertRemoteMachine({
      name: 'Célula Solda MQTT',
      machineType: 'robot-weld',
      protocol: 'MQTT',
      endpointUrl: 'mqtt://factory.local:1883/parametrix/gcode',
      mqttEnabled: true,
      mqttBrokerUrl: 'mqtt://factory.local:1883',
      mqttTopic: 'parametrix/laser/telemetry',
      mqttQos: 2,
    });
    expect(createdAuto.id).toMatch(/^mach-/);
    expect(createdAuto.mqttEnabled).toBe(true);
    expect(createdAuto.mqttQos).toBe(2);
    expect(createdAuto.mqttTopic).toBe('parametrix/laser/telemetry');

    const createdExplicit = store.upsertRemoteMachine({
      id: 'mach-custom-1',
      name: 'Torno CNC MQTT',
      machineType: 'cnc-5axis',
      protocol: 'HTTP-Moonraker',
      endpointUrl: 'http://lathe.local:7125/gcode',
      mqttEnabled: true,
      mqttBrokerUrl: 'mqtt://lathe.local:1883',
      mqttTopic: 'parametrix/lathe/status',
      mqttQos: 0,
    });
    expect(createdExplicit.id).toBe('mach-custom-1');
    expect(createdExplicit.mqttQos).toBe(0);

    const updatedExplicit = store.upsertRemoteMachine({
      id: 'mach-custom-1',
      name: 'Torno CNC Atualizado',
      machineType: 'cnc-5axis',
      protocol: 'OPC-UA',
      endpointUrl: 'opc.tcp://lathe.local:4840',
      mqttEnabled: false,
    });
    expect(updatedExplicit.id).toBe('mach-custom-1');
    expect(updatedExplicit.name).toBe('Torno CNC Atualizado');
    expect(updatedExplicit.mqttEnabled).toBe(false);
    expect(updatedExplicit.mqttBrokerUrl).toBe('');
    expect(updatedExplicit.mqttTopic).toBe('');
    expect(updatedExplicit.mqttQos).toBe(1);

    // VUC ledger
    expect(store.listVucLedger().length).toBeGreaterThan(0);

    // CAM service jobs: seeded jobs, create (auto ID & explicit ID), and full restart
    expect(store.listCamServiceJobs().length).toBeGreaterThanOrEqual(2);
    const camJobAuto = store.createCamServiceJob({
      title: 'Cold-Plate URL Sync',
      targetCategory: 'datacenter',
      programId: 'dc-coldplate',
      sourceKind: 'url',
      sourceRef: 'https://example.com/coldplate.step',
      filename: 'coldplate.step',
      machineType: 'cnc-5axis',
      postFormat: 'fanuc-nc',
      estimatedMinutes: 18.4,
      cuttingLengthMm: 2950,
      postCodeSnippet: 'G90 G21\nG01 X10 Y10',
      geometrySummary: '190x120x18 mm',
    });
    expect(camJobAuto.status).toBe('executando');

    const camJobExplicit = store.createCamServiceJob({
      id: 'cam-srv-custom-1',
      title: 'Torso Humanoide API',
      targetCategory: 'humanoid',
      programId: 'hum-torso',
      sourceKind: 'api',
      sourceRef: 'api://cam/services',
      filename: 'torso.slm.nc',
      machineType: 'powder-metal',
      postFormat: 'slm-powder',
      estimatedMinutes: 42.0,
      cuttingLengthMm: 6200,
      postCodeSnippet: 'LPBF START',
      geometrySummary: '195x145x56 mm',
    });
    expect(camJobExplicit.id).toBe('cam-srv-custom-1');
    expect(store.restartCamServiceJob('non-existent-cam-job')).toBeNull();
    const restartedCamJob = store.restartCamServiceJob('cam-srv-custom-1');
    expect(restartedCamJob?.status).toBe('reiniciado');
    expect(restartedCamJob?.restartCount).toBe(1);
    expect(restartedCamJob?.progressPct).toBe(0);

    // Reopen second store on same file DB to exercise non-empty seed skip branches
    const reopen = new ParametrixSqliteStore(fileDbPath);
    expect(reopen.listErpRecords().length).toBeGreaterThanOrEqual(4);
    reopen.db.close();
    store.db.close();

    // Legacy remote_machines schema migration (missing mqtt_* columns)
    const legacyDbPath = path.join(tmpDir, 'legacy.sqlite');
    const legacyRawDb = new DatabaseSync(legacyDbPath);
    legacyRawDb.exec(`
      CREATE TABLE remote_machines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        machine_type TEXT NOT NULL,
        protocol TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        status TEXT NOT NULL,
        last_job_vuc TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        is_agent INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        lat REAL,
        lng REAL,
        vuc_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    legacyRawDb.close();
    const migratedStore = new ParametrixSqliteStore(legacyDbPath);
    expect(migratedStore.listRemoteMachines()).toHaveLength(4);

    // Exercise isRegisteredUser, updateRemoteMachineProbe, saveProductionSessionLog & listProductionSessionLogs
    expect(migratedStore.isRegisteredUser('unknown-user', 'unknown@none')).toBe(false);
    expect(migratedStore.isRegisteredUser()).toBe(false);
    const registeredUser = migratedStore.loginOrRegister({
      email: 'registrado@parametrix.local',
      displayName: 'Registrado Chat',
      provider: 'email',
      offlineMode: false,
    });
    expect(migratedStore.isRegisteredUser(registeredUser.id)).toBe(true);
    expect(migratedStore.isRegisteredUser('other-id', 'registrado@parametrix.local')).toBe(true);

    const chatWithUrl = migratedStore.appendChatMessage({
      room: 'cam-cnc',
      theme: 'cam-cnc',
      senderId: registeredUser.id,
      senderEmail: 'registrado@parametrix.local',
      senderName: registeredUser.displayName,
      senderRole: 'client',
      isAgent: false,
      content: 'Processo anexado',
      processUrl: 'https://parametrix.app/?tab=cam&process=powder-metal',
    });
    expect(chatWithUrl.processUrl).toContain('powder-metal');
    expect(
      migratedStore.listChatMessages('cam-cnc').some((m) => m.senderEmail === 'registrado@parametrix.local')
    ).toBe(true);
    migratedStore.db.prepare("UPDATE chat_messages SET theme = '' WHERE id = ?").run(chatWithUrl.id);
    expect(migratedStore.listChatMessages('cam-cnc').find((m) => m.id === chatWithUrl.id)?.theme).toBe(
      'cam-cnc'
    );

    expect(
      migratedStore.updateRemoteMachineProbe('missing-mach', {
        status: 'offline',
        latencyMs: 5,
        detail: 'Not found',
      })
    ).toBeNull();
    const probedMach = migratedStore.upsertRemoteMachine({
      id: 'mach-probe-1',
      name: 'Laser Corte',
      machineType: 'laser-cut',
      protocol: 'GRBL-Serial-WS',
      endpointUrl: 'ws://laser.local:81',
      assignedProgramId: 'dc-manifold',
      mqttEnabled: false,
    });
    expect(probedMach.status).toBe('standby');
    const updatedProbeWithProg = migratedStore.updateRemoteMachineProbe('mach-probe-1', {
      status: 'online',
      latencyMs: 12,
      detail: 'TCP conectado',
      assignedProgramId: 'dc-coldplate',
    });
    expect(updatedProbeWithProg?.assignedProgramId).toBe('dc-coldplate');
    expect(updatedProbeWithProg?.lastProbeLatencyMs).toBe(12);
    const updatedProbeKeepProg = migratedStore.updateRemoteMachineProbe('mach-probe-1', {
      status: 'offline',
      latencyMs: 2500,
      detail: 'Timeout TCP',
    });
    expect(updatedProbeKeepProg?.assignedProgramId).toBe('dc-coldplate');

    const machEmptyProg = migratedStore.upsertRemoteMachine({
      id: 'mach-probe-2',
      name: 'CNC Empty Prog',
      machineType: 'cnc-3axis',
      protocol: 'HTTP-Moonraker',
      endpointUrl: 'http://cnc3.local:7125',
    });
    const probeEmptyProg = migratedStore.updateRemoteMachineProbe(machEmptyProg.id, {
      status: 'offline',
      latencyMs: 10,
      detail: 'Offline',
    });
    expect(probeEmptyProg?.assignedProgramId).toBeUndefined();

    migratedStore.saveProductionSessionLog({
      id: 'sess-demo-1',
      sessionId: 'demo-1',
      userId: registeredUser.id,
      poHumano: 'Registrado Chat (@registradochat)',
      llmAgent: 'gemini',
      delegatedByPo: true,
      activeTab: 'cam',
      processMachine: 'powder-metal',
      processUrl: 'https://parametrix.app/?tab=cam',
      pointerCount: 4,
      actionCount: 2,
      durationSec: 12,
      hotzoneLabel: 'Q[1,1]',
      heatmap: [{ col: 1, row: 1, count: 4 }],
      events: [],
      insights: [{ code: 'OK', severity: 'info', recommendation: 'Nominal' }],
      vucHash: 'VUC-ABCD',
      createdAt: '2026-11-23T12:00:00.000Z',
    });
    migratedStore.saveProductionSessionLog({
      id: 'sess-demo-2',
      sessionId: 'demo-2',
      userId: registeredUser.id,
      poHumano: 'Registrado Chat (@registradochat)',
      llmAgent: 'gemini',
      delegatedByPo: false,
      activeTab: 'viewport',
      processMachine: 'cnc-5axis',
      processUrl: 'https://parametrix.app/?tab=viewport',
      pointerCount: 0,
      actionCount: 0,
      durationSec: 0,
      hotzoneLabel: 'Sem movimento registrado',
      heatmap: [],
      events: [],
      insights: [],
      vucHash: 'VUC-EF01',
      createdAt: '2026-11-23T12:01:00.000Z',
    });
    expect(migratedStore.listProductionSessionLogs()).toHaveLength(2);

    migratedStore.db.close();

    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Also verify :memory: and default data/parametrix.sqlite constructor branches
    const prevEnv = process.env.PARAMETRIX_DB_PATH;
    process.env.PARAMETRIX_DB_PATH = ':memory:';
    const memStore = new ParametrixSqliteStore();
    expect(memStore.listRemoteMachines()).toHaveLength(4);
    memStore.db.close();

    delete process.env.PARAMETRIX_DB_PATH;
    const defaultStore = new ParametrixSqliteStore();
    expect(defaultStore.listRemoteMachines()).toHaveLength(4);
    defaultStore.db.close();
    if (prevEnv !== undefined) process.env.PARAMETRIX_DB_PATH = prevEnv;
  });
});
