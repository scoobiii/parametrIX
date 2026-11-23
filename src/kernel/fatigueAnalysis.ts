import { buildVucExecutionProof } from './vucHash';
import { MATERIAL_MECHANICAL_SPECS } from './structuralFea';
import type {
  CamServiceJob,
  FeaResult,
  FeaSettings,
  MaterialFinish,
  McpEyeEvent,
  PartEngineeringProfile,
  RemoteMqttTelemetryEvent,
  VucExecutionProof,
  VucLedgerEntry,
} from '../types/cad';

export type CyclicLoadRatio = -1 | 0 | 0.5;

export type FatigueRegime =
  | 'vida-infinita'
  | 'alto-ciclo-hcf'
  | 'baixo-ciclo-lcf'
  | 'critico-imediato';

export interface MaterialFatigueSpec {
  materialFinish: MaterialFinish;
  materialName: string;
  ultimateStrengthMpa: number;
  yieldStrengthMpa: number;
  enduranceLimitMpa: number;
  fatigueStrengthCoeffMpa: number;
  basquinExponent: number;
  surfaceFactorKa: number;
}

export interface TelemetryLoadBlock {
  id: string;
  source: 'mqtt' | 'cam-job' | 'vuc-ledger' | 'mcp-eye';
  label: string;
  timestamp: string;
  cyclesCount: number;
  loadMultiplier: number;
  vucHash: string;
}

export interface ComponentFatigueCycleEstimate {
  elementId: string;
  label: string;
  ifcClass: string;
  peakVonMisesMpa: number;
  stressAmplitudeMpa: number;
  meanStressMpa: number;
  goodmanEquivalentMpa: number;
  utilizationRatio: number;
  expectedCycles: number;
  log10ExpectedCycles: number;
  consumedCyclesFromTelemetry: number;
  minerDamageFraction: number;
  remainingCycles: number;
  remainingLifePct: number;
  regime: FatigueRegime;
}

export interface SnCurveSamplePoint {
  cycles: number;
  log10Cycles: number;
  allowableStressMpa: number;
}

export interface FatigueCycleAnalysisReport {
  generatedAt: string;
  materialSpec: MaterialFatigueSpec;
  loadRatio: CyclicLoadRatio;
  dynamicLoadFactor: number;
  telemetrySourceStatus: 'telemetria-ativa' | 'baseline-sem-historico';
  telemetryRecordCount: number;
  totalTelemetryCycles: number;
  telemetryBlocks: TelemetryLoadBlock[];
  components: ComponentFatigueCycleEstimate[];
  criticalComponent: ComponentFatigueCycleEstimate;
  minExpectedCycles: number;
  maxMinerDamageFraction: number;
  fleetAverageRemainingLifePct: number;
  overallRegime: FatigueRegime;
  snCurve: SnCurveSamplePoint[];
  vucProof: VucExecutionProof;
}

export const INFINITE_FATIGUE_CAP_CYCLES = 1e8;
export const HCF_TRANSITION_CYCLES = 1e7;

export const MATERIAL_FATIGUE_SPECS: Record<MaterialFinish, MaterialFatigueSpec> = {
  aluminum: {
    materialFinish: 'aluminum',
    materialName: MATERIAL_MECHANICAL_SPECS.aluminum.name,
    ultimateStrengthMpa: 345,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS.aluminum.yieldStrengthMpa,
    enduranceLimitMpa: 138,
    fatigueStrengthCoeffMpa: 640,
    basquinExponent: -0.095,
    surfaceFactorKa: 0.9,
  },
  titanium: {
    materialFinish: 'titanium',
    materialName: MATERIAL_MECHANICAL_SPECS.titanium.name,
    ultimateStrengthMpa: 950,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS.titanium.yieldStrengthMpa,
    enduranceLimitMpa: 475,
    fatigueStrengthCoeffMpa: 1680,
    basquinExponent: -0.082,
    surfaceFactorKa: 0.92,
  },
  'carbon-fiber': {
    materialFinish: 'carbon-fiber',
    materialName: MATERIAL_MECHANICAL_SPECS['carbon-fiber'].name,
    ultimateStrengthMpa: 720,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS['carbon-fiber'].yieldStrengthMpa,
    enduranceLimitMpa: 380,
    fatigueStrengthCoeffMpa: 1050,
    basquinExponent: -0.062,
    surfaceFactorKa: 0.94,
  },
  'matte-plastic': {
    materialFinish: 'matte-plastic',
    materialName: MATERIAL_MECHANICAL_SPECS['matte-plastic'].name,
    ultimateStrengthMpa: 48,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS['matte-plastic'].yieldStrengthMpa,
    enduranceLimitMpa: 18,
    fatigueStrengthCoeffMpa: 88,
    basquinExponent: -0.105,
    surfaceFactorKa: 0.85,
  },
  oak: {
    materialFinish: 'oak',
    materialName: MATERIAL_MECHANICAL_SPECS.oak.name,
    ultimateStrengthMpa: 58,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS.oak.yieldStrengthMpa,
    enduranceLimitMpa: 21,
    fatigueStrengthCoeffMpa: 102,
    basquinExponent: -0.098,
    surfaceFactorKa: 0.84,
  },
  glass: {
    materialFinish: 'glass',
    materialName: MATERIAL_MECHANICAL_SPECS.glass.name,
    ultimateStrengthMpa: 140,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS.glass.yieldStrengthMpa,
    enduranceLimitMpa: 45,
    fatigueStrengthCoeffMpa: 245,
    basquinExponent: -0.11,
    surfaceFactorKa: 0.88,
  },
  clay: {
    materialFinish: 'clay',
    materialName: MATERIAL_MECHANICAL_SPECS.clay.name,
    ultimateStrengthMpa: 22,
    yieldStrengthMpa: MATERIAL_MECHANICAL_SPECS.clay.yieldStrengthMpa,
    enduranceLimitMpa: 7.5,
    fatigueStrengthCoeffMpa: 38,
    basquinExponent: -0.125,
    surfaceFactorKa: 0.8,
  },
};

export function classifyFatigueRegime(expectedCycles: number): FatigueRegime {
  if (expectedCycles >= HCF_TRANSITION_CYCLES) return 'vida-infinita';
  if (expectedCycles >= 1e5) return 'alto-ciclo-hcf';
  if (expectedCycles >= 1e3) return 'baixo-ciclo-lcf';
  return 'critico-imediato';
}

export function computeGoodmanAndBasquinLife(
  peakStressMpa: number,
  spec: MaterialFatigueSpec,
  loadRatio: CyclicLoadRatio,
  dynamicLoadFactor: number
): {
  stressAmplitudeMpa: number;
  meanStressMpa: number;
  goodmanEquivalentMpa: number;
  expectedCycles: number;
  log10ExpectedCycles: number;
  regime: FatigueRegime;
} {
  const effectivePeak = Math.max(0.1, peakStressMpa * Math.max(0.5, dynamicLoadFactor));
  const stressAmplitudeMpa = effectivePeak * ((1 - loadRatio) / 2);
  const meanStressMpa = effectivePeak * ((1 + loadRatio) / 2);

  const meanRatio = Math.min(0.95, Math.max(-0.5, meanStressMpa / spec.ultimateStrengthMpa));
  const goodmanEquivalentMpa = stressAmplitudeMpa / Math.max(0.05, 1 - meanRatio);

  const modifiedEndurance = spec.enduranceLimitMpa * spec.surfaceFactorKa;
  let expectedCycles: number;

  if (goodmanEquivalentMpa <= modifiedEndurance * 0.85) {
    expectedCycles = INFINITE_FATIGUE_CAP_CYCLES;
  } else {
    const ratio = goodmanEquivalentMpa / (spec.fatigueStrengthCoeffMpa * spec.surfaceFactorKa);
    const rawCycles = Math.pow(Math.max(1e-6, ratio), 1 / spec.basquinExponent);
    expectedCycles = Math.round(Math.max(100, Math.min(INFINITE_FATIGUE_CAP_CYCLES, rawCycles)));
  }

  return {
    stressAmplitudeMpa: Number(stressAmplitudeMpa.toFixed(2)),
    meanStressMpa: Number(meanStressMpa.toFixed(2)),
    goodmanEquivalentMpa: Number(goodmanEquivalentMpa.toFixed(2)),
    expectedCycles,
    log10ExpectedCycles: Number(Math.log10(Math.max(100, expectedCycles)).toFixed(3)),
    regime: classifyFatigueRegime(expectedCycles),
  };
}

function parseLoadMultiplierHint(text: string, fallback: number): number {
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct > 0 && pct <= 250) {
      return Number(Math.max(0.55, Math.min(1.85, pct / 100)).toFixed(3));
    }
  }
  return fallback;
}

export function extractTelemetryLoadHistory(input: {
  mqttTelemetryFeed?: RemoteMqttTelemetryEvent[];
  camServiceJobs?: CamServiceJob[];
  vucLedger?: VucLedgerEntry[];
  mcpEyeEvents?: McpEyeEvent[];
}): TelemetryLoadBlock[] {
  const blocks: TelemetryLoadBlock[] = [];

  for (const ev of input.mqttTelemetryFeed ?? []) {
    const mult = parseLoadMultiplierHint(ev.payloadSummary, 1.08);
    blocks.push({
      id: `mqtt-${ev.id}`,
      source: 'mqtt',
      label: `MQTT ${ev.machineName} (${ev.topic})`,
      timestamp: ev.timestamp,
      cyclesCount: 1200,
      loadMultiplier: mult,
      vucHash: ev.vucHash,
    });
  }

  for (const job of input.camServiceJobs ?? []) {
    const minutes = Math.max(1, job.estimatedMinutes);
    const cyclesCount = Math.round(minutes * 90 + Math.max(0, job.restartCount) * 350);
    const mult =
      job.machineType === 'cnc-5axis' || job.machineType === 'robot-weld' ? 1.15 : 1.0;
    blocks.push({
      id: `cam-${job.id}`,
      source: 'cam-job',
      label: `CAM ${job.title} (${job.machineType})`,
      timestamp: job.updatedAt,
      cyclesCount,
      loadMultiplier: mult,
      vucHash: job.vucHash,
    });
  }

  for (const entry of input.vucLedger ?? []) {
    const upper = entry.domain.toUpperCase();
    const mult = upper.includes('FEA') || upper.includes('CAE') ? 1.12 : 0.96;
    const cyclesCount = upper.includes('CAM') || upper.includes('REMOTE') ? 950 : 600;
    blocks.push({
      id: `vuc-${entry.vucHash.slice(0, 12)}-${blocks.length}`,
      source: 'vuc-ledger',
      label: `VUC ${entry.domain}`,
      timestamp: entry.createdAt,
      cyclesCount,
      loadMultiplier: mult,
      vucHash: entry.vucHash,
    });
  }

  for (const mcp of input.mcpEyeEvents ?? []) {
    const mult = mcp.direction === 'cam-output' ? 1.06 : 0.92;
    blocks.push({
      id: `mcp-${mcp.id}`,
      source: 'mcp-eye',
      label: `MCP ${mcp.source}: ${mcp.summary.slice(0, 42)}`,
      timestamp: mcp.timestamp,
      cyclesCount: 450,
      loadMultiplier: mult,
      vucHash: mcp.vucHash,
    });
  }

  return blocks.slice(0, 64);
}

export function buildSnCurveSamples(spec: MaterialFatigueSpec): SnCurveSamplePoint[] {
  const exponents = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8];
  const modifiedEndurance = spec.enduranceLimitMpa * spec.surfaceFactorKa;
  return exponents.map((exp) => {
    const cycles = Math.pow(10, exp);
    const basquinStress =
      spec.fatigueStrengthCoeffMpa * spec.surfaceFactorKa * Math.pow(cycles, spec.basquinExponent);
    const allowableStressMpa =
      exp >= 7 ? Math.min(basquinStress, modifiedEndurance) : basquinStress;
    return {
      cycles,
      log10Cycles: exp,
      allowableStressMpa: Number(Math.max(0.5, allowableStressMpa).toFixed(2)),
    };
  });
}

export function evaluateComponentFatigueCycles(params: {
  feaResult: FeaResult;
  feaSettings: FeaSettings;
  materialFinish: MaterialFinish;
  partProfile?: PartEngineeringProfile;
  loadRatio?: CyclicLoadRatio;
  dynamicLoadFactor?: number;
  mqttTelemetryFeed?: RemoteMqttTelemetryEvent[];
  camServiceJobs?: CamServiceJob[];
  vucLedger?: VucLedgerEntry[];
  mcpEyeEvents?: McpEyeEvent[];
}): FatigueCycleAnalysisReport {
  const loadRatio: CyclicLoadRatio = params.loadRatio ?? 0;
  const dynamicLoadFactor = Math.max(0.75, Math.min(2.0, params.dynamicLoadFactor ?? 1.0));
  const effectiveFinish = params.partProfile?.primaryMaterial ?? params.materialFinish;
  const materialSpec = MATERIAL_FATIGUE_SPECS[effectiveFinish];

  const telemetryBlocks = extractTelemetryLoadHistory({
    mqttTelemetryFeed: params.mqttTelemetryFeed,
    camServiceJobs: params.camServiceJobs,
    vucLedger: params.vucLedger,
    mcpEyeEvents: params.mcpEyeEvents,
  });

  const totalTelemetryCycles = telemetryBlocks.reduce((acc, b) => acc + b.cyclesCount, 0);

  const rawElements =
    params.feaResult.elementStresses.length > 0
      ? params.feaResult.elementStresses
      : [
          {
            elementId: 'PRIMARY-SHELL',
            label: `${params.feaResult.isolatedScope} (${params.feaSettings.loadNewtons} N)`,
            ifcClass: 'IfcPlate',
            maxStressMpa: params.feaResult.maxStressMpa,
            utilizationRatio: Number(
              (params.feaResult.maxStressMpa / Math.max(1, params.feaResult.yieldStrengthMpa)).toFixed(3)
            ),
          },
        ];

  const components: ComponentFatigueCycleEstimate[] = rawElements.map((elem) => {
    const nominal = computeGoodmanAndBasquinLife(
      elem.maxStressMpa,
      materialSpec,
      loadRatio,
      dynamicLoadFactor
    );

    let minerDamage = 0;
    for (const block of telemetryBlocks) {
      const blockLife = computeGoodmanAndBasquinLife(
        elem.maxStressMpa,
        materialSpec,
        loadRatio,
        dynamicLoadFactor * block.loadMultiplier
      );
      minerDamage += block.cyclesCount / Math.max(100, blockLife.expectedCycles);
    }

    const clampedDamage = Number(Math.min(1, Math.max(0, minerDamage)).toFixed(6));
    const remainingFraction = Math.max(0, 1 - clampedDamage);
    const remainingCycles = Math.round(nominal.expectedCycles * remainingFraction);
    const remainingLifePct = Number((remainingFraction * 100).toFixed(2));

    return {
      elementId: elem.elementId,
      label: elem.label,
      ifcClass: elem.ifcClass,
      peakVonMisesMpa: Number(elem.maxStressMpa.toFixed(2)),
      stressAmplitudeMpa: nominal.stressAmplitudeMpa,
      meanStressMpa: nominal.meanStressMpa,
      goodmanEquivalentMpa: nominal.goodmanEquivalentMpa,
      utilizationRatio: Number(elem.utilizationRatio.toFixed(3)),
      expectedCycles: nominal.expectedCycles,
      log10ExpectedCycles: nominal.log10ExpectedCycles,
      consumedCyclesFromTelemetry: totalTelemetryCycles,
      minerDamageFraction: clampedDamage,
      remainingCycles,
      remainingLifePct,
      regime: nominal.regime,
    };
  });

  const sortedByLife = [...components].sort((a, b) => a.remainingCycles - b.remainingCycles);
  const criticalComponent = sortedByLife[0];
  const maxMinerDamageFraction = Number(
    Math.max(...components.map((c) => c.minerDamageFraction)).toFixed(6)
  );
  const fleetAverageRemainingLifePct = Number(
    (
      components.reduce((acc, c) => acc + c.remainingLifePct, 0) / Math.max(1, components.length)
    ).toFixed(2)
  );

  const snCurve = buildSnCurveSamples(materialSpec);

  const vucProof = buildVucExecutionProof(
    'SUSTAINABILITY_FATIGUE_MINER',
    `Fadiga S-N/Miner: ${criticalComponent.label} N_f=${criticalComponent.expectedCycles.toExponential(2)} (${totalTelemetryCycles} ciclos telemetria)`,
    {
      materialFinish: effectiveFinish,
      loadRatio,
      dynamicLoadFactor,
      telemetryCount: telemetryBlocks.length,
      totalTelemetryCycles,
      criticalElement: criticalComponent.elementId,
      minExpectedCycles: criticalComponent.expectedCycles,
      maxMinerDamageFraction,
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    materialSpec,
    loadRatio,
    dynamicLoadFactor,
    telemetrySourceStatus: telemetryBlocks.length > 0 ? 'telemetria-ativa' : 'baseline-sem-historico',
    telemetryRecordCount: telemetryBlocks.length,
    totalTelemetryCycles,
    telemetryBlocks,
    components,
    criticalComponent,
    minExpectedCycles: criticalComponent.expectedCycles,
    maxMinerDamageFraction,
    fleetAverageRemainingLifePct,
    overallRegime: criticalComponent.regime,
    snCurve,
    vucProof,
  };
}
