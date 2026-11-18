import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Cloud,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  Layers,
  LogIn,
  LogOut,
  Pause,
  Play,
  Puzzle,
  Save,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Volume2,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { buildLocalIcsCalendarBlob } from '../kernel/mcpServer';
import type { SavedCadProject } from '../services/userWorkspaceStore';
import type {
  EvaluatedMesh,
  NurbsSurfaceData,
  SessionDeliverable,
  WorkspaceTab,
} from '../types/cad';

interface OnboardingHelpViewProps {
  onNavigate: (tab: WorkspaceTab) => void;
  sessionSeconds: number;
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  deliverables: SessionDeliverable[];
  onRecordDeliverable: (d: Omit<SessionDeliverable, 'id' | 'timestamp'>) => void;
  savedProjects: SavedCadProject[];
  activeProjectId: string | null;
  cloudBusy: boolean;
  onSaveCloudProject: (projectName: string) => Promise<void>;
  onLoadCloudProject: (project: SavedCadProject) => void;
  onDeleteCloudProject: (projectId: string) => Promise<void>;
}

interface VoiceGuideTopic {
  id: string;
  title: string;
  targetTab: WorkspaceTab;
  script: string;
}

const VOICE_GUIDE_TOPICS: VoiceGuideTopic[] = [
  {
    id: 'grabcad_3d',
    title: '01. Visualizador & Editor 3D GrabCAD',
    targetTab: 'viewport',
    script:
      'Módulo 1: Visualizador e Editor 3D GrabCAD. Sempre que você envia ou importa um arquivo STEP, STL, OBJ, DXF, 3DM ou IFC, o ambiente abre automaticamente o editor 3D e enquadra a peça. Na barra inferior você pode usar o controle Explodir para separar os componentes, girar o conjunto ou ativar o Gizmo 3D para rotacionar peças individualmente, além de ativar o Corte Transversal e os botões de Enquadrar e câmera ortogonal.',
  },
  {
    id: 'object_mask',
    title: '02. Object Mask (Classificação por Família e Subcomponente)',
    targetTab: 'viewport',
    script:
      'Módulo 2: Máscara de Objetos e Classificação Contextual. Ao carregar um conjunto mecânico, como um garfo de suspensão ou estrutura BIM, o sistema detecta automaticamente famílias como Suspensão, Coroa, Estrutura, Eixo, Casca e Fixação, atribuindo uma cor única para cada família e subcomponente. Clique em Máscara Obj na barra 3D ou clique diretamente sobre qualquer peça para inspecionar, ocultar ou isolar.',
  },
  {
    id: 'part_context_fea',
    title: '03. Identidade da Peça, Certificações & FEA Antes/Depois',
    targetTab: 'viewport',
    script:
      'Módulo 3: Identidade de Engenharia e Cálculo Estrutural FEA. No painel lateral esquerdo, o ambiente reconhece fabricante, modelo, especificações técnicas, normas como ISO 4210 e ASTM F2043, uso pretendido e fator de segurança mínimo. Clique em Exibir Mapa de Calor de Estresse para visualizar a tensão de Von Mises em megapascals, e utilize os botões de gerar nova geometria para comparar a resistência Antes e Depois com verificação automática de norma.',
  },
  {
    id: 'component_pbr',
    title: '04. Renderização PBR por Componente',
    targetTab: 'viewport',
    script:
      'Módulo 4: Renderização por Material e Customização Individual. No modo PBR por Peça, cada componente recebe o material inferido do seu contexto, como alumínio forjado nas coroas, titânio nas bengalas, fibra de carbono em carenagens e polímero fosco nos retentores. Para alterar o material de apenas um componente, clique na peça na cena 3D ou na árvore lateral e escolha Alumínio, Titânio, Fibra de Carbono, Vidro, Plástico Fosco, Argila ou Madeira.',
  },
  {
    id: 'rag_mcp_segment',
    title: '05. Agente RAG + MCP por Segmento de Aplicação',
    targetTab: 'mcp',
    script:
      'Módulo 5: Agente de Engenharia RAG e Ferramentas MCP por Segmento. Na aba MCP Tools, selecione o segmento industrial aplicável, como Ciclismo e Downhill, Automotivo, Aeroespacial, Arquitetura BIM, Usinagem CNC, Robótica ou Médico. Suba arquivos ou links do Google Drive na base RAG e peça em português para o agente explodir a vista, rotacionar componentes, rodar FEA Antes e Depois ou exportar arquivos isolados.',
  },
  {
    id: 'grasshopper_cam',
    title: '06. Grasshopper, Plugins SDK & CAM / Robótica',
    targetTab: 'grasshopper',
    script:
      'Módulo 6: Automação Grasshopper, SDK de Plugins e Fabricação Digital CAM. Conecte nós paramétricos no grafo visual para deformar superfícies NURBS em tempo real, escreva modificadores JavaScript em Plugins SDK e configure fresa, avanço e pós-processamento para CNC 3 ou 5 eixos, usinagem manual ou robô KUKA de 6 eixos, exportando em 3DM, STL, DXF, NC ou SRC.',
  },
];

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export const OnboardingHelpView: React.FC<OnboardingHelpViewProps> = ({
  onNavigate,
  sessionSeconds,
  surface,
  meshData,
  deliverables,
  onRecordDeliverable,
  savedProjects,
  activeProjectId,
  cloudBusy,
  onSaveCloudProject,
  onLoadCloudProject,
  onDeleteCloudProject,
}) => {
  const { user, authReady, authBusy, authError, signInWithGoogle, logout, clearAuthError } =
    useAuth();
  const [projectNameInput, setProjectNameInput] = useState(surface.name);

  // Voice synthesis guidance state
  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [speakingTopicId, setSpeakingTopicId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const tourCancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      tourCancelledRef.current = true;
      if (speechSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSupported]);

  const stopSpeech = () => {
    tourCancelledRef.current = true;
    if (speechSupported) {
      window.speechSynthesis.cancel();
    }
    setSpeakingTopicId(null);
    setIsPaused(false);
  };

  const speakSingleTopic = (topic: VoiceGuideTopic, chainTour = false, tourIndex = 0) => {
    if (!speechSupported) return;
    if (!chainTour) {
      tourCancelledRef.current = false;
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(topic.script);
    utterance.lang = 'pt-BR';
    utterance.rate = speechRate;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (ptVoice) utterance.voice = ptVoice;

    setSpeakingTopicId(topic.id);
    setIsPaused(false);

    utterance.onend = () => {
      if (chainTour && !tourCancelledRef.current && tourIndex + 1 < VOICE_GUIDE_TOPICS.length) {
        speakSingleTopic(VOICE_GUIDE_TOPICS[tourIndex + 1], true, tourIndex + 1);
      } else {
        setSpeakingTopicId(null);
        setIsPaused(false);
      }
    };
    utterance.onerror = () => {
      setSpeakingTopicId(null);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleStartFullTour = () => {
    if (!speechSupported) return;
    tourCancelledRef.current = false;
    window.speechSynthesis.cancel();
    speakSingleTopic(VOICE_GUIDE_TOPICS[0], true, 0);
  };

  const handleTogglePause = () => {
    if (!speechSupported || !speakingTopicId) return;
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleDownloadIcs = () => {
    const blob = buildLocalIcsCalendarBlob(sessionSeconds, surface.name, deliverables);
    const filename = `sessao_parametrix_${new Date().toISOString().slice(0, 10)}.ics`;
    triggerBlobDownload(blob, filename);
    onRecordDeliverable({
      filename,
      kind: 'ICS',
      summary: `Evento de agenda local (${formatDuration(sessionSeconds)}, ${deliverables.length} entregáveis)`,
    });
  };

  const handleDownloadMarkdownSummary = () => {
    const lines = [
      `# Resumo da Sessão — Parametrix CAD Studio`,
      ``,
      `- **Tempo de Sessão**: ${formatDuration(sessionSeconds)}`,
      `- **Modelo Ativo**: ${surface.name}`,
      `- **Malha**: ${meshData.triangleCount} triângulos · ${meshData.surfaceAreaCm2} cm² · ${meshData.volumeCm3} cm³`,
      ``,
      `## Entregáveis Gerados`,
      ...(deliverables.length > 0
        ? deliverables.map(
            (d) => `- [${d.timestamp}] \`${d.filename}\` (${d.kind}) — ${d.summary}`
          )
        : [`- Nenhum arquivo exportado ainda nesta sessão.`]),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const filename = `resumo_sessao_${new Date().toISOString().slice(0, 10)}.md`;
    triggerBlobDownload(blob, filename);
    onRecordDeliverable({
      filename,
      kind: 'REPORT',
      summary: `Relatório Markdown de sessão (${formatDuration(sessionSeconds)})`,
    });
  };

  const activeVoiceTopic = VOICE_GUIDE_TOPICS.find((t) => t.id === speakingTopicId) ?? null;

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {/* Hero Header */}
        <section className="space-y-4 pb-8 border-b border-white/10">
          <p className="text-xs font-medium text-sky-400">
            Guia de Início, Ajuda por Voz & Documentação · Engenheiros, Devs e Agentes
          </p>
          <h1
            className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-100 max-w-3xl"
            style={{ textWrap: 'balance' }}
          >
            Ambiente Paramétrico NURBS, GrabCAD 3D, FEA & MCP por Segmento
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
            Receba arquivos CAD (STEP, STL, OBJ, DXF, 3DM, IFC), visualize com explosão, rotação e
            Object Mask por família, calcule resistência estrutural Antes vs Depois segundo normas de
            certificação e acione explicações guiadas por voz para cada recurso.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('viewport')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Abrir Editor 3D GrabCAD
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('mcp')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 rounded-lg hover:border-sky-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              Agente RAG + MCP
            </button>
            <button
              type="button"
              onClick={() => onNavigate('files')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 rounded-lg hover:border-sky-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              Importar Arquivo CAD
            </button>
          </div>
        </section>

        {/* Interactive Voice-Guided Help Center */}
        <section className="p-5 sm:p-6 bg-[#111620] border border-sky-500/30 rounded-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-400 shrink-0" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Guia Interativo por Voz (Como Usar Cada Recurso)
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Acione a narração em português (Web Speech API) para ouvir o funcionamento completo do ambiente ou toque em qualquer recurso abaixo para explicação passo a passo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Velocidade da explicação por voz"
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-200"
              >
                <option value={0.9}>Voz 0.9x</option>
                <option value={1.0}>Voz 1.0x</option>
                <option value={1.2}>Voz 1.2x</option>
              </select>

              {!speakingTopicId ? (
                <button
                  type="button"
                  disabled={!speechSupported}
                  onClick={handleStartFullTour}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Ouvir Tour Completo
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 cursor-pointer"
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {isPaused ? 'Retomar' : 'Pausar'}
                  </button>
                  <button
                    type="button"
                    onClick={stopSpeech}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-rose-500/20 border border-rose-400/50 text-rose-200 rounded-lg hover:bg-rose-500/30 cursor-pointer"
                  >
                    <Square className="w-3 h-3" />
                    Parar
                  </button>
                </>
              )}
            </div>
          </div>

          {!speechSupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200">
              Seu navegador atual não disponibiliza síntese de voz (Web Speech API). Leia os roteiros completos abaixo.
            </div>
          )}

          {activeVoiceTopic && (
            <div className="p-3.5 bg-sky-500/12 border border-sky-400/40 rounded-lg space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2 font-semibold text-sky-300">
                <span>Reproduzindo agora: {activeVoiceTopic.title}</span>
                <span className="font-mono-tabular text-[11px] text-slate-300">
                  {isPaused ? 'PAUSADO' : 'EM NARRAÇÃO'}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">{activeVoiceTopic.script}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {VOICE_GUIDE_TOPICS.map((topic) => {
              const isPlayingThis = speakingTopicId === topic.id;
              return (
                <div
                  key={topic.id}
                  className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
                    isPlayingThis
                      ? 'bg-sky-500/10 border-sky-400/60'
                      : 'bg-[#0c1017] border-white/8'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-xs font-semibold text-slate-100">
                      {topic.title}
                    </h3>
                    <button
                      type="button"
                      disabled={!speechSupported}
                      onClick={() =>
                        isPlayingThis ? stopSpeech() : speakSingleTopic(topic, false)
                      }
                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border shrink-0 cursor-pointer ${
                        isPlayingThis
                          ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                          : 'bg-sky-500/15 border-sky-400/40 text-sky-200 hover:bg-sky-500/25'
                      }`}
                    >
                      {isPlayingThis ? (
                        <>
                          <Square className="w-3 h-3" /> Parar
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3" /> Ouvir Voz
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{topic.script}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate(topic.targetTab)}
                    className="text-[11px] font-medium text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    Ir para este recurso <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* End-User Google Login & Isolated Personal Cloud Workspace */}
        <section className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/8">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Acesso de Usuário Final (Login Google Isolado)
                </h2>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cada usuário entra com sua própria conta Google via Firebase Authentication. Nenhum dado do desenvolvedor/PO do Google AI Studio ou permissões de Drive/Calendar é acessado ou exposto.
              </p>
            </div>

            {authReady && !user && (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void signInWithGoogle()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white text-slate-950 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                {authBusy ? 'Autenticando...' : 'Entrar com Google'}
              </button>
            )}

            {user && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#0c1017] border border-white/10 rounded-lg">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Avatar'}
                      className="w-6 h-6 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Cloud className="w-4 h-4 text-sky-400" />
                  )}
                  <div className="text-left">
                    <div className="text-xs font-medium text-slate-100 leading-tight">
                      {user.displayName || 'Usuário Conectado'}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-tight">{user.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void logout()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0c1017] border border-white/12 text-slate-300 hover:text-white hover:border-white/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sair
                </button>
              </div>
            )}
          </div>

          {authError && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
              <span>{authError}</span>
              <button
                type="button"
                onClick={clearAuthError}
                className="text-[11px] underline hover:text-rose-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          )}

          {user ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  maxLength={120}
                  placeholder="Nome do projeto paramétrico..."
                  className="flex-1 min-w-[220px] px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={() => void onSaveCloudProject(projectNameInput)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {cloudBusy ? 'Salvando...' : 'Salvar Projeto na Minha Conta'}
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">
                    Meus Projetos Privados ({savedProjects.length})
                  </span>
                  <span className="text-[11px] font-mono-tabular text-slate-500">
                    Escopo isolado: users/{user.uid.slice(0, 8)}…
                  </span>
                </div>

                {savedProjects.length > 0 ? (
                  <div className="divide-y divide-white/6 border border-white/8 rounded-lg bg-[#0c1017]">
                    {savedProjects.map((proj) => {
                      const isActive = proj.id === activeProjectId;
                      return (
                        <div
                          key={proj.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-slate-100 truncate">
                              {proj.name}{' '}
                              {isActive && (
                                <span className="text-[11px] text-sky-400 font-normal">
                                  (Ativo)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono-tabular">
                              {proj.preset.toUpperCase()} · {proj.materialFinish} ·{' '}
                              {proj.camSettings.machineType} · {formatDuration(proj.sessionSeconds)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onLoadCloudProject(proj)}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-sky-500/15 border border-sky-400/30 text-sky-300 hover:bg-sky-500/25 rounded-md cursor-pointer"
                            >
                              <FolderOpen className="w-3 h-3" />
                              Carregar
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteCloudProject(proj.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md cursor-pointer"
                              title="Excluir projeto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3.5 bg-[#0c1017] border border-white/8 rounded-lg text-xs text-slate-400">
                    Nenhum projeto salvo na sua conta ainda. Clique em <strong className="text-slate-200">Salvar Projeto na Minha Conta</strong> para persistir os parâmetros NURBS e CAM atuais.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-[#0c1017] border border-white/8 rounded-lg text-xs text-slate-400">
              Você está operando em modo local no navegador. Faça login com sua própria conta Google acima para salvar projetos paramétricos e histórico de entregáveis exclusivamente no seu espaço privado.
            </div>
          )}
        </section>

        {/* Role-oriented Onboarding Tracks: Developers vs Agents */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-sky-400" />
              <h2 className="font-display text-base font-semibold text-slate-100">
                Para Desenvolvedores (SDK & CAD Kernel)
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Estenda o kernel matemático Cox-de Boor escrevendo modificadores em JavaScript
              sandboxed sobre pontos de controle 4D, importe malhas externas e exporte binários
              industriais sem dependências externas.
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('plugins')}
                className="px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-sky-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Abrir Plugins SDK
              </button>
              <button
                type="button"
                onClick={() => onNavigate('files')}
                className="px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-sky-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Importar / Exportar CAD
              </button>
            </div>
          </div>

          <div className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4 text-amber-400" />
              <h2 className="font-display text-base font-semibold text-slate-100">
                Para Agentes & Automação (MCP & Segmentos)
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Conecte agentes de IA com <strong className="text-slate-200">RAG (Upload, URL e Google Drive)</strong> e{' '}
              <strong className="text-slate-200">Model Context Protocol (MCP)</strong> por segmento,
              com explosão GrabCAD, Object Mask, cálculo FEA e mapa de calor Antes vs Depois.
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('mcp')}
                className="px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-amber-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Agente RAG + MCP
              </button>
              <button
                type="button"
                onClick={() => onNavigate('cam')}
                className="px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-amber-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Simular CAM & Robô
              </button>
            </div>
          </div>
        </section>

        {/* Reference Help Menu Grid */}
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            Mapa Rápido dos Módulos (Menu Ajuda)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <HelpTile
              icon={<Layers className="w-4 h-4 text-sky-400" />}
              title="01. Modelagem 3D"
              desc="GrabCAD Explodir/Rotacionar, Máscara de Objetos, PBR por componente e FEA."
              onClick={() => onNavigate('viewport')}
            />
            <HelpTile
              icon={<Workflow className="w-4 h-4 text-emerald-400" />}
              title="02. Grasshopper DAG"
              desc="Grafo de nós paramétricos conectáveis com avaliação topológica instantânea."
              onClick={() => onNavigate('grasshopper')}
            />
            <HelpTile
              icon={<Wrench className="w-4 h-4 text-amber-400" />}
              title="03. CAM & Robótica"
              desc="Seleção de fresas, folha manual DRO, G-Code ISO e cinemática inversa 6-eixos."
              onClick={() => onNavigate('cam')}
            />
            <HelpTile
              icon={<Puzzle className="w-4 h-4 text-indigo-400" />}
              title="04. MCP & Plugins"
              desc="15 Ferramentas MCP por segmento e editor JS sandboxed para extensões."
              onClick={() => onNavigate('mcp')}
            />
          </div>
        </section>

        {/* Session Summary & Deliverables Tracker */}
        <section className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/8">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Resumo da Sessão & Entregáveis
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Acompanhe o tempo decorrido, sincronize com seu histórico privado ao entrar com Google ou baixe agenda local (.ICS) e relatório Markdown.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500/15 border border-sky-400/40 text-sky-300 hover:bg-sky-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                Exportar Agenda (.ICS)
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdownSummary}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 text-slate-200 hover:border-white/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Relatório (.MD)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-slate-500">Tempo da Sessão</div>
              <div className="font-mono-tabular text-lg font-semibold text-sky-400 mt-0.5">
                {formatDuration(sessionSeconds)}
              </div>
            </div>
            <div className="p-3.5 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-slate-500">Geometria Ativa</div>
              <div className="text-sm font-medium text-slate-100 mt-1 truncate">
                {surface.name}
              </div>
            </div>
            <div className="p-3.5 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-slate-500">Entregáveis na Sessão</div>
              <div className="font-mono-tabular text-lg font-semibold text-emerald-400 mt-0.5">
                {deliverables.length}
              </div>
            </div>
          </div>

          {deliverables.length > 0 ? (
            <div className="divide-y divide-white/6 border border-white/8 rounded-lg bg-[#0c1017]">
              {deliverables.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-mono-tabular text-slate-100 truncate">
                      {item.filename}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400 truncate">{item.summary}</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                    {item.kind} · {item.timestamp}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-[#0c1017] border border-white/8 rounded-lg text-xs text-slate-400">
              Nenhum artefato exportado ainda. Utilize <strong className="text-slate-200">Exportar CAD / NC</strong> ou
              os comandos <strong className="text-slate-200">MCP Tools</strong> para gerar arquivos .3DM, .STL, .DXF ou código NC/KRL.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface HelpTileProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}

const HelpTile: React.FC<HelpTileProps> = ({ icon, title, desc, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left p-4 bg-[#111620] border border-white/10 hover:border-sky-400/50 rounded-xl transition-colors space-y-2 cursor-pointer"
  >
    <div className="flex items-center gap-2">
      {icon}
      <span className="font-display text-xs font-semibold text-slate-100">{title}</span>
    </div>
    <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
  </button>
);