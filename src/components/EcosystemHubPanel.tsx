import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgentHarnessDock, type AgentHarnessDockProps } from './AgentHarnessDock';
import {
  Activity,
  Briefcase,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Navigation,
  Pencil,
  PhoneOff,
  Radio,
  Save,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Truck,
  UserCheck,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import { usePublicChatRtc } from '../hooks/usePublicChatRtc';
import { CAM_PRODUCTION_PROGRAMS } from '../kernel/camProcessEngine';
import {
  ECOSYSTEM_ROLE_DEFINITIONS,
  aggregateComputeSharePool,
  estimateMultimodalLogisticsRoute,
  summarizeErpCrmPipeline,
} from '../kernel/ecosystemErpLogistics';
import {
  PUBLIC_CHAT_RULES,
  PUBLIC_CHAT_THEMES,
  isRegisteredEcosystemUser,
  normalizeChatRoomTheme,
} from '../kernel/publicChatSignaling';
import { resolveMachineProcessAssociation } from '../kernel/realMachineConnector';
import { HEATMAP_COLS, HEATMAP_ROWS } from '../kernel/sessionPointerRecorder';
import type {
  ErpTaxRegime,
  OpenErpWorkspaceSnapshot,
} from '../kernel/openErpEngine';
import type {
  AuthUserProfile,
  ComputeShareNode,
  EcosystemChatMessage,
  EcosystemRole,
  ErpCrmRecord,
  LogisticsModal,
  LogisticsTelemetryNode,
  MachineType,
  ProductionSessionLogRecord,
  PublicChatThemeId,
  RemoteMachineTarget,
  RemoteMqttTelemetryEvent,
  WorkspaceTab,
} from '../types/cad';

export interface RemoteMachineConfigInput {
  id?: string;
  name: string;
  machineType: MachineType;
  protocol: RemoteMachineTarget['protocol'];
  endpointUrl: string;
  assignedProgramId?: string;
  mqttEnabled: boolean;
  mqttBrokerUrl: string;
  mqttTopic: string;
  mqttQos: 0 | 1 | 2;
}

const RtcStreamView: React.FC<{ stream: MediaStream; muted?: boolean; label: string }> = ({
  stream,
  muted = false,
  label,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.srcObject = stream;
    }
  }, [stream]);
  const hasVideo = stream.getVideoTracks().length > 0;
  if (!hasVideo) {
    return (
      <div className="p-2.5 bg-[#090d14] border border-emerald-400/35 rounded-lg flex items-center justify-between text-xs">
        <span className="text-emerald-200 font-medium truncate">{label} (Áudio Full-Duplex)</span>
        <audio
          ref={(el) => {
            if (el) el.srcObject = stream;
          }}
          autoPlay
          muted={muted}
        />
      </div>
    );
  }
  return (
    <div className="bg-[#090d14] border border-sky-400/35 rounded-lg overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-36 object-cover bg-black" />
      <div className="px-2 py-1 text-[10px] font-mono-tabular text-slate-300 bg-[#0e131c] truncate">
        {label}
      </div>
    </div>
  );
};

interface EcosystemHubPanelProps {
  profile: AuthUserProfile;
  onUpdateProfile: (patch: Partial<AuthUserProfile>) => Promise<void>;
  onOpenAuthModal: () => void;
  chatMessages: EcosystemChatMessage[];
  onSendChat: (
    room: string,
    content: string,
    asAgent?: boolean,
    askCamAgent?: boolean,
    processUrl?: string,
    askLocalAgent?: boolean
  ) => Promise<void>;
  chatError?: string | null;
  activeProcessUrl?: string;
  onOpenProcessUrl?: (url: string) => void;
  wsRef?: React.RefObject<WebSocket | null>;
  logisticsNodes: LogisticsTelemetryNode[];
  onPingGpsLocation: (modal: LogisticsModal, routeLabel: string) => Promise<void>;
  computeNodes: ComputeShareNode[];
  erpRecords: ErpCrmRecord[];
  onAddErpRecord: (rec: Omit<ErpCrmRecord, 'id' | 'vucHash' | 'updatedAt'>) => Promise<void>;
  remoteMachines: RemoteMachineTarget[];
  onDispatchRemoteMachine: (machineId: string) => Promise<void>;
  onProbeRemoteMachine?: (machineId: string) => Promise<void>;
  remoteDispatchStatus?: string | null;
  onSaveRemoteMachine?: (input: RemoteMachineConfigInput) => Promise<void>;
  onPingRemoteMqtt?: (machineId: string) => Promise<void>;
  mqttTelemetryFeed?: RemoteMqttTelemetryEvent[];
  onRunAutonomousProjectWorkflow: (role: EcosystemRole) => void;
  activeSessionLog?: ProductionSessionLogRecord;
  savedSessionLogs?: ProductionSessionLogRecord[];
  sessionRecordingEnabled?: boolean;
  onToggleSessionRecording?: () => void;
  onFlushSessionLog?: () => Promise<void>;
  delegatedByPo?: boolean;
  onToggleDelegatedByPo?: () => void;
  selectedAgentId?: string;
  offlineMode?: boolean;
  onRecordSessionAction?: (detail: string) => void;
  initialSubTab?: EcosystemSubTab;
  initialChatRoom?: PublicChatThemeId;
  liveErpSnapshot?: OpenErpWorkspaceSnapshot;
  erpBatchQty?: number;
  onChangeErpBatchQty?: (qty: number) => void;
  erpMarginPct?: number;
  onChangeErpMarginPct?: (pct: number) => void;
  erpTaxRegime?: ErpTaxRegime;
  onChangeErpTaxRegime?: (regime: ErpTaxRegime) => void;
  erpLogisticsModal?: LogisticsModal;
  onChangeErpLogisticsModal?: (modal: LogisticsModal) => void;
  erpDistanceKm?: number;
  onChangeErpDistanceKm?: (km: number) => void;
  googleUserEmail?: string | null;
  googleAccessToken?: string | null;
  onSaveErpSnapshotToDrive?: (snapshot: OpenErpWorkspaceSnapshot) => Promise<void>;
  onNavigateTab?: (tab: WorkspaceTab) => void;
  harnessDockProps?: Omit<AgentHarnessDockProps, 'layer' | 'title'>;
}

type EcosystemSubTab = 'chat' | 'session' | 'logistics' | 'erp' | 'compute' | 'remote';
type ErpInternalSection = 'overview' | 'bom' | 'finance' | 'crm' | 'ledger';

export const EcosystemHubPanel: React.FC<EcosystemHubPanelProps> = ({
  profile,
  onUpdateProfile,
  onOpenAuthModal,
  chatMessages,
  onSendChat,
  chatError = null,
  activeProcessUrl = '',
  onOpenProcessUrl,
  wsRef,
  logisticsNodes,
  onPingGpsLocation,
  computeNodes,
  erpRecords,
  onAddErpRecord,
  remoteMachines,
  onDispatchRemoteMachine,
  onProbeRemoteMachine,
  remoteDispatchStatus = null,
  onSaveRemoteMachine,
  onPingRemoteMqtt,
  mqttTelemetryFeed = [],
  onRunAutonomousProjectWorkflow,
  activeSessionLog,
  savedSessionLogs = [],
  sessionRecordingEnabled = true,
  onToggleSessionRecording,
  onFlushSessionLog,
  delegatedByPo = true,
  onToggleDelegatedByPo,
  selectedAgentId = 'gemini',
  offlineMode = false,
  onRecordSessionAction,
  initialSubTab = 'chat',
  initialChatRoom = 'geral',
  liveErpSnapshot,
  erpBatchQty = 10,
  onChangeErpBatchQty,
  erpMarginPct = 28,
  onChangeErpMarginPct,
  erpTaxRegime = 'presumido',
  onChangeErpTaxRegime,
  erpLogisticsModal,
  onChangeErpLogisticsModal,
  erpDistanceKm = 220,
  onChangeErpDistanceKm,
  googleUserEmail = null,
  googleAccessToken = null,
  onSaveErpSnapshotToDrive,
  onNavigateTab,
  harnessDockProps,
}) => {
  const [subTab, setSubTab] = useState<EcosystemSubTab>(initialSubTab);
  const [erpSection, setErpSection] = useState<ErpInternalSection>('overview');
  const [erpDriveBusy, setErpDriveBusy] = useState(false);
  const [erpActionStatus, setErpActionStatus] = useState<string | null>(null);
  const [chatRoom, setChatRoom] = useState<PublicChatThemeId>(normalizeChatRoomTheme(initialChatRoom));
  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);
  const [chatDraft, setChatDraft] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const fallbackWsRef = useRef<WebSocket | null>(null);
  const effectiveWsRef = wsRef ?? fallbackWsRef;
  const isRegistered = isRegisteredEcosystemUser({
    userId: profile.id,
    email: profile.email,
    isAgent: false,
    dbRegistered: profile.id !== 'local-default-op',
  });
  const [routeModal, setRouteModal] = useState<LogisticsModal>('road');
  const [routeDistanceKm, setRouteDistanceKm] = useState(185);
  const [routeMassKg, setRouteMassKg] = useState(14);
  const [erpTitle, setErpTitle] = useState('');
  const [erpParty, setErpParty] = useState('');
  const [erpAmount, setErpAmount] = useState(4800);
  const [erpKind, setErpKind] = useState<ErpCrmRecord['kind']>('order');
  const [gpsBusy, setGpsBusy] = useState(false);

  const [agentHandle, setAgentHandle] = useState(profile.agentConfig.handleAt);
  const [agentPhone, setAgentPhone] = useState(profile.agentConfig.phone);
  const [agentAddress, setAgentAddress] = useState(profile.agentConfig.address);
  const [agentBusy, setAgentBusy] = useState(false);

  // Remote Machine + MQTT Configuration Panel State
  const [editingMachineId, setEditingMachineId] = useState<string | undefined>(undefined);
  const [rmName, setRmName] = useState('');
  const [rmType, setRmType] = useState<MachineType>('cnc-5axis');
  const [rmProtocol, setRmProtocol] = useState<RemoteMachineTarget['protocol']>('HTTP-Moonraker');
  const [rmEndpointUrl, setRmEndpointUrl] = useState('');
  const [rmProgramId, setRmProgramId] = useState<string>(CAM_PRODUCTION_PROGRAMS[0]?.id ?? '');
  const [rmMqttEnabled, setRmMqttEnabled] = useState(true);
  const [rmMqttBrokerUrl, setRmMqttBrokerUrl] = useState('mqtt://broker.parametrix.local:1883');
  const [rmMqttTopic, setRmMqttTopic] = useState('parametrix/machines/nova-celula/telemetry');
  const [rmMqttQos, setRmMqttQos] = useState<0 | 1 | 2>(1);
  const [rmBusy, setRmBusy] = useState(false);
  const [rmFeedback, setRmFeedback] = useState<string | null>(null);
  const [rmError, setRmError] = useState<string | null>(null);

  const rtc = usePublicChatRtc({
    wsRef: effectiveWsRef,
    profile,
    room: chatRoom,
    processUrl: activeProcessUrl,
    isRegistered,
    onRequireAuth: onOpenAuthModal,
    onRecordAction: onRecordSessionAction,
  });

  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const poolStats = useMemo(() => aggregateComputeSharePool(computeNodes), [computeNodes]);
  const erpStats = useMemo(
    () => summarizeErpCrmPipeline(erpRecords, logisticsNodes),
    [erpRecords, logisticsNodes]
  );
  const routeEstimate = useMemo(
    () => estimateMultimodalLogisticsRoute(routeModal, routeDistanceKm, routeMassKg),
    [routeModal, routeDistanceKm, routeMassKg]
  );

  // Render live Multimodal GPS Hub Map onto Canvas cleanly
  React.useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Hub Corridors (Rodo / Ferro / Aero / Fluvial)
    const hubs = [
      { label: 'Hub Fabril Jundiaí/Foxconn', x: w * 0.24, y: h * 0.34, color: '#38bdf8' },
      { label: 'Hub Ferro/Porto Santos', x: w * 0.72, y: h * 0.78, color: '#f59e0b' },
      { label: 'Aeroporto Carga Viracopos', x: w * 0.44, y: h * 0.22, color: '#a855f7' },
      { label: 'Terminal Fluvial Tietê-Paraná', x: w * 0.14, y: h * 0.72, color: '#10b981' },
    ];
    ctx.strokeStyle = 'rgba(56,189,248,0.28)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hubs[0].x, hubs[0].y);
    ctx.lineTo(hubs[2].x, hubs[2].y);
    ctx.lineTo(hubs[1].x, hubs[1].y);
    ctx.lineTo(hubs[3].x, hubs[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    for (const hb of hubs) {
      ctx.fillStyle = hb.color;
      ctx.fillRect(hb.x - 4, hb.y - 4, 8, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(hb.label, hb.x + 8, hb.y + 3);
    }

    // Live driver GPS dots normalized around SP/BR lat/lng
    for (const node of logisticsNodes) {
      const nx = Math.max(18, Math.min(w - 24, ((node.lng + 49.0) / 3.2) * w));
      const ny = Math.max(18, Math.min(h - 18, ((-node.lat - 22.0) / 2.4) * h));
      ctx.fillStyle =
        node.modal === 'air'
          ? '#c084fc'
          : node.modal === 'rail'
            ? '#fbbf24'
            : node.modal === 'river'
              ? '#34d399'
              : '#38bdf8';
      ctx.beginPath();
      ctx.arc(nx, ny, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${node.serviceTag} · ${node.speedKmh} km/h`, nx + 8, ny - 2);
    }
  }, [logisticsNodes, subTab]);

  const handleSaveAgentConfig = async () => {
    setAgentBusy(true);
    try {
      await onUpdateProfile({
        handleAt: agentHandle,
        phone: agentPhone,
        address: agentAddress,
        agentConfig: {
          ...profile.agentConfig,
          handleAt: agentHandle,
          phone: agentPhone,
          address: agentAddress,
        },
      });
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSend = async (
    asAgent = false,
    askCamAgent = false,
    attachProcessUrl = false,
    askLocalAgent = false
  ) => {
    const text = chatDraft.trim();
    if (!text && !asAgent && !askCamAgent && !attachProcessUrl && !askLocalAgent) return;
    const msg =
      text ||
      (attachProcessUrl
        ? `Compartilhando processo em tempo real (${activeProcessUrl || '?tab=viewport'})`
        : askLocalAgent
          ? '@hermes Resuma o estado atual do processo, ferramenta ATC, RAG local e próximo passo CAM/VUC.'
          : askCamAgent
            ? 'Qual o estado atual do processo CAM, ferramenta ATC e prova VUC?'
            : `[Agente Autônomo ${profile.handleAt}] Executando checklist completo do perfil (${ECOSYSTEM_ROLE_DEFINITIONS[profile.role].shortTag}) no endereço ${agentAddress} · Contato ${agentPhone}.`);
    setChatDraft('');
    await onSendChat(
      chatRoom,
      msg,
      asAgent,
      askCamAgent,
      attachProcessUrl ? activeProcessUrl : undefined,
      askLocalAgent
    );
  };

  const resetRemoteForm = () => {
    setEditingMachineId(undefined);
    setRmName('');
    setRmType('cnc-5axis');
    setRmProtocol('HTTP-Moonraker');
    setRmEndpointUrl('');
    setRmProgramId(CAM_PRODUCTION_PROGRAMS[0]?.id ?? '');
    setRmMqttEnabled(true);
    setRmMqttBrokerUrl('mqtt://broker.parametrix.local:1883');
    setRmMqttTopic('parametrix/machines/nova-celula/telemetry');
    setRmMqttQos(1);
    setRmError(null);
  };

  const handleEditRemoteMachine = (m: RemoteMachineTarget) => {
    setEditingMachineId(m.id);
    setRmName(m.name);
    setRmType(m.machineType);
    setRmProtocol(m.protocol);
    setRmEndpointUrl(m.endpointUrl);
    setRmProgramId(m.assignedProgramId ?? CAM_PRODUCTION_PROGRAMS[0]?.id ?? '');
    setRmMqttEnabled(m.mqttEnabled ?? true);
    setRmMqttBrokerUrl(m.mqttBrokerUrl || 'mqtt://broker.parametrix.local:1883');
    setRmMqttTopic(m.mqttTopic || `parametrix/machines/${m.id}/telemetry`);
    setRmMqttQos(m.mqttQos ?? 1);
    setRmFeedback(null);
    setRmError(null);
  };

  const handleSaveRemoteForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveRemoteMachine) return;
    if (!rmName.trim() || !rmEndpointUrl.trim()) {
      setRmError('Informe o nome da máquina e a URL do endpoint para código G.');
      return;
    }
    setRmBusy(true);
    setRmError(null);
    setRmFeedback(null);
    try {
      await onSaveRemoteMachine({
        id: editingMachineId,
        name: rmName.trim(),
        machineType: rmType,
        protocol: rmProtocol,
        endpointUrl: rmEndpointUrl.trim(),
        assignedProgramId: rmProgramId || undefined,
        mqttEnabled: rmMqttEnabled,
        mqttBrokerUrl: rmMqttBrokerUrl.trim(),
        mqttTopic: rmMqttTopic.trim(),
        mqttQos: rmMqttQos,
      });
      setRmFeedback(
        editingMachineId
          ? `Endpoint "${rmName.trim()}" atualizado no SQLite com monitoramento MQTT.`
          : `Novo endpoint "${rmName.trim()}" salvo no SQLite.`
      );
      resetRemoteForm();
    } catch (err) {
      setRmError(err instanceof Error ? err.message : 'Falha ao salvar endpoint remoto.');
    } finally {
      setRmBusy(false);
    }
  };

  const roleDef = ECOSYSTEM_ROLE_DEFINITIONS[profile.role];

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Identity & Configurable Profile Agent Header */}
        <div className="bg-[#111620] border border-white/10 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono-tabular text-sky-400">
              {profile.provider.toUpperCase()} · {roleDef.shortTag} · {profile.handleAt} · Compartilha {profile.computeSharePct}% GPU/CPU
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-slate-100">
              Ecossistema Parametrix — Chat, Logística 4-Modais, Compute 20% & ERP/CRM Open
            </h1>
            <p className="text-xs text-slate-400">
              Conectado via SQLite Localhost + WebSockets: Clientes, Provedores CAM (Foxconn/CNC), Logística GPS (iFood/99/Autônomos), Fornecedores e Nós 20%.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold bg-[#141a24] border border-white/15 text-slate-100 hover:border-sky-400/50 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-sky-400" />
              Trocar Perfil / Auth Offline
            </button>
            <button
              type="button"
              onClick={() => onRunAutonomousProjectWorkflow(profile.role)}
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-lg cursor-pointer"
            >
              Automatizar Projeto p/ {roleDef.shortTag}
            </button>
          </div>
        </div>

        {/* Reconfigurable Profile Agent Row (@handle, telefone, endereço) */}
        <div className="bg-[#111620] border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Arroba / Handle Agente</label>
            <input
              type="text"
              value={agentHandle}
              onChange={(e) => setAgentHandle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Telefone Específico</label>
            <input
              type="text"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Endereço / Hub Fabril</label>
            <input
              type="text"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
            />
          </div>
          <button
            type="button"
            disabled={agentBusy}
            onClick={handleSaveAgentConfig}
            className="min-h-[38px] px-3 py-2 text-xs font-semibold bg-sky-500/15 border border-sky-400/45 text-sky-200 hover:bg-sky-500/25 rounded-lg cursor-pointer"
          >
            {agentBusy ? 'Salvando...' : 'Salvar Config Agente no SQLite'}
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
          {(
            [
              { id: 'chat', label: 'Chat Público + Voz/Vídeo WebRTC', icon: MessageSquare },
              { id: 'session', label: 'Sessão Gravada & Ponteiro', icon: Activity },
              { id: 'logistics', label: 'Hub Logística GPS 4-Modais', icon: Truck },
              { id: 'erp', label: 'ERP / CRM Open Free', icon: Briefcase },
              { id: 'compute', label: 'Malha Compute 20%', icon: Cpu },
              { id: 'remote', label: 'Máquinas Remotas Reais', icon: Server },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  subTab === t.id
                    ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                    : 'border-white/10 bg-[#111620] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-sky-400" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 1. Public Chat for Registered Users: Rules, Themes, Process URL & Full-Duplex WebRTC */}
        {subTab === 'chat' && (
          <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-3">
            {/* Registration Gate Banner */}
            {!isRegistered && (
              <div className="p-3 bg-amber-500/10 border border-amber-400/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="text-amber-200">
                  <strong>Acesso Somente Leitura:</strong> o Chat Público e WebRTC (voz/vídeo/tela) exigem usuário cadastrado no Parametrix.
                </div>
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="px-3 py-1.5 bg-amber-400 text-slate-950 font-semibold rounded-lg hover:bg-amber-300 shrink-0 cursor-pointer"
                >
                  Entrar / Cadastrar Conta
                </button>
              </div>
            )}

            {(offlineMode || profile.offlineMode || selectedAgentId === 'local-llm') && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-400/35 rounded-lg text-[11px] text-emerald-200 flex items-center justify-between gap-2">
                <span>
                  <strong>Modo Offline / Agente Local Ativo:</strong> Mordomo{' '}
                  <strong>Hermes + Burrinhos (OpenClaw/NanoClaw/PicoClaw) + Qwen 2.5 0.5B SimpleTool Harness + Search Local/GrabCAD</strong>{' '}
                  respondem automaticamente neste chat e nos processos.
                </span>
              </div>
            )}

            {harnessDockProps && (
              <AgentHarnessDock
                layer="erp"
                title="ERP / Chat · Qwen 0.5B SimpleTool Harness"
                {...harnessDockProps}
              />
            )}

            {/* Themes Selector + Rules Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {PUBLIC_CHAT_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description}
                    onClick={() => setChatRoom(t.id)}
                    className={`px-2.5 py-1 text-xs font-mono-tabular rounded border cursor-pointer ${
                      chatRoom === t.id
                        ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                        : 'border-white/10 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="px-2.5 py-1 text-[11px] font-medium border border-white/15 bg-[#0c1017] text-slate-300 hover:text-white rounded-lg cursor-pointer"
              >
                {rulesOpen ? 'Ocultar Regras' : 'Regras do Chat Público'}
              </button>
            </div>

            {rulesOpen && (
              <div className="p-3 bg-[#090d14] border border-sky-400/30 rounded-lg space-y-1 text-[11px] text-slate-300">
                <div className="font-semibold text-sky-300 mb-1">Regras Oficiais do Chat Público Parametrix:</div>
                {PUBLIC_CHAT_RULES.map((rule) => (
                  <div key={rule}>{rule}</div>
                ))}
              </div>
            )}

            {/* Real-Time Full-Duplex Voice / Video / Screen Share + Process URL Bar */}
            <div className="p-3 bg-[#0c1017] border border-white/10 rounded-lg space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-300 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Sala WebRTC: <strong className="text-sky-300">#{chatRoom}</strong> ·{' '}
                    {rtc.allPeers.length} participante(s)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void rtc.toggleVoiceOrVideo(!rtc.audioEnabled, rtc.videoEnabled)}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1 cursor-pointer ${
                      rtc.audioEnabled
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-[#111620] border-white/15 text-slate-300'
                    }`}
                  >
                    {rtc.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    {rtc.audioEnabled ? 'Voz Ativa' : 'Ligar Voz'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rtc.toggleVoiceOrVideo(rtc.audioEnabled || true, !rtc.videoEnabled)}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1 cursor-pointer ${
                      rtc.videoEnabled
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-[#111620] border-white/15 text-slate-300'
                    }`}
                  >
                    {rtc.videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                    {rtc.videoEnabled ? 'Vídeo Ativo' : 'Ligar Vídeo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rtc.toggleScreenShare()}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1 cursor-pointer ${
                      rtc.screenEnabled
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-[#111620] border-white/15 text-slate-300'
                    }`}
                  >
                    {rtc.screenEnabled ? <Monitor className="w-3.5 h-3.5" /> : <MonitorOff className="w-3.5 h-3.5" />}
                    {rtc.screenEnabled ? 'Compartilhando Tela' : 'Compartilhar Tela'}
                  </button>
                  {(rtc.joinedRoom || rtc.audioEnabled || rtc.videoEnabled || rtc.screenEnabled) && (
                    <button
                      type="button"
                      onClick={rtc.leaveCall}
                      className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-rose-400/50 bg-rose-500/15 text-rose-200 flex items-center gap-1 cursor-pointer"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      Sair Chamada
                    </button>
                  )}
                </div>
              </div>

              {/* Active Session Process URL */}
              {activeProcessUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/8 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0 text-slate-300 font-mono-tabular">
                    <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">{activeProcessUrl}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(activeProcessUrl);
                        setUrlCopied(true);
                        window.setTimeout(() => setUrlCopied(false), 1800);
                      }}
                      className="px-2 py-1 rounded border border-white/15 bg-[#111620] text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {urlCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {urlCopied ? 'Copiada' : 'Copiar URL'}
                    </button>
                    <button
                      type="button"
                      disabled={!isRegistered}
                      onClick={() => void handleSend(false, false, true)}
                      className="px-2.5 py-1 rounded border border-sky-400/45 bg-sky-500/15 text-sky-200 disabled:opacity-40 cursor-pointer"
                    >
                      Postar URL no Chat
                    </button>
                  </div>
                </div>
              )}

              {rtc.rtcError && <div className="text-[11px] text-rose-400">{rtc.rtcError}</div>}

              {(rtc.localMediaStream || rtc.localScreenStream || rtc.remoteStreams.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                  {rtc.localMediaStream && (
                    <RtcStreamView
                      stream={rtc.localMediaStream}
                      muted
                      label={`Você (${profile.displayName})`}
                    />
                  )}
                  {rtc.localScreenStream && (
                    <RtcStreamView
                      stream={rtc.localScreenStream}
                      muted
                      label="Sua Tela / Módulo CAD"
                    />
                  )}
                  {rtc.remoteStreams.map((rs) => (
                    <RtcStreamView
                      key={rs.peerId}
                      stream={rs.stream}
                      label={`Peer ${rs.peerId}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {chatError && (
              <div className="p-2.5 bg-rose-500/15 border border-rose-400/40 rounded-lg text-xs text-rose-200">
                {chatError}
              </div>
            )}

            <div className="h-72 overflow-y-auto space-y-2 p-3 bg-[#090d14] border border-white/8 rounded-lg">
              {chatMessages
                .filter((m) => (m.theme ?? m.room) === chatRoom || chatRoom === 'geral')
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 bg-[#111620] border border-white/8 rounded-lg space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular gap-2">
                      <span className={m.isAgent ? 'text-emerald-300 font-semibold' : 'text-sky-300 font-semibold'}>
                        {m.senderName} · {ECOSYSTEM_ROLE_DEFINITIONS[m.senderRole]?.shortTag ?? m.senderRole} · #{m.theme ?? m.room}
                      </span>
                      <span className="text-slate-500 shrink-0">{m.vucHash.slice(0, 14)}</span>
                    </div>
                    <p className="text-xs text-slate-200 whitespace-pre-wrap">{m.content}</p>
                    {m.processUrl && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenProcessUrl?.(m.processUrl!)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-[10px] font-mono-tabular text-sky-200 hover:bg-sky-500/25 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Abrir Processo Compartilhado
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                disabled={!isRegistered}
                placeholder={
                  isRegistered
                    ? `Enviar em #${chatRoom} (use @hermes, @burrinho, @grabcad, @cam ou URL GrabCAD)...`
                    : 'Faça login ou cadastre-se para enviar mensagens no chat público'
                }
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isRegistered) void handleSend(false, false);
                }}
                className="flex-1 min-w-[200px] px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void handleSend(true)}
                className="px-3 py-2 text-xs font-medium bg-[#141a24] border border-emerald-400/40 text-emerald-200 rounded-lg cursor-pointer"
              >
                Agente {profile.handleAt}
              </button>
              <button
                type="button"
                disabled={!isRegistered}
                onClick={() => void handleSend(false, false, false, true)}
                className="px-3 py-2 text-xs font-semibold bg-amber-500/15 border border-amber-400/45 text-amber-200 rounded-lg hover:bg-amber-500/25 flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                title="Aciona Mordomo Hermes + Burrinhos + Qwen 2.5 0.5B Super-RAG + Search no chat"
              >
                <Cpu className="w-3.5 h-3.5" />
                Hermes + Burrinho
              </button>
              <button
                type="button"
                disabled={!isRegistered}
                onClick={() => void handleSend(false, true)}
                className="px-3 py-2 text-xs font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 rounded-lg hover:bg-emerald-500/25 flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                title="Envia pergunta e aciona o Agente Orquestrador CAM com prova VUC na sala"
              >
                <Send className="w-3.5 h-3.5" />
                Perguntar Agente CAM
              </button>
              <button
                type="button"
                disabled={!isRegistered}
                onClick={() => void handleSend(false, false)}
                className="px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </div>
          </div>
        )}

        {/* 1B. Live Session Pointer Tracking, Production History & Refinement Recommendations */}
        {subTab === 'session' && (
          <div className="space-y-4">
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-100">
                    Sessão Gravada com Movimentação do Ponteiro + Proveniência GOS7 ({selectedAgentId})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Registra trajeto do ponteiro e ações CAD/CAE/CAM para refinar usabilidade e emitir certificado VUC.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onToggleDelegatedByPo && (
                    <button
                      type="button"
                      onClick={onToggleDelegatedByPo}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                        delegatedByPo
                          ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                          : 'bg-[#0c1017] border-white/15 text-slate-300'
                      }`}
                    >
                      {delegatedByPo ? 'PO Delegou p/ Agente LLM' : 'PO Supervisionando Direto'}
                    </button>
                  )}
                  {onToggleSessionRecording && (
                    <button
                      type="button"
                      onClick={onToggleSessionRecording}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                        sessionRecordingEnabled
                          ? 'bg-rose-500/15 border-rose-400/45 text-rose-200'
                          : 'bg-[#0c1017] border-white/15 text-slate-300'
                      }`}
                    >
                      {sessionRecordingEnabled ? '● Gravando Ponteiro' : 'Gravação Pausada'}
                    </button>
                  )}
                  {onFlushSessionLog && (
                    <button
                      type="button"
                      onClick={() => void onFlushSessionLog()}
                      className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 cursor-pointer"
                    >
                      Persistir Log no SQLite
                    </button>
                  )}
                </div>
              </div>

              {activeSessionLog && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                      <div className="text-slate-500">Amostras Ponteiro</div>
                      <div className="font-mono-tabular text-base font-bold text-sky-300">
                        {activeSessionLog.pointerCount}
                      </div>
                    </div>
                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                      <div className="text-slate-500">Ações Discretas</div>
                      <div className="font-mono-tabular text-base font-bold text-emerald-300">
                        {activeSessionLog.actionCount}
                      </div>
                    </div>
                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                      <div className="text-slate-500">Duração Gravada</div>
                      <div className="font-mono-tabular text-base font-bold text-slate-100">
                        {activeSessionLog.durationSec}s
                      </div>
                    </div>
                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                      <div className="text-slate-500">Hotzone Ponteiro</div>
                      <div className="font-mono-tabular text-[11px] font-semibold text-amber-300 truncate">
                        {activeSessionLog.hotzoneLabel}
                      </div>
                    </div>
                  </div>

                  {/* 6x4 Spatial Pointer Heatmap */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-slate-200">
                        Mapa de Calor Espacial do Ponteiro ({HEATMAP_COLS}×{HEATMAP_ROWS})
                      </div>
                      <div className="grid grid-cols-6 gap-1.5">
                        {Array.from({ length: HEATMAP_ROWS * HEATMAP_COLS }).map((_, idx) => {
                          const col = idx % HEATMAP_COLS;
                          const row = Math.floor(idx / HEATMAP_COLS);
                          const cell = activeSessionLog.heatmap.find((h) => h.col === col && h.row === row);
                          const cnt = cell?.count ?? 0;
                          const maxCnt = Math.max(1, ...activeSessionLog.heatmap.map((h) => h.count));
                          const intensity = cnt / maxCnt;
                          return (
                            <div
                              key={`${col}:${row}`}
                              title={`Q[${col},${row}] = ${cnt} amostras`}
                              className="h-10 rounded border border-white/10 flex flex-col items-center justify-center text-[10px] font-mono-tabular"
                              style={{
                                backgroundColor:
                                  cnt === 0
                                    ? 'rgba(15, 23, 42, 0.8)'
                                    : `rgba(56, 189, 248, ${(0.15 + intensity * 0.7).toFixed(2)})`,
                              }}
                            >
                              <span className="text-slate-100 font-semibold">{cnt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-slate-200">
                        Recomendações de Refinamento do Ecossistema
                      </div>
                      <div className="space-y-1.5">
                        {activeSessionLog.insights.map((ins) => (
                          <div
                            key={ins.code}
                            className={`p-2 rounded border text-xs ${
                              ins.severity === 'atencao'
                                ? 'bg-amber-500/10 border-amber-400/35 text-amber-200'
                                : ins.severity === 'otimizacao'
                                  ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-200'
                                  : 'bg-[#111620] border-white/10 text-slate-300'
                            }`}
                          >
                            <div className="font-mono-tabular text-[10px] opacity-80">{ins.code}</div>
                            <div>{ins.recommendation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Persisted SQLite Historical Production Sessions */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-xs font-semibold text-slate-200">
                  Histórico Persistido no SQLite ({savedSessionLogs.length} sessões)
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {savedSessionLogs.slice(0, 8).map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 bg-[#090d14] border border-white/8 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">
                          {s.poHumano} · Agente {s.llmAgent} ({s.delegatedByPo ? 'Delegado' : 'Direto'})
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-400 truncate">
                          {s.pointerCount} ponteiro · {s.actionCount} ações · {s.processMachine} · {s.hotzoneLabel}
                        </div>
                      </div>
                      <span className="font-mono-tabular text-[10px] text-emerald-400 shrink-0">
                        {s.vucHash}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Multimodal Logistics Hub + Real-time Mobile GPS */}
        {subTab === 'logistics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-sky-400" />
                  Mapa Multimodal Real-Time (Rodo · Ferro · Aero · Fluvial)
                </span>
                <button
                  type="button"
                  disabled={gpsBusy}
                  onClick={async () => {
                    setGpsBusy(true);
                    try {
                      await onPingGpsLocation(
                        routeModal,
                        `Rota Ativa ${profile.handleAt} (${routeModal.toUpperCase()})`
                      );
                    } finally {
                      setGpsBusy(false);
                    }
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {gpsBusy ? 'Capturando GPS...' : 'Emitir GPS do Celular'}
                </button>
              </div>
              <canvas
                ref={mapCanvasRef}
                width={520}
                height={260}
                className="w-full h-auto rounded-lg border border-white/10"
              />
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {logisticsNodes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between text-xs px-3 py-2 bg-[#0c1017] border border-white/8 rounded-lg"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 truncate">
                        {n.driverName} · {n.serviceTag}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{n.routeLabel}</div>
                    </div>
                    <div className="text-right font-mono-tabular text-[11px] text-sky-300 shrink-0 ml-2">
                      {n.lat.toFixed(3)}, {n.lng.toFixed(3)} · {n.speedKmh} km/h
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-4">
              <div className="text-xs font-semibold text-slate-100">
                Simulador Hub Logístico Ponto-a-Ponto
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'road', label: 'Rodoviário (iFood/99)' },
                    { id: 'rail', label: 'Ferroviário Carga' },
                    { id: 'air', label: 'Aéreo Expresso' },
                    { id: 'river', label: 'Fluvial / Hidrovia' },
                  ] as { id: LogisticsModal; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRouteModal(m.id)}
                    className={`min-h-[40px] px-3 py-2 text-xs rounded-lg border text-left cursor-pointer ${
                      routeModal === m.id
                        ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                        : 'border-white/10 bg-[#0c1017] text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Distância Ponto-a-Ponto</span>
                  <span className="font-mono-tabular text-slate-100">{routeDistanceKm} km</span>
                </div>
                <input
                  type="range"
                  className="cad-slider w-full"
                  min={5}
                  max={3200}
                  step={15}
                  value={routeDistanceKm}
                  onChange={(e) => setRouteDistanceKm(parseInt(e.target.value, 10))}
                />
                <div className="flex justify-between">
                  <span className="text-slate-400">Massa da Carga</span>
                  <span className="font-mono-tabular text-slate-100">{routeMassKg} kg</span>
                </div>
                <input
                  type="range"
                  className="cad-slider w-full"
                  min={1}
                  max={250}
                  step={1}
                  value={routeMassKg}
                  onChange={(e) => setRouteMassKg(parseInt(e.target.value, 10))}
                />
              </div>

              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1 text-xs">
                <div className="font-medium text-sky-300">{routeEstimate.modalLabel}</div>
                <div className="flex justify-between font-mono-tabular text-slate-200">
                  <span>ETA: {routeEstimate.estimatedHours} h</span>
                  <span>Custo: R$ {routeEstimate.costBrl.toFixed(2)}</span>
                  <span>CO₂: {routeEstimate.co2Kg} kg</span>
                </div>
                <div className="text-[10px] font-mono-tabular text-emerald-400">
                  {routeEstimate.vucHash}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Open-Source Manufacturing ERP + Real-Time CAD/CAE/CAM + BI & CRM */}
        {subTab === 'erp' && (
          <div className="space-y-4">
            {harnessDockProps && (
              <AgentHarnessDock
                layer="erp"
                title="ERP · Qwen 0.5B SimpleTool Harness"
                {...harnessDockProps}
              />
            )}
            {/* ERP Executive Header + User Session Sync */}
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-[11px] font-mono-tabular text-sky-400 font-semibold">
                    ERP OPEN MANUFACTURA (ERPNext/Odoo Pattern) · SINCRONIA REAL-TIME CAD/CAE/CAM
                  </div>
                  <h2 className="font-display text-base font-bold text-slate-100">
                    {liveErpSnapshot ? liveErpSnapshot.partName : 'Cockpit ERP & BI/CRM Parametrix'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Conta vinculada:{' '}
                    <strong className="text-emerald-300">
                      {googleUserEmail || profile.email}
                    </strong>{' '}
                    ({profile.handleAt} · {ECOSYSTEM_ROLE_DEFINITIONS[profile.role].shortTag})
                    {liveErpSnapshot && ` · VUC ${liveErpSnapshot.vucHash.slice(0, 14)}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('library')}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/15 text-slate-200 hover:border-sky-400/50 rounded-lg cursor-pointer"
                    >
                      Abrir Lib / Biblioteca
                    </button>
                  )}
                  {liveErpSnapshot && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onAddErpRecord({
                          kind: 'order',
                          title: `[Auto CAD/CAM] ${liveErpSnapshot.partName} (${liveErpSnapshot.pricingAndRoi.batchQty} un · ${liveErpSnapshot.taxBreakdown.regime.toUpperCase()})`,
                          status: 'aberto',
                          partyName: googleUserEmail || profile.displayName,
                          segment: liveErpSnapshot.segment,
                          amountBrl: liveErpSnapshot.pricingAndRoi.parametrixBatchTotalBrl,
                          modal: liveErpSnapshot.logistics.modal,
                          ownerRole: profile.role,
                        });
                        setErpActionStatus(
                          `Ordem ERP de R$ ${liveErpSnapshot.pricingAndRoi.parametrixBatchTotalBrl.toLocaleString('pt-BR')} gravada no SQLite com prova VUC.`
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-lg cursor-pointer"
                    >
                      + Registrar Lote Real-Time no SQLite
                    </button>
                  )}
                  {liveErpSnapshot && googleAccessToken && onSaveErpSnapshotToDrive && (
                    <button
                      type="button"
                      disabled={erpDriveBusy}
                      onClick={async () => {
                        setErpDriveBusy(true);
                        try {
                          await onSaveErpSnapshotToDrive(liveErpSnapshot);
                          setErpActionStatus('Cotação ERP + BOM salva no seu Google Drive.');
                        } finally {
                          setErpDriveBusy(false);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-sky-500/20 border border-sky-400/50 text-sky-200 hover:bg-sky-500/30 rounded-lg cursor-pointer"
                    >
                      {erpDriveBusy ? 'Enviando Drive...' : 'Salvar Proposta no Drive'}
                    </button>
                  )}
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('media-studio')}
                      className="px-3 py-1.5 text-xs font-semibold bg-[#2563EB]/20 border border-[#22D3EE]/50 text-cyan-200 hover:bg-[#2563EB]/30 rounded-lg cursor-pointer"
                    >
                      Media Studio · Organograma & Business Plan →
                    </button>
                  )}
                </div>
              </div>

              {erpActionStatus && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-400/40 rounded-lg text-xs text-emerald-200">
                  {erpActionStatus}
                </div>
              )}

              {liveErpSnapshot?.pricingAndRoi.frostbiteNotice && (
                <div className="p-3 bg-amber-500/10 border border-amber-400/40 rounded-lg text-xs text-amber-200">
                  <strong>Aviso Pré-Silício FrostbiteEngine:</strong>{' '}
                  {liveErpSnapshot.pricingAndRoi.frostbiteNotice}
                </div>
              )}

              {/* Internal Open-Source ERP Sub-Module Switcher */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'overview', label: 'Entrada & Sincronia CAD/CAE/CAM' },
                    { id: 'bom', label: 'BOM, Insumos & Roteiro CAM' },
                    { id: 'finance', label: 'Preços, Impostos, Logística & ROI' },
                    { id: 'crm', label: 'BI & CRM (Potenciais Clientes)' },
                    { id: 'ledger', label: `Lançamentos SQLite (${erpRecords.length})` },
                  ] as const
                ).map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setErpSection(sec.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                      erpSection === sec.id
                        ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                        : 'border-white/10 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              {/* Top KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                  <div className="text-slate-500">Custo Unit. Direto</div>
                  <div className="font-mono-tabular text-base font-bold text-slate-100">
                    R${' '}
                    {(liveErpSnapshot?.pricingAndRoi.totalCostUnitBrl ?? 0).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                  <div className="text-slate-500">Preço Final Parametrix</div>
                  <div className="font-mono-tabular text-base font-bold text-sky-300">
                    R${' '}
                    {(liveErpSnapshot?.pricingAndRoi.parametrixPriceUnitBrl ?? 0).toLocaleString(
                      'pt-BR'
                    )}
                    /un
                  </div>
                </div>
                <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                  <div className="text-slate-500">Preço Mercado Trad.</div>
                  <div className="font-mono-tabular text-base font-bold text-amber-300">
                    {liveErpSnapshot?.pricingAndRoi.marketPriceUnitBrl !== null &&
                    liveErpSnapshot?.pricingAndRoi.marketPriceUnitBrl !== undefined
                      ? `R$ ${liveErpSnapshot.pricingAndRoi.marketPriceUnitBrl.toLocaleString('pt-BR')}`
                      : 'Interno 7nm'}
                  </div>
                </div>
                <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                  <div className="text-slate-500">ROI Projetado / Econ.</div>
                  <div className="font-mono-tabular text-base font-bold text-emerald-300">
                    {liveErpSnapshot?.pricingAndRoi.roiPct !== null &&
                    liveErpSnapshot?.pricingAndRoi.roiPct !== undefined
                      ? `ROI ${liveErpSnapshot.pricingAndRoi.roiPct}% (-${liveErpSnapshot.pricingAndRoi.savingsVsMarketPct}%)`
                      : 'Sem ROI público'}
                  </div>
                </div>
                <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                  <div className="text-slate-500">Pipeline SQLite + BI</div>
                  <div className="font-mono-tabular text-base font-bold text-emerald-300">
                    R${' '}
                    {(
                      erpStats.totalPipelineBrl +
                      (liveErpSnapshot?.biSummary.weightedCrmValueBrl ?? 0)
                    ).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* Parameter Interactive Bar (always accessible to re-compute in real time) */}
              {liveErpSnapshot && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-[#0c1017] border border-white/8 rounded-xl text-xs">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Tamanho do Lote</span>
                      <span className="font-mono-tabular text-slate-100">{erpBatchQty} un</span>
                    </div>
                    <input
                      type="range"
                      className="cad-slider w-full"
                      min={1}
                      max={100}
                      step={1}
                      value={erpBatchQty}
                      onChange={(e) => onChangeErpBatchQty?.(parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Margem Líquida Alvo</span>
                      <span className="font-mono-tabular text-emerald-300">{erpMarginPct}%</span>
                    </div>
                    <input
                      type="range"
                      className="cad-slider w-full"
                      min={10}
                      max={55}
                      step={1}
                      value={erpMarginPct}
                      onChange={(e) => onChangeErpMarginPct?.(parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Regime Tributário (BR)</label>
                    <select
                      value={erpTaxRegime}
                      onChange={(e) => onChangeErpTaxRegime?.(e.target.value as ErpTaxRegime)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                    >
                      <option value="simples">Simples Nacional (Anexo II)</option>
                      <option value="presumido">Lucro Presumido</option>
                      <option value="real">Lucro Real (Créditos)</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Frete Multimodal ({(erpLogisticsModal ?? routeModal).toUpperCase()})</span>
                      <span className="font-mono-tabular text-sky-300">{erpDistanceKm} km</span>
                    </div>
                    <div className="flex gap-1.5">
                      <select
                        value={erpLogisticsModal ?? routeModal}
                        onChange={(e) => {
                          const m = e.target.value as LogisticsModal;
                          setRouteModal(m);
                          onChangeErpLogisticsModal?.(m);
                        }}
                        className="px-2 py-1 text-xs bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                      >
                        <option value="road">Rodo</option>
                        <option value="rail">Ferro</option>
                        <option value="air">Aéreo</option>
                        <option value="river">Fluvial</option>
                      </select>
                      <input
                        type="range"
                        className="cad-slider flex-1"
                        min={20}
                        max={2500}
                        step={20}
                        value={erpDistanceKm}
                        onChange={(e) => onChangeErpDistanceKm?.(parseInt(e.target.value, 10))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-view 1: Real-Time CAD/CAE/CAM Correlation */}
              {erpSection === 'overview' && liveErpSnapshot && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {liveErpSnapshot.correlatedAreas.map((corr) => (
                      <div
                        key={corr.area}
                        className="p-3.5 bg-[#0c1017] border border-white/10 rounded-xl space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono-tabular">
                          <span className="font-bold text-sky-300">
                            {corr.area} → {corr.erpModule}
                          </span>
                          <span
                            className={
                              corr.status === 'sincronizado'
                                ? 'text-emerald-400'
                                : 'text-amber-300'
                            }
                          >
                            {corr.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-100">{corr.headline}</div>
                        <div className="text-[11px] font-mono-tabular text-slate-400">
                          {corr.metricsSummary}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3 bg-[#090d14] border border-white/8 rounded-xl">
                    <div>
                      <div className="text-slate-500">Lote Parametrix Total</div>
                      <div className="font-mono-tabular font-bold text-sky-300">
                        R${' '}
                        {liveErpSnapshot.pricingAndRoi.parametrixBatchTotalBrl.toLocaleString(
                          'pt-BR'
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Carga Tributária ({liveErpSnapshot.taxBreakdown.effectiveRatePct}%)</div>
                      <div className="font-mono-tabular font-bold text-amber-300">
                        R$ {liveErpSnapshot.taxBreakdown.totalTaxBrl.toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Frete ({liveErpSnapshot.logistics.cargoMassKg} kg)</div>
                      <div className="font-mono-tabular font-bold text-slate-100">
                        R$ {liveErpSnapshot.logistics.totalFreightBrl.toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Prontidão Técnica BI</div>
                      <div className="font-mono-tabular font-bold text-emerald-300">
                        {liveErpSnapshot.biSummary.techReadinessPct}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-view 2: BOM, Insumos & Roteiro CAM */}
              {erpSection === 'bom' && liveErpSnapshot && (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 text-slate-400">
                        <tr>
                          <th className="py-2 pr-3">SKU</th>
                          <th className="py-2 pr-3">Insumo / Recurso</th>
                          <th className="py-2 pr-3">Origem</th>
                          <th className="py-2 pr-3">Qtd Lote</th>
                          <th className="py-2 pr-3">Unit.</th>
                          <th className="py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8 font-mono-tabular">
                        {liveErpSnapshot.bomLines.map((line) => (
                          <tr key={line.sku}>
                            <td className="py-2 pr-3 text-sky-300">{line.sku}</td>
                            <td className="py-2 pr-3 font-sans text-slate-100">{line.name}</td>
                            <td className="py-2 pr-3 text-slate-400">{line.sourceArea}</td>
                            <td className="py-2 pr-3 text-slate-200">
                              {line.quantity} {line.unit}
                            </td>
                            <td className="py-2 pr-3 text-slate-400">
                              R$ {line.unitCostBrl.toLocaleString('pt-BR')}
                            </td>
                            <td
                              className={`py-2 text-right font-semibold ${
                                line.subtotalBrl < 0 ? 'text-emerald-400' : 'text-slate-100'
                              }`}
                            >
                              R$ {line.subtotalBrl.toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 bg-[#0c1017] border border-white/10 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular">
                    <div>
                      <div className="text-slate-500">Máquina CAM</div>
                      <div className="text-slate-100 font-semibold">
                        {liveErpSnapshot.routingCost.machineType} (R${' '}
                        {liveErpSnapshot.routingCost.machineHourlyRateBrl}/h)
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Ciclo / Setup Lote</div>
                      <div className="text-slate-100">
                        {liveErpSnapshot.routingCost.cycleMinutesPerUnit} min/un · Setup R${' '}
                        {liveErpSnapshot.routingCost.setupCostBatchBrl}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Metrologia + VUC</div>
                      <div className="text-sky-300">
                        R$ {liveErpSnapshot.routingCost.qaAndVucFeeBatchBrl}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Total Operação CAM</div>
                      <div className="text-emerald-300 font-bold">
                        R${' '}
                        {liveErpSnapshot.routingCost.machiningTotalBatchBrl.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-view 3: Pricing, Brazilian Taxes, Logistics & ROI */}
              {erpSection === 'finance' && liveErpSnapshot && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 bg-[#0c1017] border border-white/10 rounded-xl space-y-2">
                    <div className="font-semibold text-slate-100">
                      Composição Tributária ({liveErpSnapshot.taxBreakdown.regimeLabel})
                    </div>
                    <div className="space-y-1 font-mono-tabular">
                      <div className="flex justify-between">
                        <span className="text-slate-400">ICMS Estadual</span>
                        <span>R$ {liveErpSnapshot.taxBreakdown.icmsBrl.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">IPI Industrial</span>
                        <span>R$ {liveErpSnapshot.taxBreakdown.ipiBrl.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">PIS / COFINS / DAS</span>
                        <span>
                          R$ {liveErpSnapshot.taxBreakdown.pisCofinsOrDasBrl.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-1 text-amber-300 font-bold">
                        <span>
                          Total Impostos ({liveErpSnapshot.taxBreakdown.effectiveRatePct}%)
                        </span>
                        <span>
                          R$ {liveErpSnapshot.taxBreakdown.totalTaxBrl.toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#0c1017] border border-white/10 rounded-xl space-y-2">
                    <div className="font-semibold text-slate-100">
                      Logística Multimodal & Retorno Financeiro
                    </div>
                    <div className="space-y-1 font-mono-tabular">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Modal & Rota</span>
                        <span className="text-sky-300">
                          {liveErpSnapshot.logistics.modal.toUpperCase()} ·{' '}
                          {liveErpSnapshot.logistics.distanceKm} km (ETA{' '}
                          {liveErpSnapshot.logistics.estimatedHours} h)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frete + CO₂ Logístico</span>
                        <span>
                          R$ {liveErpSnapshot.logistics.totalFreightBrl.toLocaleString('pt-BR')} ·{' '}
                          {liveErpSnapshot.logistics.co2Kg} kgCO₂
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Payback Lote / Economia</span>
                        <span className="text-emerald-300">
                          {liveErpSnapshot.pricingAndRoi.paybackBatches !== null
                            ? `${liveErpSnapshot.pricingAndRoi.paybackBatches} lote(s) · -${liveErpSnapshot.pricingAndRoi.savingsVsMarketPct}% vs mercado`
                            : 'Pré-silício interno'}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-1 text-sky-300 font-bold">
                        <span>Total Lote ({liveErpSnapshot.pricingAndRoi.batchQty} un)</span>
                        <span>
                          R${' '}
                          {liveErpSnapshot.pricingAndRoi.parametrixBatchTotalBrl.toLocaleString(
                            'pt-BR'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-view 4: BI & CRM Potential Customers */}
              {erpSection === 'crm' && liveErpSnapshot && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300 font-semibold">
                      BI & CRM — Potenciais Compradores / Segmentos Qualificados em Tempo Real
                    </span>
                    <span className="font-mono-tabular text-emerald-300">
                      Valor Ponderado CRM: R${' '}
                      {liveErpSnapshot.biSummary.weightedCrmValueBrl.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {liveErpSnapshot.crmLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="p-3.5 bg-[#0c1017] border border-white/10 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono-tabular">
                          <span className="text-sky-300 uppercase">{lead.stage}</span>
                          <span className="text-emerald-300 font-semibold">
                            Fit {lead.qualificationScorePct}% · {lead.estimatedOrderQty} un
                          </span>
                        </div>
                        <div className="font-semibold text-slate-100">{lead.companySegment}</div>
                        <div className="text-[11px] text-slate-400">
                          Decisor: {lead.contactRole} · Ticket est.{' '}
                          <strong className="text-slate-200 font-mono-tabular">
                            R$ {lead.estimatedTicketBrl.toLocaleString('pt-BR')}
                          </strong>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{lead.rationale}</p>
                        <button
                          type="button"
                          onClick={async () => {
                            await onAddErpRecord({
                              kind: 'lead',
                              title: `CRM ${lead.companySegment} · ${liveErpSnapshot.partName}`,
                              status: 'aberto',
                              partyName: lead.contactRole,
                              segment: lead.vertical,
                              amountBrl: lead.estimatedTicketBrl,
                              modal: liveErpSnapshot.logistics.modal,
                              ownerRole: profile.role,
                            });
                            setErpActionStatus(
                              `Lead CRM "${lead.companySegment}" registrado no SQLite.`
                            );
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500/20 border border-sky-400/50 text-sky-200 hover:bg-sky-500/30 rounded-md cursor-pointer"
                        >
                          Converter Lead → SQLite CRM
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-view 5: Persisted SQLite ERP/CRM Ledger */}
              {erpSection === 'ledger' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <select
                      value={erpKind}
                      onChange={(e) => setErpKind(e.target.value as ErpCrmRecord['kind'])}
                      className="px-2.5 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                    >
                      <option value="order">Ordem CAM</option>
                      <option value="lead">Lead CRM</option>
                      <option value="inventory">Insumo / Estoque</option>
                      <option value="shipment">Frete Hub</option>
                      <option value="invoice">Fatura VUC</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Descrição da ordem / insumo..."
                      value={erpTitle}
                      onChange={(e) => setErpTitle(e.target.value)}
                      className="md:col-span-2 px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Parceiro / Cliente..."
                      value={erpParty}
                      onChange={(e) => setErpParty(e.target.value)}
                      className="px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!erpTitle.trim()) return;
                        await onAddErpRecord({
                          kind: erpKind,
                          title: erpTitle.trim(),
                          status: 'aberto',
                          partyName: erpParty.trim() || profile.displayName,
                          segment: liveErpSnapshot?.segment ?? 'industrial-cnc',
                          amountBrl: erpAmount,
                          modal: routeModal,
                          ownerRole: profile.role,
                        });
                        setErpTitle('');
                        setErpParty('');
                        setErpAmount((v) => v + 500);
                      }}
                      className="px-3 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg cursor-pointer"
                    >
                      + Lançar no SQLite
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 text-slate-400">
                        <tr>
                          <th className="py-2 pr-3">Tipo</th>
                          <th className="py-2 pr-3">Descrição</th>
                          <th className="py-2 pr-3">Parceiro</th>
                          <th className="py-2 pr-3">Valor</th>
                          <th className="py-2">Prova VUC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {erpRecords.map((r) => (
                          <tr key={r.id}>
                            <td className="py-2 pr-3 font-mono-tabular uppercase text-sky-300">
                              {r.kind}
                            </td>
                            <td className="py-2 pr-3 text-slate-100">{r.title}</td>
                            <td className="py-2 pr-3 text-slate-400">{r.partyName}</td>
                            <td className="py-2 pr-3 font-mono-tabular text-emerald-300">
                              R$ {r.amountBrl.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 font-mono-tabular text-[11px] text-slate-400">
                              {r.vucHash.slice(0, 18)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. 20% Shared Compute Pool */}
        {subTab === 'compute' && (
          <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">Nós Logados Ativos (20% Share)</div>
                <div className="font-mono-tabular text-lg font-bold text-sky-300">
                  {poolStats.activeCount}
                </div>
              </div>
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">vCPUs Compartilhados (20%)</div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-300">
                  {poolStats.totalCoresContributed} cores
                </div>
              </div>
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">TFLOPs Cluster Distribuído</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-300">
                  {poolStats.totalTflopsContributed} TFLOPs
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {computeNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 bg-[#0c1017] border border-white/8 rounded-lg text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{n.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {n.osName} · {n.cpuCores} cores · {n.gpuName}
                    </div>
                  </div>
                  <div className="font-mono-tabular text-emerald-300">
                    {n.sharePct}% dedicado ({n.tflopsEst} TFLOPs pico)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Remote Machine Execution & MQTT Configuration */}
        {subTab === 'remote' && (
          <div className="space-y-4">
            {/* Configuration Panel for Saving New G-Code & MQTT Endpoints */}
            {onSaveRemoteMachine && (
              <form
                onSubmit={handleSaveRemoteForm}
                className="bg-[#111620] border border-sky-400/35 rounded-xl p-4 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-sky-400" />
                      <h2 className="font-display text-sm font-bold text-slate-100">
                        Configuração de Máquinas Remotas · Despacho Código G & Monitoramento MQTT
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cadastre novos endpoints fabris para envio direto de G-Code/KRL e vincule broker/tópico MQTT para telemetria em tempo real.
                    </p>
                  </div>
                  {editingMachineId && (
                    <button
                      type="button"
                      onClick={resetRemoteForm}
                      className="px-3 py-1.5 text-xs border border-white/15 text-slate-300 hover:text-white rounded-lg cursor-pointer self-start sm:self-auto"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Nome da Máquina / Célula
                    </label>
                    <input
                      type="text"
                      value={rmName}
                      onChange={(e) => setRmName(e.target.value)}
                      placeholder="Ex: Fresadora Haas VF-2"
                      className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Tipo CAM</label>
                    <select
                      aria-label="Tipo de Máquina CAM"
                      value={rmType}
                      onChange={(e) => setRmType(e.target.value as MachineType)}
                      className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                    >
                      <option value="cnc-5axis">CNC 5-Eixos</option>
                      <option value="cnc-3axis">CNC 3-Eixos</option>
                      <option value="powder-metal">Pó Metálico (LPBF)</option>
                      <option value="resin-sla">Resina UV (SLA)</option>
                      <option value="robot-weld">Robô Solda MIG/TIG</option>
                      <option value="laser-cut">Corte Laser Fibra</option>
                      <option value="robot-6axis">Robô 6-Eixos KUKA</option>
                      <option value="manual">DRO / Manual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Protocolo Despacho G-Code
                    </label>
                    <select
                      aria-label="Protocolo Despacho Código G"
                      value={rmProtocol}
                      onChange={(e) =>
                        setRmProtocol(e.target.value as RemoteMachineTarget['protocol'])
                      }
                      className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                    >
                      <option value="HTTP-Moonraker">HTTP Moonraker / Klipper</option>
                      <option value="OPC-UA">OPC-UA Industrial</option>
                      <option value="SSH-KUKA-Bridge">SSH KUKA / FANUC Bridge</option>
                      <option value="GRBL-Serial-WS">GRBL Serial over WebSocket</option>
                      <option value="MQTT">MQTT Direct Command</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Endpoint URL (Código G)
                    </label>
                    <input
                      type="text"
                      value={rmEndpointUrl}
                      onChange={(e) => setRmEndpointUrl(e.target.value)}
                      placeholder="http://192.168.1.40:7125/printer/gcode"
                      className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-sky-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Programa / Processo Associado
                  </label>
                  <select
                    aria-label="Programa CAM Associado"
                    value={rmProgramId}
                    onChange={(e) => setRmProgramId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                  >
                    <option value="">Automático pelo Tipo CAM</option>
                    {CAM_PRODUCTION_PROGRAMS.map((prog) => (
                      <option key={prog.id} value={prog.id}>
                        {prog.title} ({prog.machineType} · {prog.postFormat})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-[#0c1017] border border-white/10 rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <Wifi className="w-3.5 h-3.5" />
                      Monitoramento via MQTT
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rmMqttEnabled}
                        onChange={(e) => setRmMqttEnabled(e.target.checked)}
                        className="accent-emerald-400"
                      />
                      Ativar assinatura de telemetria MQTT
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Broker MQTT URL
                      </label>
                      <input
                        type="text"
                        value={rmMqttBrokerUrl}
                        onChange={(e) => setRmMqttBrokerUrl(e.target.value)}
                        placeholder="mqtt://broker.empresa.local:1883"
                        className="w-full px-3 py-2 bg-[#111620] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Tópico de Telemetria MQTT
                      </label>
                      <input
                        type="text"
                        value={rmMqttTopic}
                        onChange={(e) => setRmMqttTopic(e.target.value)}
                        placeholder="parametrix/machines/cnc-01/telemetry"
                        className="w-full px-3 py-2 bg-[#111620] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">QoS MQTT</label>
                      <select
                        aria-label="QoS MQTT"
                        value={rmMqttQos}
                        onChange={(e) =>
                          setRmMqttQos(Number(e.target.value) as 0 | 1 | 2)
                        }
                        className="w-full px-3 py-2 bg-[#111620] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-emerald-400"
                      >
                        <option value={0}>QoS 0 (At most once)</option>
                        <option value={1}>QoS 1 (At least once)</option>
                        <option value={2}>QoS 2 (Exactly once)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {rmError && <div className="text-xs text-rose-400">{rmError}</div>}
                {rmFeedback && <div className="text-xs text-emerald-400">{rmFeedback}</div>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={rmBusy}
                    className="min-h-[38px] px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {rmBusy
                      ? 'Salvando no SQLite...'
                      : editingMachineId
                        ? 'Atualizar Endpoint Remoto'
                        : 'Salvar Novo Endpoint Remoto + MQTT'}
                  </button>
                </div>
              </form>
            )}

            {/* Saved Endpoints Grid + Real Network Probe + Dispatch + MQTT Ping */}
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="text-xs text-slate-400">
                Associação real entre processos CAM e controladores físicos (HTTP Moonraker, OPC-UA, SSH KUKA, GRBL WS, MQTT). Sem mock: endpoints offline retornam falha explícita.
              </div>
              {remoteDispatchStatus && (
                <div className="p-2.5 bg-[#090d14] border border-amber-400/40 rounded-lg text-xs text-amber-200 font-mono-tabular">
                  {remoteDispatchStatus}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {remoteMachines.map((m) => {
                  const assoc = resolveMachineProcessAssociation(m);
                  const badgeColor =
                    m.status === 'online'
                      ? 'text-emerald-400'
                      : m.status === 'executando'
                        ? 'text-amber-300'
                        : m.status === 'offline'
                          ? 'text-rose-400'
                          : 'text-slate-400';
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 bg-[#0c1017] border border-white/10 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-semibold text-slate-100 truncate">{m.name}</span>
                        <span className={`font-mono-tabular text-[11px] shrink-0 ${badgeColor}`}>
                          {m.status.toUpperCase()}
                          {typeof m.lastProbeLatencyMs === 'number' ? ` (${m.lastProbeLatencyMs}ms)` : ''}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-300 truncate">
                        {m.protocol} · {m.endpointUrl}
                      </div>
                      <div className="text-[11px] text-sky-300 truncate">
                        Processo: {assoc.processLabel}
                        {assoc.assignedProgram ? ` · ${assoc.assignedProgram.title}` : ''}
                      </div>
                      {m.lastProbeDetail && (
                        <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                          Sonda Real: {m.lastProbeDetail}
                        </div>
                      )}
                      <div className="text-[11px] font-mono-tabular text-slate-400 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {m.mqttEnabled
                            ? `MQTT (QoS ${m.mqttQos ?? 1}): ${m.mqttTopic || 'tópico padrão'}`
                            : 'MQTT: desativado'}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">{m.machineType}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/8">
                        <span className="text-[10px] font-mono-tabular text-slate-500 truncate max-w-[140px]">
                          {m.lastJobVuc}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {onProbeRemoteMachine && (
                            <button
                              type="button"
                              onClick={() => void onProbeRemoteMachine(m.id)}
                              className="px-2.5 py-1.5 text-[11px] font-medium bg-[#141a24] border border-sky-400/40 text-sky-200 hover:bg-sky-500/20 rounded-lg cursor-pointer"
                            >
                              Testar Conexão
                            </button>
                          )}
                          {onSaveRemoteMachine && (
                            <button
                              type="button"
                              onClick={() => handleEditRemoteMachine(m)}
                              className="px-2.5 py-1.5 text-[11px] font-medium border border-white/15 text-slate-200 hover:border-sky-400 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
                          )}
                          {onPingRemoteMqtt && (
                            <button
                              type="button"
                              onClick={() => void onPingRemoteMqtt(m.id)}
                              className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Wifi className="w-3 h-3" />
                              MQTT Ping
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDispatchRemoteMachine(m.id)}
                            className="px-3 py-1.5 text-[11px] font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Radio className="w-3 h-3" />
                            Enviar Código G
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live MQTT Telemetry Feed */}
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  Monitoramento MQTT em Tempo Real
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {mqttTelemetryFeed.length} eventos recebidos
                </span>
              </div>
              {mqttTelemetryFeed.length === 0 ? (
                <div className="p-3 bg-[#090d14] border border-white/8 rounded-lg text-xs text-slate-400">
                  Nenhum evento MQTT recebido ainda. Clique em "MQTT Ping" ou "Enviar Código G" em qualquer máquina habilitada para monitorar o tópico em tempo real.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {mqttTelemetryFeed.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2.5 bg-[#090d14] border border-white/8 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-mono-tabular text-emerald-300 truncate">
                          [{evt.topic}] · QoS {evt.qos}
                        </div>
                        <div className="text-slate-200 truncate">
                          {evt.machineName} — {evt.payloadSummary}
                        </div>
                      </div>
                      <div className="font-mono-tabular text-[10px] text-slate-500 shrink-0">
                        {evt.brokerUrl} · {evt.vucHash.slice(0, 12)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
