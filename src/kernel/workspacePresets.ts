import {
  parse3DM,
  parseDXF,
  parseIPTAsync,
  parseOBJ,
  parseSTEPAsync,
  parseSTL,
  parseSVGToCad,
} from './cadFormats';
import { convertImageToCadModel, isRasterImageFilename } from './imageToCad';
import type {
  ApplicationSegment,
  CadFeatureOperation,
  CamSettings,
  DisplayMode,
  FeaSettings,
  ImportedCadModel,
  MaterialFinish,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../types/cad';

export const ACCEPTED_CAD_EXTENSIONS =
  '.stl,.obj,.dxf,.3dm,.step,.stp,.ifc,.ipt,.svg,.png,.jpg,.jpeg,.webp';

/**
 * Parses any uploaded CAD or raster/vector image file into a unified 3D ImportedCadModel.
 */
export async function parseUploadedCadOrImageFile(file: File): Promise<ImportedCadModel> {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (ext === 'stl') {
    return parseSTL(await file.arrayBuffer(), file.name);
  }
  if (ext === 'obj') {
    return parseOBJ(await file.text(), file.name);
  }
  if (ext === 'dxf') {
    return parseDXF(await file.text(), file.name);
  }
  if (ext === '3dm') {
    return parse3DM(await file.arrayBuffer(), file.name);
  }
  if (ext === 'step' || ext === 'stp' || ext === 'ifc') {
    return parseSTEPAsync(await file.arrayBuffer(), file.name, ext === 'ifc' ? 'IFC' : 'STEP');
  }
  if (ext === 'ipt') {
    return parseIPTAsync(await file.arrayBuffer(), file.name);
  }
  if (ext === 'svg') {
    return parseSVGToCad(await file.text(), file.name);
  }
  if (isRasterImageFilename(file.name, file.type)) {
    const { model } = await convertImageToCadModel({
      filename: file.name,
      mimeType: file.type,
      blobOrBuffer: file,
    });
    return model;
  }
  throw new Error(
    `Extensão .${ext || '?'} não suportada. Use STL, OBJ, DXF, 3DM, STEP/STP, IFC, IPT, SVG, PNG, JPG ou WEBP.`
  );
}

export interface FullWorkspacePreset {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  segment: ApplicationSegment;
  graphTemplateId: string;
  designParams: ParametricDesignParams;
  camSettings: CamSettings;
  feaSettings: FeaSettings;
  materialFinish: MaterialFinish;
  displayMode: DisplayMode;
  partProfileOverride?: Partial<PartEngineeringProfile>;
  buildImportedModel?: () => ImportedCadModel;
  initialFeatures?: CadFeatureOperation[];
}

const ROCKSHOX_FORK_ASSEMBLY_OBJ = [
  'o Canela_Esquerda_Lower_Leg_L',
  'v -68 0 -18', 'v -38 0 -18', 'v -38 0 18', 'v -68 0 18',
  'v -68 125 -18', 'v -38 125 -18', 'v -38 125 18', 'v -68 125 18',
  'f 1 2 3 4', 'f 5 8 7 6', 'f 1 5 6 2', 'f 2 6 7 3', 'f 3 7 8 4', 'f 4 8 5 1',
  'o Canela_Direita_Lower_Leg_R',
  'v 38 0 -18', 'v 68 0 -18', 'v 68 0 18', 'v 38 0 18',
  'v 38 125 -18', 'v 68 125 -18', 'v 68 125 18', 'v 38 125 18',
  'f 9 10 11 12', 'f 13 16 15 14', 'f 9 13 14 10', 'f 10 14 15 11', 'f 11 15 16 12', 'f 12 16 13 9',
  'o Coroa_Inferior_CNC',
  'v -72 126 -24', 'v 72 126 -24', 'v 72 126 16', 'v -72 126 16',
  'v -72 142 -24', 'v 72 142 -24', 'v 72 142 16', 'v -72 142 16',
  'f 17 18 19 20', 'f 21 24 23 22', 'f 17 21 22 18', 'f 18 22 23 19', 'f 19 23 24 20', 'f 20 24 21 17',
  'o Bengala_Superior_L',
  'v -64 115 -14', 'v -42 115 -14', 'v -42 115 14', 'v -64 115 14',
  'v -64 235 -14', 'v -42 235 -14', 'v -42 235 14', 'v -64 235 14',
  'f 25 26 27 28', 'f 29 32 31 30', 'f 25 29 30 26', 'f 26 30 31 27', 'f 27 31 32 28', 'f 28 32 29 25',
  'o Bengala_Superior_R',
  'v 42 115 -14', 'v 64 115 -14', 'v 64 115 14', 'v 42 115 14',
  'v 42 235 -14', 'v 64 235 -14', 'v 64 235 14', 'v 42 235 14',
  'f 33 34 35 36', 'f 37 40 39 38', 'f 33 37 38 34', 'f 34 38 39 35', 'f 35 39 40 36', 'f 36 40 37 33',
  'o Coroa_Superior_Forged',
  'v -72 214 -24', 'v 72 214 -24', 'v 72 214 16', 'v -72 214 16',
  'v -72 228 -24', 'v 72 228 -24', 'v 72 228 16', 'v -72 228 16',
  'f 41 42 43 44', 'f 45 48 47 46', 'f 41 45 46 42', 'f 42 46 47 43', 'f 43 47 48 44', 'f 44 48 45 41',
  'o Eixo_Passante_Maxle_20x110',
  'v -74 8 -8', 'v 74 8 -8', 'v 74 8 8', 'v -74 8 8',
  'v -74 22 -8', 'v 74 22 -8', 'v 74 22 8', 'v -74 22 8',
  'f 49 50 51 52', 'f 53 56 55 54', 'f 49 53 54 50', 'f 50 54 55 51', 'f 51 55 56 52', 'f 52 56 53 49',
].join('\n');

const FLANGE_CNC_DXF = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'CIRCLE', '8', 'PERFIL_EXTERNO', '10', '0', '20', '0', '30', '2', '40', '95',
  '0', 'CIRCLE', '8', 'FURO_CENTRAL', '10', '0', '20', '0', '30', '2', '40', '32',
  '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '65', '20', '0', '30', '2', '40', '6',
  '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '-65', '20', '0', '30', '2', '40', '6',
  '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '0', '20', '65', '30', '2', '40', '6',
  '0', 'CIRCLE', '8', 'FURACAO_M8', '10', '0', '20', '-65', '30', '2', '40', '6',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n');

export const WORKSPACE_PROJECT_PRESETS: FullWorkspacePreset[] = [
  {
    id: 'preset-dh-fork',
    title: 'Garfo Downhill Dupla Coroa (Conjunto 3D)',
    badge: 'ISO 4210 · Ciclismo',
    subtitle: 'Preenche conjunto multi-peça, Object Mask, FEA 5400 N, parafusos M6 e CAM 5-eixos.',
    segment: 'ciclismo-mobilidade',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'shell',
      spanX: 165,
      spanY: 115,
      archHeight: 46,
      waveAmplitude: 8,
      twistDeg: 0,
      thicknessMm: 8,
      uDivisions: 32,
      vDivisions: 32,
      ribCountU: 4,
      ribCountV: 3,
      ribHeightMm: 16,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'cnc-5axis',
      strategy: 'contour',
      toolId: 'tool-ball-8',
      stepoverPct: 20,
      stepdownMm: 2.0,
      stockMarginMm: 0.15,
      safeZMm: 30,
      cutSpeedMultiplier: 1.0,
      postFormat: 'fanuc-nc',
    },
    feaSettings: {
      loadNewtons: 5400,
      supportMode: 'four-corner-pins',
      loadPattern: 'torsion-tip',
      targetSafetyFactor: 2.5,
    },
    materialFinish: 'aluminum',
    displayMode: 'component-pbr',
    buildImportedModel: () =>
      parseOBJ(ROCKSHOX_FORK_ASSEMBLY_OBJ, 'RockShox_BoXXer_DH.obj'),
    initialFeatures: [
      {
        id: 'feat-init-m6',
        kind: 'threaded-bolt',
        label: 'Parafuso M6×1.0 Coroa CNC',
        targetComponentId: 'COMP-4',
        point: [36, 132, 16],
        normal: [0, 0, 1],
        widthMm: 10,
        lengthMm: 10,
        diameterMm: 6,
        depthMm: 16,
        threadSpec: 'M6',
        threadPitchMm: 1.0,
        headStyle: 'allen',
        createdAt: 'Preset',
      },
    ],
  },
  {
    id: 'preset-aero-titanium',
    title: 'Pá Helicoidal Ti-6Al-4V (Aeroespacial)',
    badge: 'AS9100 · Titânio',
    subtitle: 'Preenche NURBS helicoidal, FEA 6800 N em engaste, usinagem 5-eixos e prova SCOOBIII.',
    segment: 'aeroespacial',
    graphTemplateId: 'tpl-turbine-5axis',
    designParams: {
      preset: 'impeller',
      spanX: 220,
      spanY: 130,
      archHeight: 58,
      waveAmplitude: 12,
      twistDeg: 42,
      thicknessMm: 7.5,
      uDivisions: 38,
      vDivisions: 30,
      ribCountU: 4,
      ribCountV: 3,
      ribHeightMm: 14,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'cnc-5axis',
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 18,
      stepdownMm: 1.5,
      stockMarginMm: 0.1,
      safeZMm: 28,
      cutSpeedMultiplier: 0.9,
      postFormat: 'fanuc-nc',
    },
    feaSettings: {
      loadNewtons: 6800,
      supportMode: 'cantilever-u',
      loadPattern: 'torsion-tip',
      targetSafetyFactor: 2.2,
    },
    materialFinish: 'titanium',
    displayMode: 'component-pbr',
    partProfileOverride: {
      partName: 'Rotor / Pá Propulsão Ti-6Al-4V (AS9100)',
      manufacturer: 'Parametrix Aero Propulsion',
      modelCode: 'AERO-TI64-R42',
    },
  },
  {
    id: 'preset-cnc-flange',
    title: 'Flange Industrial ISO 2768 + Parafusos M8',
    badge: 'ASME Y14.5 · CNC',
    subtitle: 'Carrega flange DXF com furação M8, rasgo de chaveta paramétrico e plano CNC 3-eixos.',
    segment: 'industrial-cnc',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'cavity',
      spanX: 190,
      spanY: 190,
      archHeight: 28,
      waveAmplitude: 4,
      twistDeg: 0,
      thicknessMm: 12,
      uDivisions: 30,
      vDivisions: 30,
      ribCountU: 3,
      ribCountV: 3,
      ribHeightMm: 12,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'cnc-3axis',
      strategy: 'contour',
      toolId: 'tool-flat-12',
      stepoverPct: 28,
      stepdownMm: 3.0,
      stockMarginMm: 0.2,
      safeZMm: 25,
      cutSpeedMultiplier: 1.1,
      postFormat: 'fanuc-nc',
    },
    feaSettings: {
      loadNewtons: 6500,
      supportMode: 'edge-clamped',
      loadPattern: 'center-point',
      targetSafetyFactor: 2.8,
    },
    materialFinish: 'aluminum',
    displayMode: 'component-pbr',
    buildImportedModel: () => parseDXF(FLANGE_CNC_DXF, 'flange_furo_180mm.dxf'),
    initialFeatures: [
      {
        id: 'feat-flange-slot',
        kind: 'slot-cutout',
        label: 'Rasgo Chaveta 12×28mm',
        targetComponentId: 'COMP-1',
        point: [0, 14, 24],
        normal: [0, 1, 0],
        widthMm: 12,
        lengthMm: 28,
        diameterMm: 12,
        depthMm: 8,
        slotProfile: 'rectangular',
        createdAt: 'Preset',
      },
    ],
  },
  {
    id: 'preset-bim-dome',
    title: 'Cobertura Abóbada + Waffle BIM (NBR 8800)',
    badge: 'ABNT NBR · BIM',
    subtitle: 'Casca NURBS dupla curvatura com grelha IfcBeam/IfcMember, carga 9500 N e Grasshopper.',
    segment: 'arquitetura-bim',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'diagrid',
      spanX: 240,
      spanY: 165,
      archHeight: 62,
      waveAmplitude: 14,
      twistDeg: 8,
      thicknessMm: 8.5,
      uDivisions: 36,
      vDivisions: 36,
      ribCountU: 6,
      ribCountV: 5,
      ribHeightMm: 20,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'cnc-5axis',
      strategy: 'isoparm',
      toolId: 'tool-ball-8',
      stepoverPct: 24,
      stepdownMm: 2.5,
      stockMarginMm: 0.25,
      safeZMm: 30,
      cutSpeedMultiplier: 1.0,
      postFormat: 'fanuc-nc',
    },
    feaSettings: {
      loadNewtons: 9500,
      supportMode: 'edge-clamped',
      loadPattern: 'uniform-pressure',
      targetSafetyFactor: 2.0,
    },
    materialFinish: 'oak',
    displayMode: 'component-pbr',
  },
  {
    id: 'preset-robot-6axis',
    title: 'Efetuador / Molde Robô KUKA 6-Eixos',
    badge: 'ISO 10218 · KRL',
    subtitle: 'Ativa grafo Grasshopper + Plugin Atrator, cinemática inversa 6-eixos e pós-proc KRL.',
    segment: 'robotica',
    graphTemplateId: 'tpl-robot-plugin',
    designParams: {
      preset: 'cavity',
      spanX: 185,
      spanY: 140,
      archHeight: 42,
      waveAmplitude: 10,
      twistDeg: 0,
      thicknessMm: 9,
      uDivisions: 34,
      vDivisions: 34,
      ribCountU: 4,
      ribCountV: 4,
      ribHeightMm: 16,
      attractorStrength: 18,
    },
    camSettings: {
      machineType: 'robot-6axis',
      strategy: 'isoparm',
      toolId: 'tool-robot-spindle',
      stepoverPct: 22,
      stepdownMm: 2.0,
      stockMarginMm: 0.2,
      safeZMm: 35,
      cutSpeedMultiplier: 1.0,
      postFormat: 'kuka-krl',
    },
    feaSettings: {
      loadNewtons: 3600,
      supportMode: 'four-corner-pins',
      loadPattern: 'center-point',
      targetSafetyFactor: 2.3,
    },
    materialFinish: 'carbon-fiber',
    displayMode: 'component-pbr',
  },
  {
    id: 'preset-frostbite-rack',
    title: 'Rack #FrostbiteEngine vs @nvidia (1 MW · 800 VDC HVAC)',
    badge: '7nm CMOS · 800VDC',
    subtitle:
      'Assembly 42U com barramento 800VDC, trocador HVAC líquido e lâminas 7nm Interaction-Net 500MHz (4.6×/W).',
    segment: 'robotica',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'diagrid',
      spanX: 210,
      spanY: 135,
      archHeight: 38,
      waveAmplitude: 6,
      twistDeg: 0,
      thicknessMm: 7.5,
      uDivisions: 32,
      vDivisions: 32,
      ribCountU: 6,
      ribCountV: 4,
      ribHeightMm: 18,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'robot-weld',
      strategy: 'contour',
      toolId: 'tool-robot-spindle',
      stepoverPct: 24,
      stepdownMm: 2.0,
      stockMarginMm: 0.15,
      safeZMm: 30,
      cutSpeedMultiplier: 1.0,
      postFormat: 'weld-tig-mig',
    },
    feaSettings: {
      loadNewtons: 4200,
      supportMode: 'four-corner-pins',
      loadPattern: 'uniform-pressure',
      targetSafetyFactor: 2.5,
    },
    materialFinish: 'aluminum',
    displayMode: 'component-pbr',
    partProfileOverride: {
      partName: 'Rack #FrostbiteEngine 1 MW 800VDC Busbar + HVAC',
      manufacturer: 'Frostbite Interaction-Net Research (Pré-Silício GDS)',
      modelCode: 'FB-7NM-1MW-800VDC',
    },
    buildImportedModel: () =>
      parseOBJ(
        [
          'o Barramento_Principal_800VDC_Busbar',
          'v -88 0 -55', 'v 88 0 -55', 'v 88 0 55', 'v -88 0 55',
          'v -88 14 -55', 'v 88 14 -55', 'v 88 14 55', 'v -88 14 55',
          'f 1 2 3 4', 'f 5 8 7 6', 'f 1 5 6 2', 'f 2 6 7 3', 'f 3 7 8 4', 'f 4 8 5 1',
          'o Rack_Nvidia_1MW_Baseline',
          'v -82 14 -48', 'v -12 14 -48', 'v -12 14 48', 'v -82 14 48',
          'v -82 152 -48', 'v -12 152 -48', 'v -12 152 48', 'v -82 152 48',
          'f 9 10 11 12', 'f 13 16 15 14', 'f 9 13 14 10', 'f 10 14 15 11', 'f 11 15 16 12', 'f 12 16 13 9',
          'o Rack_FrostbiteEngine_7nm_CMOS_Tiles',
          'v 12 14 -48', 'v 82 14 -48', 'v 82 14 48', 'v 12 14 48',
          'v 12 152 -48', 'v 82 152 -48', 'v 82 152 48', 'v 12 152 48',
          'f 17 18 19 20', 'f 21 24 23 22', 'f 17 21 22 18', 'f 18 22 23 19', 'f 19 23 24 20', 'f 20 24 21 17',
          'o Trocador_Calor_HVAC_800VDC_Coolant',
          'v -68 152 -40', 'v 68 152 -40', 'v 68 152 40', 'v -68 152 40',
          'v -68 178 -40', 'v 68 178 -40', 'v 68 178 40', 'v -68 178 40',
          'f 25 26 27 28', 'f 29 32 31 30', 'f 25 29 30 26', 'f 26 30 31 27', 'f 27 31 32 28', 'f 28 32 29 25',
        ].join('\n'),
        'Rack_Frostbite_vs_Nvidia_1MW_800VDC.obj'
      ),
  },
  {
    id: 'preset-soc-hybrid',
    title: 'SoC CPU/GPU Silício + Interposer Óptico/Híbrido',
    badge: '7nm · CPO / Laser',
    subtitle: 'Substrato chiplet silício CMOS, guia óptico WDM e inspeção laser sub-micrométrica.',
    segment: 'aeroespacial',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'cavity',
      spanX: 180,
      spanY: 180,
      archHeight: 22,
      waveAmplitude: 3,
      twistDeg: 0,
      thicknessMm: 5.5,
      uDivisions: 34,
      vDivisions: 34,
      ribCountU: 4,
      ribCountV: 4,
      ribHeightMm: 10,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'laser-cut',
      strategy: 'isoparm',
      toolId: 'tool-ball-4',
      stepoverPct: 16,
      stepdownMm: 1.0,
      stockMarginMm: 0.05,
      safeZMm: 22,
      cutSpeedMultiplier: 1.2,
      postFormat: 'laser-g',
    },
    feaSettings: {
      loadNewtons: 1800,
      supportMode: 'edge-clamped',
      loadPattern: 'uniform-pressure',
      targetSafetyFactor: 3.0,
    },
    materialFinish: 'glass',
    displayMode: 'component-pbr',
    partProfileOverride: {
      partName: 'Chiplet SoC Híbrido Silício + Óptico (CPO)',
      manufacturer: 'Parametrix Semiconductor Lab',
      modelCode: 'SOC-CPO-7NM-H',
    },
  },
  {
    id: 'preset-metal-powder',
    title: 'Suporte Ti-6Al-4V — Impressão Pó Metálico (LPBF)',
    badge: 'SLM / Pó Metálico',
    subtitle: 'Sinterização seletiva a laser em leito de pó metálico Ti-6Al-4V com troca de recoater e feixe 400W.',
    segment: 'aeroespacial',
    graphTemplateId: 'tpl-turbine-5axis',
    designParams: {
      preset: 'shell',
      spanX: 165,
      spanY: 120,
      archHeight: 54,
      waveAmplitude: 14,
      twistDeg: 22,
      thicknessMm: 4.8,
      uDivisions: 32,
      vDivisions: 32,
      ribCountU: 5,
      ribCountV: 4,
      ribHeightMm: 15,
      attractorStrength: 8,
    },
    camSettings: {
      machineType: 'powder-metal',
      strategy: 'isoparm',
      toolId: 'tool-ball-4',
      stepoverPct: 20,
      stepdownMm: 0.5,
      stockMarginMm: 0.1,
      safeZMm: 24,
      cutSpeedMultiplier: 1.0,
      postFormat: 'slm-powder',
    },
    feaSettings: {
      loadNewtons: 5200,
      supportMode: 'four-corner-pins',
      loadPattern: 'center-point',
      targetSafetyFactor: 2.4,
    },
    materialFinish: 'titanium',
    displayMode: 'component-pbr',
  },
  {
    id: 'preset-resin-sla',
    title: 'Molde Óptico / Microfluídico — Resina UV (SLA)',
    badge: 'SLA · Resina 405nm',
    subtitle: 'Fotopolimerização em cuba de resina engenharia UV 405 nm com trajeto contínuo visível.',
    segment: 'medico',
    graphTemplateId: 'tpl-bim-shell',
    designParams: {
      preset: 'cavity',
      spanX: 145,
      spanY: 125,
      archHeight: 36,
      waveAmplitude: 9,
      twistDeg: 10,
      thicknessMm: 3.5,
      uDivisions: 36,
      vDivisions: 36,
      ribCountU: 3,
      ribCountV: 3,
      ribHeightMm: 9,
      attractorStrength: 0,
    },
    camSettings: {
      machineType: 'resin-sla',
      strategy: 'contour',
      toolId: 'tool-ball-4',
      stepoverPct: 18,
      stepdownMm: 0.4,
      stockMarginMm: 0.05,
      safeZMm: 20,
      cutSpeedMultiplier: 1.1,
      postFormat: 'sla-resin',
    },
    feaSettings: {
      loadNewtons: 1200,
      supportMode: 'edge-clamped',
      loadPattern: 'uniform-pressure',
      targetSafetyFactor: 2.2,
    },
    materialFinish: 'glass',
    displayMode: 'component-pbr',
  },
];
