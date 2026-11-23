/**
 * @gos7-header v1.0
 * arquivo: src/kernel/publicChatSignaling.ts
 * responsabilidade: Regras, temas, validação de usuários cadastrados, URL de processo por sessão e presença WebRTC do chat público.
 */
import type {
  DisplayMode,
  MachineType,
  PublicChatTheme,
  PublicChatThemeId,
  RtcPeerPresence,
  WorkspaceTab,
} from '../types/cad';

export const PUBLIC_CHAT_THEMES: PublicChatTheme[] = [
  {
    id: 'geral',
    label: '#geral · Ecossistema & Pedidos',
    description: 'Coordenação geral entre clientes, oficinas CAM, logística e fornecedores.',
    recommendedProcess: 'cnc-5axis',
  },
  {
    id: 'cad-nurbs',
    label: '#cad-nurbs · B-Rep, STEP & Máscaras',
    description: 'Discussão de malhas estancadas, NURBS, tolerâncias ISO 2768 e Object Mask.',
    recommendedProcess: 'cnc-5axis',
  },
  {
    id: 'cae-fea',
    label: '#cae-fea · Von Mises & Fadiga',
    description: 'Análise estrutural FEA, fator de segurança, ciclos Basquin S-N e material PBR.',
    recommendedProcess: 'cnc-3axis',
  },
  {
    id: 'cam-cnc',
    label: '#cam-cnc · G-Code, Robôs & Aditiva',
    description: 'CNC 3/5 eixos, KUKA 6-eixos, LPBF pó metálico, Resina SLA UV, Solda MIG/TIG e Laser 4 kW.',
    recommendedProcess: 'powder-metal',
  },
  {
    id: 'frostbite-7nm',
    label: '#frostbite-7nm · Silício CMOS & DC 800V',
    description: 'Interaction nets em silício CMOS 7 nm 500 MHz (pré-silício), liquid cooling e humanoides.',
    recommendedProcess: 'cnc-5axis',
  },
  {
    id: 'vuc-devops',
    label: '#vuc-devops · Provas Ed25519 & CI',
    description: 'Provas VUC SHA-256 + Ed25519, cobertura 100% e cabeçalhos GOS7 multi-agente.',
    recommendedProcess: 'manual',
  },
];

export const PUBLIC_CHAT_RULES: string[] = [
  '1. Acesso restrito a usuários cadastrados no Parametrix (e-mail/sessão verificada no SQLite ou Firebase).',
  '2. Proibido simular resultados ou enviar métricas inventadas; referencie hashes VUC e arquivos reais.',
  '3. Nunca compartilhe tokens privados, chaves de API, senhas ou chaves privadas PEM nas mensagens.',
  '4. Ao abrir chamada de voz, vídeo full-duplex ou compartilhamento de tela, vincule a URL do processo ativo.',
  '5. Respeite o tema do canal para facilitar a rastreabilidade técnica por processo CAD/CAE/CAM.',
];

const FORBIDDEN_SECRET_RE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,})/;

export function isRegisteredEcosystemUser(params: {
  userId?: string;
  email?: string;
  isAgent?: boolean;
  dbRegistered?: boolean;
}): boolean {
  if (params.isAgent) return true;
  if (params.dbRegistered === false) return false;
  const uid = (params.userId ?? '').trim();
  const email = (params.email ?? '').trim().toLowerCase();
  if (!uid || uid === 'local-default-op' || uid === 'anon') return false;
  if (!email || !email.includes('@')) return false;
  return Boolean(params.dbRegistered ?? true);
}

export function normalizeChatRoomTheme(raw?: string): PublicChatThemeId {
  const clean = (raw ?? '').trim().toLowerCase();
  const matched = PUBLIC_CHAT_THEMES.find((t) => t.id === clean);
  return matched ? matched.id : 'geral';
}

export function validatePublicChatMessage(input: {
  senderId?: string;
  senderEmail?: string;
  isAgent?: boolean;
  dbRegistered?: boolean;
  room?: string;
  content?: string;
}): {
  ok: boolean;
  room: PublicChatThemeId;
  content: string;
  reason?: string;
} {
  const room = normalizeChatRoomTheme(input.room);
  const content = (input.content ?? '').trim();

  if (
    !isRegisteredEcosystemUser({
      userId: input.senderId,
      email: input.senderEmail,
      isAgent: input.isAgent,
      dbRegistered: input.dbRegistered,
    })
  ) {
    return {
      ok: false,
      room,
      content,
      reason:
        'Apenas usuários cadastrados no Parametrix podem enviar mensagens no chat público. Faça login ou crie sua conta.',
    };
  }

  if (!content) {
    return {
      ok: false,
      room,
      content,
      reason: 'A mensagem não pode estar vazia.',
    };
  }

  if (content.length > 2000) {
    return {
      ok: false,
      room,
      content: content.slice(0, 2000),
      reason: 'Mensagem excede o limite de 2000 caracteres do chat público.',
    };
  }

  if (FORBIDDEN_SECRET_RE.test(content)) {
    return {
      ok: false,
      room,
      content,
      reason: 'Bloqueado pela regra #3: não envie segredos, tokens ou chaves privadas no chat público.',
    };
  }

  return { ok: true, room, content };
}

export interface ProcessUrlParams {
  origin: string;
  tab: WorkspaceTab;
  subTab?: string;
  room?: string;
  processMachine?: MachineType;
  displayMode?: DisplayMode;
  componentId?: string | null;
  sessionId?: string;
  sharedBy?: string;
}

export function buildProcessShareUrl(input: ProcessUrlParams): string {
  const cleanOrigin = input.origin.replace(/\/+$/, '');
  const qs = new URLSearchParams();
  qs.set('tab', input.tab);
  if (input.subTab) qs.set('sub', input.subTab);
  if (input.room) qs.set('room', normalizeChatRoomTheme(input.room));
  if (input.processMachine) qs.set('process', input.processMachine);
  if (input.displayMode) qs.set('mode', input.displayMode);
  if (input.componentId) qs.set('part', input.componentId);
  if (input.sessionId) qs.set('session', input.sessionId);
  if (input.sharedBy) qs.set('by', input.sharedBy);
  return `${cleanOrigin}/?${qs.toString()}`;
}

const VALID_TABS: WorkspaceTab[] = [
  'onboarding',
  'library',
  'viewport',
  'grasshopper',
  'cam',
  'frostbite',
  'ecosystem',
  'sustainability',
  'mcp',
  'plugins',
  'files',
];

const VALID_MACHINES: MachineType[] = [
  'manual',
  'cnc-3axis',
  'cnc-5axis',
  'robot-6axis',
  'powder-metal',
  'resin-sla',
  'robot-weld',
  'laser-cut',
];

const VALID_DISPLAY_MODES: DisplayMode[] = [
  'solid',
  'component-pbr',
  'object-mask',
  'wireframe',
  'zebra',
  'curvature',
  'stress-heatmap',
  'xray',
];

export function parseProcessShareUrl(searchOrUrl: string): {
  tab?: WorkspaceTab;
  subTab?: string;
  room?: PublicChatThemeId;
  processMachine?: MachineType;
  displayMode?: DisplayMode;
  componentId?: string;
  sessionId?: string;
  sharedBy?: string;
} {
  const rawSearch = searchOrUrl.includes('?') ? searchOrUrl.slice(searchOrUrl.indexOf('?')) : searchOrUrl;
  const qs = new URLSearchParams(rawSearch);
  const tabRaw = qs.get('tab') as WorkspaceTab | null;
  const procRaw = qs.get('process') as MachineType | null;
  const modeRaw = qs.get('mode') as DisplayMode | null;
  const roomRaw = qs.get('room');
  const subTab = qs.get('sub') ?? undefined;
  const componentId = qs.get('part') ?? undefined;
  const sessionId = qs.get('session') ?? undefined;
  const sharedBy = qs.get('by') ?? undefined;

  return {
    tab: tabRaw && VALID_TABS.includes(tabRaw) ? tabRaw : undefined,
    subTab,
    room: roomRaw ? normalizeChatRoomTheme(roomRaw) : undefined,
    processMachine: procRaw && VALID_MACHINES.includes(procRaw) ? procRaw : undefined,
    displayMode: modeRaw && VALID_DISPLAY_MODES.includes(modeRaw) ? modeRaw : undefined,
    componentId,
    sessionId,
    sharedBy,
  };
}

export function upsertRtcPeer(peers: RtcPeerPresence[], incoming: RtcPeerPresence): RtcPeerPresence[] {
  const filtered = peers.filter((p) => p.peerId !== incoming.peerId);
  return [...filtered, incoming].sort((a, b) => a.peerId.localeCompare(b.peerId));
}

export function removeRtcPeer(peers: RtcPeerPresence[], peerId: string): RtcPeerPresence[] {
  return peers.filter((p) => p.peerId !== peerId);
}

export function summarizeRtcRoomMedia(peers: RtcPeerPresence[]): {
  totalPeers: number;
  voiceActiveCount: number;
  videoActiveCount: number;
  screenSharingCount: number;
} {
  let voiceActiveCount = 0;
  let videoActiveCount = 0;
  let screenSharingCount = 0;
  for (const p of peers) {
    if (p.audioEnabled) voiceActiveCount++;
    if (p.videoEnabled) videoActiveCount++;
    if (p.screenEnabled) screenSharingCount++;
  }
  return {
    totalPeers: peers.length,
    voiceActiveCount,
    videoActiveCount,
    screenSharingCount,
  };
}
