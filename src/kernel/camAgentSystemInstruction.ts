import type { AdditiveManufacturingSettings, MachineType } from '../types/cad';

export interface CamAgentContextSummary {
  partName?: string;
  activeSegment?: string;
  machineType?: MachineType | string;
  processLabel?: string;
  activeTool?: string;
  postFormat?: string;
  estimatedMinutes?: number;
  cuttingLengthMm?: number;
  camRestartCount?: number;
  safetyFactor?: number;
  additiveConfig?: Partial<AdditiveManufacturingSettings>;
  remoteMachinesCount?: number;
  vucHash?: string;
}

export const PARAMETRIX_SYSTEM_INSTRUCTION_CORE = `Você é o agente técnico do Parametric Forge / FrostbiteEngine (https://github.com/scoobiii/parametrIX, branch main).

IDENTIDADE E VERDADE DE ENGENHARIA
1. Nunca invente geometria, dimensão em mm, massa, tolerância GD&T, Fator de Segurança ou resultado de teste/benchmark. Se não foi medido no pipeline real, declare explicitamente que não foi medido.
2. Nunca gere CAD aproximado ou estatístico sem arquivo/medida verificada. Exija STEP, IPT, DXF, STL, 3DM, IFC, SVG ou imagem analisada com contexto e máscara de objetos.
3. FrostbiteEngine: documente estritamente como CPU por interaction nets em silício CMOS binário térmico padrão a 7 nm, 500 MHz até GDS final (pré-silício, ~4,6x desempenho/Watt, não óptico e não quântico). Nunca invente dados públicos de fornecedores, CAM comercial, CAPEX, OPEX ou ROI de Frostbite porque esses dados não existem publicamente.
4. VUC Formal: toda execução CAM, FEA, CAD, build, audit:cad e deploy exige prova VUC determinística e certificado SHA-256 (hash_input, hash_output, hash_processo) com assinatura Ed25519 verificável. Sem hash VUC, considere não executado.
5. Cobertura & Ambiente: 100% de cobertura V8 local e no CI runner; Node >= 22 (em Termux/proot Debian usar /usr/local/node22/bin/node, nunca o Node do Termux que quebra rolldown/dlopen); persistência dupla Firebase nomeado + SQLite local offline.

DOMÍNIO DE VOZ & CHAT CAM (PT-BR)
- Comande e explique os 8 processos CAM (cnc-5axis, cnc-3axis, robot-6axis, powder-metal LPBF, resin-sla UV, robot-weld MIG/TIG com fio/arco visíveis, laser-cut 4 kW com raio/rota visíveis, manual), troca ATC de ferramentas, espessura de camada (µm), temperatura de sinterização (°C), suportes, programas Datacenter/Humanoides, despacho G-Code e monitoramento MQTT em máquinas remotas.
- Responda de forma objetiva em pt-BR (adequada tanto para leitura na tela quanto para síntese de voz TTS) e sempre encerre indicando o próximo comando ou ação concreta no Studio / terminal.`;

export function buildCamAgentSystemInstruction(params: {
  agentId?: string;
  roleLabel?: string;
  cadSummary?: CamAgentContextSummary;
  eyeEvents?: Array<{ direction?: string; source?: string; summary?: string }>;
}): string {
  const s = params.cadSummary ?? {};
  const add = s.additiveConfig;
  const additiveLine = add
    ? `Manufatura Aditiva: camada=${add.layerThicknessUm ?? 'n/d'} µm, sinterização/cura=${add.sinterTempC ?? 'n/d'} °C, suporte=${add.supportPattern ?? 'n/d'} (${add.supportDensityPct ?? 'n/d'}%), atmosfera=${add.atmosphere ?? 'n/d'}.`
    : 'Manufatura Aditiva: processo subtrativo/robótico ativo (sem camada aditiva aplicada).';

  const eyeLines =
    params.eyeEvents && params.eyeEvents.length > 0
      ? params.eyeEvents
          .slice(0, 6)
          .map((e, i) => `${i + 1}. [${e.direction || 'eye'} · ${e.source || 'mcp'}] ${e.summary || ''}`)
          .join('\n')
      : 'Nenhum evento MCP Eye recente registrado.';

  return `${PARAMETRIX_SYSTEM_INSTRUCTION_CORE}

PERFIL ATIVO: Agente=${params.agentId || 'gemini'} · Papel=${params.roleLabel || 'Engenharia CAM/MCP'}
TELEMETRIA REAL DA SESSÃO CAM/CAD:
- Peça: ${s.partName || 'Peça Parametrix'} (Segmento: ${s.activeSegment || 'industrial-cnc'})
- Processo CAM: ${s.processLabel || s.machineType || 'cnc-5axis'} (Pós: ${s.postFormat || 'fanuc-nc'})
- Ferramenta ATC ativa: ${s.activeTool || 'Fresa padrão'} | Reinícios CAM: ${s.camRestartCount ?? 0}
- Percurso G-Code: ${s.cuttingLengthMm ?? 'n/d'} mm | Ciclo estimado: ${s.estimatedMinutes ?? 'n/d'} min
- ${additiveLine}
- Fator de Segurança FEA: ${s.safetyFactor ?? 'n/d'} | Máquinas remotas SQLite: ${s.remoteMachinesCount ?? 0}
- Último Hash VUC: ${s.vucHash || 'pendente'}

OLHO MCP EM TEMPO REAL:
${eyeLines}`;
}

export function buildDeterministicCamAgentReply(params: {
  agentId: string;
  userMessage: string;
  cadSummary?: CamAgentContextSummary;
  eyeEvents?: Array<{ summary?: string }>;
  vucHash: string;
}): string {
  const s = params.cadSummary ?? {};
  const q = params.userMessage
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const processDesc = s.processLabel || s.machineType || 'cnc-5axis';
  const toolDesc = s.activeTool || 'ferramenta ATC ativa';
  const add = s.additiveConfig;

  if (/(capex|opex|roi|fornecedor|frostbite|7nm|500mhz|optico|quantico)/.test(q)) {
    return (
      `[${params.agentId.toUpperCase()} · FrostbiteEngine & VUC] Rack FrostbiteEngine opera em 1 MW / 800 VDC HVAC com tiles CMOS 7 nm binários (500 MHz, GDS final, pré-silício, ~4,6x perf/Watt, NÃO óptico e NÃO quântico). ` +
      `Não existem dados públicos de fornecedores comerciais, CAM específico de silício, CAPEX, OPEX ou ROI — não inventamos esses valores. ` +
      `Prova VUC: ${params.vucHash.slice(0, 18)}. Próxima ação: abra a aba Frostbite 1MW ou dispare POST /api/vuc/formal-proof.`
    );
  }

  if (/(sinter|camada|po metal|lpbf|resina|sla|suporte|aditiv)/.test(q)) {
    const layer = add?.layerThicknessUm ? `${add.layerThicknessUm} µm` : '40 µm (padrão LPBF) / 50 µm (SLA)';
    const temp = add?.sinterTempC ? `${add.sinterTempC} °C` : '1220 °C (LPBF) / 60 °C (SLA)';
    const sup = add?.supportPattern ? `${add.supportPattern} (${add.supportDensityPct ?? 35}%)` : 'configurável em Manufatura Aditiva';
    return (
      `[${params.agentId.toUpperCase()} · CAM Aditivo] Peça "${s.partName || 'Peça Parametrix'}" em ${processDesc}. ` +
      `Camada ativa: ${layer} | Sinterização/Cura: ${temp} | Suporte: ${sup}. ` +
      `Ferramenta: ${toolDesc} | VUC: ${params.vucHash.slice(0, 18)}. Próxima ação: diga "reiniciar CAM" para recalcular o toolpath do zero.`
    );
  }

  if (/(vuc|prova|ed25519|hash|audit|cobertura|test)/.test(q)) {
    return (
      `[${params.agentId.toUpperCase()} · Prova Formal VUC] Hash desta operação: ${params.vucHash}. ` +
      `Use POST /api/vuc/formal-proof para emitir certificado SHA-256 (input/output/processo) + assinatura Ed25519 verificável e rode "npm run ci" para validar 26/26 audit:cad e 100% de cobertura V8.`
    );
  }

  if (/(mqtt|remota|maquina|codigo g|gcode|despachar|opc)/.test(q)) {
    return (
      `[${params.agentId.toUpperCase()} · Despacho Remoto & MQTT] Há ${s.remoteMachinesCount ?? 4} máquinas remotas cadastradas no SQLite. ` +
      `Pós-processador atual: ${s.postFormat || 'fanuc-nc'} (${s.cuttingLengthMm ?? 0} mm de percurso). ` +
      `VUC: ${params.vucHash.slice(0, 18)}. Próxima ação: diga "enviar código G" ou use Ecossistema & ERP -> Máquinas Remotas.`
    );
  }

  const lastEye = params.eyeEvents?.[0]?.summary || 'Viewport 3D e CAM sincronizados';
  return (
    `[${params.agentId.toUpperCase()} · Chat CAM & Olho MCP] Analisei "${params.userMessage}" para "${s.partName || 'Peça Parametrix'}". ` +
    `Processo: ${processDesc} | Ferramenta: ${toolDesc} | Ciclo: ${s.estimatedMinutes ?? 0} min | SF FEA: ${s.safetyFactor ?? 'n/d'}. ` +
    `Olho MCP: "${lastEye}" | VUC: ${params.vucHash.slice(0, 18)}. Próxima ação: peça "reiniciar CAM", "modo pó metálico", "prova VUC" ou "enviar código G".`
  );
}
