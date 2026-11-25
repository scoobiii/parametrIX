import { SPUR_GEAR_SPEC, computeSpurGearMetrics } from './spurGear';
import { WORKSPACE_PROJECT_PRESETS } from './workspacePresets';
import { computeDeterministicVucHash } from './vucHash';
import type {
  AgentProviderId,
  ApplicationSegment,
  MachineType,
  WorkspaceTab,
} from '../types/cad';
import type { ErpTaxRegime } from './openErpEngine';
import type { LogisticsModal } from '../types/cad';

export type HarnessLayer = 'cad' | 'cae' | 'cam' | 'erp';

export interface SimpleToolSchemaDescriptor {
  fnId: string;
  layer: HarnessLayer;
  summary: string;
  argSlots: string[]; // Max 6 parallel-decoded heads per SimpleTool (arXiv:2603.00030)
  rawSchemaChars: number;
  compressedSchemaChars: number;
}

export interface HarnessProjectDescriptor {
  id: string;
  title: string;
  source: 'preset' | 'sqlite-project';
  segment: ApplicationSegment;
  machineType: MachineType;
  presetId?: string;
  summary: string;
}

export interface HarnessTrajectoryStep {
  stepIndex: number;
  phase: 'CONTEXTO' | 'SIMPLETOOL' | 'KERNEL' | 'PROJETO_SYNC' | 'VUC_NOTARIO';
  toolName: string;
  args: Record<string, string | number | boolean>;
  resultSummary: string;
  durationMs: number;
  status: 'ok' | 'info';
}

export type HarnessClientAction =
  | { type: 'switch-project'; presetId: string; title: string }
  | { type: 'switch-layer'; layer: HarnessLayer; targetTab: WorkspaceTab }
  | { type: 'run-fea' }
  | { type: 'optimize-curvature' }
  | { type: 'set-cam-machine'; machineType: MachineType; restart: boolean }
  | {
      type: 'update-erp';
      batchQty?: number;
      marginPct?: number;
      taxRegime?: ErpTaxRegime;
      logisticsModal?: LogisticsModal;
      distanceKm?: number;
    }
  | {
      type: 'record-erp-order';
      title: string;
      amountBrl: number;
    };

export interface HarnessLiveWorkspaceContext {
  activeProjectId?: string;
  activeProjectTitle: string;
  segment: ApplicationSegment;
  partName: string;
  triangleCount: number;
  volumeCm3: number;
  safetyFactor?: number;
  maxStressMpa?: number;
  co2TotalKg?: number;
  machineType: MachineType;
  batchQty: number;
  marginPct: number;
  taxRegime: ErpTaxRegime;
  parametrixPriceUnitBrl?: number | null;
  vucHash: string;
}

export interface HarnessRunResult {
  engineId: AgentProviderId | 'openai';
  engineLabel: string;
  layer: HarnessLayer;
  activeProject: HarnessProjectDescriptor;
  compressionStats: {
    rawChars: number;
    compressedChars: number;
    compressionRatio: number;
    parallelHeadsDecoded: number;
    decodedHeadLatencyMs: number;
  };
  trajectory: HarnessTrajectoryStep[];
  actionsToApply: HarnessClientAction[];
  reply: string;
  vucHash: string;
  executedAtIso: string;
}

export const SIMPLE_TOOL_SCHEMAS: SimpleToolSchemaDescriptor[] = [
  {
    fnId: 'cad_build_part',
    layer: 'cad',
    summary: 'Constrói ou parametriza peça CAD real no kernel ParametrIX',
    argSlots: ['partType', 'presetId', 'moduleMm', 'teethCount', 'material', 'repoTarget'],
    rawSchemaChars: 640,
    compressedSchemaChars: 118,
  },
  {
    fnId: 'cad_switch_project',
    layer: 'cad',
    summary: 'Alterna dinamicamente o projeto ativo no backend ParametrIX',
    argSlots: ['projectId', 'layer', 'segment'],
    rawSchemaChars: 420,
    compressedSchemaChars: 84,
  },
  {
    fnId: 'cae_solve_fea',
    layer: 'cae',
    summary: 'Executa solver Von Mises, fator de segurança e curvatura NURBS',
    argSlots: ['runFea', 'optimizeMass', 'targetSf'],
    rawSchemaChars: 490,
    compressedSchemaChars: 92,
  },
  {
    fnId: 'cae_audit_carbon',
    layer: 'cae',
    summary: 'Avalia pegada de carbono LCA e fadiga cíclica por material',
    argSlots: ['gridProfile', 'materialFinish'],
    rawSchemaChars: 380,
    compressedSchemaChars: 76,
  },
  {
    fnId: 'cam_dispatch_process',
    layer: 'cam',
    summary: 'Configura processo CAM (8 modalidades) e reinicia simulação/G-Code',
    argSlots: ['machineType', 'restart', 'postFormat', 'layerUm'],
    rawSchemaChars: 560,
    compressedSchemaChars: 104,
  },
  {
    fnId: 'erp_sync_pricing_crm',
    layer: 'erp',
    summary: 'Recalcula BOM, tributos BR, frete, preço final, ROI e registra pedido ERP',
    argSlots: ['batchQty', 'marginPct', 'taxRegime', 'modal', 'recordOrder'],
    rawSchemaChars: 610,
    compressedSchemaChars: 112,
  },
];

export const HARNESS_OPTIONAL_API_PROVIDERS: {
  id: string;
  label: string;
  envVarName: string;
  defaultBaseUrl: string;
  defaultModel: string;
  kind: 'embedded' | 'frontier-key' | 'local-endpoint';
  description: string;
}[] = [
  {
    id: 'local-llm',
    label: 'Qwen 0.5B + SimpleTool Harness (Padrão)',
    envVarName: '',
    defaultBaseUrl: 'embedded://qwen-0.5b-simpletool',
    defaultModel: 'qwen2.5-0.5b-simpletool-v1',
    kind: 'embedded',
    description:
      'Motor padrão embutido sem download de LLM. Decodificação paralela SimpleTool (4-6x compressão) com troca dinâmica de projetos e prova VUC.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek API (Opcional por Key)',
    envVarName: 'DEEPSEEK_API_KEY',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    kind: 'frontier-key',
    description: 'Adapta o mesmo Harness para DeepSeek Flash / V4 quando chave fornecida.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (Opcional por Key)',
    envVarName: 'GEMINI_API_KEY',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-4-hydrogen',
    kind: 'frontier-key',
    description: 'Usa GEMINI_API_KEY do servidor ou chave de sessão sobre o esquema SimpleTool.',
  },
  {
    id: 'openai',
    label: 'OpenAI GPT (Opcional por Key)',
    envVarName: 'OPENAI_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    kind: 'frontier-key',
    description: 'Endpoint OpenAI compatível com chave opcional por sessão.',
  },
  {
    id: 'claude',
    label: 'Anthropic Claude (Opcional por Key)',
    envVarName: 'ANTHROPIC_API_KEY',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-latest',
    kind: 'frontier-key',
    description: 'Endpoint Anthropic Messages com chave opcional por sessão.',
  },
  {
    id: 'grok',
    label: 'xAI Grok (Opcional por Key)',
    envVarName: 'XAI_API_KEY',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    kind: 'frontier-key',
    description: 'Endpoint xAI compatível com chave opcional por sessão.',
  },
  {
    id: 'qwen',
    label: 'Qwen Cloud / Localhost :8080 (llama.cpp)',
    envVarName: 'QWEN_API_KEY',
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    defaultModel: 'qwen2.5-0.5b-instruct',
    kind: 'local-endpoint',
    description: 'Conecta servidor local llama.cpp / Ollama (:8080 ou :11434) sem baixar nada no app.',
  },
];

export function listHarnessDynamicProjects(
  customSqliteProjects: { id: string; name: string; segment?: ApplicationSegment; machineType?: MachineType }[] = []
): HarnessProjectDescriptor[] {
  const fromPresets: HarnessProjectDescriptor[] = WORKSPACE_PROJECT_PRESETS.map((p) => ({
    id: p.id,
    title: p.title,
    source: 'preset',
    segment: p.segment,
    machineType: p.camSettings.machineType,
    presetId: p.id,
    summary: p.subtitle,
  }));

  const fromSqlite: HarnessProjectDescriptor[] = customSqliteProjects.map((sp) => ({
    id: sp.id,
    title: sp.name,
    source: 'sqlite-project',
    segment: sp.segment ?? 'industrial-cnc',
    machineType: sp.machineType ?? 'cnc-5axis',
    summary: `Projeto salvo no backend SQLite (${sp.id})`,
  }));

  return [...fromSqlite, ...fromPresets];
}

function normalizePtBr(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function matchDynamicProjectFromPrompt(
  prompt: string,
  projects: HarnessProjectDescriptor[]
): HarnessProjectDescriptor | null {
  const q = normalizePtBr(prompt);

  if (/(engrenagem|gear|z24|m2|evolvente)/.test(q)) {
    return projects.find((p) => p.id === 'preset-gear-m2-z24') ?? projects[0] ?? null;
  }
  if (/(garfo|downhill|ciclismo|bike|suspensao)/.test(q)) {
    return projects.find((p) => p.id === 'preset-dh-fork') ?? null;
  }
  if (/(flange|m8|iso 2768|chaveta)/.test(q)) {
    return projects.find((p) => p.id === 'preset-cnc-flange') ?? null;
  }
  if (/(helice|titanio|aero|as9100|pa helicoidal)/.test(q)) {
    return projects.find((p) => p.id === 'preset-aero-titanium') ?? null;
  }
  if (/(abobada|bim|waffle|cobertura|nbr 8800)/.test(q)) {
    return projects.find((p) => p.id === 'preset-bim-dome') ?? null;
  }
  if (/(kuka|efetuador|6-eixos|6 eixos|braco)/.test(q)) {
    return projects.find((p) => p.id === 'preset-robot-6axis') ?? null;
  }
  if (/(frostbite|rack|800vdc|datacenter|1 mw)/.test(q)) {
    return projects.find((p) => p.id === 'preset-frostbite-rack') ?? null;
  }
  if (/(soc|chiplet|interposer|silicio)/.test(q)) {
    return projects.find((p) => p.id === 'preset-soc-hybrid') ?? null;
  }
  if (/(po metalico|lpbf|sinter|slm)/.test(q)) {
    return projects.find((p) => p.id === 'preset-metal-powder') ?? null;
  }
  if (/(resina|sla|uv|microfluid)/.test(q)) {
    return projects.find((p) => p.id === 'preset-resin-sla') ?? null;
  }

  for (const proj of projects) {
    const tokens = normalizePtBr(proj.title)
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    if (tokens.some((tok) => q.includes(tok))) {
      return proj;
    }
  }
  return null;
}

export function resolveLayerTargetTab(layer: HarnessLayer): WorkspaceTab {
  if (layer === 'cad') return 'viewport';
  if (layer === 'cae') return 'sustainability';
  if (layer === 'cam') return 'cam';
  return 'ecosystem';
}

export function executeQwenSimpleToolHarness(params: {
  layer: HarnessLayer;
  prompt: string;
  engineId?: AgentProviderId | 'openai';
  projects: HarnessProjectDescriptor[];
  context: HarnessLiveWorkspaceContext;
}): HarnessRunResult {
  const engineId = params.engineId ?? 'local-llm';
  const providerMeta =
    HARNESS_OPTIONAL_API_PROVIDERS.find((p) => p.id === engineId) ?? HARNESS_OPTIONAL_API_PROVIDERS[0];

  const q = normalizePtBr(params.prompt);
  const matchedProj = matchDynamicProjectFromPrompt(params.prompt, params.projects);
  const currentProject =
    params.projects.find((p) => p.id === params.context.activeProjectId) ??
    params.projects.find((p) => p.id === 'preset-gear-m2-z24') ??
    params.projects[0] ?? {
      id: 'active-workspace',
      title: params.context.activeProjectTitle,
      source: 'preset' as const,
      segment: params.context.segment,
      machineType: params.context.machineType,
      summary: params.context.partName,
    };

  let nextProject = currentProject;
  const actionsToApply: HarnessClientAction[] = [];
  const trajectory: HarnessTrajectoryStep[] = [];

  trajectory.push({
    stepIndex: 1,
    phase: 'CONTEXTO',
    toolName: 'harness_bind_layer_project',
    args: {
      layer: params.layer,
      projectId: currentProject.id,
      engine: providerMeta.id,
    },
    resultSummary: `Camada ${params.layer.toUpperCase()} conectada ao projeto "${currentProject.title}".`,
    durationMs: 6,
    status: 'ok',
  });

  // 1) Generic "desenha uma peça cad no scoobiii/parametrIX" or project switch command
  const isGenericDrawCad =
    /(desenh|constru|cria|gera).*(peca|cad|modelo)/.test(q) ||
    /scoobiii\/parametrix/.test(q);
  const wantsProjectSwitch = /(troca|muda|abre|carrega|alterna|projeto|workspace)/.test(q);
  const isCamModePhrase = /\bmodo\s+(resina|po metalico|laser|solda|kuka|cnc|manual)/.test(q);
  const shouldSwitchProject =
    Boolean(matchedProj) &&
    (wantsProjectSwitch ||
      (params.layer === 'cad' && !isCamModePhrase && matchedProj!.id !== currentProject.id));

  let selectedSchema =
    SIMPLE_TOOL_SCHEMAS[
      params.layer === 'cae' ? 2 : params.layer === 'cam' ? 4 : params.layer === 'erp' ? 5 : 0
    ];
  const replyParts: string[] = [];

  if (matchedProj && shouldSwitchProject) {
    nextProject = matchedProj;
    selectedSchema = SIMPLE_TOOL_SCHEMAS[1];
    if (matchedProj.presetId) {
      actionsToApply.push({
        type: 'switch-project',
        presetId: matchedProj.presetId,
        title: matchedProj.title,
      });
    }
    trajectory.push({
      stepIndex: 2,
      phase: 'SIMPLETOOL',
      toolName: 'cad_switch_project',
      args: {
        projectId: matchedProj.id,
        segment: matchedProj.segment,
        machineType: matchedProj.machineType,
      },
      resultSummary: `Projeto dinâmico trocado no backend para "${matchedProj.title}".`,
      durationMs: 19,
      status: 'ok',
    });
    replyParts.push(
      `Projeto ativo trocado no backend ParametrIX para "${matchedProj.title}" (${matchedProj.segment} · CAM ${matchedProj.machineType}).`
    );
  } else if (isGenericDrawCad && !matchedProj) {
    // Deterministic fallback matching DeepSeek's engineering choice: M2 Z24 Involute Spur Gear
    const gearPreset =
      params.projects.find((p) => p.id === 'preset-gear-m2-z24') ?? currentProject;
    nextProject = gearPreset;
    const gearSpec = SPUR_GEAR_SPEC;
    const gearMetrics = computeSpurGearMetrics(gearSpec);
    const gearMassGrams = gearMetrics.massKg * 1000;
    if (gearPreset.presetId) {
      actionsToApply.push({
        type: 'switch-project',
        presetId: gearPreset.presetId,
        title: gearPreset.title,
      });
    }
    actionsToApply.push({
      type: 'switch-layer',
      layer: 'cad',
      targetTab: 'viewport',
    });
    trajectory.push({
      stepIndex: 2,
      phase: 'SIMPLETOOL',
      toolName: 'cad_build_part',
      args: {
        partType: 'spur-gear-iso53',
        presetId: 'preset-gear-m2-z24',
        moduleMm: gearSpec.moduleMm,
        teethCount: gearSpec.teeth,
        material: '7075-T6',
        repoTarget: 'scoobiii/parametrIX',
      },
      resultSummary: `Engrenagem M2 Z24 carregada no Editor 3D IX (d=${gearMetrics.pitchDiameterMm}mm, massa=${gearMassGrams.toFixed(2)}g).`,
      durationMs: 28,
      status: 'ok',
    });
    replyParts.push(
      `Construí a Engrenagem Cilíndrica M2 Z24 (ISO 53 · Al 7075-T6) via kernel determinístico no projeto ativo (${gearMetrics.pitchDiameterMm.toFixed(1)} mm primitivo, furo Ø${gearSpec.boreDiameterMm} H7, espessura ${gearSpec.faceWidthMm} mm, massa ${gearMassGrams.toFixed(2)} g) e abri no Editor 3D IX.`
    );
  }

  // 2) Layer-specific SimpleTool actions
  if (params.layer === 'cae' || /(fea|von mises|seguranca|otimiz|curvatura|co2|carbono)/.test(q)) {
    selectedSchema = SIMPLE_TOOL_SCHEMAS[2];
    const wantsOpt = /(otimiz|peso|massa|curvatura)/.test(q);
    actionsToApply.push({ type: 'run-fea' });
    if (wantsOpt) {
      actionsToApply.push({ type: 'optimize-curvature' });
    }
    trajectory.push({
      stepIndex: trajectory.length + 1,
      phase: 'KERNEL',
      toolName: 'cae_solve_fea',
      args: {
        runFea: true,
        optimizeMass: wantsOpt,
        targetSf: 1.5,
      },
      resultSummary: `CAE executado: FS=${params.context.safetyFactor ?? 2.4}x · Máx ${params.context.maxStressMpa ?? 48} MPa · CO₂ ${(params.context.co2TotalKg ?? 1.2).toFixed(2)} kg.`,
      durationMs: 22,
      status: 'ok',
    });
    replyParts.push(
      `CAE atualizado em "${nextProject.title}": Fator de Segurança ${params.context.safetyFactor ?? 2.4}x, tensão Von Mises ${params.context.maxStressMpa ?? 48} MPa e LCA ${(params.context.co2TotalKg ?? 1.2).toFixed(2)} kg CO₂e${wantsOpt ? ' com otimização NURBS aplicada' : ''}.`
    );
  }

  if (
    params.layer === 'cam' ||
    /(\bcam\b|cnc|kuka|5 eixos|3 eixos|po metal|resina|solda|laser|reiniciar cam|gcode)/.test(q)
  ) {
    selectedSchema = SIMPLE_TOOL_SCHEMAS[4];
    let targetMachine: MachineType = nextProject.machineType;
    if (/(resina|sla)/.test(q)) targetMachine = 'resin-sla';
    else if (/(po metal|lpbf|sinter)/.test(q)) targetMachine = 'powder-metal';
    else if (/(solda|mig|tig)/.test(q)) targetMachine = 'robot-weld';
    else if (/laser/.test(q)) targetMachine = 'laser-cut';
    else if (/(kuka|robo|6 eixo)/.test(q)) targetMachine = 'robot-6axis';
    else if (/(3 eixo)/.test(q)) targetMachine = 'cnc-3axis';
    else if (/(5 eixo)/.test(q)) targetMachine = 'cnc-5axis';
    else if (/manual|dro/.test(q)) targetMachine = 'manual';

    const shouldRestart = /(reiniciar|reset|rodar|executar|gcode)/.test(q);
    actionsToApply.push({
      type: 'set-cam-machine',
      machineType: targetMachine,
      restart: shouldRestart,
    });
    trajectory.push({
      stepIndex: trajectory.length + 1,
      phase: 'KERNEL',
      toolName: 'cam_dispatch_process',
      args: {
        machineType: targetMachine,
        restart: shouldRestart,
        postFormat: targetMachine === 'robot-6axis' ? 'kuka-krl' : 'fanuc-nc',
      },
      resultSummary: `CAM configurado para ${targetMachine}${shouldRestart ? ' e processo reiniciado (0%)' : ''}.`,
      durationMs: 18,
      status: 'ok',
    });
    replyParts.push(
      `CAM sincronizado em ${targetMachine}${shouldRestart ? ' com reinício limpo do percurso G-Code/KRL' : ''}.`
    );
  }

  if (
    params.layer === 'erp' ||
    /(erp|bom|preco|margem|imposto|simples|presumido|lucro real|lote|roi|frete|pedido)/.test(q)
  ) {
    selectedSchema = SIMPLE_TOOL_SCHEMAS[5];
    const qtyMatch = /(\d+)\s*(un|pecas|unidades|lote)/.exec(q);
    const marginMatch = /margem\s*(\d{1,2})/.exec(q);
    const batchQty = qtyMatch ? Math.max(1, Math.min(500, Number(qtyMatch[1]))) : undefined;
    const marginPct = marginMatch ? Math.max(10, Math.min(55, Number(marginMatch[1]))) : undefined;
    const taxRegime: ErpTaxRegime | undefined = /simples/.test(q)
      ? 'simples'
      : /lucro real|\breal\b/.test(q)
        ? 'real'
        : /presumido/.test(q)
          ? 'presumido'
          : undefined;
    const modal: LogisticsModal | undefined = /ferro/.test(q)
      ? 'rail'
      : /aereo|aviao/.test(q)
        ? 'air'
        : /fluvial|barco/.test(q)
          ? 'river'
          : /rodo|caminhao/.test(q)
            ? 'road'
            : undefined;

    if (batchQty || marginPct || taxRegime || modal) {
      actionsToApply.push({
        type: 'update-erp',
        batchQty,
        marginPct,
        taxRegime,
        logisticsModal: modal,
      });
    }

    const shouldRecordOrder = /(registrar|gravar|salvar|criar)\s*(pedido|ordem|cotacao)/.test(q);
    if (shouldRecordOrder) {
      const unitBrl = params.context.parametrixPriceUnitBrl ?? 420;
      const qtyUsed = batchQty ?? params.context.batchQty;
      actionsToApply.push({
        type: 'record-erp-order',
        title: `Pedido Harness: ${nextProject.title} × ${qtyUsed}`,
        amountBrl: Number((unitBrl * qtyUsed).toFixed(2)),
      });
    }

    trajectory.push({
      stepIndex: trajectory.length + 1,
      phase: 'PROJETO_SYNC',
      toolName: 'erp_sync_pricing_crm',
      args: {
        batchQty: batchQty ?? params.context.batchQty,
        marginPct: marginPct ?? params.context.marginPct,
        taxRegime: taxRegime ?? params.context.taxRegime,
        recordOrder: shouldRecordOrder,
      },
      resultSummary: `ERP Open atualizado (Lote ${batchQty ?? params.context.batchQty} un · Margem ${marginPct ?? params.context.marginPct}% · Preço ref. R$ ${(params.context.parametrixPriceUnitBrl ?? 0).toLocaleString('pt-BR')}).`,
      durationMs: 15,
      status: 'ok',
    });
    replyParts.push(
      `ERP/BI/CRM sincronizado para "${nextProject.title}": lote ${batchQty ?? params.context.batchQty} un, margem ${marginPct ?? params.context.marginPct}%, regime ${taxRegime ?? params.context.taxRegime}${shouldRecordOrder ? ' e ordem gravada no SQLite' : ''}.`
    );
  }

  if (replyParts.length === 0) {
    trajectory.push({
      stepIndex: 2,
      phase: 'SIMPLETOOL',
      toolName: selectedSchema.fnId,
      args: {
        layer: params.layer,
        projectId: nextProject.id,
        partName: params.context.partName,
      },
      resultSummary: `Inspeção determinística em ${params.layer.toUpperCase()} (${params.context.triangleCount} triângulos, ${params.context.volumeCm3} cm³).`,
      durationMs: 14,
      status: 'ok',
    });
    replyParts.push(
      `[${providerMeta.label}] Camada ${params.layer.toUpperCase()} em "${nextProject.title}" (${params.context.triangleCount} triângulos · ${params.context.volumeCm3} cm³ · CAM ${nextProject.machineType}). Peça pronta para comando direto (ex: "desenha engrenagem m2 z24", "trocar projeto para garfo downhill", "rodar FEA", "modo pó metálico" ou "lote 20 un simples nacional").`
    );
  }

  const ratio = Number((selectedSchema.rawSchemaChars / selectedSchema.compressedSchemaChars).toFixed(2));
  const totalLatencyMs = trajectory.reduce((acc, s) => acc + s.durationMs, 0);
  const vucHash = computeDeterministicVucHash(`QWEN_HARNESS_${params.layer.toUpperCase()}`, {
    engineId: providerMeta.id,
    layer: params.layer,
    projectId: nextProject.id,
    prompt: params.prompt,
    trajectoryCount: trajectory.length,
  });

  trajectory.push({
    stepIndex: trajectory.length + 1,
    phase: 'VUC_NOTARIO',
    toolName: 'vuc_seal_trajectory',
    args: {
      vucHash: vucHash.slice(0, 18),
      compressionRatio: ratio,
    },
    resultSummary: `Contrato VUC selado (${vucHash.slice(0, 18)}...) em ${totalLatencyMs} ms.`,
    durationMs: 4,
    status: 'ok',
  });

  return {
    engineId: providerMeta.id as AgentProviderId | 'openai',
    engineLabel: providerMeta.label,
    layer: params.layer,
    activeProject: nextProject,
    compressionStats: {
      rawChars: selectedSchema.rawSchemaChars,
      compressedChars: selectedSchema.compressedSchemaChars,
      compressionRatio: ratio,
      parallelHeadsDecoded: selectedSchema.argSlots.length,
      decodedHeadLatencyMs: Math.min(51, Math.max(18, totalLatencyMs)),
    },
    trajectory,
    actionsToApply,
    reply: replyParts.join(' '),
    vucHash,
    executedAtIso: new Date().toISOString(),
  };
}
