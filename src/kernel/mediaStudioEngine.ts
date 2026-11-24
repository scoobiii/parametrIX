import type { OpenErpWorkspaceSnapshot } from './openErpEngine';
import { buildVucExecutionProof } from './vucHash';
import type { WorkspaceTab } from '../types/cad';

export type MediaPieceCategoryId =
  | '01-logo'
  | '02-social'
  | '03-stationery'
  | '04-apparel'
  | '05-football'
  | '06-advertising'
  | '07-merch'
  | '08-digital'
  | '09-manual';

export type MediaViewSide = 'front' | 'back' | 'application';

export type GanPresetId =
  | 'parametric-mesh'
  | 'neural-circuit'
  | 'kinetic-stadium'
  | 'monochrome-steel';

export type MediaOutputFormat = 'SVG' | 'PDF' | 'PNG' | 'JPG';

export interface CmykTuple {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface BrandColorSwatch {
  id: 'black' | 'blue' | 'cyan' | 'white';
  name: string;
  hex: string;
  rgb: [number, number, number];
  cmyk: CmykTuple;
  role: string;
}

export interface BrandIdentityConfig {
  mode: 'parametrix-official' | 'client-custom';
  brandName: string;
  tagline: string;
  slogan: string;
  symbolCode: string;
  palette: BrandColorSwatch[];
  officialDomain: string;
  officialDomainConfirmed: boolean;
  partnerSponsorName: string;
  athleteImageRightsCleared: boolean;
  clubRulesVerified: boolean;
  logoAspectLocked: boolean;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  versionTag: string;
}

export interface MediaPieceSpec {
  id: MediaPieceCategoryId;
  code: string;
  title: string;
  subtitle: string;
  variants: string[];
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  targetDpi: number;
  colorSpace: 'RGB + CMYK' | 'RGB Digital' | 'CMYK Print';
  unitFabricationCostBrl: number;
  setupCostBrl: number;
  supportsPartnerSponsor: boolean;
  requiresComplianceChecks: boolean;
  defaultFrontLabel: string;
  defaultBackLabel: string;
  defaultApplicationLabel: string;
}

export interface GanSynthesisInput {
  seed: number;
  preset: GanPresetId;
  creativeIntensity: number; // 0..1
  curvatureHarmonic: number; // 0..1
  circuitDensity: number; // 0..1
  motionSweep: number; // 0..1
}

export interface GanWaveCurve {
  index: number;
  amplitude: number;
  phaseRad: number;
  strokeOpacity: number;
}

export interface GanCircuitNode {
  xPct: number;
  yPct: number;
  radius: number;
  connectedToIndex: number;
}

export interface GanMotionStreak {
  yPct: number;
  lengthPct: number;
  angleDeg: number;
  opacity: number;
}

export interface GanLatentMatrix {
  seed: number;
  preset: GanPresetId;
  latentVector: number[];
  waveCurves: GanWaveCurve[];
  circuitNodes: GanCircuitNode[];
  motionStreaks: GanMotionStreak[];
  patternEntropyScore: number;
  ganHash: string;
}

export interface ConstructiveCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ConstructiveMediaReport {
  pieceId: MediaPieceCategoryId;
  allPassed: boolean;
  totalAreaCoveragePct: number;
  maxRecommendedTacPct: number;
  qrCodeEnabled: boolean;
  checks: ConstructiveCheckItem[];
  batchQty: number;
  unitCostBrl: number;
  batchTotalBrl: number;
  vucProofHex: string;
}

export interface ParametrIfRepresentative {
  id: string;
  fullName: string;
  role:
    | 'Embaixador Regional'
    | 'Engenheiro Certificado VUC'
    | 'Parceiro Manufatura CAM'
    | 'Gestão Esportiva & Clubes';
  region: string;
  githubHandle: string;
  email: string;
  status: 'ativo' | 'em-auditoria';
  badgeHash: string;
  issuedAt: string;
}

export interface GithubGovernanceAgent {
  id: string;
  name: string;
  handle: string;
  repoScope: string;
  trigger: string;
  responsibility: string;
  enforcedCheck: string;
}

export interface BusinessPlanPillar {
  id: string;
  title: string;
  targetSegment: string;
  revenueStream: string;
  moat: string;
  linkedTab: WorkspaceTab;
}

export interface AgentOrganogramNode {
  id: string;
  agentName: string;
  roleTitle: string;
  tier: 'Diretoria & Governança' | 'Engenharia & Mídia' | 'Operações ERP/CRM';
  parentAgentId: string | null;
  managedModule: string;
  linkedTab: WorkspaceTab;
  liveKpiLabel: string;
  liveKpiValue: string;
  status: 'online' | 'alerta';
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [37, 99, 235];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToCmyk(r: number, g: number, b: number): CmykTuple {
  const rn = Math.min(1, Math.max(0, r / 255));
  const gn = Math.min(1, Math.max(0, g / 255));
  const bn = Math.min(1, Math.max(0, b / 255));
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.9999) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const c = Math.round(((1 - rn - k) / (1 - k)) * 100);
  const m = Math.round(((1 - gn - k) / (1 - k)) * 100);
  const y = Math.round(((1 - bn - k) / (1 - k)) * 100);
  return { c, m, y, k: Math.round(k * 100) };
}

export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const PARAMETRIX_OFFICIAL_PALETTE: BrandColorSwatch[] = [
  {
    id: 'black',
    name: 'Preto Estrutural',
    hex: '#05070B',
    rgb: [5, 7, 11],
    cmyk: { c: 70, m: 60, y: 55, k: 95 },
    role: 'Fundo industrial, contraste alto e legibilidade em mídia física/digital',
  },
  {
    id: 'blue',
    name: 'Azul Paramétrico',
    hex: '#2563EB',
    rgb: [37, 99, 235],
    cmyk: { c: 84, m: 58, y: 0, k: 8 },
    role: 'Identidade primária de engenharia, tecnologia e confiança construtiva',
  },
  {
    id: 'cyan',
    name: 'Ciano Precisão',
    hex: '#22D3EE',
    rgb: [34, 211, 238],
    cmyk: { c: 72, m: 0, y: 12, k: 0 },
    role: 'Malhas NURBS, circuitos, destaque de movimento e métricas VUC',
  },
  {
    id: 'white',
    name: 'Branco Puro',
    hex: '#F8FAFC',
    rgb: [248, 250, 252],
    cmyk: { c: 2, m: 1, y: 0, k: 1 },
    role: 'Espaço limpo, versão negativa, uniformes claros e tipografia de leitura',
  },
];

export const PARAMETRIX_OFFICIAL_IDENTITY_PRESET: BrandIdentityConfig = {
  mode: 'parametrix-official',
  brandName: 'PARAMETRIX',
  tagline: 'Tecnologia • Inovação • Liberdade',
  slogan: 'Engenharia paramétrica para um mundo melhor.',
  symbolCode: 'P-GEOM-1.0',
  palette: PARAMETRIX_OFFICIAL_PALETTE,
  officialDomain: '',
  officialDomainConfirmed: false,
  partnerSponsorName: '',
  athleteImageRightsCleared: false,
  clubRulesVerified: false,
  logoAspectLocked: true,
  contactName: 'ParametrIF Foundation',
  contactRole: 'Identidade Oficial 1.0',
  contactEmail: 'contato@parametrif.org',
  versionTag: 'Identidade 1.0',
};

export function createClientBrandIdentityPreset(
  brandName: string,
  primaryHex: string,
  accentHex: string,
  partnerSponsorName = ''
): BrandIdentityConfig {
  const cleanBrand = brandName.trim() || 'Cliente Industrial';
  const primaryRgb = hexToRgb(primaryHex);
  const accentRgb = hexToRgb(accentHex);
  return {
    ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
    mode: 'client-custom',
    brandName: cleanBrand.slice(0, 36),
    tagline: 'Produto Oficial • Engenharia ParametrIX',
    slogan: `Identidade construtiva gerada para ${cleanBrand.slice(0, 36)}.`,
    partnerSponsorName: partnerSponsorName.trim().slice(0, 28),
    palette: [
      PARAMETRIX_OFFICIAL_PALETTE[0],
      {
        id: 'blue',
        name: 'Primária Cliente',
        hex: /^#[0-9a-fA-F]{6}$/.test(primaryHex) ? primaryHex : '#2563EB',
        rgb: primaryRgb,
        cmyk: rgbToCmyk(primaryRgb[0], primaryRgb[1], primaryRgb[2]),
        role: 'Cor principal do produto/marca do cliente',
      },
      {
        id: 'cyan',
        name: 'Acento Técnico',
        hex: /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : '#22D3EE',
        rgb: accentRgb,
        cmyk: rgbToCmyk(accentRgb[0], accentRgb[1], accentRgb[2]),
        role: 'Acento de malha paramétrica e acabamento gráfico',
      },
      PARAMETRIX_OFFICIAL_PALETTE[3],
    ],
    contactName: cleanBrand.slice(0, 36),
    contactRole: 'Produto & Marca Customizada',
    contactEmail: 'projetos@parametrix.local',
  };
}

export const MEDIA_STUDIO_PIECE_LIBRARY: MediaPieceSpec[] = [
  {
    id: '01-logo',
    code: '01',
    title: 'Logotipo & Símbolo P',
    subtitle: 'Principal, Horizontal, Vertical, Ícone e Monocromático',
    variants: ['Principal', 'Horizontal', 'Vertical', 'Ícone', 'Monocromático'],
    widthMm: 240,
    heightMm: 120,
    bleedMm: 3,
    targetDpi: 300,
    colorSpace: 'RGB + CMYK',
    unitFabricationCostBrl: 35,
    setupCostBrl: 180,
    supportsPartnerSponsor: false,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Versão Principal & Grade Construtiva',
    defaultBackLabel: 'Versão Monocromática & Área de Respiro',
    defaultApplicationLabel: 'Aplicação em Placa Metálica Anodizada',
  },
  {
    id: '02-social',
    code: '02',
    title: 'Redes Sociais',
    subtitle: 'Avatar, Capa, Post Técnico e Thumbnail/Reel',
    variants: ['Avatar', 'Capa', 'Post', 'Reel/Thumbnail'],
    widthMm: 285.75,
    heightMm: 285.75,
    bleedMm: 0,
    targetDpi: 150,
    colorSpace: 'RGB Digital',
    unitFabricationCostBrl: 18,
    setupCostBrl: 90,
    supportsPartnerSponsor: true,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Card Técnico 1080×1080',
    defaultBackLabel: 'Variação Editorial / Carrossel',
    defaultApplicationLabel: 'Feed & Avatar Responsivo',
  },
  {
    id: '03-stationery',
    code: '03',
    title: 'Papelaria Corporativa',
    subtitle: 'Cartão de Visita, Papel Timbrado, Crachá, Pasta e Assinatura',
    variants: ['Cartão de visita', 'Papel timbrado', 'Crachá', 'Pasta', 'Assinatura'],
    widthMm: 90,
    heightMm: 50,
    bleedMm: 3,
    targetDpi: 300,
    colorSpace: 'CMYK Print',
    unitFabricationCostBrl: 1.45,
    setupCostBrl: 140,
    supportsPartnerSponsor: false,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Frente Institucional (90×50 mm + 3 mm sangria)',
    defaultBackLabel: 'Verso Técnico & Dados (QR bloqueado até URL)',
    defaultApplicationLabel: 'Kit Papelaria (Cartão + Crachá + Papel Timbrado)',
  },
  {
    id: '04-apparel',
    code: '04',
    title: 'Vestuário & Produtos',
    subtitle: 'Camiseta, Polo, Uniforme Técnico, Boné e Jaqueta',
    variants: ['Camiseta', 'Polo', 'Uniforme', 'Boné', 'Jaqueta'],
    widthMm: 320,
    heightMm: 440,
    bleedMm: 5,
    targetDpi: 300,
    colorSpace: 'RGB + CMYK',
    unitFabricationCostBrl: 64,
    setupCostBrl: 290,
    supportsPartnerSponsor: true,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Camiseta / Polo — Frente Peito & Malha',
    defaultBackLabel: 'Costas — Símbolo P, Costura & Assinatura',
    defaultApplicationLabel: 'Uniforme em Chão de Fábrica / Evento',
  },
  {
    id: '05-football',
    code: '05',
    title: 'Futebol & Estádio',
    subtitle: 'Camisa Jogador, Manga, Calção, Placa de Campo, LED & Entrevista',
    variants: [
      'Camisa Jogador (Frente/Verso)',
      'Manga & Calção',
      'Placa de Campo',
      'Painel LED Estádio',
      'Backdrop Entrevista & Colete',
    ],
    widthMm: 360,
    heightMm: 520,
    bleedMm: 5,
    targetDpi: 300,
    colorSpace: 'RGB + CMYK',
    unitFabricationCostBrl: 118,
    setupCostBrl: 520,
    supportsPartnerSponsor: true,
    requiresComplianceChecks: true,
    defaultFrontLabel: 'Camisa de Jogo — Frente + Zona Patrocinador',
    defaultBackLabel: 'Camisa de Jogo — Verso + Numeração Técnica',
    defaultApplicationLabel: 'Painel LED de Campo (6000×900 mm) & Entrevista',
  },
  {
    id: '06-advertising',
    code: '06',
    title: 'Publicidade & Eventos',
    subtitle: 'Backdrop, Banner, Flyer, Totem e Estande Modular',
    variants: ['Backdrop', 'Banner', 'Flyer', 'Totem', 'Estande'],
    widthMm: 2000,
    heightMm: 1200,
    bleedMm: 10,
    targetDpi: 150,
    colorSpace: 'CMYK Print',
    unitFabricationCostBrl: 420,
    setupCostBrl: 360,
    supportsPartnerSponsor: true,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Painel Backdrop Modular 2000×1200 mm',
    defaultBackLabel: 'Guia de Montagem & Corte com Sangria',
    defaultApplicationLabel: 'Cenário de Feira Industrial & Keynotes',
  },
  {
    id: '07-merch',
    code: '07',
    title: 'Produtos & Brindes',
    subtitle: 'Caneca, Squeeze, Botton, Adesivo e Mochila',
    variants: ['Caneca', 'Squeeze', 'Botton', 'Adesivo', 'Mochila'],
    widthMm: 210,
    heightMm: 95,
    bleedMm: 3,
    targetDpi: 300,
    colorSpace: 'RGB + CMYK',
    unitFabricationCostBrl: 29,
    setupCostBrl: 160,
    supportsPartnerSponsor: false,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Rótulo Envoltório Caneca / Squeeze 210×95 mm',
    defaultBackLabel: 'Selo Adesivo Técnico & Botton Ø45 mm',
    defaultApplicationLabel: 'Kit Boas-Vindas Engenharia ParametrIX',
  },
  {
    id: '08-digital',
    code: '08',
    title: 'Digital & Interfaces',
    subtitle: 'Slide Deck, Interface Web/App, Vídeo Técnico e Assinatura',
    variants: ['Slide', 'Interface', 'Vídeo', 'Assinatura'],
    widthMm: 338.6,
    heightMm: 190.5,
    bleedMm: 0,
    targetDpi: 150,
    colorSpace: 'RGB Digital',
    unitFabricationCostBrl: 22,
    setupCostBrl: 110,
    supportsPartnerSponsor: true,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Slide Mestre 16:9 & HUD Digital',
    defaultBackLabel: 'Tela de Encerramento & Métricas VUC',
    defaultApplicationLabel: 'Preview Responsivo Web / Mobile / Apresentação',
  },
  {
    id: '09-manual',
    code: '09',
    title: 'Manual da Marca 1.0',
    subtitle: 'Grid, Tipografia, Cores RGB/CMYK, Usos e Proibições',
    variants: ['Grid Símbolo P', 'Paleta RGB/CMYK', 'Usos Proibidos', 'Aplicações'],
    widthMm: 297,
    heightMm: 210,
    bleedMm: 3,
    targetDpi: 300,
    colorSpace: 'RGB + CMYK',
    unitFabricationCostBrl: 48,
    setupCostBrl: 210,
    supportsPartnerSponsor: false,
    requiresComplianceChecks: false,
    defaultFrontLabel: 'Folha A4 Paisagem — Construção & Malha',
    defaultBackLabel: 'Especificação Cromática & Restrições',
    defaultApplicationLabel: 'Especificação Técnica Completa PDF Vetorial',
  },
];

export const GAN_CREATIVE_PRESETS: { id: GanPresetId; label: string; description: string }[] = [
  {
    id: 'parametric-mesh',
    label: 'Malha NURBS Paramétrica',
    description: 'Harmônicos de superfície B-Spline + curvas gaussianas contínuas.',
  },
  {
    id: 'neural-circuit',
    label: 'Circuito & Nós VUC',
    description: 'Grafo generativo de trilhas digitais inspirado em silício e CAE.',
  },
  {
    id: 'kinetic-stadium',
    label: 'Movimento & Estádio LED',
    description: 'Vetores cinéticos de alta legibilidade para uniformes e placas.',
  },
  {
    id: 'monochrome-steel',
    label: 'Aço Monocromático',
    description: 'Contraste reduzido de alta precisão para gravação laser e papelaria.',
  },
];

export function synthesizeGanLatentMatrix(input: GanSynthesisInput): GanLatentMatrix {
  const seed = Math.abs(Math.floor(input.seed)) || 104729;
  const intensity = clamp01(input.creativeIntensity);
  const curvature = clamp01(input.curvatureHarmonic);
  const density = clamp01(input.circuitDensity);
  const sweep = clamp01(input.motionSweep);

  const latentVector: number[] = [];
  let state = (seed * 1664525 + 1013904223) >>> 0;
  for (let i = 0; i < 8; i++) {
    state = (state * 1664525 + 1013904223 + i * 37) >>> 0;
    const raw = (state % 10000) / 10000;
    const modulated = Number((raw * 0.5 + intensity * 0.25 + curvature * 0.25).toFixed(4));
    latentVector.push(modulated);
  }

  const waveCount = Math.max(3, Math.round(3 + curvature * 5));
  const waveCurves: GanWaveCurve[] = Array.from({ length: waveCount }, (_, idx) => ({
    index: idx,
    amplitude: Number((6 + latentVector[idx % 8] * 18 * (0.4 + intensity)).toFixed(2)),
    phaseRad: Number((latentVector[(idx + 2) % 8] * Math.PI * 2).toFixed(3)),
    strokeOpacity: Number((0.18 + (1 - idx / Math.max(1, waveCount)) * 0.45).toFixed(2)),
  }));

  const nodeCount = Math.max(4, Math.round(4 + density * 8));
  const circuitNodes: GanCircuitNode[] = Array.from({ length: nodeCount }, (_, idx) => {
    const a = latentVector[idx % 8];
    const b = latentVector[(idx + 3) % 8];
    return {
      xPct: Number((12 + ((a * 76 + idx * 11) % 76)).toFixed(1)),
      yPct: Number((14 + ((b * 72 + idx * 17) % 72)).toFixed(1)),
      radius: Number((1.6 + (idx % 3) * 0.8 + intensity * 0.8).toFixed(2)),
      connectedToIndex: (idx + 1) % nodeCount,
    };
  });

  const streakCount = Math.max(2, Math.round(2 + sweep * 6));
  const motionStreaks: GanMotionStreak[] = Array.from({ length: streakCount }, (_, idx) => ({
    yPct: Number((16 + (idx * 68) / Math.max(1, streakCount)).toFixed(1)),
    lengthPct: Number((22 + latentVector[(idx + 1) % 8] * 48 * (0.5 + sweep)).toFixed(1)),
    angleDeg: input.preset === 'kinetic-stadium' ? -12 : -4,
    opacity: Number((0.22 + sweep * 0.48).toFixed(2)),
  }));

  const entropy = Number(
    (
      (latentVector.reduce((acc, v) => acc + v, 0) / latentVector.length) * 0.55 +
      intensity * 0.25 +
      density * 0.2
    ).toFixed(3)
  );

  const proof = buildVucExecutionProof(
    'media-gan-latent',
    `${seed}:${input.preset}:${intensity}:${curvature}:${density}:${sweep}`,
    JSON.stringify({ latentVector, entropy })
  );

  return {
    seed,
    preset: input.preset,
    latentVector,
    waveCurves,
    circuitNodes,
    motionStreaks,
    patternEntropyScore: entropy,
    ganHash: proof.vucHash,
  };
}

export function evaluateConstructiveMediaEngineering(
  identity: BrandIdentityConfig,
  piece: MediaPieceSpec,
  ganMatrix: GanLatentMatrix,
  batchQty: number
): ConstructiveMediaReport {
  const safeBatchQty = Math.max(1, Math.round(batchQty));
  const blueSwatch = identity.palette.find((c) => c.id === 'blue') ?? PARAMETRIX_OFFICIAL_PALETTE[1];
  const blackSwatch = identity.palette.find((c) => c.id === 'black') ?? PARAMETRIX_OFFICIAL_PALETTE[0];
  const primaryTac =
    blueSwatch.cmyk.c + blueSwatch.cmyk.m + blueSwatch.cmyk.y + blueSwatch.cmyk.k;
  const darkTac =
    blackSwatch.cmyk.c + blackSwatch.cmyk.m + blackSwatch.cmyk.y + blackSwatch.cmyk.k;
  const totalAreaCoveragePct = Math.max(primaryTac, darkTac);
  const maxRecommendedTacPct = 290;

  const domainTrimmed = identity.officialDomain.trim();
  const domainValid =
    !identity.officialDomainConfirmed ||
    /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(domainTrimmed);
  const qrCodeEnabled = identity.officialDomainConfirmed && domainValid;

  const isPrintPiece = piece.colorSpace !== 'RGB Digital';
  const bleedOk = !isPrintPiece || piece.bleedMm >= 3;
  const tacOk = !isPrintPiece || totalAreaCoveragePct <= maxRecommendedTacPct;
  const sponsorOk =
    !identity.partnerSponsorName.trim() ||
    (piece.supportsPartnerSponsor && identity.partnerSponsorName.trim().length <= 28);
  const footballComplianceOk =
    !piece.requiresComplianceChecks ||
    (identity.athleteImageRightsCleared && identity.clubRulesVerified);

  const checks: ConstructiveCheckItem[] = [
    {
      id: 'logo-aspect-lock',
      label: 'Proporção Geométrica do Símbolo P travada',
      passed: identity.logoAspectLocked,
      detail: identity.logoAspectLocked
        ? 'Razão 1:1 preservada em malha construtiva sem deformação.'
        : 'Trava de proporção desativada — risco de distorção da marca.',
    },
    {
      id: 'print-bleed',
      label: 'Sangria & Área de Corte Industrial',
      passed: bleedOk,
      detail: isPrintPiece
        ? `Sangria ${piece.bleedMm} mm em ${piece.widthMm}×${piece.heightMm} mm @ ${piece.targetDpi} DPI.`
        : `Saída digital ${piece.widthMm.toFixed(0)}×${piece.heightMm.toFixed(0)} mm sem sangria gráfica.`,
    },
    {
      id: 'cmyk-tac',
      label: 'Limite de Tinta CMYK (TAC)',
      passed: tacOk,
      detail: `TAC máximo medido: ${totalAreaCoveragePct}% (teto normativo ${maxRecommendedTacPct}%).`,
    },
    {
      id: 'domain-qr-gate',
      label: 'Trava de URL Oficial & QR Code',
      passed: domainValid,
      detail: qrCodeEnabled
        ? `Domínio oficial confirmado (${domainTrimmed}) — QR Code liberado para impressão.`
        : identity.officialDomainConfirmed
          ? 'Domínio marcado como confirmado, mas formato URL https:// inválido.'
          : 'URL/QR Code bloqueados por segurança até confirmação do domínio oficial.',
    },
    {
      id: 'partner-sponsor-zone',
      label: 'Zona Neutra de Patrocinador / Parceiro',
      passed: sponsorOk,
      detail: identity.partnerSponsorName.trim()
        ? piece.supportsPartnerSponsor
          ? `Slot dedicado reservado para "${identity.partnerSponsorName.trim()}" sem sobrepor o P.`
          : 'Esta peça institucional não permite patrocinador externo.'
        : 'Sem patrocinador secundário; área limpa preservada.',
    },
    {
      id: 'sports-rights-compliance',
      label: 'Direitos de Imagem & Regulamento de Clube/Liga',
      passed: footballComplianceOk,
      detail: piece.requiresComplianceChecks
        ? footballComplianceOk
          ? 'Autorização de atletas e regulamento de competição/estádio validados.'
          : 'Pendente confirmar direitos de imagem do atleta e regras do clube/estádio.'
        : 'Não aplicável a esta mídia fora do escopo esportivo.',
    },
  ];

  const unitCostBrl = Number(
    (
      piece.unitFabricationCostBrl *
      (1 + (identity.mode === 'client-custom' ? 0.08 : 0) + ganMatrix.waveCurves.length * 0.01)
    ).toFixed(2)
  );
  const batchTotalBrl = Number((piece.setupCostBrl + unitCostBrl * safeBatchQty).toFixed(2));

  const proof = buildVucExecutionProof(
    'media-constructive-engineering',
    `${identity.brandName}:${piece.id}:${ganMatrix.ganHash}:${safeBatchQty}`,
    JSON.stringify({ checks, unitCostBrl, batchTotalBrl })
  );

  return {
    pieceId: piece.id,
    allPassed: checks.every((c) => c.passed),
    totalAreaCoveragePct,
    maxRecommendedTacPct,
    qrCodeEnabled,
    checks,
    batchQty: safeBatchQty,
    unitCostBrl,
    batchTotalBrl,
    vucProofHex: proof.vucHash.replace('VUC-', '').slice(0, 16).toUpperCase(),
  };
}

export function generateBrandAssetSvg(
  identity: BrandIdentityConfig,
  piece: MediaPieceSpec,
  ganMatrix: GanLatentMatrix,
  viewSide: MediaViewSide
): string {
  const black = identity.palette.find((c) => c.id === 'black')?.hex ?? '#05070B';
  const blue = identity.palette.find((c) => c.id === 'blue')?.hex ?? '#2563EB';
  const cyan = identity.palette.find((c) => c.id === 'cyan')?.hex ?? '#22D3EE';
  const white = identity.palette.find((c) => c.id === 'white')?.hex ?? '#F8FAFC';

  const isWide =
    piece.id === '03-stationery' ||
    piece.id === '06-advertising' ||
    piece.id === '08-digital' ||
    piece.id === '09-manual' ||
    (piece.id === '05-football' && viewSide === 'application');

  const vw = isWide ? 900 : 720;
  const vh = isWide ? 500 : 720;

  const isLightMode = viewSide === 'back' && piece.id !== '05-football';
  const bgColor =
    ganMatrix.preset === 'monochrome-steel'
      ? '#0B0E14'
      : isLightMode
        ? white
        : black;
  const fgColor = isLightMode && ganMatrix.preset !== 'monochrome-steel' ? black : white;
  const accentPrimary = ganMatrix.preset === 'monochrome-steel' ? '#CBD5E1' : blue;
  const accentSecondary = ganMatrix.preset === 'monochrome-steel' ? '#94A3B8' : cyan;

  const wavePaths = ganMatrix.waveCurves
    .map((w) => {
      const yBase = Math.round(vh * 0.72 + (w.index - 2) * 18);
      const c1y = Math.round(yBase - w.amplitude * 2.2);
      const c2y = Math.round(yBase + w.amplitude * 2.2);
      return `<path d="M 0 ${yBase} C ${Math.round(vw * 0.33)} ${c1y}, ${Math.round(
        vw * 0.66
      )} ${c2y}, ${vw} ${yBase}" fill="none" stroke="${accentSecondary}" stroke-width="1.5" opacity="${
        w.strokeOpacity
      }" />`;
    })
    .join('\n');

  const circuitElements = ganMatrix.circuitNodes
    .map((node, i) => {
      const target =
        ganMatrix.circuitNodes[node.connectedToIndex % ganMatrix.circuitNodes.length];
      const x1 = Math.round((node.xPct / 100) * vw);
      const y1 = Math.round((node.yPct / 100) * vh);
      const x2 = Math.round((target.xPct / 100) * vw);
      const y2 = Math.round((target.yPct / 100) * vh);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accentPrimary}" stroke-width="1" opacity="0.24" /><circle cx="${x1}" cy="${y1}" r="${
        node.radius + 1
      }" fill="${i % 2 === 0 ? accentSecondary : accentPrimary}" opacity="0.45" />`;
    })
    .join('\n');

  const streakElements = ganMatrix.motionStreaks
    .map((st) => {
      const x = Math.round(vw * 0.08);
      const y = Math.round((st.yPct / 100) * vh);
      const w = Math.round((st.lengthPct / 100) * vw);
      return `<rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="${accentSecondary}" opacity="${st.opacity}" />`;
    })
    .join('\n');

  const pMarkX = isWide ? 72 : 290;
  const pMarkY = isWide ? 82 : 120;
  const pMark = `
    <g transform="translate(${pMarkX}, ${pMarkY})">
      <rect x="0" y="0" width="96" height="96" rx="14" fill="${accentPrimary}" opacity="0.14" stroke="${accentSecondary}" stroke-width="2" />
      <path d="M22 18 H62 L76 32 V52 L62 66 H38 V82 H22 Z M38 32 V52 H58 V32 Z" fill="${accentPrimary}" />
      <path d="M56 18 H76 L76 36 Z" fill="${accentSecondary}" />
      <circle cx="72" cy="74" r="5" fill="${accentSecondary}" />
    </g>
  `;

  const sponsorText = identity.partnerSponsorName.trim();
  const sponsorBlock =
    sponsorText && piece.supportsPartnerSponsor
      ? `<g transform="translate(${Math.round(vw * 0.5) - 140}, ${vh - 138})">
           <rect x="0" y="0" width="280" height="44" rx="8" fill="${accentPrimary}" opacity="0.16" stroke="${accentSecondary}" stroke-width="1.2" />
           <text x="140" y="16" text-anchor="middle" font-family="monospace" font-size="10" fill="${accentSecondary}">PATROCINADOR PARCEIRO</text>
           <text x="140" y="34" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="16" fill="${fgColor}">${escapeXml(
             sponsorText
           )}</text>
         </g>`
      : '';

  const qrBlock = identity.officialDomainConfirmed && identity.officialDomain.trim()
    ? `<g transform="translate(${vw - 128}, ${vh - 128})">
         <rect x="0" y="0" width="84" height="84" rx="6" fill="${white}" stroke="${accentSecondary}" stroke-width="1.5" />
         <rect x="10" y="10" width="20" height="20" fill="${black}" />
         <rect x="54" y="10" width="20" height="20" fill="${black}" />
         <rect x="10" y="54" width="20" height="20" fill="${black}" />
         <rect x="38" y="38" width="14" height="14" fill="${accentPrimary}" />
         <text x="42" y="98" text-anchor="middle" font-family="monospace" font-size="9" fill="${accentSecondary}">URL OFICIAL ATIVA</text>
       </g>`
    : `<g transform="translate(${vw - 154}, ${vh - 108})">
         <rect x="0" y="0" width="118" height="64" rx="6" fill="${accentPrimary}" opacity="0.12" stroke="${accentSecondary}" stroke-dasharray="4 3" stroke-width="1" />
         <text x="59" y="28" text-anchor="middle" font-family="monospace" font-size="9" fill="${accentSecondary}">QR / URL TRAVADO</text>
         <text x="59" y="44" text-anchor="middle" font-family="monospace" font-size="8" fill="${fgColor}" opacity="0.7">Confirmar domínio</text>
       </g>`;

  const apparelSilhouette =
    (piece.id === '04-apparel' || piece.id === '05-football') && viewSide !== 'application'
      ? `<g opacity="0.9">
           <path d="M180 120 L255 92 Q360 135 465 92 L540 120 L615 225 L555 275 L515 225 L515 620 L205 620 L205 225 L165 275 L105 225 Z" fill="${
             viewSide === 'back' ? '#0F172A' : '#111827'
           }" stroke="${accentSecondary}" stroke-width="2.5" />
           ${
             viewSide === 'back'
               ? `<text x="360" y="295" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="34" letter-spacing="4" fill="${white}">${escapeXml(
                   identity.brandName.toUpperCase()
                 )}</text>
                  <text x="360" y="455" text-anchor="middle" font-family="monospace" font-weight="800" font-size="144" fill="${accentSecondary}">10</text>`
               : ''
           }
         </g>`
      : '';

  const viewTitle =
    viewSide === 'front'
      ? piece.defaultFrontLabel
      : viewSide === 'back'
        ? piece.defaultBackLabel
        : piece.defaultApplicationLabel;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" role="img" aria-label="${escapeXml(
    `${identity.brandName} — ${piece.title}`
  )}">
  <rect width="${vw}" height="${vh}" fill="${bgColor}" />
  <rect x="16" y="16" width="${vw - 32}" height="${vh - 32}" fill="none" stroke="${accentSecondary}" stroke-width="1" stroke-dasharray="6 4" opacity="0.35" />
  ${wavePaths}
  ${circuitElements}
  ${streakElements}
  ${apparelSilhouette}
  ${pMark}
  <text x="${isWide ? 196 : 360}" y="${isWide ? 124 : 262}" text-anchor="${
    isWide ? 'start' : 'middle'
  }" font-family="sans-serif" font-weight="800" font-size="${
    isWide ? 42 : 38
  }" letter-spacing="3" fill="${fgColor}">${escapeXml(identity.brandName)}</text>
  <text x="${isWide ? 196 : 360}" y="${isWide ? 156 : 296}" text-anchor="${
    isWide ? 'start' : 'middle'
  }" font-family="sans-serif" font-weight="600" font-size="16" fill="${accentSecondary}">${escapeXml(
    identity.tagline
  )}</text>
  <text x="${isWide ? 72 : 360}" y="${isWide ? 236 : 340}" text-anchor="${
    isWide ? 'start' : 'middle'
  }" font-family="sans-serif" font-size="17" fill="${fgColor}" opacity="0.9">${escapeXml(
    identity.slogan
  )}</text>
  <text x="${isWide ? 72 : 44}" y="${vh - 68}" font-family="monospace" font-size="12" fill="${fgColor}" opacity="0.82">${escapeXml(
    `${piece.code} ${piece.title} · ${viewTitle}`
  )}</text>
  <text x="${isWide ? 72 : 44}" y="${vh - 46}" font-family="monospace" font-size="11" fill="${accentSecondary}">${escapeXml(
    `${piece.widthMm}×${piece.heightMm} mm · Sangria ${piece.bleedMm} mm · ${piece.targetDpi} DPI · GAN #${ganMatrix.seed}`
  )}</text>
  <text x="${isWide ? 72 : 44}" y="${vh - 28}" font-family="monospace" font-size="10" fill="${fgColor}" opacity="0.68">${escapeXml(
    `${identity.contactName} · ${identity.contactRole} · ${identity.versionTag}`
  )}</text>
  ${sponsorBlock}
  ${qrBlock}
</svg>`;
}

function pdfSafeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildVectorPdfDocument(
  identity: BrandIdentityConfig,
  piece: MediaPieceSpec,
  report: ConstructiveMediaReport,
  viewSide: MediaViewSide
): string {
  const blueSwatch = identity.palette.find((c) => c.id === 'blue') ?? PARAMETRIX_OFFICIAL_PALETTE[1];
  const cyanSwatch = identity.palette.find((c) => c.id === 'cyan') ?? PARAMETRIX_OFFICIAL_PALETTE[2];
  const r1 = (blueSwatch.rgb[0] / 255).toFixed(3);
  const g1 = (blueSwatch.rgb[1] / 255).toFixed(3);
  const b1 = (blueSwatch.rgb[2] / 255).toFixed(3);
  const r2 = (cyanSwatch.rgb[0] / 255).toFixed(3);
  const g2 = (cyanSwatch.rgb[1] / 255).toFixed(3);
  const b2 = (cyanSwatch.rgb[2] / 255).toFixed(3);

  const lines = [
    '0.020 0.027 0.043 rg 0 0 595 842 re f',
    `${r2} ${g2} ${b2} RG 1.2 w 36 36 523 770 re S`,
    `${r1} ${g1} ${b1} rg 54 680 72 72 re f`,
    `${r2} ${g2} ${b2} RG 2 w 54 680 72 72 re S`,
    `0.973 0.980 0.988 rg BT /F1 24 Tf 144 722 Td (${pdfSafeText(identity.brandName)}) Tj ET`,
    `${r2} ${g2} ${b2} rg BT /F1 11 Tf 144 700 Td (${pdfSafeText(identity.tagline)}) Tj ET`,
    `0.973 0.980 0.988 rg BT /F1 12 Tf 54 640 Td (${pdfSafeText(identity.slogan)}) Tj ET`,
    `${r2} ${g2} ${b2} rg BT /F1 11 Tf 54 606 Td (Peca ${pdfSafeText(piece.code)}: ${pdfSafeText(piece.title)} [${viewSide}]) Tj ET`,
    `0.820 0.860 0.910 rg BT /F1 10 Tf 54 584 Td (Dimensoes: ${piece.widthMm} x ${piece.heightMm} mm | Sangria: ${piece.bleedMm} mm | ${piece.targetDpi} DPI | ${pdfSafeText(piece.colorSpace)}) Tj ET`,
    `0.820 0.860 0.910 rg BT /F1 10 Tf 54 564 Td (CMYK TAC: ${report.totalAreaCoveragePct}% / Max ${report.maxRecommendedTacPct}% | Lote: ${report.batchQty} un | Total: BRL ${report.batchTotalBrl.toFixed(2)}) Tj ET`,
    `${r2} ${g2} ${b2} rg BT /F1 9 Tf 54 536 Td (URL/QR Oficial: ${
      report.qrCodeEnabled ? pdfSafeText(identity.officialDomain) : 'BLOQUEADO ATE CONFIRMACAO DE DOMINIO'
    }) Tj ET`,
    `0.820 0.860 0.910 rg BT /F1 9 Tf 54 516 Td (VUC Ed25519/SHA256 Ref: ${report.vucProofHex}) Tj ET`,
  ];

  const streamContent = lines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}

export const PARAMETRIF_FOUNDATION_CHARTER = {
  foundationName: 'ParametrIF Foundation',
  mandate: 'Guardiã da Marca ParametrIX 1.0, Normas Abertas CAD/CAM e Certificação VUC',
  repositoryUrl: 'https://github.com/scoobiii/parametrIX',
  principles: [
    'Proibido distorcer ou alterar a geometria do símbolo P em aplicações físicas ou digitais.',
    'Todo entregável físico ou esportivo exige prova VUC SHA-256 + Ed25519 verificável.',
    'QR Codes e URLs só podem ser impressos após validação formal do domínio oficial.',
    'Uso esportivo e patrocínios em futebol exigem autorização de imagem de atletas e clube.',
  ],
};

export const DEFAULT_PARAMETRIF_REPRESENTATIVES: ParametrIfRepresentative[] = [
  {
    id: 'rep-if-01',
    fullName: 'Marcos Dutra da Silva',
    role: 'Embaixador Regional',
    region: 'Brasil — São Paulo / Sudeste',
    githubHandle: '@scoobiii',
    email: 'marcosdutradasilva9@gmail.com',
    status: 'ativo',
    badgeHash: 'VUC-IF-SCB01',
    issuedAt: '2026-11-24',
  },
  {
    id: 'rep-if-02',
    fullName: 'Núcleo ParametrIF VUC Audit',
    role: 'Engenheiro Certificado VUC',
    region: 'Global / GitHub CI Runner',
    githubHandle: '@parametrif-vuc-bot',
    email: 'vuc-audit@parametrif.org',
    status: 'ativo',
    badgeHash: 'VUC-IF-AUD02',
    issuedAt: '2026-11-24',
  },
  {
    id: 'rep-if-03',
    fullName: 'Célula CAM & Esportes Brasil',
    role: 'Gestão Esportiva & Clubes',
    region: 'Brasil — Estádios & Confecções',
    githubHandle: '@parametrix-sports',
    email: 'esportes@parametrif.org',
    status: 'em-auditoria',
    badgeHash: 'VUC-IF-SPT03',
    issuedAt: '2026-11-24',
  },
];

export function certifyFoundationRepresentative(
  existing: ParametrIfRepresentative[],
  input: {
    fullName: string;
    role: ParametrIfRepresentative['role'];
    region: string;
    githubHandle: string;
    email: string;
  }
): ParametrIfRepresentative[] {
  const normalizedHandle = input.githubHandle.trim().startsWith('@')
    ? input.githubHandle.trim()
    : `@${input.githubHandle.trim() || 'rep-parametrix'}`;
  const proof = buildVucExecutionProof(
    'parametrif-rep-cert',
    `${input.fullName}:${input.email}:${normalizedHandle}`,
    input.region
  );
  const next: ParametrIfRepresentative = {
    id: `rep-if-${existing.length + 1}`,
    fullName: input.fullName.trim() || 'Novo Representante',
    role: input.role,
    region: input.region.trim() || 'Global',
    githubHandle: normalizedHandle,
    email: input.email.trim() || 'rep@parametrif.org',
    status: 'ativo',
    badgeHash: `VUC-IF-${proof.vucHash.replace('VUC-', '').slice(0, 6).toUpperCase()}`,
    issuedAt: new Date().toISOString().slice(0, 10),
  };
  return [next, ...existing];
}

export const GITHUB_GOVERNANCE_AGENTS: GithubGovernanceAgent[] = [
  {
    id: 'gh-brand-guard',
    name: 'Agente Brand-Guard ParametrIF',
    handle: '@parametrif-brand-guard',
    repoScope: 'scoobiii/parametrIX (main / PRs)',
    trigger: 'pull_request / push em src/kernel/mediaStudioEngine.ts & assets',
    responsibility: 'Impede distorção da paleta 1.0, trava QR sem domínio oficial e valida SVG/PDF.',
    enforcedCheck: 'Brand Identity 1.0 + TAC <= 290% + QR Domain Lock',
  },
  {
    id: 'gh-vuc-sentinel',
    name: 'Agente Sentinel CI 100%',
    handle: '@parametrix-ci-vuc',
    repoScope: 'scoobiii/parametrIX (.github/workflows/ci.yml)',
    trigger: 'push / workflow_dispatch',
    responsibility: 'Exige 100% de cobertura V8, 27/27 audit:cad e emissão de proof/vuc-latest.json.',
    enforcedCheck: 'npm run ci && npm run vuc:proof',
  },
  {
    id: 'gh-rep-registry',
    name: 'Agente Registro ParametrIF',
    handle: '@parametrif-registry',
    repoScope: 'scoobiii/parametrIX (representantes & licenças)',
    trigger: 'issues / pull_request / sync ERP',
    responsibility: 'Valida credenciais de representantes oficiais, clubes e fornecedores CAM.',
    enforcedCheck: 'Certificação VUC + Licença Semestral',
  },
];

export function buildGithubBrandGuardWorkflowYaml(repoSlug = 'scoobiii/parametrIX'): string {
  return `name: ParametrIF Brand Guard & Governance (${repoSlug})

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  parametrif-brand-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run tests/mediaStudioEngine.test.ts --coverage --coverage.include=src/kernel/mediaStudioEngine.ts --coverage.thresholds.lines=100 --coverage.thresholds.functions=100 --coverage.thresholds.branches=100 --coverage.thresholds.statements=100
      - run: npm run vuc:proof
`;
}

export const PARAMETRIX_BUSINESS_PLAN = {
  mission:
    'Democratizar engenharia paramétrica CAD/CAE/CAM, manufatura inteligente e identidade construtiva verificável por prova matemática VUC.',
  vision:
    'Consolidar o sistema operacional aberto que une projeto 3D NURBS, chão de fábrica robótico, branding construtivo e ERP/CRM em tempo real.',
  valueProposition:
    'Do arquivo técnico ou conceito visual à peça fabricada, certificada em Ed25519 VUC e precificada com ROI real em um único fluxo contínuo.',
  pillars: [
    {
      id: 'p1-cad-cae',
      title: 'Engenharia CAD NURBS & FEA/CO₂',
      targetSegment: 'Indústrias CNC, Aeroespacial, BIM e Mobilidade',
      revenueStream: 'Projetos sob demanda, auditoria GD&T e otimização de massa',
      moat: 'Importação real .STP/.IPT + Caneta Mágica + prova matemática SCOOBIII/VUC',
      linkedTab: 'viewport',
    },
    {
      id: 'p2-cam-robotics',
      title: 'Manufatura CAM 8-Processos & Robótica',
      targetSegment: 'Usinagem 3/5 eixos, KUKA 6-eixos, LPBF Metal, SLA e Laser',
      revenueStream: 'Horas-máquina distribuídas e despacho remoto OPC-UA/MQTT',
      moat: 'G-Code/KRL real sincronizado ao vivo com custos e consumo energético no ERP',
      linkedTab: 'cam',
    },
    {
      id: 'p3-media-studio',
      title: 'ParametrIX Media Studio (GAN + Construtiva)',
      targetSegment: 'Produtos de clientes, vestuário técnico, clubes de futebol e eventos',
      revenueStream: 'Kits corporativos, uniformes/LED esportivo e personalização B2B',
      moat: 'Identidade 1.0 + GAN determinístico + fechamento vetorial SVG/PDF 300 DPI',
      linkedTab: 'media-studio',
    },
    {
      id: 'p4-erp-crm',
      title: 'ERP / BI / CRM Open Real-Time',
      targetSegment: 'PMEs fabris, fornecedores de insumos e operadores logísticos',
      revenueStream: 'Comissão de pedidos B2B, roteamento multimodal e BI preditivo',
      moat: 'BOM automática, tributos Brasil (Simples/Presumido/Real) e SQLite + Firestore',
      linkedTab: 'ecosystem',
    },
    {
      id: 'p5-parametrif',
      title: 'Fundação ParametrIF & Governança GitHub',
      targetSegment: 'Representantes regionais, clubes parceiros e contribuidores open-source',
      revenueStream: 'Licenciamento ético da marca, auditoria VUC e certificação de parceiros',
      moat: 'Agentes GitHub automatizados com 100% de cobertura de testes e guarda da marca',
      linkedTab: 'media-studio',
    },
  ] satisfies BusinessPlanPillar[],
};

export function buildAgentOrganogramBoard(
  erpSnapshot?: OpenErpWorkspaceSnapshot | null
): AgentOrganogramNode[] {
  const unitPrice = erpSnapshot
    ? erpSnapshot.pricingAndRoi.commercialDisclosureBlocked
      ? 'Pré-Silício'
      : `R$ ${erpSnapshot.pricingAndRoi.parametrixPriceUnitBrl.toLocaleString('pt-BR')}`
    : 'Aguardando ERP';
  const bomTotal = erpSnapshot
    ? `R$ ${erpSnapshot.bomTotalBatchBrl.toLocaleString('pt-BR')}`
    : 'Sync ativo';
  const crmPipeline = erpSnapshot
    ? `R$ ${erpSnapshot.biSummary.weightedCrmValueBrl.toLocaleString('pt-BR')}`
    : '0 leads';
  const freightLabel = erpSnapshot
    ? `${erpSnapshot.logistics.modalLabel} · R$ ${erpSnapshot.logistics.totalFreightBrl.toLocaleString('pt-BR')}`
    : 'Multimodal';
  const readiness = erpSnapshot ? `${erpSnapshot.biSummary.techReadinessPct}% BI` : 'VUC Ativo';

  return [
    {
      id: 'ag-ceo-vuc',
      agentName: 'Agente Orquestrador VUC',
      roleTitle: 'Governança Executiva, Missão & Prova Ed25519',
      tier: 'Diretoria & Governança',
      parentAgentId: null,
      managedModule: 'Orquestração Geral & Onboarding',
      linkedTab: 'onboarding',
      liveKpiLabel: 'Prontidão Técnica',
      liveKpiValue: readiness,
      status: 'online',
    },
    {
      id: 'ag-parametrif-gh',
      agentName: 'Agente ParametrIF & GitHub',
      roleTitle: 'Representantes Oficiais & CI Brand-Guard',
      tier: 'Diretoria & Governança',
      parentAgentId: 'ag-ceo-vuc',
      managedModule: 'Fundação ParametrIF & Repo scoobiii/parametrIX',
      linkedTab: 'media-studio',
      liveKpiLabel: 'Cobertura / Marca',
      liveKpiValue: '100% V8 + Identidade 1.0',
      status: 'online',
    },
    {
      id: 'ag-media-gan',
      agentName: 'Agente Media Studio GAN',
      roleTitle: 'Identidade Visual, Vestuário, Futebol & PDF Vetorial',
      tier: 'Engenharia & Mídia',
      parentAgentId: 'ag-ceo-vuc',
      managedModule: 'ParametrIX Media Studio (01–09)',
      linkedTab: 'media-studio',
      liveKpiLabel: 'Motor Dual',
      liveKpiValue: 'GAN + Construtiva 300 DPI',
      status: 'online',
    },
    {
      id: 'ag-cad-nurbs',
      agentName: 'Agente CAD NURBS & Caneta',
      roleTitle: 'B-Rep STEP/IPT, Curvatura & Ferramentas 3D',
      tier: 'Engenharia & Mídia',
      parentAgentId: 'ag-ceo-vuc',
      managedModule: 'Editor 3D IX & Biblioteca',
      linkedTab: 'viewport',
      liveKpiLabel: 'Peça Ativa',
      liveKpiValue: erpSnapshot?.partName || 'Casca Paramétrica',
      status: 'online',
    },
    {
      id: 'ag-cae-co2',
      agentName: 'Agente CAE FEA & LCA CO₂',
      roleTitle: 'Von Mises, Margem de Segurança & Pegada de Carbono',
      tier: 'Engenharia & Mídia',
      parentAgentId: 'ag-cad-nurbs',
      managedModule: 'CAE / Sustentabilidade',
      linkedTab: 'sustainability',
      liveKpiLabel: 'Correlação CAE',
      liveKpiValue: erpSnapshot?.correlatedAreas[1]?.status.toUpperCase() || 'SINCRONIZADO',
      status: erpSnapshot?.correlatedAreas[1]?.status === 'alerta' ? 'alerta' : 'online',
    },
    {
      id: 'ag-cam-robot',
      agentName: 'Agente CAM & Robótica',
      roleTitle: '8 Processos Produtivos, G-Code & Despacho MQTT',
      tier: 'Operações ERP/CRM',
      parentAgentId: 'ag-cad-nurbs',
      managedModule: 'CAM & Máquinas Remotas',
      linkedTab: 'cam',
      liveKpiLabel: 'Ciclo / Máquina',
      liveKpiValue: erpSnapshot
        ? `${erpSnapshot.routingCost.machineType} (${erpSnapshot.routingCost.cycleMinutesPerUnit} min)`
        : '5-Eixos / KUKA',
      status: 'online',
    },
    {
      id: 'ag-erp-bom',
      agentName: 'Agente Suprimentos & BOM',
      roleTitle: 'Lista de Materiais, Tarugo, Cavaco & Consumíveis',
      tier: 'Operações ERP/CRM',
      parentAgentId: 'ag-ceo-vuc',
      managedModule: 'ERP Open — BOM & Insumos',
      linkedTab: 'ecosystem',
      liveKpiLabel: 'BOM do Lote',
      liveKpiValue: bomTotal,
      status: 'online',
    },
    {
      id: 'ag-erp-logistica',
      agentName: 'Agente Logística Multimodal',
      roleTitle: 'Roteamento Rodo/Ferro/Aero/Fluvial & GPS Ao Vivo',
      tier: 'Operações ERP/CRM',
      parentAgentId: 'ag-erp-bom',
      managedModule: 'Logística GPS & Frete',
      linkedTab: 'ecosystem',
      liveKpiLabel: 'Rota Ativa',
      liveKpiValue: freightLabel,
      status: 'online',
    },
    {
      id: 'ag-crm-vendas',
      agentName: 'Agente CRM & Clientes',
      roleTitle: 'Leads B2B, Clubes Esportivos & Cotações VUC',
      tier: 'Operações ERP/CRM',
      parentAgentId: 'ag-ceo-vuc',
      managedModule: 'BI & CRM Potenciais Clientes',
      linkedTab: 'ecosystem',
      liveKpiLabel: 'Pipeline Ponderado',
      liveKpiValue: crmPipeline,
      status: 'online',
    },
    {
      id: 'ag-fin-fiscal',
      agentName: 'Agente Financeiro & Fiscal',
      roleTitle: 'Preço ParametrIX, Tributos BR, ROI & Payback',
      tier: 'Operações ERP/CRM',
      parentAgentId: 'ag-crm-vendas',
      managedModule: 'Precificação, Impostos & ROI',
      linkedTab: 'ecosystem',
      liveKpiLabel: 'Preço Unitário',
      liveKpiValue: unitPrice,
      status: 'online',
    },
  ];
}
