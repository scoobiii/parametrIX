import {
  parse3DM,
  parseDXF,
  parseIPT,
  parseOBJ,
  parseSTEPorIFC,
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
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
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
    return parseSTEPorIFC(await file.text(), file.name, ext === 'ifc' ? 'IFC' : 'STEP');
  }
  if (ext === 'ipt') {
    return parseIPT(await file.arrayBuffer(), file.name);
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

const ROCKSHOX_SAMPLE_STEP = [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_DESCRIPTION(('RockShox BoXXer Ultimate 27.5 DH Dual Crown Fork'),'2;1');",
  "FILE_NAME('RockShox_BoXXer_DH.stp','2026-11-18',('Engenharia DH'),('RockShox / SRAM LLC'),'Parametrix','','');",
  'ENDSEC;',
  'DATA;',
  "#10=PRODUCT('BOXXER-275','RockShox BoXXer Ultimate Dual Crown','',(#1));",
  "#20=PRODUCT_DEFINITION_SHAPE('Stanchion_Tube_Left','',#10);",
  "#21=PRODUCT_DEFINITION_SHAPE('Stanchion_Tube_Right','',#10);",
  "#22=PRODUCT_DEFINITION_SHAPE('Lower_Cast_Arch','',#10);",
  "#23=PRODUCT_DEFINITION_SHAPE('Upper_Crown_Forged','',#10);",
  "#24=PRODUCT_DEFINITION_SHAPE('Lower_Crown_CNC','',#10);",
  "#25=PRODUCT_DEFINITION_SHAPE('Maxle_Axle_20x110','',#10);",
  "#30=CARTESIAN_POINT('P1',(-62.0,-32.0,4.0));",
  "#31=CARTESIAN_POINT('P2',(62.0,-32.0,4.0));",
  "#32=CARTESIAN_POINT('P3',(62.0,32.0,4.0));",
  "#33=CARTESIAN_POINT('P4',(-62.0,32.0,4.0));",
  "#34=CARTESIAN_POINT('P5',(-62.0,-32.0,220.0));",
  "#35=CARTESIAN_POINT('P6',(62.0,-32.0,220.0));",
  "#36=CARTESIAN_POINT('P7',(62.0,32.0,220.0));",
  "#37=CARTESIAN_POINT('P8',(-62.0,32.0,220.0));",
  'ENDSEC;',
  'END-ISO-10303-21;',
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
    title: 'Garfo Downhill Dupla Coroa (STEP)',
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
      parseSTEPorIFC(ROCKSHOX_SAMPLE_STEP, 'RockShox_BoXXer_DH.stp', 'STEP'),
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
];
