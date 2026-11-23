import { describe, expect, it } from 'vitest';
import {
  buildSnCurveSamples,
  classifyFatigueRegime,
  computeGoodmanAndBasquinLife,
  evaluateComponentFatigueCycles,
  extractTelemetryLoadHistory,
  INFINITE_FATIGUE_CAP_CYCLES,
  MATERIAL_FATIGUE_SPECS,
} from '../src/kernel/fatigueAnalysis';
import type {
  CamServiceJob,
  FeaResult,
  FeaSettings,
  McpEyeEvent,
  PartEngineeringProfile,
  RemoteMqttTelemetryEvent,
  VucLedgerEntry,
} from '../src/types/cad';

function makeFeaResult(overrides: Partial<FeaResult> = {}): FeaResult {
  return {
    materialName: 'Alumínio Aeroespacial 6061/7075-T6',
    yieldStrengthMpa: 310,
    youngsModulusGpa: 71,
    loadNewtons: 2500,
    supportMode: 'edge-clamped',
    loadPattern: 'uniform-pressure',
    isolatedScope: 'all',
    vertexStressesMpa: new Float32Array([80, 140, 210]),
    stressColors: new Float32Array(9),
    maxStressMpa: 210,
    meanStressMpa: 143,
    minStressMpa: 80,
    maxDeflectionMm: 0.42,
    safetyFactor: 1.48,
    totalMassKg: 1.25,
    stiffnessToMass: 120,
    criticalLocationMm: [0, 0, 10],
    elementStresses: [
      {
        elementId: 'RIB-U1',
        label: 'Nervura U1',
        ifcClass: 'IfcBeam',
        maxStressMpa: 210,
        utilizationRatio: 0.677,
      },
      {
        elementId: 'SKIN-01',
        label: 'Casca Principal',
        ifcClass: 'IfcPlate',
        maxStressMpa: 65,
        utilizationRatio: 0.21,
      },
    ],
    status: 'seguro',
    timestamp: '2026-11-23T10:00:00.000Z',
    ...overrides,
  };
}

const BASE_FEA_SETTINGS: FeaSettings = {
  loadNewtons: 2500,
  supportMode: 'edge-clamped',
  loadPattern: 'uniform-pressure',
  targetSafetyFactor: 2.0,
};

describe('fatigueAnalysis kernel (Basquin S-N + Goodman + Palmgren-Miner)', () => {
  it('classifies all four fatigue regimes deterministically', () => {
    expect(classifyFatigueRegime(1e7)).toBe('vida-infinita');
    expect(classifyFatigueRegime(5e5)).toBe('alto-ciclo-hcf');
    expect(classifyFatigueRegime(2500)).toBe('baixo-ciclo-lcf');
    expect(classifyFatigueRegime(420)).toBe('critico-imediato');
  });

  it('computes Basquin infinite-life cap below modified endurance limit and finite life above it', () => {
    const alu = MATERIAL_FATIGUE_SPECS.aluminum;
    const lowStress = computeGoodmanAndBasquinLife(55, alu, -1, 1.0);
    expect(lowStress.expectedCycles).toBe(INFINITE_FATIGUE_CAP_CYCLES);
    expect(lowStress.regime).toBe('vida-infinita');

    const highStress = computeGoodmanAndBasquinLife(295, alu, 0.5, 1.25);
    expect(highStress.expectedCycles).toBeLessThan(1e5);
    expect(highStress.goodmanEquivalentMpa).toBeGreaterThan(highStress.stressAmplitudeMpa);

    const reversedHigh = computeGoodmanAndBasquinLife(290, alu, -1, 1.0);
    expect(reversedHigh.meanStressMpa).toBe(0);
    expect(reversedHigh.expectedCycles).toBeLessThan(INFINITE_FATIGUE_CAP_CYCLES);
  });

  it('extracts telemetry blocks cleanly from MQTT, CAM jobs, VUC ledger, and MCP eye events (including empty input)', () => {
    expect(extractTelemetryLoadHistory({})).toEqual([]);

    const mqtt: RemoteMqttTelemetryEvent[] = [
      {
        id: 'm1',
        machineId: 'cnc-1',
        machineName: 'DMG 5-Axis',
        brokerUrl: 'mqtt://broker:1883',
        topic: 'cnc/spindle/load',
        qos: 1,
        payloadSummary: 'Spindle load 120% peak torque',
        vucHash: 'VUC-MQTT-1',
        timestamp: '2026-11-23T09:00:00Z',
      },
      {
        id: 'm2',
        machineId: 'cnc-2',
        machineName: 'GRBL Router',
        brokerUrl: 'mqtt://broker:1883',
        topic: 'cnc/idle',
        qos: 0,
        payloadSummary: 'Load nominal sin porcentaje',
        vucHash: 'VUC-MQTT-2',
        timestamp: '2026-11-23T09:05:00Z',
      },
      {
        id: 'm3',
        machineId: 'cnc-3',
        machineName: 'Out-of-range test',
        brokerUrl: 'mqtt://broker:1883',
        topic: 'cnc/spike',
        qos: 0,
        payloadSummary: 'Spike 320% ignored',
        vucHash: 'VUC-MQTT-3',
        timestamp: '2026-11-23T09:06:00Z',
      },
    ];

    const camJobs: CamServiceJob[] = [
      {
        id: 'j1',
        title: 'Impeller Roughing',
        targetCategory: 'datacenter',
        programId: 'p1',
        sourceKind: 'catalog',
        sourceRef: 'local',
        filename: 'impeller.stp',
        machineType: 'cnc-5axis',
        postFormat: 'fanuc-nc',
        status: 'concluido',
        progressPct: 100,
        restartCount: 2,
        estimatedMinutes: 12,
        cuttingLengthMm: 4200,
        postCodeSnippet: 'G01 X10',
        geometrySummary: 'N=24',
        vucHash: 'VUC-CAM-1',
        createdAt: '2026-11-23T09:10:00Z',
        updatedAt: '2026-11-23T09:22:00Z',
      },
      {
        id: 'j2',
        title: 'Bracket 3-Axis',
        targetCategory: 'humanoid',
        programId: 'p2',
        sourceKind: 'catalog',
        sourceRef: 'local',
        filename: 'bracket.stp',
        machineType: 'cnc-3axis',
        postFormat: 'grbl-gcode',
        status: 'executando',
        progressPct: 50,
        restartCount: 0,
        estimatedMinutes: 5,
        cuttingLengthMm: 900,
        postCodeSnippet: 'G01 Y5',
        geometrySummary: 'N=10',
        vucHash: 'VUC-CAM-2',
        createdAt: '2026-11-23T09:25:00Z',
        updatedAt: '2026-11-23T09:30:00Z',
      },
    ];

    const vucLedger: VucLedgerEntry[] = [
      {
        vucHash: 'VUC-FEA-000111222',
        domain: 'CAE_FEA_CHECK',
        summary: 'Structural verification',
        payloadJson: '{}',
        sha256Hex: 'a'.repeat(64),
        createdAt: '2026-11-23T09:31:00Z',
      },
      {
        vucHash: 'VUC-REMOTE-000111222',
        domain: 'REMOTE_EXEC_DISPATCH',
        summary: 'Remote CAM dispatch',
        payloadJson: '{}',
        sha256Hex: 'b'.repeat(64),
        createdAt: '2026-11-23T09:32:00Z',
      },
      {
        vucHash: 'VUC-CAD-000111222',
        domain: 'CAD_NURBS_SYNC',
        summary: 'NURBS build',
        payloadJson: '{}',
        sha256Hex: 'c'.repeat(64),
        createdAt: '2026-11-23T09:33:00Z',
      },
    ];

    const mcpEvents: McpEyeEvent[] = [
      {
        id: 'e1',
        direction: 'cam-output',
        source: 'CAM Engine',
        summary: 'G-Code emitido para usinagem 5 eixos',
        payloadPreview: '{}',
        vucHash: 'VUC-MCP-1',
        timestamp: '2026-11-23T09:40:00Z',
      },
      {
        id: 'e2',
        direction: 'viewport-action',
        source: 'Viewport3D',
        summary: 'Heatmap Von Mises ativado',
        payloadPreview: '{}',
        vucHash: 'VUC-MCP-2',
        timestamp: '2026-11-23T09:41:00Z',
      },
    ];

    const blocks = extractTelemetryLoadHistory({
      mqttTelemetryFeed: mqtt,
      camServiceJobs: camJobs,
      vucLedger,
      mcpEyeEvents: mcpEvents,
    });

    expect(blocks).toHaveLength(10);
    expect(blocks[0].loadMultiplier).toBe(1.2);
    expect(blocks[1].loadMultiplier).toBe(1.08);
    expect(blocks[2].loadMultiplier).toBe(1.08);
    expect(blocks[3].loadMultiplier).toBe(1.15);
    expect(blocks[4].loadMultiplier).toBe(1.0);
    expect(blocks[5].loadMultiplier).toBe(1.12);
    expect(blocks[6].cyclesCount).toBe(950);
    expect(blocks[7].loadMultiplier).toBe(0.96);
    expect(blocks[8].loadMultiplier).toBe(1.06);
    expect(blocks[9].loadMultiplier).toBe(0.92);
  });

  it('builds valid S-N Basquin sample points and evaluates full Miner fatigue report with and without elementStresses or telemetry', () => {
    const curve = buildSnCurveSamples(MATERIAL_FATIGUE_SPECS.titanium);
    expect(curve).toHaveLength(9);
    expect(curve[0].cycles).toBe(100);
    expect(curve[curve.length - 1].allowableStressMpa).toBeLessThan(curve[0].allowableStressMpa);

    const profileOverride: PartEngineeringProfile = {
      partName: 'Braço Robô Titânio',
      manufacturer: 'Parametric Forge',
      modelCode: 'PF-TI-01',
      segment: 'robotica',
      primaryMaterial: 'titanium',
      specifications: [],
      certifications: [],
      intendedUse: 'Atuador cíclico',
      safetyCriteria: {
        recommendedLoadN: 2500,
        supportMode: 'edge-clamped',
        loadPattern: 'uniform-pressure',
        minSafetyFactor: 2.0,
        maxDeflectionMm: 1.0,
        criticalInspectionNote: 'OK',
      },
      detectedFrom: 'test',
    };

    // Baseline without telemetry and without elementStresses (triggers PRIMARY-SHELL fallback)
    const emptyShellReport = evaluateComponentFatigueCycles({
      feaResult: makeFeaResult({ elementStresses: [], maxStressMpa: 120 }),
      feaSettings: BASE_FEA_SETTINGS,
      materialFinish: 'aluminum',
    });
    expect(emptyShellReport.telemetrySourceStatus).toBe('baseline-sem-historico');
    expect(emptyShellReport.components).toHaveLength(1);
    expect(emptyShellReport.components[0].elementId).toBe('PRIMARY-SHELL');
    expect(emptyShellReport.maxMinerDamageFraction).toBe(0);

    // Rich active telemetry + multi-element stresses + partProfile material override
    const richReport = evaluateComponentFatigueCycles({
      feaResult: makeFeaResult(),
      feaSettings: BASE_FEA_SETTINGS,
      materialFinish: 'aluminum',
      partProfile: profileOverride,
      loadRatio: 0,
      dynamicLoadFactor: 1.25,
      mqttTelemetryFeed: [
        {
          id: 'mq-1',
          machineId: 'kuka-1',
          machineName: 'KUKA KR210',
          brokerUrl: 'mqtt://broker:1883',
          topic: 'robot/torque',
          qos: 1,
          payloadSummary: 'Torque 135% pico cíclico',
          vucHash: 'VUC-KUKA-1',
          timestamp: '2026-11-23T10:00:00Z',
        },
      ],
      camServiceJobs: [
        {
          id: 'job-w',
          title: 'Solda Junta',
          targetCategory: 'humanoid',
          programId: 'w1',
          sourceKind: 'catalog',
          sourceRef: 'local',
          filename: 'junta.stp',
          machineType: 'robot-weld',
          postFormat: 'weld-tig-mig',
          status: 'concluido',
          progressPct: 100,
          restartCount: 1,
          estimatedMinutes: 8,
          cuttingLengthMm: 400,
          postCodeSnippet: 'WELD',
          geometrySummary: 'Weld',
          vucHash: 'VUC-WELD-1',
          createdAt: '2026-11-23T10:00:00Z',
          updatedAt: '2026-11-23T10:08:00Z',
        },
      ],
    });

    expect(richReport.telemetrySourceStatus).toBe('telemetria-ativa');
    expect(richReport.materialSpec.materialFinish).toBe('titanium');
    expect(richReport.totalTelemetryCycles).toBe(1200 + 8 * 90 + 350);
    expect(richReport.components).toHaveLength(2);
    expect(richReport.criticalComponent.elementId).toBe('RIB-U1');
    expect(richReport.vucProof.vucHash).toMatch(/^VUC-/);
  });
});
