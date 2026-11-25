import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  Cpu,
  FolderGit2,
  GitBranch,
  KeyRound,
  Layers,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  HARNESS_OPTIONAL_API_PROVIDERS,
  type HarnessLayer,
  type HarnessProjectDescriptor,
  type HarnessRunResult,
} from '../kernel/qwenSimpleToolHarness';
import type { AgentProviderId } from '../types/cad';

export interface HarnessProviderEnvStatus {
  id: string;
  envKeyConfigured: boolean;
}

export interface AgentHarnessDockProps {
  layer: HarnessLayer;
  title?: string;
  defaultExpanded?: boolean;
  selectedEngineId: AgentProviderId | 'openai';
  onSelectEngine: (id: AgentProviderId | 'openai') => void;
  projects: HarnessProjectDescriptor[];
  activeProjectId?: string;
  onSwitchDynamicProject: (projectId: string, layer: HarnessLayer) => Promise<void>;
  onCreateDynamicProject?: (name: string, layer: HarnessLayer) => Promise<void>;
  onRunHarness: (layer: HarnessLayer, prompt: string) => Promise<HarnessRunResult>;
  history: {
    id: string;
    prompt: string;
    result: HarnessRunResult;
  }[];
  sessionApiKeys: Record<string, string>;
  onChangeSessionApiKey: (providerId: string, keyValue: string) => void;
  customBaseUrls: Record<string, string>;
  onChangeCustomBaseUrl: (providerId: string, baseUrl: string) => void;
  providerEnvStatuses?: HarnessProviderEnvStatus[];
}

const LAYER_LABELS: Record<HarnessLayer, { label: string; accent: string; quickPrompts: { label: string; cmd: string }[] }> = {
  cad: {
    label: 'CAD · Geometria & B-Rep',
    accent: 'text-sky-300 border-sky-400/40 bg-sky-500/10',
    quickPrompts: [
      { label: 'Desenha Peça CAD (M2 Z24)', cmd: 'desenha uma peça cad no scoobiii/parametrIX' },
      { label: 'Trocar → Garfo Downhill', cmd: 'trocar projeto para garfo downhill' },
      { label: 'Trocar → Rack Frostbite 1MW', cmd: 'trocar projeto para rack frostbite 1 mw' },
      { label: 'Trocar → Flange CNC', cmd: 'trocar projeto para flange cnc' },
    ],
  },
  cae: {
    label: 'CAE · FEA, Fadiga & LCA',
    accent: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
    quickPrompts: [
      { label: 'Rodar FEA + Otimizar Curvatura', cmd: 'rodar FEA e otimizar curvatura massa' },
      { label: 'Avaliar Carbono + Trocar Hélice', cmd: 'trocar projeto para helice titanio e avaliar carbono' },
      { label: 'Auditar Fator de Segurança', cmd: 'rodar FEA verificar seguranca estrutural' },
    ],
  },
  cam: {
    label: 'CAM · Toolpath & Robótica',
    accent: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
    quickPrompts: [
      { label: 'Pó Metálico LPBF + Reiniciar', cmd: 'modo po metalico e reiniciar cam' },
      { label: 'Resina SLA UV + Reiniciar', cmd: 'modo resina sla e reiniciar cam' },
      { label: 'Robô KUKA 6-Eixos KRL', cmd: 'ativar kuka 6 eixos e gerar gcode' },
      { label: 'Laser 4 kW', cmd: 'ativar laser e reiniciar cam' },
    ],
  },
  erp: {
    label: 'ERP · Custos, Tributos & CRM',
    accent: 'text-violet-300 border-violet-400/40 bg-violet-500/10',
    quickPrompts: [
      { label: 'Lote 25 un · Simples Nacional', cmd: 'lote 25 un simples margem 32' },
      { label: 'Lucro Real + Gravar Pedido', cmd: 'lote 15 un lucro real registrar pedido' },
      { label: 'Modal Ferroviário + Trocar Rack', cmd: 'trocar projeto para rack frostbite lote 10 un ferro' },
    ],
  },
};

export const AgentHarnessDock: React.FC<AgentHarnessDockProps> = ({
  layer,
  title,
  defaultExpanded = false,
  selectedEngineId,
  onSelectEngine,
  projects,
  activeProjectId,
  onSwitchDynamicProject,
  onCreateDynamicProject,
  onRunHarness,
  history,
  sessionApiKeys,
  onChangeSessionApiKey,
  customBaseUrls,
  onChangeCustomBaseUrl,
  providerEnvStatuses = [],
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [subView, setSubView] = useState<'chat' | 'trajectory'>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');

  const layerMeta = LAYER_LABELS[layer];
  const currentEngineMeta =
    HARNESS_OPTIONAL_API_PROVIDERS.find((p) => p.id === selectedEngineId) ??
    HARNESS_OPTIONAL_API_PROVIDERS[0];

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId]
  );

  const latestEntry = history[0] ?? null;

  const handleSubmitPrompt = async (rawPrompt?: string) => {
    const clean = (rawPrompt ?? promptDraft).trim();
    if (!clean || busy) return;
    setBusy(true);
    setExpanded(true);
    try {
      await onRunHarness(layer, clean);
      if (!rawPrompt) setPromptDraft('');
    } finally {
      setBusy(false);
    }
  };

  const handleProjectSelect = async (nextId: string) => {
    if (!nextId || switchingProject) return;
    setSwitchingProject(true);
    try {
      await onSwitchDynamicProject(nextId, layer);
    } finally {
      setSwitchingProject(false);
    }
  };

  return (
    <div className="bg-[#0e131c] border border-white/12 rounded-xl overflow-hidden text-xs">
      {/* Compact Header Bar */}
      <div className="px-3 py-2 bg-[#131924] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold ${layerMeta.accent}`}>
            {title || layerMeta.label}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/12 border border-emerald-400/35 text-[10px] font-mono-tabular text-emerald-200">
            <Cpu className="w-3 h-3 shrink-0" />
            {currentEngineMeta.id === 'local-llm' ? 'Qwen 0.5B SimpleTool (Padrão)' : currentEngineMeta.label}
          </span>
          {latestEntry && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono-tabular text-sky-300">
              {latestEntry.result.compressionStats.compressionRatio}× compressão ·{' '}
              {latestEntry.result.compressionStats.decodedHeadLatencyMs} ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Dynamic Backend Project Selector */}
          <div className="flex items-center gap-1 bg-[#090d14] border border-white/12 rounded px-1.5 py-0.5">
            <FolderGit2 className="w-3 h-3 text-sky-400 shrink-0" />
            <select
              aria-label={`Projeto dinâmico do backend (${layer.toUpperCase()})`}
              value={activeProject?.id ?? ''}
              disabled={switchingProject}
              onChange={(e) => void handleProjectSelect(e.target.value)}
              className="bg-transparent text-[11px] text-slate-100 outline-none cursor-pointer max-w-[165px] sm:max-w-[210px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0b0f17] text-slate-100">
                  {p.source === 'sqlite-project' ? `[SQLite] ${p.title}` : p.title}
                </option>
              ))}
            </select>
            {switchingProject && <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />}
          </div>

          {onCreateDynamicProject && (
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setNewProjectModal((v) => !v);
              }}
              className="px-1.5 py-1 rounded border border-white/12 bg-[#090d14] text-slate-300 hover:text-white cursor-pointer"
              title="Criar novo projeto dinâmico no backend SQLite"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-2 py-1 rounded border border-white/12 bg-[#090d14] text-slate-200 hover:border-sky-400/50 flex items-center gap-1 text-[10px] font-medium cursor-pointer"
            title="Configurações do Harness (Qwen 0.5B padrão ou API Key opcional)"
          >
            <Settings2 className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Configurações</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-2 py-1 rounded border border-sky-400/35 bg-sky-500/12 text-sky-200 hover:bg-sky-500/20 flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Recolher
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Chat & Trajetória ({history.length})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Inline Create SQLite Project Bar */}
      {newProjectModal && onCreateDynamicProject && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newProjectTitle.trim()) return;
            setSwitchingProject(true);
            try {
              await onCreateDynamicProject(newProjectTitle.trim(), layer);
              setNewProjectTitle('');
              setNewProjectModal(false);
            } finally {
              setSwitchingProject(false);
            }
          }}
          className="px-3 py-2 bg-[#0a0f17] border-b border-white/10 flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            placeholder="Nome do novo projeto dinâmico no backend..."
            className="flex-1 min-w-[180px] px-2.5 py-1 text-[11px] bg-[#06090e] border border-white/15 rounded text-slate-100 outline-none focus:border-sky-400"
          />
          <button
            type="submit"
            disabled={switchingProject}
            className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500 text-slate-950 rounded hover:bg-sky-400 cursor-pointer disabled:opacity-50"
          >
            Criar & Alternar
          </button>
          <button
            type="button"
            onClick={() => setNewProjectModal(false)}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Expanded Harness Workspace: Dual Chat / Trajetória Tabs */}
      {expanded && (
        <div className="p-3 space-y-2.5">
          {/* DeepSeek-style Chat / Trajetória switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSubView('chat')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                  subView === 'chat'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setSubView('trajectory')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                  subView === 'trajectory'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Activity className="w-3 h-3" />
                Trajetória ({latestEntry ? latestEntry.result.trajectory.length : 0})
              </button>
            </div>
            <div className="text-[10px] font-mono-tabular text-slate-400 flex items-center gap-2">
              <span>SimpleTool arXiv:2603.00030</span>
              <span>·</span>
              <span className="text-emerald-300">Sem download LLM</span>
            </div>
          </div>

          {subView === 'chat' ? (
            <>
              {/* Chat Feed */}
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {history.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-[#090d14] border border-white/8 text-[11px] text-slate-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-sky-300 font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      Qwen 0.5B SimpleTool Harness ativo em {layer.toUpperCase()}
                    </div>
                    <p className="text-slate-400">
                      Projeto backend atual: <strong className="text-slate-200">{activeProject?.title}</strong>.
                      Peça peças CAD reais (ex: &quot;desenha uma peça cad no scoobiii/parametrIX&quot;), troque projetos dinamicamente ou comande parâmetros CAE/CAM/ERP sem instalar nenhum LLM.
                    </p>
                  </div>
                ) : (
                  history.slice(0, 6).map((item) => (
                    <div key={item.id} className="space-y-1.5">
                      <div className="flex justify-end">
                        <div className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-400/35 text-slate-100 text-[11px] max-w-[90%]">
                          {item.prompt}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#090d14] border border-white/10 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular">
                          <span className="text-emerald-300 font-semibold flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {item.result.engineLabel} · {item.result.activeProject.title}
                          </span>
                          <span className="text-slate-400">
                            {item.result.compressionStats.compressionRatio}× SimpleTool ·{' '}
                            {item.result.compressionStats.decodedHeadLatencyMs} ms ·{' '}
                            <span className="text-emerald-400">{item.result.vucHash.slice(0, 12)}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {item.result.reply}
                        </p>
                        {item.result.actionsToApply.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {item.result.actionsToApply.map((act, idx) => (
                              <span
                                key={`${item.id}-act-${idx}`}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/12 border border-emerald-400/35 text-[9px] font-mono-tabular text-emerald-200"
                              >
                                ✓ {act.type}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Prompt Form & Quick Chips */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSubmitPrompt();
                }}
                className="flex flex-wrap items-center gap-1.5"
              >
                <input
                  type="text"
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  placeholder={`Comando ${layer.toUpperCase()} (ex: desenha uma peça cad, trocar projeto, rodar FEA, lote 20 un)...`}
                  className="flex-1 min-w-[200px] px-2.5 py-1.5 text-[11px] bg-[#080b10] border border-white/15 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={busy || !promptDraft.trim()}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  {busy ? 'Executando...' : 'Executar Harness'}
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {layerMeta.quickPrompts.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSubmitPrompt(chip.cmd)}
                    className="px-2 py-0.5 text-[10px] font-mono-tabular bg-[#141a24] border border-white/10 text-slate-300 hover:border-sky-400 hover:text-sky-200 rounded cursor-pointer disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Trajetória View (mirrors DeepSeek Harness Trajetória inspector) */
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {!latestEntry ? (
                <div className="p-3 rounded-lg bg-[#090d14] border border-white/8 text-[11px] text-slate-400">
                  Execute qualquer comando na aba Chat para inspecionar a trajetória completa SimpleTool + Prova VUC.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2 rounded bg-[#090d14] border border-white/10">
                      <div className="text-[9px] text-slate-400">Compressão Schema</div>
                      <div className="text-xs font-mono-tabular font-semibold text-sky-300">
                        {latestEntry.result.compressionStats.rawChars} → {latestEntry.result.compressionStats.compressedChars} ch ({latestEntry.result.compressionStats.compressionRatio}×)
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#090d14] border border-white/10">
                      <div className="text-[9px] text-slate-400">Cabeças Paralelas</div>
                      <div className="text-xs font-mono-tabular font-semibold text-emerald-300">
                        {latestEntry.result.compressionStats.parallelHeadsDecoded} slots · {latestEntry.result.compressionStats.decodedHeadLatencyMs} ms
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#090d14] border border-white/10">
                      <div className="text-[9px] text-slate-400">Projeto Ativo</div>
                      <div className="text-xs font-mono-tabular font-semibold text-slate-100 truncate">
                        {latestEntry.result.activeProject.title}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#090d14] border border-white/10">
                      <div className="text-[9px] text-slate-400">Contrato VUC</div>
                      <div className="text-xs font-mono-tabular font-semibold text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {latestEntry.result.vucHash.slice(0, 14)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {latestEntry.result.trajectory.map((step) => (
                      <div
                        key={`traj-${step.stepIndex}-${step.toolName}`}
                        className="p-2 rounded-lg bg-[#090d14] border border-white/10 space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular">
                          <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3" />
                            #{step.stepIndex} [{step.phase}] · {step.toolName}
                          </span>
                          <span className="text-emerald-300">{step.durationMs} ms · OK</span>
                        </div>
                        <div className="text-[11px] text-slate-200">{step.resultSummary}</div>
                        <div className="text-[10px] font-mono-tabular text-slate-400 break-all">
                          args: {JSON.stringify(step.args)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Configurações do Harness (Modelos + Chaves Opcionais em Memória) */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-[#111620] border border-white/15 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="font-display text-sm font-bold text-slate-100">
                  Configurações do Harness · Qwen 0.5B Padrão + APIs Opcionais
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-400/35 text-[11px] text-emerald-200">
                <strong>Zero-Install Padrão:</strong> o motor <strong>Qwen 0.5B + SimpleTool Harness</strong> roda nativamente sem download de modelos. Chaves de API abaixo são totalmente opcionais e ficam <strong>apenas na memória da sessão</strong> (nunca gravadas no disco ou SQLite).
              </div>

              <div className="space-y-2">
                {HARNESS_OPTIONAL_API_PROVIDERS.map((prov) => {
                  const isSelected = selectedEngineId === prov.id;
                  const envStatus = providerEnvStatuses.find((s) => s.id === prov.id);
                  const sessionVal = sessionApiKeys[prov.id] ?? '';
                  const baseUrlVal = customBaseUrls[prov.id] ?? prov.defaultBaseUrl;
                  return (
                    <div
                      key={prov.id}
                      className={`p-3 rounded-xl border transition-colors space-y-2 ${
                        isSelected
                          ? 'border-sky-400/60 bg-sky-500/8'
                          : 'border-white/10 bg-[#0b0f17]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-100">
                          <input
                            type="radio"
                            name="harness-engine-selector"
                            checked={isSelected}
                            onChange={() => onSelectEngine(prov.id as AgentProviderId | 'openai')}
                            className="accent-sky-400 cursor-pointer"
                          />
                          <span>{prov.label}</span>
                        </label>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular">
                          {prov.envVarName ? (
                            <span
                              className={`px-1.5 py-0.5 rounded border ${
                                envStatus?.envKeyConfigured || sessionVal.trim()
                                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-white/15 bg-white/5 text-slate-400'
                              }`}
                            >
                              {sessionVal.trim()
                                ? 'Chave na sessão'
                                : envStatus?.envKeyConfigured
                                  ? `${prov.envVarName} OK`
                                  : `${prov.envVarName} opcional`}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                              Embutido · Ativo Offline/Online
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400">{prov.description}</p>

                      {prov.kind !== 'embedded' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5 flex items-center gap-1">
                              <KeyRound className="w-3 h-3 text-amber-400" />
                              API Chave Opcional ({prov.envVarName || 'Local'})
                            </label>
                            <input
                              type="password"
                              autoComplete="off"
                              value={sessionVal}
                              onChange={(e) => onChangeSessionApiKey(prov.id, e.target.value)}
                              placeholder={`Deixe em branco para usar env (${prov.envVarName || 'nenhuma'})`}
                              className="w-full px-2.5 py-1.5 text-[11px] bg-[#070a0f] border border-white/12 rounded text-slate-100 font-mono-tabular outline-none focus:border-sky-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              URL Base ({prov.kind === 'local-endpoint' ? 'localhost :8080/:11434' : 'Endpoint oficial HTTPS'})
                            </label>
                            <input
                              type="text"
                              value={baseUrlVal}
                              readOnly={prov.kind === 'frontier-key'}
                              onChange={(e) => onChangeCustomBaseUrl(prov.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 text-[11px] bg-[#070a0f] border border-white/12 rounded text-slate-300 font-mono-tabular outline-none focus:border-sky-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex justify-end gap-2 bg-[#0c1017]">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 cursor-pointer"
              >
                Aplicar & Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
