import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROCESS_LABELS,
  buildToolChangeSequence,
  evaluateCamProcessVisualState,
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
  evaluateRackComparison,
} from '../src/kernel/rackFrostbiteEngine';
import { parseVoiceCommand } from '../src/kernel/voiceCommandParser';
import {
  buildVucExecutionProof,
  canonicalSerialize,
  computeDeterministicVucHash,
} from '../src/kernel/vucHash';
import { ParametrixSqliteStore } from '../src/server/sqliteStore';
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

    const powderFuse = evaluateCamProcessVisualState({ ...baseCam, machineType: 'powder-metal' }, tp, 0.5, 2);
    expect(powderFuse.showLaserRay).toBe(true);
    expect(powderFuse.showPowderCone).toBe(false);

    const slaUv = evaluateCamProcessVisualState({ ...baseCam, machineType: 'resin-sla' }, tp, 0.6, 1);
    expect(slaUv.showResinUvBeam).toBe(true);

    const weldArc = evaluateCamProcessVisualState({ ...baseCam, machineType: 'robot-weld' }, tp, 0.5, 3);
    expect(weldArc.showWeldWireAndArc).toBe(true);

    const laserBeam = evaluateCamProcessVisualState({ ...baseCam, machineType: 'laser-cut' }, tp, 0.5, 1);
    expect(laserBeam.showLaserRay).toBe(true);

    const cncFinish = evaluateCamProcessVisualState(baseCam, tp, 0.9, 1);
    expect(cncFinish.activeToolEvent.toolNumber).toBe('T03');
    expect(cncFinish.vucProof.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);
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
    expect(parseVoiceCommand('falar sobre clima amanha').action).toBe('unknown');
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

    // VUC ledger
    expect(store.listVucLedger().length).toBeGreaterThan(0);

    // Reopen second store on same file DB to exercise non-empty seed skip branches
    const reopen = new ParametrixSqliteStore(fileDbPath);
    expect(reopen.listErpRecords().length).toBeGreaterThanOrEqual(4);
    reopen.db.close();
    store.db.close();
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
