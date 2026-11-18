import type {
  ApplicationSegment,
  CadComponentPart,
  EvaluatedMesh,
  MaterialFinish,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../types/cad';

export interface SegmentDefinition {
  id: ApplicationSegment;
  label: string;
  shortLabel: string;
  defaultStandards: string[];
  recommendedLoadN: number;
  recommendedSf: number;
  focusSummary: string;
}

export const SEGMENT_CATALOG: SegmentDefinition[] = [
  {
    id: 'ciclismo-mobilidade',
    label: 'Ciclismo / Downhill & Mobilidade',
    shortLabel: 'Ciclismo / DH',
    defaultStandards: ['ISO 4210-6 (Garfos & Suspensões MTB)', 'ASTM F2043 Cat. 4/5 (Downhill)', 'EN 15194'],
    recommendedLoadN: 5200,
    recommendedSf: 2.5,
    focusSummary: 'Impacto frontal, fadiga em coroa/bengalas, rigidez torcional do eixo passante.',
  },
  {
    id: 'automotivo',
    label: 'Automotivo & Motorsport',
    shortLabel: 'Automotivo',
    defaultStandards: ['SAE J2530', 'ISO 26262 (Integridade Mecânica)', 'FIA Homologation'],
    recommendedLoadN: 8500,
    recommendedSf: 2.4,
    focusSummary: 'Fadiga térmica, cargas de frenagem/curva em 3.5G e precisão de usinagem CNC 5-eixos.',
  },
  {
    id: 'aeroespacial',
    label: 'Aeroespacial & Propulsão',
    shortLabel: 'Aeroespacial',
    defaultStandards: ['AS9100 Rev D', 'NASA-STD-5019', 'AMS 4911 (Ti-6Al-4V)'],
    recommendedLoadN: 6800,
    recommendedSf: 2.2,
    focusSummary: 'Máxima razão rigidez/massa, compósitos CFRP, titânio e tolerância de superfície NURBS.',
  },
  {
    id: 'arquitetura-bim',
    label: 'Arquitetura & Estruturas BIM',
    shortLabel: 'Arquitetura BIM',
    defaultStandards: ['ABNT NBR 6118 / NBR 8800', 'Eurocode 3 / EN 1993', 'ISO 16739 (IFC4)'],
    recommendedLoadN: 9500,
    recommendedSf: 2.0,
    focusSummary: 'Cargas distribuídas de cobertura, grelhas waffle IfcBeam/IfcMember e flecha máxima.',
  },
  {
    id: 'industrial-cnc',
    label: 'Usinagem Industrial & Matrizes CNC',
    shortLabel: 'Industrial CNC',
    defaultStandards: ['ISO 2768-fH (Tolerâncias Gerais)', 'ASME Y14.5 GD&T', 'DIN 8580'],
    recommendedLoadN: 6000,
    recommendedSf: 2.8,
    focusSummary: 'Rigidez de fixação em mesa, moldes e flanges usinados, trajetórias CAM sem colisão.',
  },
  {
    id: 'robotica',
    label: 'Robótica & Automação 6-Eixos',
    shortLabel: 'Robótica',
    defaultStandards: ['ISO 10218-1', 'ISO/TS 15066', 'KUKA KRL / ABB RAPID'],
    recommendedLoadN: 3600,
    recommendedSf: 2.3,
    focusSummary: 'Inércia de efetuadores terminais, alcançabilidade cinemática e rigidez de braço.',
  },
  {
    id: 'medico',
    label: 'Dispositivos Médicos & Órteses',
    shortLabel: 'Médico',
    defaultStandards: ['ISO 13485', 'ASTM F136 (Ti ELI)', 'ANVISA RDC 751'],
    recommendedLoadN: 2400,
    recommendedSf: 3.0,
    focusSummary: 'Biocompatibilidade, ergonomia anatômica NURBS e fator de segurança elevado.',
  },
];

export interface FamilyMaskSpec {
  family: string;
  baseHueHex: string;
  subPaletteHex: string[];
  defaultMaterial: MaterialFinish;
}

const FAMILY_SPECS: Record<string, FamilyMaskSpec> = {
  casca: {
    family: 'Casca / Carenagem',
    baseHueHex: '#0ea5e9',
    subPaletteHex: ['#0ea5e9', '#38bdf8', '#0284c7', '#7dd3fc'],
    defaultMaterial: 'carbon-fiber',
  },
  estrutura: {
    family: 'Estrutura / Chassi Principal',
    baseHueHex: '#22c55e',
    subPaletteHex: ['#22c55e', '#16a34a', '#4ade80', '#15803d'],
    defaultMaterial: 'aluminum',
  },
  suspensao: {
    family: 'Suspensão / Tubos & Amortecimento',
    baseHueHex: '#f59e0b',
    subPaletteHex: ['#f59e0b', '#fbbf24', '#d97706', '#f97316'],
    defaultMaterial: 'titanium',
  },
  coroa: {
    family: 'Coroa / Mesa / Suporte',
    baseHueHex: '#a855f7',
    subPaletteHex: ['#a855f7', '#c084fc', '#9333ea', '#7e22ce'],
    defaultMaterial: 'aluminum',
  },
  eixo: {
    family: 'Eixo / Transmissão & Rotação',
    baseHueHex: '#ec4899',
    subPaletteHex: ['#ec4899', '#f472b6', '#db2777', '#be185d'],
    defaultMaterial: 'titanium',
  },
  fixacao: {
    family: 'Fixação / Hardware & Retentores',
    baseHueHex: '#ef4444',
    subPaletteHex: ['#ef4444', '#f87171', '#dc2626', '#fb7185'],
    defaultMaterial: 'matte-plastic',
  },
  bim_u: {
    family: 'Nervura BIM U (IfcBeam)',
    baseHueHex: '#14b8a6',
    subPaletteHex: ['#14b8a6', '#2dd4bf', '#0d9488', '#5eead4'],
    defaultMaterial: 'aluminum',
  },
  bim_v: {
    family: 'Travessa BIM V (IfcMember)',
    baseHueHex: '#6366f1',
    subPaletteHex: ['#6366f1', '#818cf8', '#4f46e5', '#a5b4fc'],
    defaultMaterial: 'titanium',
  },
};

export function classifyComponentFamily(
  name: string,
  index: number
): {
  family: string;
  subFamily: string;
  maskColorHex: string;
  inferredMaterial: MaterialFinish;
} {
  const lower = name.toLowerCase();

  let specKey: keyof typeof FAMILY_SPECS = 'estrutura';
  let subFamily = 'Sub-componente Estrutural';

  if (/stanchion|tube|bengala|telescop|damper|cartridge|spring|mola|pistao|piston|fork_leg|upper/.test(lower)) {
    specKey = 'suspensao';
    subFamily = /damper|cartridge|charger|air/.test(lower)
      ? 'Cartucho Hidropneumático'
      : 'Tubo Superior / Stanchion';
  } else if (/lower|canela|slider|arch|arco|brace|housing|corpo/.test(lower)) {
    specKey = 'estrutura';
    subFamily = /arch|brace|ponte/.test(lower)
      ? 'Ponte / Arco de Rigidez'
      : 'Canela / Estrutura Inferior';
  } else if (/crown|coroa|steerer|espiga|clamp|mesa|stem|yoke|bracket|suporte/.test(lower)) {
    specKey = 'coroa';
    subFamily = /steerer|espiga/.test(lower)
      ? 'Tubo Espiga (Steerer)'
      : 'Coroa / Bloco de Fixação';
  } else if (/axle|eixo|shaft|spindle|hub|rotor|flange/.test(lower)) {
    specKey = 'eixo';
    subFamily = 'Eixo Passante / Acoplamento';
  } else if (/bolt|screw|pin|seal|washer|cap|knob|dial|retentor|parafuso|anel|nut|clip/.test(lower)) {
    specKey = 'fixacao';
    subFamily = /seal|retentor|wiper/.test(lower)
      ? 'Retentor / Vedação Polimérica'
      : 'Parafuso / Pino / Dial';
  } else if (/fender|guard|shell|casca|cover|carenagem|skin|canopy|blade|impeller/.test(lower)) {
    specKey = 'casca';
    subFamily = 'Carenagem / Superfície Aerodinâmica';
  } else if (/bim-u|ifcbeam|longarina/.test(lower)) {
    specKey = 'bim_u';
    subFamily = 'Longarina Longitudinal U';
  } else if (/bim-v|ifcmember|travessa/.test(lower)) {
    specKey = 'bim_v';
    subFamily = 'Travessa Transversal V';
  } else {
    const cycleKeys: (keyof typeof FAMILY_SPECS)[] = [
      'estrutura',
      'coroa',
      'suspensao',
      'eixo',
      'casca',
      'fixacao',
    ];
    specKey = cycleKeys[index % cycleKeys.length];
    subFamily = `Sub-conjunto ${String.fromCharCode(65 + (index % 6))}`;
  }

  const spec = FAMILY_SPECS[specKey];
  const maskColorHex = spec.subPaletteHex[index % spec.subPaletteHex.length];

  return {
    family: spec.family,
    subFamily,
    maskColorHex,
    inferredMaterial: spec.defaultMaterial,
  };
}

export function resolvePartEngineeringProfile(params: {
  filename?: string;
  rawText?: string;
  layers?: string[];
  preset?: ParametricDesignParams['preset'];
  segmentOverride?: ApplicationSegment;
  surfaceName?: string;
}): PartEngineeringProfile {
  const filename = params.filename || '';
  const rawText = params.rawText || '';
  const combined = `${filename} ${rawText.slice(0, 14000)} ${(params.layers || []).join(' ')}`.toLowerCase();

  // Specific high-confidence engineering database matching
  if (/rockshox|boxxer/.test(combined)) {
    const seg = params.segmentOverride ?? 'ciclismo-mobilidade';
    return {
      partName: 'Garfo de Suspensão Dupla Coroa — RockShox BoXXer Ultimate 27.5"',
      manufacturer: 'RockShox / SRAM LLC',
      modelCode: filename.replace(/\.[^.]+$/, '') || 'BoXXer Ultimate 27.5 (RC2 / DebonAir)',
      segment: seg,
      primaryMaterial: 'aluminum',
      specifications: [
        'Curso: 200 mm · Roda 27.5" · Offset 46 mm / 36 mm',
        'Bengalas (Stanchions): 35 mm Alumínio 7075 anodizado Fast Black',
        'Canelas (Lowers): Liga de Magnésio fundido · Eixo Maxle Stealth 20×110 mm',
        'Coroa Dupla: Alumínio forjado CNC 6061-T6 · Cartucho Charger 2.1 RC2',
      ],
      certifications: [
        'ISO 4210-6 (Ciclos — Requisitos de Segurança para Garfos MTB)',
        'ASTM F2043 Categoria 5 (Downhill / Bike Park Extremo)',
        'EN 15194 / E-MTB Rated',
      ],
      intendedUse:
        'Suspensão dianteira de dupla coroa para Downhill (DH) e Freeride extremo, sujeita a impactos frontais combinados, frenagem de disco 220 mm e torção no eixo passante.',
      safetyCriteria: {
        recommendedLoadN: 5400,
        supportMode: 'four-corner-pins',
        loadPattern: 'torsion-tip',
        minSafetyFactor: 2.5,
        maxDeflectionMm: 2.8,
        criticalInspectionNote:
          'Monitorar concentração de tensão na transição bengala/coroa inferior e orelhas de pinça de freio Post Mount.',
      },
      detectedFrom: filename || 'STEP Header / Contexto',
    };
  }

  if (/fox\s*40|fox.*factory|marzocchi|ohlins.*dh/.test(combined)) {
    const seg = params.segmentOverride ?? 'ciclismo-mobilidade';
    return {
      partName: 'Garfo Invertido / Dupla Coroa Downhill',
      manufacturer: /fox/.test(combined) ? 'FOX Racing Shox' : /ohlins/.test(combined) ? 'Öhlins' : 'Marzocchi',
      modelCode: filename.replace(/\.[^.]+$/, '') || 'DH Factory Fork',
      segment: seg,
      primaryMaterial: 'titanium',
      specifications: [
        'Curso: 203 mm · Bengalas 40 mm com revestimento de baixo atrito',
        'Eixo Passante 20×110 mm · Fixação de coroa dupla CNC',
      ],
      certifications: ['ISO 4210-6', 'ASTM F2043 Categoria 5'],
      intendedUse: 'Competições de Downhill e impactos verticais/torcionais severos.',
      safetyCriteria: {
        recommendedLoadN: 5600,
        supportMode: 'four-corner-pins',
        loadPattern: 'torsion-tip',
        minSafetyFactor: 2.5,
        maxDeflectionMm: 2.6,
        criticalInspectionNote: 'Verificar escoamento na região de aperto das coroas e ponte inferior.',
      },
      detectedFrom: filename || 'Contexto CAD',
    };
  }

  if (/flange|furo|chaveta|bucha|eixo|mancal|pinion|gear|engrenagem/.test(combined)) {
    const seg = params.segmentOverride ?? 'industrial-cnc';
    return {
      partName: `Componente Mecânico Usinado (${filename || 'Flange / Eixo'})`,
      manufacturer: 'Fabricação Industrial CNC (Padrão ISO)',
      modelCode: filename.replace(/\.[^.]+$/, '') || 'CNC-FLANGE-R1',
      segment: seg,
      primaryMaterial: 'aluminum',
      specifications: [
        'Usinagem CNC 3/5-eixos · Tolerância ISO 2768-mK',
        'Furação radial M8/M10 · Concentricidade ≤ 0.03 mm',
      ],
      certifications: ['ASME Y14.5 GD&T', 'ISO 2768-fH', 'DIN EN 1092-1'],
      intendedUse: 'Acoplamento mecânico industrial sob torque, cisalhamento nos parafusos e carga axial.',
      safetyCriteria: {
        recommendedLoadN: 6500,
        supportMode: 'edge-clamped',
        loadPattern: 'center-point',
        minSafetyFactor: 2.8,
        maxDeflectionMm: 0.9,
        criticalInspectionNote: 'Avaliar concentração de tensão nas bordas dos furos e chaveta.',
      },
      detectedFrom: filename || 'DXF / STEP',
    };
  }

  if (/impeller|turbina|rotor|blade|aero|wing|suporte_trelica|aeroespacial/.test(combined)) {
    const seg = params.segmentOverride ?? 'aeroespacial';
    return {
      partName: filename ? `Conjunto Aeroespacial (${filename})` : 'Rotor / Pá Helicoidal NURBS',
      manufacturer: 'Parametrix Aero Engineering',
      modelCode: filename.replace(/\.[^.]+$/, '') || 'AERO-IMP-7075',
      segment: seg,
      primaryMaterial: 'titanium',
      specifications: [
        'Superfície G2 contínua · Liga Ti-6Al-4V ou CFRP',
        'Balanceamento dinâmico G2.5 · Baixa massa rotacional',
      ],
      certifications: ['AS9100 Rev D', 'AMS 4911', 'NASA-STD-5019'],
      intendedUse: 'Fluxo aerodinâmico/hidrodinâmico de alta rotação com torque na raiz das pás.',
      safetyCriteria: {
        recommendedLoadN: 6800,
        supportMode: 'cantilever-u',
        loadPattern: 'torsion-tip',
        minSafetyFactor: 2.2,
        maxDeflectionMm: 1.8,
        criticalInspectionNote: 'Verificar tensão máxima na raiz da pá e deformação de ponta.',
      },
      detectedFrom: filename || 'Parâmetros NURBS',
    };
  }

  // Extract STEP FILE_NAME / ORGANIZATION if present
  const orgMatch = /FILE_NAME\s*\([^)]*'([^']*)'\s*,\s*\('([^']*)'\)\s*,\s*\('([^']*)'\)/i.exec(rawText);
  const prodMatch = /PRODUCT\s*\(\s*'([^']+)'\s*,\s*'([^']*)'/i.exec(rawText);
  const extractedName = prodMatch?.[2] || prodMatch?.[1] || filename.replace(/\.[^.]+$/, '');
  const extractedOrg = orgMatch?.[3]?.trim();

  // Parametric presets fallback
  const segment =
    params.segmentOverride ??
    (params.preset === 'diagrid'
      ? 'arquitetura-bim'
      : params.preset === 'impeller'
        ? 'aeroespacial'
        : params.preset === 'cavity'
          ? 'industrial-cnc'
          : 'arquitetura-bim');
  const segSpec = SEGMENT_CATALOG.find((s) => s.id === segment) ?? SEGMENT_CATALOG[0];

  return {
    partName: extractedName || params.surfaceName || 'Conjunto Paramétrico NURBS + BIM',
    manufacturer: extractedOrg && extractedOrg.length > 2 ? extractedOrg : 'Parametrix Engineering Studio',
    modelCode: filename || `NURBS-${(params.preset || 'SHELL').toUpperCase()}`,
    segment,
    primaryMaterial: segment === 'aeroespacial' ? 'carbon-fiber' : 'aluminum',
    specifications: [
      `Segmento: ${segSpec.label}`,
      `Critério estrutural: ${segSpec.focusSummary}`,
    ],
    certifications: segSpec.defaultStandards,
    intendedUse: segSpec.focusSummary,
    safetyCriteria: {
      recommendedLoadN: segSpec.recommendedLoadN,
      supportMode: segment === 'aeroespacial' ? 'cantilever-u' : 'edge-clamped',
      loadPattern: segment === 'ciclismo-mobilidade' ? 'torsion-tip' : 'center-point',
      minSafetyFactor: segSpec.recommendedSf,
      maxDeflectionMm: 3.5,
      criticalInspectionNote: 'Avaliar pico de Von Mises antes e depois da otimização paramétrica.',
    },
    detectedFrom: filename ? `Arquivo ${filename}` : 'Modelo Paramétrico Ativo',
  };
}

export function buildParametricComponentParts(
  surface: NurbsSurfaceData,
  meshData: EvaluatedMesh,
  profile: PartEngineeringProfile
): CadComponentPart[] {
  const parts: CadComponentPart[] = [
    {
      id: 'shell',
      name: `${surface.name} (Casca NURBS)`,
      family: FAMILY_SPECS.casca.family,
      subFamily: 'Casca Primária Racional',
      maskColorHex: FAMILY_SPECS.casca.subPaletteHex[0],
      inferredMaterial: profile.primaryMaterial,
      center: [
        (meshData.boundingBox.min[0] + meshData.boundingBox.max[0]) / 2,
        (meshData.boundingBox.min[1] + meshData.boundingBox.max[1]) / 2,
        (meshData.boundingBox.min[2] + meshData.boundingBox.max[2]) / 2,
      ],
      size: meshData.boundingBox.size,
      triangleCount: meshData.triangleCount,
      sourceLayer: 'NURBS_SURFACE',
    },
  ];

  meshData.bimElements.forEach((el, idx) => {
    const cls = classifyComponentFamily(`${el.id} ${el.label} ${el.ifcClass}`, idx);
    parts.push({
      id: el.id,
      name: `${el.id} · ${el.label}`,
      family: cls.family,
      subFamily: cls.subFamily,
      maskColorHex: cls.maskColorHex,
      inferredMaterial: el.ifcClass === 'IfcBeam' ? 'aluminum' : 'titanium',
      center: el.center,
      size: el.size,
      triangleCount: 12,
      sourceLayer: el.ifcClass,
    });
  });

  return parts;
}
