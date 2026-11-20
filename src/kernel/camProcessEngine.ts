import type {
  CamProcessVisualState,
  CamSettings,
  CamToolChangeEvent,
  MachineType,
  ToolpathResult,
} from '../types/cad';
import { resolveAdditiveSettings } from './camRobotics';
import { buildVucExecutionProof } from './vucHash';

export const PROCESS_LABELS: Record<MachineType, string> = {
  manual: 'Usinagem Manual / DRO',
  'cnc-3axis': 'Fresadora CNC 3-Eixos',
  'cnc-5axis': 'Centro CNC 5-Eixos Simultâneo',
  'robot-6axis': 'Robô Industrial KUKA 6-Eixos',
  'powder-metal': 'Impressão 3D Pó Metálico (LPBF / Sinterização Laser)',
  'resin-sla': 'Impressão 3D Resina UV (SLA / DLP Fotopolimerização)',
  'robot-weld': 'Robô Soldador MIG/TIG (Fio & Arco Elétrico Visíveis)',
  'laser-cut': 'Corte / Sinterização Laser 4 kW (Raio & Rota Visíveis)',
};

export function buildToolChangeSequence(
  machineType: MachineType,
  toolpath: ToolpathResult,
  settings?: CamSettings
): CamToolChangeEvent[] {
  const rpm = toolpath.spindleRpm;

  if (machineType === 'powder-metal') {
    const addCfg = resolveAdditiveSettings({
      machineType,
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 24,
      stepdownMm: 2,
      stockMarginMm: 0.2,
      safeZMm: 25,
      cutSpeedMultiplier: 1,
      postFormat: 'slm-powder',
      additiveConfig: settings?.additiveConfig,
    });
    const supLabel = `${addCfg.supportPattern} ${addCfg.supportDensityPct}%`;
    return [
      {
        atProgress: 0,
        toolNumber: 'T10',
        toolName: 'Lâmina Recoater Pó Ti/Al',
        toolKind: 'powder-recoater',
        operationLabel: `Espalhamento Pó (${addCfg.layerThicknessUm} µm) · Suporte ${supLabel}`,
        rpmOrPowerLabel: `${addCfg.atmosphere} · Recoater`,
      },
      {
        atProgress: 0.25,
        toolNumber: 'T11',
        toolName: `Cabeçote Laser Fibra Yb ${addCfg.sinterLaserPowerW}W`,
        toolKind: 'laser-head',
        operationLabel: `Fusão Seletiva Contorno & Suportes (${addCfg.hatchSpacingMm} mm)`,
        rpmOrPowerLabel: `${addCfg.sinterLaserPowerW} W · ${addCfg.sinterScanSpeedMmS} mm/s`,
      },
      {
        atProgress: 0.72,
        toolNumber: 'T12',
        toolName: `Sinterização Térmica & Pós-Fusão (${addCfg.sinterTempC}°C)`,
        toolKind: 'powder-recoater',
        operationLabel: `Ciclo Sinterização ${addCfg.sinterTempC}°C (${addCfg.sinterHoldMinutes} min)`,
        rpmOrPowerLabel: `${Math.round(addCfg.sinterLaserPowerW * 0.55)} W · Alívio Térmico`,
      },
    ];
  }

  if (machineType === 'resin-sla') {
    const addCfg = resolveAdditiveSettings({
      machineType,
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 24,
      stepdownMm: 2,
      stockMarginMm: 0.2,
      safeZMm: 25,
      cutSpeedMultiplier: 1,
      postFormat: 'sla-resin',
      additiveConfig: settings?.additiveConfig,
    });
    const uvMw = Math.round(addCfg.sinterLaserPowerW * 1000);
    const supLabel = `${addCfg.supportPattern} ${addCfg.supportDensityPct}%`;
    return [
      {
        atProgress: 0,
        toolNumber: 'T20',
        toolName: 'Limpador Nivelador Cuba Resina',
        toolKind: 'powder-recoater',
        operationLabel: `Nivelamento Resina (${addCfg.layerThicknessUm} µm) · Suporte ${supLabel}`,
        rpmOrPowerLabel: 'Fotopolímero UV 405nm',
      },
      {
        atProgress: 0.22,
        toolNumber: 'T21',
        toolName: `Projetor Galvo UV ${uvMw} mW`,
        toolKind: 'uv-projector',
        operationLabel: `Cura UV Casca & Suportes (${addCfg.hatchSpacingMm} mm)`,
        rpmOrPowerLabel: `${uvMw} mW · ${addCfg.sinterScanSpeedMmS} mm/s`,
      },
      {
        atProgress: 0.78,
        toolNumber: 'T22',
        toolName: `Pós-Cura UV + Térmica (${addCfg.sinterTempC}°C)`,
        toolKind: 'uv-projector',
        operationLabel: `Polimerização Final ${addCfg.sinterTempC}°C (${addCfg.sinterHoldMinutes} min)`,
        rpmOrPowerLabel: `${Math.round(uvMw * 0.5)} mW · Micro-Passo`,
      },
    ];
  }

  if (machineType === 'robot-weld') {
    return [
      {
        atProgress: 0,
        toolNumber: 'T30',
        toolName: 'Sensor Óptico de Junta',
        toolKind: 'probe',
        operationLabel: 'Rastreamento de Costura & Ponto de Ignição',
        rpmOrPowerLabel: '0 A · Scan Laser',
      },
      {
        atProgress: 0.18,
        toolNumber: 'T31',
        toolName: 'Tocha Solda MIG/MAG Arame Ø1.0mm',
        toolKind: 'weld-torch',
        operationLabel: 'Deposição de Cordão com Fio Contínuo & Gás',
        rpmOrPowerLabel: '195 A · 23.5 V · Ar+CO₂',
      },
      {
        atProgress: 0.75,
        toolNumber: 'T32',
        toolName: 'Tocha TIG Pulsado Acabamento',
        toolKind: 'weld-torch',
        operationLabel: 'Refusão TIG de Acabamento Estrutural',
        rpmOrPowerLabel: '130 A · Pulsado 4 Hz',
      },
    ];
  }

  if (machineType === 'laser-cut') {
    return [
      {
        atProgress: 0,
        toolNumber: 'T40',
        toolName: 'Bocal Laser Fibra Piercing',
        toolKind: 'laser-head',
        operationLabel: 'Perfuração Inicial & Alinhamento Óptico',
        rpmOrPowerLabel: '1.8 kW · N₂ Assist.',
      },
      {
        atProgress: 0.2,
        toolNumber: 'T41',
        toolName: 'Cabeçote Laser Alta Potência 4 kW',
        toolKind: 'laser-head',
        operationLabel: 'Corte / Gravação Contínua com Feixe Coerente',
        rpmOrPowerLabel: '4.0 kW · 8500 mm/min',
      },
    ];
  }

  return [
    {
      atProgress: 0,
      toolNumber: 'T01',
      toolName: 'Apalpador Renishaw / Zeramento G54',
      toolKind: 'probe',
      operationLabel: 'Calibração de Origem & Planicidade do Bloco',
      rpmOrPowerLabel: '0 RPM · Apalpagem',
    },
    {
      atProgress: 0.14,
      toolNumber: 'T02',
      toolName: 'Fresa Topo Plano Ø12mm Desbaste',
      toolKind: 'milling',
      operationLabel: 'Remoção de Volume Bruto (Desbaste Rápido)',
      rpmOrPowerLabel: `${Math.round(rpm * 0.85)} RPM`,
    },
    {
      atProgress: 0.56,
      toolNumber: 'T03',
      toolName: 'Fresa Esférica Ø8mm NURBS Acabamento',
      toolKind: 'ball',
      operationLabel: 'Troca ATC: Acabamento Isoparamétrico 3D',
      rpmOrPowerLabel: `${rpm} RPM`,
    },
  ];
}

export function evaluateCamProcessVisualState(
  settings: CamSettings,
  toolpath: ToolpathResult,
  progress: number,
  restartCount: number
): CamProcessVisualState {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const toolChanges = buildToolChangeSequence(settings.machineType, toolpath, settings);

  let activeToolEvent = toolChanges[0];
  for (const evt of toolChanges) {
    if (clampedProgress >= evt.atProgress) {
      activeToolEvent = evt;
    }
  }

  const processLabel = PROCESS_LABELS[settings.machineType];
  const showLaserRay =
    activeToolEvent.toolKind === 'laser-head' ||
    settings.machineType === 'laser-cut' ||
    (settings.machineType === 'powder-metal' && clampedProgress >= 0.25);
  const showWeldWireAndArc =
    settings.machineType === 'robot-weld' && activeToolEvent.toolKind === 'weld-torch';
  const showPowderCone =
    settings.machineType === 'powder-metal' &&
    activeToolEvent.toolKind === 'powder-recoater';
  const showResinUvBeam =
    settings.machineType === 'resin-sla' && activeToolEvent.toolKind === 'uv-projector';

  return {
    machineType: settings.machineType,
    processLabel,
    activeToolEvent,
    toolChanges,
    showLaserRay,
    showWeldWireAndArc,
    showPowderCone,
    showResinUvBeam,
    restartCount,
    vucProof: buildVucExecutionProof(
      'CAM_PROCESS_EXEC',
      `${processLabel} · ${activeToolEvent.toolNumber} (${Math.round(clampedProgress * 100)}%) · Reinício #${restartCount}`,
      {
        machineType: settings.machineType,
        strategy: settings.strategy,
        toolId: settings.toolId,
        activeToolNumber: activeToolEvent.toolNumber,
        progressPct: Math.round(clampedProgress * 100),
        cuttingLengthMm: toolpath.cuttingLengthMm,
        restartCount,
        additiveSummary: toolpath.additiveSummary ?? null,
      }
    ),
  };
}
