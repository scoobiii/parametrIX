import { MCP_TOOLS_CATALOG } from './mcpServer';
import { CAM_PRODUCTION_PROGRAMS } from './camProcessEngine';
import { WORKSPACE_PROJECT_PRESETS } from './workspacePresets';
import { computeDeterministicVucHash } from './vucHash';
import type { RagSourceDocument } from '../types/cad';
import type { CamAgentContextSummary } from './camAgentSystemInstruction';

export type Qwen05bVariantId = 'qwen2.5-coder-0.5b-instruct-q4' | 'qwen2.5-0.5b-instruct-q4';

export type QwenSpecialistFunctionId =
  | 'cad-geometry'
  | 'cam-machining'
  | 'cae-structural'
  | 'frostbite-7nm'
  | 'vuc-proofs'
  | 'hermes-search-butler'
  | 'erp-logistics'
  | 'ecosystem-chat';

export interface QwenSpecialistProfile {
  id: QwenSpecialistFunctionId;
  title: string;
  modelVariant: Qwen05bVariantId;
  ggufRelPath: string;
  targetDomains: string[];
  maxPromptTokensBudget: number;
  rtDirective: string;
}

export interface QwenFinetuneExample {
  id: string;
  domain: string;
  specialistId: QwenSpecialistFunctionId;
  modelVariant: Qwen05bVariantId;
  messages: [
    { role: 'system'; content: string },
    { role: 'user'; content: string },
    { role: 'assistant'; content: string },
  ];
  vucHash: string;
}

export interface ProjectKnowledgeEntry {
  id: string;
  title: string;
  domain: string;
  content: string;
}

export const QWEN_CORE_MODEL_ID = 'qwen2.5-0.5b-instruct-q4';
export const QWEN_CODER_MODEL_ID: Qwen05bVariantId = 'qwen2.5-coder-0.5b-instruct-q4';
export const QWEN_CORE_GGUF_REL_PATH = 'models/qwen/qwen2.5-0.5b-instruct-q4_k_m.gguf';
export const QWEN_CODER_GGUF_REL_PATH = 'models/qwen/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf';

export const QWEN_05B_SERIES_CATALOG: Record<
  Qwen05bVariantId,
  { id: Qwen05bVariantId; hfRepo: string; ggufRelPath: string; ramMb: number; strength: string }
> = {
  'qwen2.5-coder-0.5b-instruct-q4': {
    id: 'qwen2.5-coder-0.5b-instruct-q4',
    hfRepo: 'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF',
    ggufRelPath: QWEN_CODER_GGUF_REL_PATH,
    ramMb: 492,
    strength: 'Código G, pós-processadores CNC/KUKA, JSON-RPC MCP, CAD/NURBS, FEA e DevOps CI/VUC',
  },
  'qwen2.5-0.5b-instruct-q4': {
    id: 'qwen2.5-0.5b-instruct-q4',
    hfRepo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    ggufRelPath: QWEN_CORE_GGUF_REL_PATH,
    ramMb: 469,
    strength: 'Orquestração PT-BR em tempo real (Hermes + Burrinhos Open/Nano/PicoClaw), Search RAG/GrabCAD e ERP',
  },
};

export const QWEN_CORE_SYSTEM_PROMPT = [
  'Você é o núcleo LLM local Qwen 2.5 0.5B Super-RAG integrado 100% ao Parametric Forge / FrostbiteEngine (https://github.com/scoobiii/parametrIX).',
  'Arquitetura Linux Real-Time Micro-Especialista: receba somente o domínio exato da tarefa, responda de forma determinística, concisa (<550 tokens) e fiel à telemetria.',
  'Regras absolutas de engenharia:',
  '1) Nunca invente dimensões, massas, tolerâncias, CAPEX/OPEX públicos do Frostbite ou resultados não medidos.',
  '2) CAD é 100% fiel à geometria real (.stp/.step via OCCT WASM, .ipt via OLE2+zlib+ACIS/Display Mesh, .dxf, .3dm, .stl, .ifc, .svg).',
  '3) Domine os 8 processos CAM: cnc-5axis, cnc-3axis, robot-6axis, powder-metal (LPBF), resin-sla (UV), robot-weld (MIG/TIG), laser-cut (4kW) e manual (DRO).',
  '4) FrostbiteEngine usa interaction nets em CMOS binário térmico 7 nm a 500 MHz (~4,6x perf/Watt vs CPUs clássicas), NÃO é óptico nem quântico.',
  '5) Toda execução gera prova formal VUC (SHA-256 + Ed25519). Responda em pt-BR objetivo para leitura e voz TTS com próximo passo concreto.',
].join('\n');

export const QWEN_SPECIALIST_PROFILES: Record<QwenSpecialistFunctionId, QwenSpecialistProfile> = {
  'cad-geometry': {
    id: 'cad-geometry',
    title: 'RT-CAD · Geometria B-Rep / NURBS / Rhino / GrabCAD',
    modelVariant: 'qwen2.5-coder-0.5b-instruct-q4',
    ggufRelPath: QWEN_CODER_GGUF_REL_PATH,
    targetDomains: ['CAD', 'PRESETS', 'MCP', 'LIVE_STATE', 'USER_RAG'],
    maxPromptTokensBudget: 540,
    rtDirective:
      'Especialista RT CAD: valide dimensões reais em mm, formatos (.STEP/.IPT/.DXF/.3DM/.STL/.SVG), Caneta Mágica 3D e comandos Rhino sem inventar geometria.',
  },
  'cam-machining': {
    id: 'cam-machining',
    title: 'RT-CAM · 8 Processos, Aditiva LPBF/SLA & G-Code MQTT',
    modelVariant: 'qwen2.5-coder-0.5b-instruct-q4',
    ggufRelPath: QWEN_CODER_GGUF_REL_PATH,
    targetDomains: ['CAM', 'CAM_API', 'PROGRAMS', 'LIVE_STATE', 'USER_RAG'],
    maxPromptTokensBudget: 540,
    rtDirective:
      'Especialista RT CAM: valide máquina ativa, ferramenta ATC, pós-processador, layerThicknessUm/sinterTempC/supportPattern/supportDensityPct/atmosfera em aditiva e MQTT remoto.',
  },
  'cae-structural': {
    id: 'cae-structural',
    title: 'RT-CAE · FEA Von Mises, Fadiga Cíclica & ISO 2768',
    modelVariant: 'qwen2.5-coder-0.5b-instruct-q4',
    ggufRelPath: QWEN_CODER_GGUF_REL_PATH,
    targetDomains: ['CAE', 'CAD', 'LIVE_STATE', 'USER_RAG'],
    maxPromptTokensBudget: 520,
    rtDirective:
      'Especialista RT CAE: reporte apenas tensão Von Mises (MPa), Fator de Segurança e ciclos de fadiga medidos pelo solver real, indicando ajuste estrutural seguro.',
  },
  'frostbite-7nm': {
    id: 'frostbite-7nm',
    title: 'RT-Frostbite · Interaction Nets CMOS 7nm 500MHz & Rack 800VDC',
    modelVariant: 'qwen2.5-0.5b-instruct-q4',
    ggufRelPath: QWEN_CORE_GGUF_REL_PATH,
    targetDomains: ['DATACENTER', 'PROGRAMS', 'LIVE_STATE'],
    maxPromptTokensBudget: 500,
    rtDirective:
      'Especialista RT FrostbiteEngine: explique interaction nets CMOS binário térmico 7 nm a 500 MHz até GDS final (~4,6x perf/Watt, não óptico/não quântico, sem CAPEX/OPEX/ROI públicos).',
  },
  'vuc-proofs': {
    id: 'vuc-proofs',
    title: 'RT-VUC · SHA-256 + Ed25519 Formal Proof & 100% CI',
    modelVariant: 'qwen2.5-coder-0.5b-instruct-q4',
    ggufRelPath: QWEN_CODER_GGUF_REL_PATH,
    targetDomains: ['ECOSYSTEM_VUC', 'MCP', 'LIVE_STATE'],
    maxPromptTokensBudget: 500,
    rtDirective:
      'Especialista RT VUC: exija hash_input, hash_output, hash_processo e assinatura Ed25519 (/api/vuc/formal-verify), audit:cad 27/27 e cobertura V8 100%.',
  },
  'hermes-search-butler': {
    id: 'hermes-search-butler',
    title: 'RT-Hermes · Mordomo + Burrinhos (Open/Nano/PicoClaw) + Search & GrabCAD/Drive',
    modelVariant: 'qwen2.5-0.5b-instruct-q4',
    ggufRelPath: QWEN_CORE_GGUF_REL_PATH,
    targetDomains: ['HERMES_CLAW', 'USER_RAG', 'MCP', 'LIVE_STATE'],
    maxPromptTokensBudget: 540,
    rtDirective:
      'Especialista RT Hermes & Família Burrinho: coordene OpenClaw/NanoClaw/PicoClaw em Qwen 0.5B (:11435), busca RAG local + Web + GrabCAD URL e arquivos do Google Drive.',
  },
  'erp-logistics': {
    id: 'erp-logistics',
    title: 'RT-ERP · CRM Open, Logística GPS 4-Modais & Compute 20%',
    modelVariant: 'qwen2.5-0.5b-instruct-q4',
    ggufRelPath: QWEN_CORE_GGUF_REL_PATH,
    targetDomains: ['ECOSYSTEM_VUC', 'CAM_API', 'LIVE_STATE'],
    maxPromptTokensBudget: 500,
    rtDirective:
      'Especialista RT ERP/Logística: conecte ordens fabris, rotas rodo/ferro/aero/fluvial (iFood/99/Autônomo) e pool 20% GPU/CPU no SQLite/Firestore.',
  },
  'ecosystem-chat': {
    id: 'ecosystem-chat',
    title: 'RT-Chat · Sala Pública, WebRTC Full-Duplex & Sessão Gravada',
    modelVariant: 'qwen2.5-0.5b-instruct-q4',
    ggufRelPath: QWEN_CORE_GGUF_REL_PATH,
    targetDomains: ['HERMES_CLAW', 'ECOSYSTEM_VUC', 'LIVE_STATE', 'USER_RAG'],
    maxPromptTokensBudget: 520,
    rtDirective:
      'Especialista RT Chat Ecossistema: responda com clareza em pt-BR para chat público, colaboração WebRTC por URL de processo e trilha de ponteiro gravada.',
  },
};

export function routeQwenSpecialistFunction(query: string): QwenSpecialistProfile {
  const q = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    /(hermes|burrinho|openclaw|nanoclaw|picoclaw|grabcad|drive\.google|google drive|search|busca|pesquis)/.test(
      q
    ) ||
    /https?:\/\//i.test(query)
  ) {
    return QWEN_SPECIALIST_PROFILES['hermes-search-butler'];
  }
  if (/(frostbite|7nm|500mhz|interaction net|800v|nvidia|rack 1 mw|coldplate|liquid cooling)/.test(q)) {
    return QWEN_SPECIALIST_PROFILES['frostbite-7nm'];
  }
  if (/(vuc|ed25519|scoobiii|cobertura|coverage|audit:cad|formal-verify|gos7)/.test(q)) {
    return QWEN_SPECIALIST_PROFILES['vuc-proofs'];
  }
  if (
    /(cam|cnc|gcode|g-code|kuka|abb|sinter|lpbf|po metal|resina|sla|solda|laser|mqtt|ferramenta|atc|toolpath)/.test(
      q
    )
  ) {
    return QWEN_SPECIALIST_PROFILES['cam-machining'];
  }
  if (/(fea|von mises|tensao|fadiga|safety factor|fator de seguranca|curvatura|tolerancia|iso 2768)/.test(q)) {
    return QWEN_SPECIALIST_PROFILES['cae-structural'];
  }
  if (
    /(cad|step|stp|ipt|dxf|3dm|stl|ifc|svg|nurbs|rhino|extrud|fillet|chamfer|caneta|geometria|malha)/.test(
      q
    )
  ) {
    return QWEN_SPECIALIST_PROFILES['cad-geometry'];
  }
  if (/(erp|crm|logist|frete|rodo|ferro|aero|fluvial|compute 20|pedido|fatura)/.test(q)) {
    return QWEN_SPECIALIST_PROFILES['erp-logistics'];
  }
  return QWEN_SPECIALIST_PROFILES['ecosystem-chat'];
}

export function buildFullProjectKnowledgeCorpus(
  dynamicDocs: RagSourceDocument[] = [],
  cadSummary?: CamAgentContextSummary
): ProjectKnowledgeEntry[] {
  const staticModules: ProjectKnowledgeEntry[] = [
    {
      id: 'core-cad-formats',
      title: 'Motor CAD Geométrico & Formatos Reais',
      domain: 'CAD',
      content:
        'Suporta leitura e exportação fiel de .STEP/.STP (OpenCASCADE WASM + B-Rep), .IPT (OLE2+zlib+ACIS SAT ou Display Mesh; se ShapeManager ASM binário fechado orienta exportar STEP AP214/AP203), .DXF (CIRCLE/LWPOLYLINE/ARC/3DFACE), .3DM (OpenNURBS NURBS), .STL (ASCII/Binário), .IFC e .SVG. Inclui Caneta Mágica 3D, comandos Rhinoceros, Object Mask e importação por URL pública/GrabCAD e Google Drive autenticado.',
    },
    {
      id: 'core-fea-curvature',
      title: 'Análise Estrutural FEA & Otimização de Curvatura NURBS',
      domain: 'CAE',
      content:
        'Motor evaluateStructuralFea calcula tensão Von Mises (MPa), escoamento por material (Alumínio 310 MPa, Titânio 880 MPa, Carbono 600 MPa), Fator de Segurança (FS) e ciclos de fadiga pela telemetria cíclica. Na Viewport3D, o atalho Simular FEA (Shift+F) executa simulação imediata e exibe o badge flutuante FS. analyzeCurvatureAndOptimizeWeight reduz massa mantendo integridade e scoobiiiVuc valida provas matemáticas e normas.',
    },
    {
      id: 'core-cam-processes',
      title: 'Os 8 Processos CAM, Aditiva & Pós-Processadores',
      domain: 'CAM',
      content:
        'Processos ativos: cnc-5axis, cnc-3axis, robot-6axis (KUKA KRL / ABB RAPID), powder-metal (LPBF pó metálico: layerThicknessUm, sinterTempC, sinterLaserPowerW, atmosfera Argônio/Nitrogênio, supportPattern, supportDensityPct), resin-sla (UV 405nm), robot-weld (fio+arco MIG/TIG visíveis), laser-cut (feixe 4kW e rota visíveis) e manual (DRO). Pós-processadores: fanuc-nc, grbl-gcode, kuka-krl, abb-rapid, slm-powder, sla-resin, weld-tig-mig, laser-g.',
    },
    {
      id: 'core-frostbite-rack',
      title: 'Rack FrostbiteEngine 1 MW 800 VDC vs Rack NVIDIA 1 MW',
      domain: 'DATACENTER',
      content:
        'Comparativo Rack 1 MW barramento 800 VDC + HVAC liquid cooling: FrostbiteEngine é CPU baseada em interaction nets (modelo HVM/Bend) em silício CMOS binário térmico padrão 7 nm a 500 MHz até GDS final (pré-silício, ~4,6x perf/Watt sem cache/locks). NÃO é computador óptico nem quântico. Sem divulgação comercial pública de CAPEX/OPEX/ROI.',
    },
    {
      id: 'core-hermes-claw-search',
      title: 'Mordomo Hermes + Burrinhos Baixa Renda (OpenClaw/NanoClaw/PicoClaw) + GrabCAD & Drive',
      domain: 'HERMES_CLAW',
      content:
        'No Modo Offline (SQLite Local), o Parametrix ativa automaticamente o agente local com Mordomo Hermes, família Burrinho (OpenClaw JSON, NanoClaw Sandbox YAML, PicoClaw Go v2) em Qwen 2.5 0.5B (:11435, dual Coder/Instruct Q4_K_M), motor de busca local RAG + Web pública (DuckDuckGo) + extração/importação de URLs GrabCAD e acesso autenticado Google Drive (drive.file + drive.readonly) para abrir e salvar projetos CAD.',
    },
    {
      id: 'core-remote-mqtt-swagger',
      title: 'Máquinas Remotas G-Code, MQTT & API Swagger',
      domain: 'CAM_API',
      content:
        'Aba Ecossistema > Máquinas Remotas salva endpoints OPC-UA, HTTP-Moonraker, SSH-KUKA-Bridge, GRBL-Serial-WS e MQTT com broker, tópico e QoS (0/1/2), permitindo ping MQTT (/api/sqlite/remote-machines/:id/mqtt-ping) e despacho real G-Code (/api/sqlite/remote-machines/:id/dispatch). Swagger/OpenAPI em /api/docs e /api/openapi.json; serviços CAM em POST /api/cam/services e restart em POST /api/cam/services/:id/restart.',
    },
    {
      id: 'core-ecosystem-auth-vuc',
      title: 'Auth Dual (Firebase + SQLite), Ecossistema ERP/CRM, Logística & VUC Ed25519',
      domain: 'ECOSYSTEM_VUC',
      content:
        'Persistência dupla: Firestore nomeado (databaseId ai-studio-parametricforge-ac5fa4c1-e94e-4093-bf82-d61cfafbd0bd) + SQLite local WAL (data/parametrix.sqlite). Auth real multi-provedor (Google com Drive, Microsoft, Apple, Oracle, Zoho, E-mail) e fallback SQLite offline. Chat público por temas com WebRTC voz/vídeo/tela full-duplex e URL de processo. Toda operação emite certificado VUC SHA-256 + Ed25519 verificável via POST /api/vuc/formal-verify.',
    },
    {
      id: 'core-mcp-tools-catalog',
      title: `Catálogo MCP Completo (${MCP_TOOLS_CATALOG.length} ferramentas)`,
      domain: 'MCP',
      content: MCP_TOOLS_CATALOG.map((t) => `${t.name} [${t.category}]: ${t.description}`).join(' | '),
    },
    {
      id: 'core-cam-programs',
      title: `Programas Pré-Programados Datacenter & Humanoides (${CAM_PRODUCTION_PROGRAMS.length})`,
      domain: 'PROGRAMS',
      content: CAM_PRODUCTION_PROGRAMS.map(
        (p) => `${p.id} (${p.category}): ${p.title} · máquina ${p.machineType} · material ${p.material}`
      ).join(' | '),
    },
    {
      id: 'core-workspace-presets',
      title: `Presets Paramétricos 3D (${WORKSPACE_PROJECT_PRESETS.length})`,
      domain: 'PRESETS',
      content: WORKSPACE_PROJECT_PRESETS.map(
        (p) => `${p.id}: ${p.title} (${p.segment}, material ${p.materialFinish}, CAM ${p.camSettings.machineType})`
      ).join(' | '),
    },
  ];

  const dynamicEntries: ProjectKnowledgeEntry[] = [];
  if (cadSummary) {
    dynamicEntries.push({
      id: 'live-workspace-state',
      title: 'Estado Ao Vivo da Sessão CAD/CAM',
      domain: 'LIVE_STATE',
      content: [
        `Peça ativa: ${cadSummary.partName || 'Parametrix'} (${cadSummary.activeSegment || 'industrial'})`,
        `Máquina CAM: ${cadSummary.machineType || 'cnc-5axis'} (${cadSummary.processLabel || ''})`,
        `Ferramenta: ${cadSummary.activeTool || 'ATC'} · Pós: ${cadSummary.postFormat || 'fanuc-nc'}`,
        cadSummary.safetyFactor !== undefined ? `Fator de Segurança FEA: ${cadSummary.safetyFactor}x` : '',
        cadSummary.additiveConfig
          ? `Aditiva: camada ${cadSummary.additiveConfig.layerThicknessUm}µm, sinterização ${cadSummary.additiveConfig.sinterTempC}°C, suporte ${cadSummary.additiveConfig.supportPattern} ${cadSummary.additiveConfig.supportDensityPct}%`
          : '',
        cadSummary.vucHash ? `Último VUC: ${cadSummary.vucHash}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  for (const doc of dynamicDocs) {
    const chunkSnippet = doc.chunks.map((c) => c.text).join('\n').slice(0, 1600);
    dynamicEntries.push({
      id: `doc-${doc.id}`,
      title: `Documento RAG: ${doc.title} (${doc.formatTag})`,
      domain: 'USER_RAG',
      content: `${doc.summary}\n${chunkSnippet}`.trim(),
    });
  }

  return [...staticModules, ...dynamicEntries];
}

export function buildQwenChatMlFinetuneDataset(
  dynamicDocs: RagSourceDocument[] = [],
  cadSummary?: CamAgentContextSummary
): QwenFinetuneExample[] {
  const corpus = buildFullProjectKnowledgeCorpus(dynamicDocs, cadSummary);
  const basePairs: {
    id: string;
    domain: string;
    specialistId: QwenSpecialistFunctionId;
    user: string;
    assistant: string;
  }[] = [
    {
      id: 'ft-cad-import',
      domain: 'CAD',
      specialistId: 'cad-geometry',
      user: 'Quais formatos CAD o Parametrix abre com geometria fiel e como funciona arquivo .IPT?',
      assistant:
        'O motor CAD lê .STEP/.STP via OpenCASCADE WASM, .DXF, .3DM OpenNURBS, .STL, .IFC e .SVG com dimensões reais em mm. Arquivos .IPT do Inventor são decodificados via OLE2 + zlib + ACIS SAT ou Display Mesh; se usarem ShapeManager ASM fechado, o sistema informa e orienta exportar em .STEP AP214/AP203.',
    },
    {
      id: 'ft-cam-additive',
      domain: 'CAM',
      specialistId: 'cam-machining',
      user: 'Quais os 8 processos CAM e quais parâmetros devo validar na impressão metálica e resina?',
      assistant:
        'Os 8 processos são cnc-5axis, cnc-3axis, robot-6axis, powder-metal (LPBF), resin-sla (UV), robot-weld (MIG/TIG com fio e arco visíveis), laser-cut (4 kW com raio e rota) e manual (DRO). Na manufatura aditiva valide sempre layerThicknessUm, sinterTempC, supportPattern, supportDensityPct e atmosfera.',
    },
    {
      id: 'ft-frostbite',
      domain: 'DATACENTER',
      specialistId: 'frostbite-7nm',
      user: 'Como funciona a arquitetura do Rack FrostbiteEngine 1 MW 800 VDC?',
      assistant:
        'O FrostbiteEngine executa interaction nets (modelo HVM/Bend) em silício CMOS binário térmico padrão de 7 nm a 500 MHz até GDS final, alcançando ~4,6x performance/Watt com refrigeração líquida e barramento 800 VDC sem cache ou locks. Não é tecnologia óptica nem quântica e não possui dados públicos comerciais de CAPEX/OPEX.',
    },
    {
      id: 'ft-fea-shortcut',
      domain: 'CAE',
      specialistId: 'cae-structural',
      user: 'Como rodar uma simulação estrutural rápida direto na viewport 3D?',
      assistant:
        'Na Viewport3D clique no atalho flutuante "Simular FEA" ou pressione Shift+F fora de campos de texto. O kernel evaluateStructuralFea calcula a tensão Von Mises e exibe o Fator de Segurança em tempo real no badge flutuante FS colorido por status (seguro, alerta ou crítico).',
    },
    {
      id: 'ft-remote-mqtt',
      domain: 'CAM_API',
      specialistId: 'cam-machining',
      user: 'Como configurar uma máquina remota para código G e telemetria MQTT?',
      assistant:
        'Acesse a aba Ecossistema & ERP > Máquinas Remotas, preencha protocolo (HTTP-Moonraker, OPC-UA, SSH-KUKA-Bridge, GRBL-Serial-WS ou MQTT), URL do endpoint, broker MQTT, tópico e QoS, e salve via SQLite. Depois acione Ping MQTT ou Despachar G-Code com prova VUC Ed25519.',
    },
    {
      id: 'ft-vuc-ci',
      domain: 'VUC',
      specialistId: 'vuc-proofs',
      user: 'Como funciona a prova formal VUC e a verificação no CI?',
      assistant:
        'Cada processo gera hash_input (SHA-256), hash_output (SHA-256), hash_processo e assinatura_ed25519 verificável via POST /api/vuc/formal-verify ou npm run vuc:proof em proof/vuc-latest.json. O pipeline CI exige lint limpo, 100% de cobertura Vitest V8, 27/27 no audit:cad e vite build sem erros.',
    },
    {
      id: 'ft-hermes-claw-grabcad-drive',
      domain: 'HERMES_CLAW',
      specialistId: 'hermes-search-butler',
      user: 'Como o Modo Offline ativa o Hermes + Burrinho + Search + GrabCAD + Google Drive?',
      assistant:
        'Ao entrar em Modo Offline (SQLite Local), o Parametrix seleciona automaticamente o agente local com Mordomo Hermes, Burrinhos (OpenClaw, NanoClaw, PicoClaw) em Qwen 2.5 0.5B (:11435, roteado por função RT Coder/Instruct), Search Local/Web e inspeção de URLs GrabCAD. Se logado no Google com escopo Drive, você abre e importa arquivos CAD direto da sua conta.',
    },
  ];

  for (const entry of corpus) {
    if (entry.domain === 'USER_RAG' || entry.domain === 'LIVE_STATE' || entry.domain === 'MCP') {
      const sp = routeQwenSpecialistFunction(`${entry.domain} ${entry.title}`);
      basePairs.push({
        id: `ft-${entry.id}`,
        domain: entry.domain,
        specialistId: sp.id,
        user: `Resuma e explique como utilizar: ${entry.title}`,
        assistant: entry.content.slice(0, 750),
      });
    }
  }

  return basePairs.map((pair) => {
    const profile = QWEN_SPECIALIST_PROFILES[pair.specialistId];
    const systemContent = `${QWEN_CORE_SYSTEM_PROMPT}\n[Perfil ${profile.title}] ${profile.rtDirective}`;
    const vucHash = computeDeterministicVucHash(`QWEN_FT_${pair.domain}_${pair.specialistId}`, {
      id: pair.id,
      modelVariant: profile.modelVariant,
      user: pair.user,
      assistant: pair.assistant,
    });
    return {
      id: pair.id,
      domain: pair.domain,
      specialistId: pair.specialistId,
      modelVariant: profile.modelVariant,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: pair.user },
        { role: 'assistant', content: pair.assistant },
      ],
      vucHash,
    };
  });
}

export function serializeQwenFinetuneJsonl(examples: QwenFinetuneExample[]): string {
  return examples
    .map((ex) =>
      JSON.stringify({
        id: ex.id,
        domain: ex.domain,
        specialistId: ex.specialistId,
        modelVariant: ex.modelVariant,
        messages: ex.messages,
        vucHash: ex.vucHash,
      })
    )
    .join('\n');
}

export function retrieveQwenRagContext(params: {
  query: string;
  dynamicDocs?: RagSourceDocument[];
  cadSummary?: CamAgentContextSummary;
  topK?: number;
}): {
  specialistProfile: QwenSpecialistProfile;
  matchedEntries: ProjectKnowledgeEntry[];
  matchedExamples: QwenFinetuneExample[];
  chatMlPrompt: string;
  approxPromptTokens: number;
} {
  const topK = params.topK ?? 3;
  const specialistProfile = routeQwenSpecialistFunction(params.query);
  const corpus = buildFullProjectKnowledgeCorpus(params.dynamicDocs, params.cadSummary);
  const examples = buildQwenChatMlFinetuneDataset(params.dynamicDocs, params.cadSummary);

  const tokens = params.query
    .toLowerCase()
    .split(/[^a-z0-9áéíóúãõâêîôûç_-]+/i)
    .filter((t) => t.length >= 2);

  const scoreText = (haystack: string): number => {
    if (tokens.length === 0) return 1;
    const lower = haystack.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) {
        score += 2 + Math.min(3, (lower.split(tok).length - 1) * 0.5);
      }
    }
    return score;
  };

  // Micro-specialist "real-time Linux" filtering prioritizes matching specialist domains first
  const rankedEntries = corpus
    .map((entry) => {
      const domainMatchBoost = specialistProfile.targetDomains.includes(entry.domain) ? 4.5 : 0;
      const liveBoost = entry.domain === 'LIVE_STATE' ? 2.5 : 0;
      return {
        entry,
        score:
          scoreText(`${entry.title} ${entry.domain} ${entry.content}`) + domainMatchBoost + liveBoost,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.entry);

  const rankedExamples = examples
    .map((ex) => ({
      ex,
      score:
        scoreText(`${ex.messages[1].content} ${ex.messages[2].content}`) +
        (ex.specialistId === specialistProfile.id ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.ex);

  const ragBlock = rankedEntries
    .map((e) => `[${e.domain} · ${e.title}]\n${e.content.slice(0, 320)}`)
    .join('\n\n');

  const fewShotBlock = rankedExamples
    .map(
      (ex) =>
        `<|im_start|>user\n${ex.messages[1].content}<|im_end|>\n<|im_start|>assistant\n${ex.messages[2].content}<|im_end|>`
    )
    .join('\n');

  const chatMlPrompt = [
    `<|im_start|>system\n${QWEN_CORE_SYSTEM_PROMPT}\n[Especialista RT Ativo: ${specialistProfile.title} | Modelo: ${specialistProfile.modelVariant}]\n${specialistProfile.rtDirective}\n\nMicro-Contexto RAG:\n${ragBlock}<|im_end|>`,
    fewShotBlock,
    `<|im_start|>user\n${params.query.trim() || 'Resuma o estado atual do projeto e próximo passo CAM/VUC.'}<|im_end|>`,
    `<|im_start|>assistant\n`,
  ].join('\n');

  const approxPromptTokens = Math.max(1, Math.ceil(chatMlPrompt.length / 3.8));

  return {
    specialistProfile,
    matchedEntries: rankedEntries,
    matchedExamples: rankedExamples,
    chatMlPrompt,
    approxPromptTokens,
  };
}
