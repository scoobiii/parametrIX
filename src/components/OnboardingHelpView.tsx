import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  Layers,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Palette,
  Pause,
  Play,
  Puzzle,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Volume2,
  Workflow,
  Wrench,
} from 'lucide-react';
import pwcCadTeamImg from '../assets/images/pwc_cad_design_team_1795606940628.jpg';
import pwcCaeStudioImg from '../assets/images/pwc_cae_sustainable_studio_1795606941481.jpg';
import pwcCamFloorImg from '../assets/images/pwc_cam_floor_engineers_1795606942749.jpg';
import runnersCoupleImg from '../assets/images/runners_parametrix_couple_1795606941690.jpg';
import { useAuth } from '../contexts/AuthContext';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { buildLocalIcsCalendarBlob } from '../kernel/mcpServer';
import type { OpenErpWorkspaceSnapshot } from '../kernel/openErpEngine';
import {
  ACCEPTED_CAD_EXTENSIONS,
  type FullWorkspacePreset,
  WORKSPACE_PROJECT_PRESETS,
} from '../kernel/workspacePresets';
import type { SavedCadProject } from '../services/userWorkspaceStore';
import type {
  EvaluatedMesh,
  NurbsSurfaceData,
  ScoobiiiVucProofReport,
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
  onUploadFile: (file: File) => Promise<void>;
  onApplyPreset: (preset: FullWorkspacePreset, openEditor?: boolean) => void;
  scoobiiiProof: ScoobiiiVucProofReport;
  liveErpSnapshot?: OpenErpWorkspaceSnapshot;
  activeUserLabel?: string;
  onOpenErpEntry?: () => void;
  isAuthenticatedSession?: boolean;
  onOpenLoginModal?: () => void;
}

interface VoiceGuideTopic {
  id: string;
  title: string;
  targetTab: WorkspaceTab;
  thumbSrc: string;
  thumbAlt: string;
  script: string;
}

const VOICE_GUIDE_TOPICS: VoiceGuideTopic[] = [
  {
    id: 'cad_3d_editor',
    title: '01. Modelagem 3D Paramétrica & NURBS Fidedigna',
    targetTab: 'viewport',
    thumbSrc: pwcCadTeamImg,
    thumbAlt: 'Equipe de engenharia colaborando sobre projetos CAD',
    script:
      'Módulo 1: Visualizador e Editor 3D Paramétrico. Sempre que você envia ou importa um arquivo STEP, STP, IPT, SVG, STL, OBJ, DXF, 3DM, IFC ou imagens PNG, JPG e WEBP, o sistema converte em geometria 3D fidedigna, abre automaticamente o editor 3D e enquadra a peça.',
  },
  {
    id: 'object_mask',
    title: '02. Classificação por Família, PBR & Máscara de Objetos',
    targetTab: 'viewport',
    thumbSrc: runnersCoupleImg,
    thumbAlt: 'Casal de corredores usando camisetas oficiais ParametrIX',
    script:
      'Módulo 2: Máscara de Objetos e Renderização PBR por componente. Cada subcomponente mecânico ou estrutural recebe material e cor contextual individual para inspeção precisa.',
  },
  {
    id: 'part_context_fea',
    title: '03. Simulação CAE, Fadiga, Von Mises & Carbono LCA',
    targetTab: 'sustainability',
    thumbSrc: pwcCaeStudioImg,
    thumbAlt: 'Engenheiros avaliando eficiência estrutural e sustentabilidade',
    script:
      'Módulo 3: Análise CAE e Sustentabilidade LCA. Calcule tensão de Von Mises, fator de segurança contra norma e pegada de carbono com comparação Antes e Depois sem sair da plataforma.',
  },
  {
    id: 'cam_robotics_real',
    title: '04. Manufatura CAM, Robótica 6-Eixos & Despacho Real',
    targetTab: 'cam',
    thumbSrc: pwcCamFloorImg,
    thumbAlt: 'Engenheiros na planta de manufatura CNC e robótica',
    script:
      'Módulo 4: CAM e Robótica em Tempo Real. Simule e exporte trajetórias para CNC 3 e 5 eixos, robô KUKA, pó metálico LPBF, resina SLA, solda MIG/TIG e corte a laser 4 kW com prova VUC verificável.',
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
  onUploadFile,
  onApplyPreset,
  scoobiiiProof,
  liveErpSnapshot,
  activeUserLabel,
  onOpenErpEntry,
  isAuthenticatedSession = false,
  onOpenLoginModal,
}) => {
  const { user, authBusy, authError, logout, clearAuthError } = useAuth();
  const [projectNameInput, setProjectNameInput] = useState(surface.name);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;
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
      summary: `Agenda local (${formatDuration(sessionSeconds)}, ${deliverables.length} entregáveis)`,
    });
  };

  const handleDownloadMarkdownSummary = () => {
    const lines = [
      `# Resumo da Sessão — ParametrIX`,
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
      summary: `Relatório Markdown (${formatDuration(sessionSeconds)})`,
    });
  };

  const activeVoiceTopic = VOICE_GUIDE_TOPICS.find((t) => t.id === speakingTopicId) ?? null;
  const vucPassedCount = scoobiiiProof.checks.filter((c) => c.passed).length;
  const vucTotalCount = Math.max(1, scoobiiiProof.checks.length);

  // Seamless continuous infinite editorial track cards
  const marqueeCards = [
    ...WORKSPACE_PROJECT_PRESETS.map((preset) => ({
      key: preset.id,
      eyebrow: preset.badge,
      title: preset.title,
      desc: preset.subtitle,
      onClick: () => onApplyPreset(preset, true),
    })),
    {
      key: 'track-cae',
      eyebrow: 'CAE · Sustentabilidade',
      title: 'Análise Von Mises & Carbono LCA',
      desc: `Prova VUC ${vucPassedCount}/${vucTotalCount} validada para ${surface.name}.`,
      onClick: () => onNavigate('sustainability'),
    },
    {
      key: 'track-cam',
      eyebrow: 'CAM · 8 Células',
      title: 'CNC 5-Eixos, KUKA, Pó Metálico & Laser',
      desc: 'Geração ISO G-Code e monitoramento MQTT em chão de fábrica.',
      onClick: () => onNavigate('cam'),
    },
    {
      key: 'track-media',
      eyebrow: 'Media Studio 1.0',
      title: 'Identidade ParametrIX & Estamparia Esportiva',
      desc: 'Uniformes técnicos, cartões e branding com malha CAD real.',
      onClick: () => onNavigate('media-studio'),
    },
  ];

  const cyclingPreset =
    WORKSPACE_PROJECT_PRESETS.find((p) => p.id.includes('fork') || p.segment === 'ciclismo-mobilidade') ??
    WORKSPACE_PROJECT_PRESETS[0];

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-[#fafaf8] text-[#191919]">
      {/* Hidden unified CAD/Image input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_CAD_EXTENSIONS}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploadError(null);
          setUploadBusy(true);
          try {
            await onUploadFile(file);
          } catch (err) {
            setUploadError(
              err instanceof Error ? err.message : 'Falha ao processar o arquivo.'
            );
          } finally {
            setUploadBusy(false);
          }
        }}
      />

      {/* 1. PwC-Inspired Hero Section (Crisp Serif Editorial Headline + Bold Action Banner + People Photo) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-8 space-y-6">
        <div className="max-w-4xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0284c7]">
            ParametrIX · Engenharia Paramétrica para Pessoas &amp; Indústria
          </p>
          <h1
            className="font-editorial font-semibold text-[#111827] leading-[1.12] tracking-tight"
            style={{ fontSize: 'clamp(2.05rem, 4.4vw, 3.5rem)', textWrap: 'balance' }}
          >
            Do esboço 3D à fábrica real: engenharia onde decisões humanas e cálculo exato caminham juntos
          </h1>
          <p className="text-base sm:text-lg text-[#3f3f46] leading-relaxed max-w-3xl">
            Projete superfícies NURBS fidedignas em CAD, valide resistência estrutural em CAE e programe oito processos de manufatura CAM com certificação criptográfica VUC em tempo real.
          </p>
        </div>

        {/* Bold PwC-Style Full/Wide Warm Action Banner + Secondary Real CAD Upload */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
          <button
            type="button"
            onClick={() => onNavigate('viewport')}
            className="md:col-span-7 min-h-[64px] px-6 py-4 bg-[#d04a02] hover:bg-[#b83f00] text-white flex items-center justify-between gap-4 text-left transition-colors cursor-pointer"
          >
            <div>
              <span className="block text-base sm:text-lg font-semibold leading-snug">
                Entenda e explore no Editor 3D IX agora
              </span>
              <span className="block text-xs text-orange-100 mt-0.5">
                {surface.name} · {meshData.triangleCount.toLocaleString('pt-BR')} triângulos · {meshData.volumeCm3} cm³
              </span>
            </div>
            <ChevronRight className="w-6 h-6 shrink-0" />
          </button>

          <button
            type="button"
            disabled={uploadBusy}
            onClick={() => fileInputRef.current?.click()}
            className="md:col-span-5 min-h-[64px] px-6 py-4 bg-[#111620] hover:bg-[#1b2434] text-white flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-60 cursor-pointer"
          >
            <div className="min-w-0">
              <span className="block text-sm sm:text-base font-semibold leading-snug">
                {uploadBusy ? 'Processando arquivo CAD...' : 'Subir arquivo CAD ou Imagem'}
              </span>
              <span className="block text-xs text-slate-300 truncate mt-0.5">
                .STEP, .STP, .IPT, .DXF, .STL, .3DM, .IFC ou foto técnica
              </span>
            </div>
            {uploadBusy ? (
              <Loader2 className="w-5 h-5 animate-spin shrink-0 text-sky-400" />
            ) : (
              <FileUp className="w-5 h-5 shrink-0 text-sky-400" />
            )}
          </button>
        </div>

        {uploadError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {uploadError}
          </div>
        )}

        {/* Full-Width Documentary Team Photograph */}
        <div className="relative overflow-hidden bg-slate-200 aspect-[16/9] max-h-[520px] w-full">
          <img
            src={pwcCadTeamImg}
            alt="Equipe de engenharia colaborando em mesa de projeto CAD com tablet e plantas técnicas"
            className="w-full h-full object-cover object-center"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 sm:p-6 text-white flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-sky-300">Colaboração Técnica Real</span>
              <p className="font-editorial text-lg sm:text-xl font-medium">
                Equipes multidisciplinares conectadas sobre a mesma geometria paramétrica
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="min-h-[44px] px-4 py-2 bg-white/95 hover:bg-white text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              Explorar Biblioteca CAD <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 2. Continuous Infinite Sliding Strip ("Deslizante Infinito" across CAD / CAE / CAM) */}
      <section
        aria-label="Fluxo contínuo de projetos e capacidades CAD, CAE e CAM"
        className="w-full bg-[#111620] text-white py-5 border-y border-slate-800 overflow-hidden"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-3 flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium text-sky-300">
            Deslizamento contínuo · Passe o mouse ou toque para abrir qualquer projeto
          </span>
          <span className="hidden sm:inline font-mono-tabular">
            CAD NURBS · CAE FEA · CAM 8 Células · Prova VUC {vucPassedCount}/{vucTotalCount}
          </span>
        </div>

        <div className="overflow-x-auto sm:overflow-hidden">
          <div className="animate-editorial-marquee gap-4 px-4">
            {[...marqueeCards, ...marqueeCards].map((card, idx) => (
              <button
                key={`${card.key}-${idx}`}
                type="button"
                onClick={card.onClick}
                className="w-[270px] sm:w-[300px] shrink-0 text-left p-4 bg-[#18202f] hover:bg-[#1f293d] border border-white/10 hover:border-sky-400/60 transition-colors cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono-tabular text-sky-300 truncate">
                    {card.eyebrow}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white line-clamp-1">
                    {card.title}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Theme Interleave 01: CAD 3D Fidedigno + Presets em 1 Clique */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0284c7]">
              01. CAD Paramétrico &amp; Geometria Fidedigna
            </span>
            <h2
              className="font-editorial font-semibold text-[#111827] leading-[1.18]"
              style={{ fontSize: 'clamp(1.65rem, 3vw, 2.35rem)' }}
            >
              Precisão matemática do esboço inicial à malha estanque
            </h2>
            <p className="text-sm sm:text-base text-[#3f3f46] leading-relaxed">
              Superfícies NURBS avaliadas pelo algoritmo determinístico Cox-de Boor, inspeção de peças isoladas com Object Mask e leitura direta de conjuntos industriais sem chute estatístico.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('viewport')}
                className="min-h-[44px] px-5 py-2.5 bg-[#111620] hover:bg-[#1f293d] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                Abrir Editor 3D IX <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('grasshopper')}
                className="min-h-[44px] px-5 py-2.5 border border-neutral-300 hover:border-neutral-900 text-[#191919] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Workflow className="w-4 h-4 text-[#0284c7]" />
                Grafo Grasshopper DAG
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {WORKSPACE_PROJECT_PRESETS.slice(0, 6).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset, true)}
                className="min-h-[88px] text-left p-4 bg-white border border-neutral-200 hover:border-[#0284c7] transition-colors cursor-pointer group flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono-tabular text-[#0284c7] font-medium">
                    {preset.badge}
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-[#0284c7] transition-colors shrink-0" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">{preset.title}</h3>
                  <p className="text-xs text-[#52525b] mt-1 line-clamp-2 leading-relaxed">
                    {preset.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Humanized Culture & Sport Section: Couple of Runners Wearing ParametrIX Jerseys */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="relative overflow-hidden bg-slate-200 aspect-[16/9] w-full">
              <img
                src={runnersCoupleImg}
                alt="Casal de corredores no parque usando camisetas técnicas pretas e azul ciano da ParametrIX"
                className="w-full h-full object-cover object-center"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-xs text-[#52525b]">
              Movimento ParametrIX — Tecnologia, Inovação e Liberdade aplicadas ao esporte, ergonomia e identidade visual.
            </p>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d04a02]">
              Pessoas, Esporte &amp; Identidade ParametrIX
            </span>
            <h2
              className="font-editorial font-semibold text-[#111827] leading-[1.15]"
              style={{ fontSize: 'clamp(1.65rem, 3vw, 2.4rem)' }}
            >
              Tecnologia que sai da tela e ganha as ruas com quem cria
            </h2>
            <p className="text-sm sm:text-base text-[#3f3f46] leading-relaxed">
              Engenharia paramétrica para um mundo melhor significa projetar peças mais leves, seguras e sustentáveis para a vida real — de componentes de ciclismo de alta performance aos uniformes oficiais gerados no Media Studio 1.0.
            </p>

            {/* Official Jersey Reference Card */}
            <div className="flex items-center gap-4 p-3.5 bg-white border border-neutral-200">
              <img
                src="/assets/aistudio/file_000000007ba4820ebf2d75e6abc6f767_2f5dd762.png"
                alt="Camiseta oficial ParametrIX Tecnologia Inovação Liberdade"
                className="w-20 h-20 object-contain bg-slate-50 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-[#111827]">
                  Camiseta Oficial ParametrIX 1.0
                </div>
                <p className="text-xs text-[#52525b] leading-snug">
                  Personalize camisas, cartões e linhas de produto com malhas CAD reais e motor criativo no Media Studio.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('media-studio')}
                className="min-h-[44px] px-5 py-2.5 bg-[#d04a02] hover:bg-[#b83f00] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Palette className="w-4 h-4" />
                Abrir Media Studio 1.0
              </button>
              <button
                type="button"
                onClick={() => onApplyPreset(cyclingPreset, true)}
                className="min-h-[44px] px-4 py-2.5 border border-neutral-300 hover:border-neutral-900 text-[#191919] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                Abrir Projeto Esportivo 3D <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Theme Interleave 02: CAE Estrutural, Fadiga & Sustentabilidade LCA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 space-y-4 order-2 lg:order-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              02. CAE, Fadiga &amp; Sustentabilidade LCA
            </span>
            <h2
              className="font-editorial font-semibold text-[#111827] leading-[1.15]"
              style={{ fontSize: 'clamp(1.65rem, 3vw, 2.4rem)' }}
            >
              Produzimos resultados sustentáveis que fazem a diferença
            </h2>
            <p className="text-sm sm:text-base text-[#3f3f46] leading-relaxed">
              Nossa abordagem une engenharia estrutural rigorosa com responsabilidade ambiental: otimize massa com compensação de curvatura NURBS, simule tensões de Von Mises e acompanhe o balanço completo de carbono antes de cortar o primeiro bloco de material.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-[#3f3f46]">
              <div>
                <span className="block text-[11px] text-[#71717a]">Prova Matemática VUC</span>
                <strong className="font-mono-tabular text-base text-[#111827]">
                  {vucPassedCount}/{vucTotalCount} verificados
                </strong>
              </div>
              <div className="h-8 w-px bg-neutral-300" />
              <div>
                <span className="block text-[11px] text-[#71717a]">Malha Avaliada</span>
                <strong className="font-mono-tabular text-base text-[#111827]">
                  {meshData.surfaceAreaCm2} cm²
                </strong>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('sustainability')}
                className="min-h-[44px] px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                Analisar CAE / Sustentabilidade <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 order-1 lg:order-2">
            <div className="relative overflow-hidden bg-slate-200 aspect-[16/9] w-full">
              <img
                src={pwcCaeStudioImg}
                alt="Engenheiros em escritório sustentável com parede verde viva discutindo análise de ciclo de vida"
                className="w-full h-full object-cover object-center"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 6. Theme Interleave 03: CAM & Robótica de Chão de Fábrica */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="relative overflow-hidden bg-slate-200 aspect-[16/9] w-full">
              <img
                src={pwcCamFloorImg}
                alt="Engenheiras industriais revisando telemetria CAM em tablet diante de centro de usinagem CNC"
                className="w-full h-full object-cover object-center"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0284c7]">
              03. CAM &amp; Manufatura Digital em Tempo Real
            </span>
            <h2
              className="font-editorial font-semibold text-[#111827] leading-[1.15]"
              style={{ fontSize: 'clamp(1.65rem, 3vw, 2.4rem)' }}
            >
              Da modelagem à máquina com 8 células CAM integradas
            </h2>
            <p className="text-sm sm:text-base text-[#3f3f46] leading-relaxed">
              Opere CNC 3 e 5 eixos, robô KUKA 6-eixos, manufatura aditiva LPBF em pó metálico, resina UV SLA, solda robotizada MIG/TIG, corte a laser 4 kW e usinagem manual DRO com despacho MQTT e OPC-UA verificado.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('cam')}
                className="min-h-[44px] px-5 py-2.5 bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                Abrir CAM &amp; Robótica
              </button>
              <button
                type="button"
                onClick={() => onNavigate('frostbite')}
                className="min-h-[44px] px-4 py-2.5 border border-neutral-300 hover:border-neutral-900 text-[#191919] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Cpu className="w-4 h-4 text-[#d04a02]" />
                Rack Frostbite 1MW
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Publicações & Guia Interativo por Voz (PwC "Publicações" Editorial Rows) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-neutral-200">
          <div className="space-y-1">
            <h2
              className="font-editorial font-semibold text-[#111827]"
              style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)' }}
            >
              Publicações &amp; Guia por Voz em Português
            </h2>
            <p className="text-sm text-[#52525b]">
              Ouça o tour guiado em português ou navegue diretamente para cada fluxo técnico.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Velocidade da explicação por voz"
              value={speechRate}
              onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
              className="min-h-[44px] px-3 text-xs bg-white border border-neutral-300 text-[#191919]"
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
                className="min-h-[44px] px-4 py-2 text-xs font-semibold bg-[#111620] hover:bg-[#1f293d] text-white inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Ouvir Tour Completo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-amber-500 text-slate-950 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {isPaused ? 'Retomar' : 'Pausar'}
                </button>
                <button
                  type="button"
                  onClick={stopSpeech}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-rose-600 text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Parar
                </button>
              </>
            )}
          </div>
        </div>

        {activeVoiceTopic && (
          <div className="p-4 bg-sky-50 border border-sky-200 text-xs text-slate-800 space-y-1">
            <div className="flex items-center justify-between font-semibold text-sky-900">
              <span>Narrando agora: {activeVoiceTopic.title}</span>
              <span className="font-mono-tabular">{isPaused ? 'PAUSADO' : 'REPRODUZINDO'}</span>
            </div>
            <p className="leading-relaxed text-slate-700">{activeVoiceTopic.script}</p>
          </div>
        )}

        <div className="divide-y divide-neutral-200">
          {VOICE_GUIDE_TOPICS.map((topic) => {
            const isPlayingThis = speakingTopicId === topic.id;
            return (
              <article
                key={topic.id}
                className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center"
              >
                <div className="sm:col-span-8 space-y-2">
                  <h3 className="font-editorial text-lg font-semibold text-[#111827]">
                    {topic.title}
                  </h3>
                  <p className="text-sm text-[#52525b] leading-relaxed">{topic.script}</p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      disabled={!speechSupported}
                      onClick={() =>
                        isPlayingThis ? stopSpeech() : speakSingleTopic(topic, false)
                      }
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 border cursor-pointer ${
                        isPlayingThis
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-white border-neutral-300 text-[#191919] hover:border-neutral-900'
                      }`}
                    >
                      {isPlayingThis ? (
                        <>
                          <Square className="w-3 h-3" /> Parar áudio
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-[#0284c7]" /> Ouvir em voz
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate(topic.targetTab)}
                      className="min-h-[40px] px-2 text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] inline-flex items-center gap-1 cursor-pointer"
                    >
                      Acessar módulo <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <div className="aspect-[16/10] w-full overflow-hidden bg-slate-200">
                    <img
                      src={topic.thumbSrc}
                      alt={topic.thumbAlt}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 8. ERP, CRM & BI Integrated Operations — Strictly Unlocked After User Login */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 border-b border-neutral-200">
        {!isAuthenticatedSession ? (
          <div className="p-6 sm:p-8 bg-[#111620] text-white grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-2.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-300">
                <Lock className="w-4 h-4" />
                <span>Gestão Empresarial Pós-Login</span>
              </div>
              <h2
                className="font-editorial font-semibold text-white leading-tight"
                style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.15rem)' }}
              >
                ERP, CRM &amp; BI disponíveis após iniciar sessão
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Entre com sua conta Google em pop-up único ou use seu e-mail e senha para liberar custos unitários reais, CRM de clientes, logística multimodal, chat do ecossistema e salvamento privado dos seus projetos na nuvem e SQLite local.
              </p>
            </div>
            <div className="lg:col-span-4 flex lg:justify-end">
              <button
                type="button"
                onClick={() => onOpenLoginModal?.()}
                className="min-h-[48px] w-full lg:w-auto px-6 py-3 bg-[#0091ff] hover:bg-[#0284c7] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Iniciar sessão agora
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 sm:p-8 bg-white border border-neutral-200 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-neutral-200">
              <div className="space-y-1 max-w-2xl">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sessão Autenticada · ERP, CRM &amp; BI Liberados</span>
                </div>
                <h2 className="font-editorial text-2xl font-semibold text-[#111827]">
                  Central Operacional de {activeUserLabel || user?.email || 'Usuário Conectado'}
                </h2>
                <p className="text-xs text-[#52525b]">
                  Prontidão BI atual:{' '}
                  <strong className="font-mono-tabular text-[#111827]">
                    {liveErpSnapshot?.biSummary.techReadinessPct ?? (scoobiiiProof.allPassed ? 94 : 68)}%
                  </strong>{' '}
                  · Gerencie pedidos, logística GPS e projetos isolados na sua conta.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => (onOpenErpEntry ? onOpenErpEntry() : onNavigate('ecosystem'))}
                  className="min-h-[44px] px-5 py-2.5 bg-[#0091ff] hover:bg-[#0284c7] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Briefcase className="w-4 h-4" />
                  Abrir ERP, CRM &amp; BI
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void logout()}
                  className="min-h-[44px] px-4 py-2.5 border border-neutral-300 hover:border-neutral-900 text-[#191919] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Encerrar sessão
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <span>{authError}</span>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-xs underline cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            )}

            {user && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    maxLength={120}
                    placeholder="Nome do projeto paramétrico..."
                    className="flex-1 min-w-[220px] min-h-[44px] px-3.5 text-sm bg-neutral-50 border border-neutral-300 text-[#111827] focus:outline-none focus:border-[#0284c7]"
                  />
                  <button
                    type="button"
                    disabled={cloudBusy}
                    onClick={() => void onSaveCloudProject(projectNameInput)}
                    className="min-h-[44px] px-5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {cloudBusy ? 'Salvando...' : 'Salvar Projeto na Minha Conta'}
                  </button>
                </div>

                {savedProjects.length > 0 && (
                  <div className="divide-y divide-neutral-200 border border-neutral-200">
                    {savedProjects.map((proj) => {
                      const isActive = proj.id === activeProjectId;
                      return (
                        <div
                          key={proj.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[#111827] truncate">
                              {proj.name}{' '}
                              {isActive && (
                                <span className="text-[#0284c7] font-normal">(Ativo)</span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#52525b] font-mono-tabular">
                              {proj.preset.toUpperCase()} · {proj.materialFinish} ·{' '}
                              {proj.camSettings.machineType} · {formatDuration(proj.sessionSeconds)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onLoadCloudProject(proj)}
                              className="min-h-[36px] px-3 py-1 bg-sky-50 border border-sky-200 text-sky-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              Carregar
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteCloudProject(proj.id)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-neutral-500 hover:text-rose-600 cursor-pointer"
                              title="Excluir projeto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 9. Developers, Automação MCP, Entregáveis & Quiet Editorial Footer */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-neutral-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0284c7]">
              <Layers className="w-4 h-4" />
              <span>SDK &amp; Kernel Matemático</span>
            </div>
            <h3 className="font-editorial text-xl font-semibold text-[#111827]">
              Extensibilidade aberta em JavaScript &amp; Plugins
            </h3>
            <p className="text-xs text-[#52525b] leading-relaxed">
              Estenda o kernel Cox-de Boor sobre pontos de controle 4D, manipule camadas de tolerância e utilize as bibliotecas padrão.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('plugins')}
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Puzzle className="w-3.5 h-3.5" /> Plugins SDK
              </button>
              <button
                type="button"
                onClick={() => onNavigate('library')}
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" /> Biblioteca CAD
              </button>
            </div>
          </div>

          <div className="p-6 bg-white border border-neutral-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#d04a02]">
              <Terminal className="w-4 h-4" />
              <span>Automação MCP &amp; Qwen 0.5B Harness</span>
            </div>
            <h3 className="font-editorial text-xl font-semibold text-[#111827]">
              Integração de agentes via /llms.txt e HTTP JSON-RPC
            </h3>
            <p className="text-xs text-[#52525b] leading-relaxed">
              Inspecione modelos .IPT e .STEP com briefing compacto e acione ferramentas MCP diretamente pela camada visual ou terminal.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('mcp')}
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Agente RAG + MCP
              </button>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noreferrer"
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center"
              >
                /llms.txt
              </a>
              <a
                href="/gitpage/"
                target="_blank"
                rel="noreferrer"
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center"
              >
                GitPage Dinâmica
              </a>
            </div>
          </div>
        </div>

        {/* Session Deliverables Log */}
        <div className="p-6 bg-white border border-neutral-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-editorial text-lg font-semibold text-[#111827]">
                Entregáveis da Sessão ({deliverables.length})
              </h3>
              <p className="text-xs text-[#52525b]">
                Tempo ativo: {formatDuration(sessionSeconds)} · Exporte agenda (.ICS) ou resumo técnico (.MD).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" /> Agenda (.ICS)
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdownSummary}
                className="min-h-[40px] px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Relatório (.MD)
              </button>
            </div>
          </div>

          {deliverables.length > 0 && (
            <div className="divide-y divide-neutral-200 border border-neutral-200">
              {deliverables.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="font-mono-tabular font-medium text-[#111827] truncate">
                      {item.filename}
                    </span>
                    <span className="text-[#52525b] truncate">{item.summary}</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[#71717a] shrink-0">
                    {item.kind} · {item.timestamp}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="pt-4 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs text-[#71717a]">
          <span>ParametrIX · Tecnologia, Inovação e Liberdade</span>
          <span className="inline-flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            Certificação determinística VUC Ed25519
          </span>
        </footer>
      </section>
    </div>
  );
};