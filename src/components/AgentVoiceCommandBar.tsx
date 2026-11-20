import React, { useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  KeyRound,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AGENT_PROVIDER_CATALOG } from '../kernel/llmBootstrap';
import type {
  AgentProviderId,
  LocalLlmRecommendation,
  McpEyeEvent,
  SystemResourceSnapshot,
  VoiceActionIntent,
} from '../types/cad';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface AgentVoiceCommandBarProps {
  selectedAgentId: AgentProviderId;
  onSelectAgent: (id: AgentProviderId) => void;
  systemResources: SystemResourceSnapshot | null;
  localLlmRec: LocalLlmRecommendation | null;
  mcpEyeEvents: McpEyeEvent[];
  onSendAgentPrompt: (prompt: string, externalEndpoint: string, modelId?: string) => Promise<string>;
  onVoiceTranscript: (transcript: string) => VoiceActionIntent;
  onOpenWizard: () => void;
  onRestartCam: () => void;
  camRestartCount: number;
  lastVoiceStatus: string | null;
}

export const AgentVoiceCommandBar: React.FC<AgentVoiceCommandBarProps> = ({
  selectedAgentId,
  onSelectAgent,
  systemResources,
  localLlmRec,
  mcpEyeEvents,
  onSendAgentPrompt,
  onVoiceTranscript,
  onOpenWizard,
  onRestartCam,
  camRestartCount,
  lastVoiceStatus,
}) => {
  const [barExpanded, setBarExpanded] = useState(false);
  const [authConfigOpen, setAuthConfigOpen] = useState(false);
  const [eyeDrawerOpen, setEyeDrawerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [promptDraft, setPromptDraft] = useState('');
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentCredentials, setAgentCredentials] = useState<
    Record<string, { loginEmail: string; endpointUrl: string }>
  >({});

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const selectedEntry =
    AGENT_PROVIDER_CATALOG.find((a) => a.id === selectedAgentId) ?? AGENT_PROVIDER_CATALOG[0];
  const currentCred = agentCredentials[selectedAgentId] ?? {
    loginEmail: '',
    endpointUrl: selectedAgentId === 'local-llm' ? 'http://localhost:11434' : '',
  };

  const speakFeedback = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'pt-BR';
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    } catch {
      // Speech synthesis not supported in headless environments
    }
  };

  const handleToggleVoice = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecCtor) {
      setBarExpanded(true);
      setAgentReply(
        'Navegador sem Web Speech API nativa; digite o comando (ex: "reiniciar CAM", "modo resina", "frostbite") no campo abaixo.'
      );
      return;
    }

    const rec = new RecCtor();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) {
        const intent = onVoiceTranscript(transcript);
        speakFeedback(intent.feedbackText);
        if (intent.action === 'agent-query' || !intent.matched) {
          setBarExpanded(true);
          setAgentBusy(true);
          void onSendAgentPrompt(
            transcript,
            currentCred.endpointUrl,
            selectedAgentId === 'local-llm' ? localLlmRec?.modelId : selectedEntry.defaultModel
          )
            .then((reply) => {
              setAgentReply(reply);
              speakFeedback(reply);
            })
            .finally(() => setAgentBusy(false));
        }
      }
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const dispatchAgentText = async (text: string) => {
    setAgentBusy(true);
    try {
      const reply = await onSendAgentPrompt(
        text,
        currentCred.endpointUrl,
        selectedAgentId === 'local-llm' ? localLlmRec?.modelId : selectedEntry.defaultModel
      );
      setAgentReply(reply);
      speakFeedback(reply);
      setPromptDraft('');
    } finally {
      setAgentBusy(false);
    }
  };

  const handleDispatchPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = promptDraft.trim();
    if (!text) return;

    const possibleIntent = onVoiceTranscript(text);
    if (possibleIntent.matched && possibleIntent.action !== 'agent-query') {
      speakFeedback(possibleIntent.feedbackText);
      setPromptDraft('');
      setAgentReply(`Comando executado: ${possibleIntent.feedbackText}`);
      return;
    }

    await dispatchAgentText(text);
  };

  return (
    <div className="border-b border-white/10 bg-[#0d121a] px-3 sm:px-5 py-1.5 shrink-0 relative z-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Agent Dropdown + Traditional Auth + Local Bootstrap Readout */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#141a24] border border-white/12 rounded px-2 py-1">
            <Bot className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <select
              aria-label="Selecionar Agente IA MCP"
              value={selectedAgentId}
              onChange={(e) => onSelectAgent(e.target.value as AgentProviderId)}
              className="bg-transparent text-xs font-medium text-slate-100 outline-none cursor-pointer max-w-[165px] sm:max-w-[230px]"
            >
              {AGENT_PROVIDER_CATALOG.map((ag) => (
                <option key={ag.id} value={ag.id} className="bg-[#0d121a] text-slate-100">
                  {ag.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setAuthConfigOpen((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border flex items-center gap-1 cursor-pointer transition-colors ${
              authConfigOpen
                ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                : 'border-white/12 bg-[#141a24] text-slate-300 hover:text-white'
            }`}
            title="Login tradicional / endpoint do agente"
          >
            <KeyRound className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Login Agente</span>
          </button>

          {localLlmRec && systemResources && (
            <div
              className="hidden xl:flex items-center gap-1.5 px-2 py-1 border border-emerald-500/25 bg-emerald-500/5 rounded text-[11px] font-mono-tabular text-emerald-300"
              title={localLlmRec.rationale}
            >
              <Cpu className="w-3 h-3 shrink-0" />
              <span>
                Local Auto: {localLlmRec.modelId} · RAM {systemResources.freeRamGb}GB ·{' '}
                {systemResources.cpuCores}c · {systemResources.loggedInUsers}u
              </span>
            </div>
          )}
        </div>

        {/* Right: MCP Eye, Voice Control, Wizard, Restart CAM */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setEyeDrawerOpen((v) => !v)}
            className={`px-2 py-1 text-[11px] font-mono-tabular rounded border flex items-center gap-1 cursor-pointer transition-colors ${
              eyeDrawerOpen
                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                : 'border-white/12 bg-[#141a24] text-slate-300 hover:text-white'
            }`}
            title="Olho MCP: entradas MCP + saídas visuais CAM/Viewport"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Olho MCP</span>
            <span>({mcpEyeEvents.length})</span>
          </button>

          <button
            type="button"
            onClick={handleToggleVoice}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded border flex items-center gap-1 cursor-pointer transition-colors ${
              listening
                ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                : 'border-sky-400/40 bg-sky-500/12 text-sky-200 hover:bg-sky-500/20'
            }`}
            title="Acionar comandos de voz PT-BR/EN para toda a aplicação"
          >
            {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{listening ? 'Ouvindo...' : 'Voz'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTtsEnabled((v) => !v)}
            className="p-1 rounded border border-white/12 bg-[#141a24] text-slate-300 hover:text-white cursor-pointer"
            title={ttsEnabled ? 'Resposta falada ativada' : 'Resposta falada silenciada'}
          >
            {ttsEnabled ? <Volume2 className="w-3.5 h-3.5 text-sky-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          <button
            type="button"
            onClick={onOpenWizard}
            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Novo do Zero</span>
          </button>

          <button
            type="button"
            onClick={onRestartCam}
            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 flex items-center gap-1 cursor-pointer font-mono-tabular"
            title="Reiniciar processo produtivo CAM do zero com prova VUC"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reiniciar CAM</span>
            {camRestartCount > 0 && <span>#{camRestartCount}</span>}
          </button>

          <button
            type="button"
            onClick={() => setBarExpanded((v) => !v)}
            className="p-1 rounded border border-white/12 bg-[#141a24] text-slate-400 hover:text-white cursor-pointer"
            title="Expandir prompt de voz / texto para agente"
          >
            {barExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Command Prompt & Voice Status */}
      {(barExpanded || lastVoiceStatus || agentReply) && (
        <div className="mt-2 pt-2 border-t border-white/8 flex flex-col gap-1.5">
          {barExpanded && (
            <div className="space-y-1.5">
              <form onSubmit={handleDispatchPrompt} className="flex items-center gap-2">
                <input
                  type="text"
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  placeholder='Comando CAM ou pergunta ao agente (ex: "reiniciar cam", "modo po metalico", "qual a sinterizacao?")...'
                  className="flex-1 px-3 py-1.5 text-xs bg-[#090c11] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={agentBusy}
                  className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded hover:bg-sky-400 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {agentBusy ? 'Enviando...' : 'Executar'}
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Reiniciar CAM', cmd: 'reiniciar cam' },
                  { label: 'Pó Metálico LPBF', cmd: 'modo po metalico' },
                  { label: 'Resina SLA', cmd: 'modo resina' },
                  { label: 'Cold-Plate DC', cmd: 'coldplate' },
                  { label: 'Prova VUC Ed25519', cmd: 'prova vuc' },
                  { label: 'Enviar Código G / MQTT', cmd: 'enviar codigo g' },
                  { label: 'Agente: Status CAM & Sinterização', cmd: 'qual parametro de sinterizacao e ferramenta CAM atual?' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      const intent = onVoiceTranscript(chip.cmd);
                      if (intent.matched && intent.action !== 'agent-query') {
                        speakFeedback(intent.feedbackText);
                        setAgentReply(`Comando executado: ${intent.feedbackText}`);
                      } else {
                        void dispatchAgentText(chip.cmd);
                      }
                    }}
                    className="px-2 py-0.5 text-[10px] font-mono-tabular bg-[#141a24] border border-white/10 text-slate-300 hover:border-sky-400 hover:text-sky-200 rounded cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(lastVoiceStatus || agentReply) && (
            <div className="text-[11px] font-mono-tabular text-slate-300 bg-[#090c11] border border-white/8 rounded px-2.5 py-1 flex items-center justify-between gap-2">
              <span className="truncate">{agentReply || lastVoiceStatus}</span>
              <button
                type="button"
                onClick={() => setAgentReply(null)}
                className="text-slate-500 hover:text-slate-200 text-[10px] cursor-pointer shrink-0"
              >
                limpar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Agent Traditional Login / Endpoint Popover */}
      {authConfigOpen && (
        <div className="mt-2 p-3 bg-[#111620] border border-white/15 rounded-lg text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-100">
              Conexão Tradicional · {selectedEntry.label} ({selectedEntry.loginMethodLabel})
            </span>
            <button
              type="button"
              onClick={() => setAuthConfigOpen(false)}
              className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={currentCred.loginEmail}
              onChange={(e) =>
                setAgentCredentials((prev) => ({
                  ...prev,
                  [selectedAgentId]: { ...currentCred, loginEmail: e.target.value },
                }))
              }
              placeholder={`Conta / usuário ${selectedEntry.vendor}`}
              className="px-2.5 py-1.5 bg-[#090c11] border border-white/12 rounded text-slate-100"
            />
            <input
              type="text"
              value={currentCred.endpointUrl}
              onChange={(e) =>
                setAgentCredentials((prev) => ({
                  ...prev,
                  [selectedAgentId]: { ...currentCred, endpointUrl: e.target.value },
                }))
              }
              placeholder="Endpoint bridge/Ollama (ex: http://localhost:11434)"
              className="px-2.5 py-1.5 bg-[#090c11] border border-white/12 rounded text-slate-100 font-mono-tabular"
            />
          </div>
          {localLlmRec && (
            <div className="text-[11px] text-emerald-300 font-mono-tabular">
              Bootstrap Hardware Real-Time: {localLlmRec.displayName} ({localLlmRec.quantization} ·{' '}
              ~{localLlmRec.estimatedRamGb} GB · {localLlmRec.estimatedTokPerSec} tok/s) —{' '}
              {localLlmRec.rationale}
            </div>
          )}
        </div>
      )}

      {/* Live MCP Eye Feed Drawer */}
      {eyeDrawerOpen && (
        <div className="mt-2 p-3 bg-[#090c11] border border-emerald-400/30 rounded-lg text-xs space-y-2 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Olho MCP em Tempo Real (Entradas MCP + Saídas Visuais CAM/3D)
            </span>
            <button
              type="button"
              onClick={() => setEyeDrawerOpen(false)}
              className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              Ocultar
            </button>
          </div>
          {mcpEyeEvents.length === 0 ? (
            <div className="text-slate-500 text-[11px]">
              Nenhum evento registrado ainda nesta sessão. Acione FEA, CAM ou MCP para o agente enxergar o feedback.
            </div>
          ) : (
            <div className="space-y-1.5">
              {mcpEyeEvents.slice(0, 10).map((evt) => (
                <div
                  key={evt.id}
                  className="p-2 bg-[#111620] border border-white/8 rounded flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between gap-2 font-mono-tabular text-[11px]">
                    <span className="text-sky-300 font-semibold">
                      [{evt.direction}] · {evt.source}
                    </span>
                    <span className="text-emerald-400">{evt.vucHash.slice(0, 14)} · {evt.timestamp}</span>
                  </div>
                  <div className="text-slate-200">{evt.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
