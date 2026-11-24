import type { MagicPenOperationKind } from '../types/cad';

export interface ExtendedMagicPenCatalogEntry {
  kind: Extract<MagicPenOperationKind, `blender-${string}` | `bim-ifc-${string}`>;
  suite: 'blender' | 'bim-ifc';
  command: string;
  category: string;
  ifcClass?: string;
  description: string;
  syntaxExample: string;
  defaultParams: {
    widthMm: number;
    lengthMm: number;
    diameterMm: number;
    depthMm: number;
    radiusMm?: number;
    wallThicknessMm?: number;
    angleDeg?: number;
    count?: number;
    axis?: 'x' | 'y' | 'z';
  };
}

export const BLENDER_TOOL_CATALOG: ExtendedMagicPenCatalogEntry[] = [
  {
    kind: 'blender-subsurf',
    suite: 'blender',
    command: 'SubsurfCatmullClark',
    category: 'Modificadores Malha',
    description: 'Subdivisão Catmull-Clark com gaiola de controle para suavização orgânica.',
    syntaxExample: 'Subsurf 3 levels',
    defaultParams: { widthMm: 28, lengthMm: 28, diameterMm: 28, depthMm: 14, count: 3 },
  },
  {
    kind: 'blender-bevel',
    suite: 'blender',
    command: 'BevelModifier',
    category: 'Modificadores Malha',
    description: 'Biselamento chanfrado multi-segmento nas arestas selecionadas.',
    syntaxExample: 'Bevel 3.5mm 4seg',
    defaultParams: { widthMm: 18, lengthMm: 28, diameterMm: 18, depthMm: 8, radiusMm: 3.5, count: 4 },
  },
  {
    kind: 'blender-solidify',
    suite: 'blender',
    command: 'SolidifyModifier',
    category: 'Modificadores Malha',
    description: 'Adiciona espessura estrutural sólida à casca com offset normal uniforme.',
    syntaxExample: 'Solidify t=3mm',
    defaultParams: { widthMm: 26, lengthMm: 26, diameterMm: 26, depthMm: 14, wallThicknessMm: 3 },
  },
  {
    kind: 'blender-array-mod',
    suite: 'blender',
    command: 'ArrayModifier',
    category: 'Instância & Topologia',
    description: 'Repete instância da feature ao longo do eixo selecionado.',
    syntaxExample: 'ArrayModifier 5 x',
    defaultParams: { widthMm: 12, lengthMm: 12, diameterMm: 12, depthMm: 10, count: 5, axis: 'x' },
  },
  {
    kind: 'blender-boolean-mod',
    suite: 'blender',
    command: 'BooleanExact',
    category: 'Instância & Topologia',
    description: 'Operação booleana exata de malha BMesh para alívio ou união.',
    syntaxExample: 'BooleanExact 16mm',
    defaultParams: { widthMm: 16, lengthMm: 24, diameterMm: 16, depthMm: 12 },
  },
  {
    kind: 'blender-decimate',
    suite: 'blender',
    command: 'DecimatePlanar',
    category: 'Otimização Malha',
    description: 'Reduz contagem de triângulos preservando silhueta e ângulos críticos.',
    syntaxExample: 'Decimate 12mm',
    defaultParams: { widthMm: 22, lengthMm: 22, diameterMm: 22, depthMm: 10 },
  },
  {
    kind: 'blender-remesh-voxel',
    suite: 'blender',
    command: 'RemeshVoxel',
    category: 'Otimização Malha',
    description: 'Remalha volumétrica isotrópica pronta para manufatura aditiva.',
    syntaxExample: 'RemeshVoxel 4mm',
    defaultParams: { widthMm: 20, lengthMm: 20, diameterMm: 20, depthMm: 16, count: 4 },
  },
  {
    kind: 'blender-bridge-loops',
    suite: 'blender',
    command: 'BridgeEdgeLoops',
    category: 'Modelagem BMesh',
    description: 'Conecta dois contornos de borda fechados gerando ponte estrutural.',
    syntaxExample: 'BridgeLoops 34mm',
    defaultParams: { widthMm: 14, lengthMm: 34, diameterMm: 14, depthMm: 10 },
  },
  {
    kind: 'blender-screw-lathe',
    suite: 'blender',
    command: 'ScrewLathe',
    category: 'Modelagem BMesh',
    description: 'Gera perfil helicoidal ou revolucionado com passo e ângulo paramétricos.',
    syntaxExample: 'Screw 360deg r=14',
    defaultParams: { widthMm: 28, lengthMm: 28, diameterMm: 28, depthMm: 24, radiusMm: 14, angleDeg: 360 },
  },
  {
    kind: 'blender-lattice-deform',
    suite: 'blender',
    command: 'LatticeDeform',
    category: 'Deformação FFD',
    description: 'Deformação por treliça FFD (Free-Form Deformation) em caixa envolvente.',
    syntaxExample: 'Lattice 28mm',
    defaultParams: { widthMm: 28, lengthMm: 28, diameterMm: 28, depthMm: 18 },
  },
];

export const BIM_IFC_TOOL_CATALOG: ExtendedMagicPenCatalogEntry[] = [
  {
    kind: 'bim-ifc-beam',
    suite: 'bim-ifc',
    command: 'IfcBeam',
    ifcClass: 'IfcBeam',
    category: 'Estrutura BIM (NBR 8800)',
    description: 'Viga estrutural perfil I metálico / concreto com almas e mesas.',
    syntaxExample: 'IfcBeam l=60 h=18',
    defaultParams: { widthMm: 14, lengthMm: 60, diameterMm: 14, depthMm: 18 },
  },
  {
    kind: 'bim-ifc-column',
    suite: 'bim-ifc',
    command: 'IfcColumn',
    ifcClass: 'IfcColumn',
    category: 'Estrutura BIM (NBR 8800)',
    description: 'Pilar / coluna vertical estrutural com placa de base e capitel.',
    syntaxExample: 'IfcColumn h=42 w=16',
    defaultParams: { widthMm: 16, lengthMm: 16, diameterMm: 16, depthMm: 42 },
  },
  {
    kind: 'bim-ifc-slab',
    suite: 'bim-ifc',
    command: 'IfcSlab',
    ifcClass: 'IfcSlab',
    category: 'Lajes & Pisos IFC',
    description: 'Laje estrutural plana ou nervurada (Floor / Roof Slab).',
    syntaxExample: 'IfcSlab 55x45 t=8',
    defaultParams: { widthMm: 55, lengthMm: 45, diameterMm: 55, depthMm: 8 },
  },
  {
    kind: 'bim-ifc-wall',
    suite: 'bim-ifc',
    command: 'IfcWallStandardCase',
    ifcClass: 'IfcWallStandardCase',
    category: 'Vedações IFC',
    description: 'Parede estrutural ou de vedação com espessura controlada.',
    syntaxExample: 'IfcWall l=50 h=30',
    defaultParams: { widthMm: 8, lengthMm: 50, diameterMm: 8, depthMm: 30, wallThicknessMm: 8 },
  },
  {
    kind: 'bim-ifc-truss',
    suite: 'bim-ifc',
    command: 'IfcMemberTruss',
    ifcClass: 'IfcMember',
    category: 'Estrutura BIM (NBR 8800)',
    description: 'Treliça espacial diagonalizada (banzo superior/inferior e montantes).',
    syntaxExample: 'IfcTruss l=64 h=18',
    defaultParams: { widthMm: 14, lengthMm: 64, diameterMm: 14, depthMm: 18, count: 4 },
  },
  {
    kind: 'bim-ifc-bracing',
    suite: 'bim-ifc',
    command: 'IfcStructuralBracing',
    ifcClass: 'IfcMember',
    category: 'Estrutura BIM (NBR 8800)',
    description: 'Contraventamento em X para rigidez lateral contra vento e sismo.',
    syntaxExample: 'IfcBracing l=42',
    defaultParams: { widthMm: 18, lengthMm: 42, diameterMm: 18, depthMm: 22 },
  },
  {
    kind: 'bim-ifc-footing',
    suite: 'bim-ifc',
    command: 'IfcFooting',
    ifcClass: 'IfcFooting',
    category: 'Fundação IFC',
    description: 'Sapata / bloco de fundação escalonado com pedestal de ancoragem.',
    syntaxExample: 'IfcFooting 32x32',
    defaultParams: { widthMm: 32, lengthMm: 32, diameterMm: 32, depthMm: 14 },
  },
  {
    kind: 'bim-ifc-stair',
    suite: 'bim-ifc',
    command: 'IfcStairFlight',
    ifcClass: 'IfcStairFlight',
    category: 'Circulação IFC',
    description: 'Lance de escada paramétrica com degraus conforme fórmula de Blondel.',
    syntaxExample: 'IfcStair 5deg',
    defaultParams: { widthMm: 24, lengthMm: 46, diameterMm: 24, depthMm: 24, count: 5 },
  },
  {
    kind: 'bim-ifc-curtainwall',
    suite: 'bim-ifc',
    command: 'IfcCurtainWall',
    ifcClass: 'IfcCurtainWall',
    category: 'Vedações IFC',
    description: 'Fachada pele de vidro estrutural com montantes e travessas metálicas.',
    syntaxExample: 'IfcCurtainWall l=52 h=32',
    defaultParams: { widthMm: 6, lengthMm: 52, diameterMm: 6, depthMm: 32 },
  },
  {
    kind: 'bim-ifc-mep-duct',
    suite: 'bim-ifc',
    command: 'IfcDuctSegment',
    ifcClass: 'IfcDuctSegment',
    category: 'MEP & HVAC IFC',
    description: 'Duto circular ou retangular de climatização HVAC / refrigeração.',
    syntaxExample: 'IfcDuct d=14 l=54',
    defaultParams: { widthMm: 14, lengthMm: 54, diameterMm: 14, depthMm: 14, radiusMm: 7 },
  },
];

export const EXTENDED_MAGIC_PEN_CATALOG: ExtendedMagicPenCatalogEntry[] = [
  ...BLENDER_TOOL_CATALOG,
  ...BIM_IFC_TOOL_CATALOG,
];

export interface ParsedExtendedMagicPenResult {
  matched: boolean;
  suite?: 'blender' | 'bim-ifc';
  kind?: ExtendedMagicPenCatalogEntry['kind'];
  command?: string;
  label?: string;
  widthMm?: number;
  lengthMm?: number;
  diameterMm?: number;
  depthMm?: number;
  radiusMm?: number;
  wallThicknessMm?: number;
  angleDeg?: number;
  count?: number;
  axis?: 'x' | 'y' | 'z';
}

const MATCH_PATTERNS: {
  kind: ExtendedMagicPenCatalogEntry['kind'];
  regex: RegExp;
}[] = [
  { kind: 'blender-subsurf', regex: /\b(subsurf|subdivision|catmull|suaviz.*malha)\b/ },
  { kind: 'blender-bevel', regex: /\b(bevel|bisel)\b/ },
  { kind: 'blender-solidify', regex: /\b(solidify|solidificar)\b/ },
  { kind: 'blender-array-mod', regex: /\b(arraymodifier|blender array|matriz blender)\b/ },
  { kind: 'blender-boolean-mod', regex: /\b(booleanexact|bmesh boolean|booleano blender)\b/ },
  { kind: 'blender-decimate', regex: /\b(decimate|dizimar|simplificar malha)\b/ },
  { kind: 'blender-remesh-voxel', regex: /\b(remesh|voxel)\b/ },
  { kind: 'blender-bridge-loops', regex: /\b(bridge|bridgeloops|ponte borda)\b/ },
  { kind: 'blender-screw-lathe', regex: /\b(screw|lathe|espiral blender)\b/ },
  { kind: 'blender-lattice-deform', regex: /\b(lattice|ffd|trelica deform)\b/ },
  { kind: 'bim-ifc-beam', regex: /\b(ifcbeam|ifc beam|viga ifc|viga perfil)\b/ },
  { kind: 'bim-ifc-column', regex: /\b(ifccolumn|ifc column|pilar ifc|coluna ifc)\b/ },
  { kind: 'bim-ifc-slab', regex: /\b(ifcslab|ifc slab|laje ifc)\b/ },
  { kind: 'bim-ifc-wall', regex: /\b(ifcwall|ifc wall|parede ifc)\b/ },
  { kind: 'bim-ifc-truss', regex: /\b(ifctruss|ifcmember|trelica ifc|truss ifc)\b/ },
  { kind: 'bim-ifc-bracing', regex: /\b(ifcbracing|contraventamento|bracing ifc)\b/ },
  { kind: 'bim-ifc-footing', regex: /\b(ifcfooting|sapata ifc|fundacao ifc)\b/ },
  { kind: 'bim-ifc-stair', regex: /\b(ifcstair|escada ifc)\b/ },
  { kind: 'bim-ifc-curtainwall', regex: /\b(ifccurtainwall|pele de vidro|curtain wall)\b/ },
  { kind: 'bim-ifc-mep-duct', regex: /\b(ifcduct|duto mep|duto hvac|mep duct)\b/ },
];

export function parseExtendedMagicPenPrompt(rawPrompt: string): ParsedExtendedMagicPenResult {
  const clean = rawPrompt
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!clean) return { matched: false };

  const rule = MATCH_PATTERNS.find((p) => p.regex.test(clean));
  if (!rule) return { matched: false };

  const entry = EXTENDED_MAGIC_PEN_CATALOG.find((e) => e.kind === rule.kind)!;
  const numMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|deg|x)?/i);
  const firstNum = numMatch ? Number(numMatch[1].replace(',', '.')) : undefined;
  const axisMatch = clean.match(/\b([xyz])\b/i);
  const axis = axisMatch ? (axisMatch[1].toLowerCase() as 'x' | 'y' | 'z') : entry.defaultParams.axis;

  const depthMm =
    firstNum && firstNum > 0 && entry.kind !== 'blender-array-mod' && entry.kind !== 'bim-ifc-stair'
      ? Math.min(180, Math.max(2, firstNum))
      : entry.defaultParams.depthMm;

  const count =
    (entry.kind === 'blender-array-mod' ||
      entry.kind === 'bim-ifc-stair' ||
      entry.kind === 'blender-subsurf' ||
      entry.kind === 'blender-bevel') &&
    firstNum &&
    firstNum >= 2
      ? Math.min(16, Math.round(firstNum))
      : entry.defaultParams.count;

  const suiteLabel = entry.suite === 'blender' ? 'Blender' : 'BIM/IFC';

  return {
    matched: true,
    suite: entry.suite,
    kind: entry.kind,
    command: entry.command,
    label: `${suiteLabel} ${entry.command}`,
    widthMm: entry.defaultParams.widthMm,
    lengthMm: entry.defaultParams.lengthMm,
    diameterMm: entry.defaultParams.diameterMm,
    depthMm,
    radiusMm: entry.defaultParams.radiusMm,
    wallThicknessMm: entry.defaultParams.wallThicknessMm,
    angleDeg: entry.defaultParams.angleDeg,
    count,
    axis,
  };
}
