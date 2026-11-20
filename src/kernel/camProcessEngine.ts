import type {
  CamProcessVisualState,
  CamProductionProgram,
  CamProgramTargetCategory,
  CamSettings,
  CamToolChangeEvent,
  MachineType,
  ToolpathResult,
} from '../types/cad';
import { getDefaultAdditiveSettings, resolveAdditiveSettings } from './camRobotics';
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

export const CAM_PRODUCTION_PROGRAMS: CamProductionProgram[] = [
  {
    id: 'dc-coldplate',
    title: 'Cold-Plate Micro-Canais Liquid Cooling (Cobre/Al)',
    category: 'datacenter',
    subsystem: 'Refrigeração Líquida Direta no Chip',
    material: 'aluminum',
    machineType: 'cnc-5axis',
    postFormat: 'fanuc-nc',
    strategy: 'isoparm',
    toolId: 'tool-ball-4',
    designParamsPatch: { preset: 'cavity', spanX: 190, spanY: 120, archHeight: 18, thicknessMm: 6.5 },
    estimatedCycleMin: 24.5,
    toleranceSpec: 'ISO 2768-f · Planicidade ±0.03 mm',
    description: 'Usinagem 5-eixos de micro-aletas para trocador térmico direct-to-chip 800VDC.',
  },
  {
    id: 'dc-manifold',
    title: 'Manifold & Engate Rápido Liquid Cooling (LPBF)',
    category: 'datacenter',
    subsystem: 'Distribuição Hidráulica Rack 42U',
    material: 'titanium',
    machineType: 'powder-metal',
    postFormat: 'slm-powder',
    strategy: 'isoparm',
    toolId: 'tool-ball-4',
    designParamsPatch: { preset: 'shell', spanX: 210, spanY: 95, archHeight: 36, thicknessMm: 5.0 },
    additiveConfig: {
      ...getDefaultAdditiveSettings('powder-metal'),
      layerThicknessUm: 40,
      sinterTempC: 1220,
      supportPattern: 'tree-branch',
    },
    estimatedCycleMin: 58.0,
    toleranceSpec: 'ASTM F3001 · Estanqueidade 6 bar',
    description: 'Sinterização LPBF a pó metálico sem costura para coletor liquid cooling de baixa perda de carga.',
  },
  {
    id: 'dc-rack-frame',
    title: 'Chassis Rack 42U & Barramento 800 VDC',
    category: 'datacenter',
    subsystem: 'Infraestrutura Elétrica 1 MW',
    material: 'aluminum',
    machineType: 'laser-cut',
    postFormat: 'laser-g',
    strategy: 'contour',
    toolId: 'tool-flat-12',
    designParamsPatch: { preset: 'diagrid', spanX: 240, spanY: 150, archHeight: 44, thicknessMm: 8.0 },
    estimatedCycleMin: 16.2,
    toleranceSpec: 'ISO 9013 · Corte Laser 4 kW',
    description: 'Corte e gravação laser para colunas estruturais 42U e isolamento dielétrico do barramento 800 VDC.',
  },
  {
    id: 'dc-hvac-cdu',
    title: 'Bloco Trocador CDU Liquid Cooling 1 MW',
    category: 'datacenter',
    subsystem: 'Unidade de Distribuição Térmica (CDU)',
    material: 'aluminum',
    machineType: 'cnc-3axis',
    postFormat: 'fanuc-nc',
    strategy: 'raster',
    toolId: 'tool-flat-12',
    designParamsPatch: { preset: 'cavity', spanX: 220, spanY: 140, archHeight: 48, thicknessMm: 10.0 },
    estimatedCycleMin: 31.0,
    toleranceSpec: 'ASME Y14.5 · Sedes O-Ring H7',
    description: 'Fresagem de câmara pressurizada para bombeamento redundante N+1 do datacenter Frostbite.',
  },
  {
    id: 'dc-frostbite-tile',
    title: 'Interposer & Dissipador Lâmina 7nm Frostbite',
    category: 'datacenter',
    subsystem: 'Nó Computacional Interaction-Net 500MHz',
    material: 'glass',
    machineType: 'cnc-5axis',
    postFormat: 'fanuc-nc',
    strategy: 'isoparm',
    toolId: 'tool-ball-4',
    designParamsPatch: { preset: 'cavity', spanX: 170, spanY: 170, archHeight: 22, thicknessMm: 5.5 },
    estimatedCycleMin: 27.4,
    toleranceSpec: 'Sub-micrométrico · Pré-Silício GDS',
    description: 'Suporte de lâmina e interface térmica para tiles CMOS 7nm sem coerência de cache.',
  },
  {
    id: 'hum-torso',
    title: 'Endoesqueleto Torácico Robô Humanoide (LPBF Ti)',
    category: 'humanoid',
    subsystem: 'Estrutura Central Humanoide DC',
    material: 'titanium',
    machineType: 'powder-metal',
    postFormat: 'slm-powder',
    strategy: 'isoparm',
    toolId: 'tool-ball-8',
    designParamsPatch: { preset: 'diagrid', spanX: 195, spanY: 145, archHeight: 56, thicknessMm: 5.8 },
    additiveConfig: {
      ...getDefaultAdditiveSettings('powder-metal'),
      layerThicknessUm: 45,
      sinterTempC: 1260,
      atmosphere: 'vacuum',
      supportPattern: 'lattice-grid',
    },
    estimatedCycleMin: 74.0,
    toleranceSpec: 'ISO 10218 · Carga 120 kg',
    description: 'Impressão metálica a pó topológica para tronco leve do humanoide de manutenção em corredores quentes.',
  },
  {
    id: 'hum-actuator',
    title: 'Carcaça Atuador Harmônico de Junta (5-Eixos)',
    category: 'humanoid',
    subsystem: 'Articulação Ombro / Joelho Humanoide',
    material: 'titanium',
    machineType: 'cnc-5axis',
    postFormat: 'fanuc-nc',
    strategy: 'contour',
    toolId: 'tool-ball-8',
    designParamsPatch: { preset: 'impeller', spanX: 135, spanY: 135, archHeight: 42, thicknessMm: 7.0 },
    estimatedCycleMin: 22.8,
    toleranceSpec: 'IT6 · Concentricidade ≤ 0.015 mm',
    description: 'Usinagem simultânea 5-eixos para alojamento de redutor harmônico e estator BLDC.',
  },
  {
    id: 'hum-visor-head',
    title: 'Cabeça Sensorial Visão Stereo + LiDAR (Resina SLA)',
    category: 'humanoid',
    subsystem: 'Percepção & Navegação Autônoma',
    material: 'glass',
    machineType: 'resin-sla',
    postFormat: 'sla-resin',
    strategy: 'contour',
    toolId: 'tool-ball-4',
    designParamsPatch: { preset: 'shell', spanX: 145, spanY: 120, archHeight: 48, thicknessMm: 3.6 },
    additiveConfig: {
      ...getDefaultAdditiveSettings('resin-sla'),
      layerThicknessUm: 35,
      sinterTempC: 65,
      supportPattern: 'tree-branch',
    },
    estimatedCycleMin: 42.0,
    toleranceSpec: 'SLA 405nm · 35 µm Alta Resolução',
    description: 'Carena óptica SLA dielétrica para sensores térmicos IR e leitura de QR/estado em racks.',
  },
  {
    id: 'hum-hand-effector',
    title: 'Efetuador Bimanual Quick-Disconnect Liquid Cooling',
    category: 'humanoid',
    subsystem: 'Ferramenta de Troca Hot-Swap em Servidor',
    material: 'carbon-fiber',
    machineType: 'powder-metal',
    postFormat: 'slm-powder',
    strategy: 'isoparm',
    toolId: 'tool-ball-4',
    designParamsPatch: { preset: 'cavity', spanX: 160, spanY: 110, archHeight: 32, thicknessMm: 4.5 },
    additiveConfig: {
      ...getDefaultAdditiveSettings('powder-metal'),
      layerThicknessUm: 30,
      sinterTempC: 1180,
      atmosphere: 'nitrogen',
      supportPattern: 'linear-fin',
    },
    estimatedCycleMin: 39.5,
    toleranceSpec: 'Sem Faísca · Isolado 1000 VDC',
    description: 'Garra bimanual para acoplar/desacoplar válvulas de fluido refrigerante e gavetas de servidor sem parada.',
  },
];

export function listCamProductionPrograms(
  category?: CamProgramTargetCategory
): CamProductionProgram[] {
  if (!category) return CAM_PRODUCTION_PROGRAMS;
  return CAM_PRODUCTION_PROGRAMS.filter((p) => p.category === category);
}

export function getCamProductionProgram(programId: string): CamProductionProgram | undefined {
  return CAM_PRODUCTION_PROGRAMS.find((p) => p.id === programId);
}
