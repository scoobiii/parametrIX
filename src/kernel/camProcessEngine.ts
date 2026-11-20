import type {
  CamProcessVisualState,
  CamSettings,
  CamToolChangeEvent,
  MachineType,
  ToolpathResult,
} from '../types/cad';
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
  toolpath: ToolpathResult
): CamToolChangeEvent[] {
  const rpm = toolpath.spindleRpm;

  if (machineType === 'powder-metal') {
    return [
      {
        atProgress: 0,
        toolNumber: 'T10',
        toolName: 'Lâmina Recoater Pó Ti/Al',
        toolKind: 'powder-recoater',
        operationLabel: 'Espalhamento de Camada de Pó Metálico (30 µm)',
        rpmOrPowerLabel: '40 mm/s · Argônio',
      },
      {
        atProgress: 0.25,
        toolNumber: 'T11',
        toolName: 'Cabeçote Laser Fibra Yb 400W',
        toolKind: 'laser-head',
        operationLabel: 'Fusão Seletiva do Contorno em Pó Metálico',
        rpmOrPowerLabel: '400 W · Spot 80 µm',
      },
      {
        atProgress: 0.72,
        toolNumber: 'T12',
        toolName: 'Varredor Pós-Fusão + Alívio Térmico',
        toolKind: 'powder-recoater',
        operationLabel: 'Sinterização de Pele & Limpeza de Pó Residual',
        rpmOrPowerLabel: '220 W · Raio 1070 nm',
      },
    ];
  }

  if (machineType === 'resin-sla') {
    return [
      {
        atProgress: 0,
        toolNumber: 'T20',
        toolName: 'Limpador Nivelador Cuba Resina',
        toolKind: 'powder-recoater',
        operationLabel: 'Nivelamento Fotopolímero Líquido (25 µm)',
        rpmOrPowerLabel: 'Resina Engenharia 405nm',
      },
      {
        atProgress: 0.22,
        toolNumber: 'T21',
        toolName: 'Projetor Galvo UV 405 nm',
        toolKind: 'uv-projector',
        operationLabel: 'Cura a Laser UV da Casca & Nervuras Internas',
        rpmOrPowerLabel: '350 mW · UV 405 nm',
      },
      {
        atProgress: 0.78,
        toolNumber: 'T22',
        toolName: 'Feixe UV Acabamento Superficial',
        toolKind: 'uv-projector',
        operationLabel: 'Polimerização Final de Alta Definição',
        rpmOrPowerLabel: '180 mW · Micro-Passo',
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
  const toolChanges = buildToolChangeSequence(settings.machineType, toolpath);

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
      }
    ),
  };
}
