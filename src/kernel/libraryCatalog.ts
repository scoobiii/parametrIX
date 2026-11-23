import type { ApplicationSegment, EngineeringArea, MachineType, MaterialFinish } from '../types/cad';
import { WORKSPACE_PROJECT_PRESETS, type FullWorkspacePreset } from './workspacePresets';

export type LibraryCategoryId =
  | 'ciclismo-mobilidade'
  | 'aeroespacial'
  | 'industrial-cnc'
  | 'arquitetura-bim'
  | 'robotica'
  | 'aditiva'
  | 'datacenter-cmos';

export interface LibraryCategoryMeta {
  id: LibraryCategoryId;
  label: string;
  description: string;
  defaultGrabCadQuery: string;
}

export interface LibraryCatalogItem {
  id: string;
  presetId: string;
  categoryId: LibraryCategoryId;
  categoryLabel: string;
  isCategoryBest: boolean;
  title: string;
  standardBadge: string;
  summary: string;
  segment: ApplicationSegment;
  recommendedArea: EngineeringArea;
  machineType: MachineType;
  materialFinish: MaterialFinish;
  defaultBatchQty: number;
  grabCadSearchQuery: string;
  keySpecs: string[];
  exportTargets: readonly ('cad' | 'cae' | 'cam' | 'projects' | 'erp')[];
}

export const LIBRARY_CATEGORIES: LibraryCategoryMeta[] = [
  {
    id: 'ciclismo-mobilidade',
    label: 'Ciclismo & Mobilidade',
    description: 'Conjuntos multi-peça com canelas, coroas CNC, eixos passantes e testes ISO 4210.',
    defaultGrabCadQuery: 'downhill fork double crown MTB STEP STL',
  },
  {
    id: 'aeroespacial',
    label: 'Aeroespacial & Turbomáquinas',
    description: 'Pás helicoidais em Ti-6Al-4V com torção NURBS contínua e certificação AS9100.',
    defaultGrabCadQuery: 'titanium turbine blade impeller 5-axis STEP',
  },
  {
    id: 'industrial-cnc',
    label: 'CNC & Transmissão Mecânica',
    description: 'Engrenagens evolventes ISO 53, flanges ASME Y14.5 e componentes de transmissão.',
    defaultGrabCadQuery: 'spur gear involute M2 Z24 flange STEP DXF',
  },
  {
    id: 'arquitetura-bim',
    label: 'Arquitetura & Estruturas BIM',
    description: 'Cascas NURBS dupla curvatura, grelhas waffle IfcBeam/IfcMember e norma NBR 8800.',
    defaultGrabCadQuery: 'parametric waffle pavilion shell IFC BIM Rhino',
  },
  {
    id: 'robotica',
    label: 'Robótica & Efetuadores 6-Eixos',
    description: 'Moldes e efetuadores em CFRP para cinemática inversa KUKA 6-eixos e pós KRL.',
    defaultGrabCadQuery: 'robotic end effector gripper KUKA 6 axis STEP',
  },
  {
    id: 'aditiva',
    label: 'Manufatura Aditiva LPBF & SLA',
    description: 'Suportes metálicos Ti-6Al-4V sinterizados (LPBF) e moldes ópticos em resina UV 405nm.',
    defaultGrabCadQuery: 'topology optimized bracket LPBF titanium SLA resin mold',
  },
  {
    id: 'datacenter-cmos',
    label: 'Datacenter 800VDC & Pré-Silício CMOS',
    description: 'Infraestrutura 1MW Liquid Cooling HVAC e arquitetura FrostbiteEngine CMOS 7nm 500MHz.',
    defaultGrabCadQuery: 'server rack cold plate liquid cooling manifold STEP',
  },
];

const CATEGORY_CONFIG_BY_PRESET: Record<
  string,
  {
    categoryId: LibraryCategoryId;
    isCategoryBest: boolean;
    recommendedArea: EngineeringArea;
    defaultBatchQty: number;
    grabCadSearchQuery: string;
    keySpecs: string[];
  }
> = {
  'preset-dh-fork': {
    categoryId: 'ciclismo-mobilidade',
    isCategoryBest: true,
    recommendedArea: 'cad',
    defaultBatchQty: 12,
    grabCadSearchQuery: 'double crown downhill suspension fork assembly STEP',
    keySpecs: ['ISO 4210 · Carga 5400 N', 'Alumínio 7075/6061', 'CAM 5-Eixos + M6'],
  },
  'preset-aero-titanium': {
    categoryId: 'aeroespacial',
    isCategoryBest: true,
    recommendedArea: 'cae',
    defaultBatchQty: 6,
    grabCadSearchQuery: 'helical compressor blade titanium ti-6al-4v STEP',
    keySpecs: ['AS9100 · Carga 6800 N', 'Titânio Ti-6Al-4V', 'Torção 42° · SF 2.2'],
  },
  'preset-gear-m2-z24': {
    categoryId: 'industrial-cnc',
    isCategoryBest: true,
    recommendedArea: 'cad',
    defaultBatchQty: 40,
    grabCadSearchQuery: 'spur gear M2 24 teeth involute ISO 53 STEP',
    keySpecs: ['ISO 53 · Ø52 mm · 24 dentes', 'Alumínio 7075-T6', 'Furo Ø12 H7'],
  },
  'preset-cnc-flange': {
    categoryId: 'industrial-cnc',
    isCategoryBest: false,
    recommendedArea: 'cam',
    defaultBatchQty: 25,
    grabCadSearchQuery: 'industrial bolt flange M8 keyway DXF STEP',
    keySpecs: ['ASME Y14.5 · ISO 2768', '4× Furos M8 + Chaveta', 'CNC 3-Eixos'],
  },
  'preset-bim-dome': {
    categoryId: 'arquitetura-bim',
    isCategoryBest: true,
    recommendedArea: 'cad',
    defaultBatchQty: 4,
    grabCadSearchQuery: 'parametric grid shell waffle timber roof IFC',
    keySpecs: ['ABNT NBR 8800', 'Grelha IfcBeam / IfcMember', 'Carga 9500 N'],
  },
  'preset-robot-6axis': {
    categoryId: 'robotica',
    isCategoryBest: true,
    recommendedArea: 'cam',
    defaultBatchQty: 8,
    grabCadSearchQuery: 'carbon fiber robot gripper tooling KUKA KRL STEP',
    keySpecs: ['ISO 10218 · Pós KRL', 'Fibra de Carbono CFRP', 'Cinemática 6-Eixos'],
  },
  'preset-metal-powder': {
    categoryId: 'aditiva',
    isCategoryBest: true,
    recommendedArea: 'cam',
    defaultBatchQty: 10,
    grabCadSearchQuery: 'LPBF aerospace bracket Ti6Al4V lattice support STL',
    keySpecs: ['SLM/LPBF Feixe 400W', 'Camada 30 µm · Argônio', 'Titânio Ti-6Al-4V'],
  },
  'preset-resin-sla': {
    categoryId: 'aditiva',
    isCategoryBest: false,
    recommendedArea: 'cam',
    defaultBatchQty: 20,
    grabCadSearchQuery: 'microfluidic optical resin mold SLA 405nm STEP',
    keySpecs: ['SLA UV 405 nm', 'Resina Engenharia', 'Alta Resolução Superficial'],
  },
  'preset-frostbite-rack': {
    categoryId: 'datacenter-cmos',
    isCategoryBest: true,
    recommendedArea: 'cam',
    defaultBatchQty: 2,
    grabCadSearchQuery: '800VDC liquid cooling cold plate server rack 42U STEP',
    keySpecs: ['7nm CMOS · 500 MHz', 'Liquid Cooling 800VDC', 'Uso Interno Pré-Silício'],
  },
  'preset-soc-hybrid': {
    categoryId: 'datacenter-cmos',
    isCategoryBest: false,
    recommendedArea: 'cae',
    defaultBatchQty: 5,
    grabCadSearchQuery: 'silicon interposer chiplet heat spreader laser STEP',
    keySpecs: ['7nm Pré-Silício CMOS', 'Laser Fibra Sub-Micrométrico', 'Uso Interno'],
  },
};

export const LIBRARY_CATALOG_ITEMS: LibraryCatalogItem[] = WORKSPACE_PROJECT_PRESETS.map((preset) => {
  const cfg = CATEGORY_CONFIG_BY_PRESET[preset.id];
  const categoryMeta = LIBRARY_CATEGORIES.find((c) => c.id === cfg.categoryId) as LibraryCategoryMeta;

  return {
    id: `lib-${preset.id}`,
    presetId: preset.id,
    categoryId: cfg.categoryId,
    categoryLabel: categoryMeta.label,
    isCategoryBest: cfg.isCategoryBest,
    title: preset.title,
    standardBadge: preset.badge,
    summary: preset.subtitle,
    segment: preset.segment,
    recommendedArea: cfg.recommendedArea,
    machineType: preset.camSettings.machineType,
    materialFinish: preset.materialFinish,
    defaultBatchQty: cfg.defaultBatchQty,
    grabCadSearchQuery: cfg.grabCadSearchQuery,
    keySpecs: cfg.keySpecs,
    exportTargets: ['cad', 'cae', 'cam', 'projects', 'erp'] as const,
  };
});

export interface LibraryCategoryGroup {
  category: LibraryCategoryMeta;
  bestItem: LibraryCatalogItem;
  items: LibraryCatalogItem[];
}

export function listLibraryCategoriesWithBest(): LibraryCategoryGroup[] {
  return LIBRARY_CATEGORIES.map((category) => {
    const items = LIBRARY_CATALOG_ITEMS.filter((item) => item.categoryId === category.id).sort(
      (a, b) => Number(b.isCategoryBest) - Number(a.isCategoryBest)
    );
    const bestItem = items[0];
    return {
      category,
      bestItem,
      items,
    };
  });
}

export function filterLibraryItems(
  categoryId: LibraryCategoryId | 'all',
  query: string
): LibraryCatalogItem[] {
  const cleanQuery = query.trim().toLowerCase();
  return LIBRARY_CATALOG_ITEMS.filter((item) => {
    if (categoryId !== 'all' && item.categoryId !== categoryId) {
      return false;
    }
    if (!cleanQuery) return true;
    const haystack = [
      item.title,
      item.standardBadge,
      item.summary,
      item.categoryLabel,
      item.segment,
      item.machineType,
      item.materialFinish,
      item.grabCadSearchQuery,
      ...item.keySpecs,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(cleanQuery);
  }).sort((a, b) => Number(b.isCategoryBest) - Number(a.isCategoryBest));
}

export function buildGrabCadLibrarySearchUrl(query: string): string {
  const clean = query.trim();
  if (!clean) {
    return 'https://grabcad.com/library';
  }
  return `https://grabcad.com/library?page=1&time=all_time&sort=recent&query=${encodeURIComponent(clean)}`;
}

export function resolveLibraryPreset(itemOrPresetId: string): FullWorkspacePreset | undefined {
  const catalogMatch = LIBRARY_CATALOG_ITEMS.find(
    (item) => item.id === itemOrPresetId || item.presetId === itemOrPresetId
  );
  const targetPresetId = catalogMatch ? catalogMatch.presetId : itemOrPresetId;
  return WORKSPACE_PROJECT_PRESETS.find((p) => p.id === targetPresetId);
}
