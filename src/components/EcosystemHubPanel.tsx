import React, { useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Cpu,
  MapPin,
  MessageSquare,
  Navigation,
  Pencil,
  Radio,
  Save,
  Send,
  Server,
  Settings,
  Truck,
  UserCheck,
  Wifi,
} from 'lucide-react';
import {
  ECOSYSTEM_ROLE_DEFINITIONS,
  aggregateComputeSharePool,
  estimateMultimodalLogisticsRoute,
  summarizeErpCrmPipeline,
} from '../kernel/ecosystemErpLogistics';
import type {
  AuthUserProfile,
  ComputeShareNode,
  EcosystemChatMessage,
  EcosystemRole,
  ErpCrmRecord,
  LogisticsModal,
  LogisticsTelemetryNode,
  MachineType,
  RemoteMachineTarget,
  RemoteMqttTelemetryEvent,
} from '../types/cad';

export interface RemoteMachineConfigInput {
  id?: string;
  name: string;
  machineType: MachineType;
  protocol: RemoteMachineTarget['protocol'];
  endpointUrl: string;
  mqttEnabled: boolean;
  mqttBrokerUrl: string;
  mqttTopic: string;
  mqttQos: 0 | 1 | 2;
}

interface EcosystemHubPanelProps {
  profile: AuthUserProfile;
  onUpdateProfile: (patch: Partial<AuthUserProfile>) => Promise<void>;
  onOpenAuthModal: () => void;
  chatMessages: EcosystemChatMessage[];
  onSendChat: (room: string, content: string, asAgent?: boolean, askCamAgent?: boolean) => Promise<void>;
  logisticsNodes: LogisticsTelemetryNode[];
  onPingGpsLocation: (modal: LogisticsModal, routeLabel: string) => Promise<void>;
  computeNodes: ComputeShareNode[];
  erpRecords: ErpCrmRecord[];
  onAddErpRecord: (rec: Omit<ErpCrmRecord, 'id' | 'vucHash' | 'updatedAt'>) => Promise<void>;
  remoteMachines: RemoteMachineTarget[];
  onDispatchRemoteMachine: (machineId: string) => Promise<void>;
  onSaveRemoteMachine?: (input: RemoteMachineConfigInput) => Promise<void>;
  onPingRemoteMqtt?: (machineId: string) => Promise<void>;
  mqttTelemetryFeed?: RemoteMqttTelemetryEvent[];
  onRunAutonomousProjectWorkflow: (role: EcosystemRole) => void;
}

type EcosystemSubTab = 'chat' | 'logistics' | 'erp' | 'compute' | 'remote';

export const EcosystemHubPanel: React.FC<EcosystemHubPanelProps> = ({
  profile,
  onUpdateProfile,
  onOpenAuthModal,
  chatMessages,
  onSendChat,
  logisticsNodes,
  onPingGpsLocation,
  computeNodes,
  erpRecords,
  onAddErpRecord,
  remoteMachines,
  onDispatchRemoteMachine,
  onSaveRemoteMachine,
  onPingRemoteMqtt,
  mqttTelemetryFeed = [],
  onRunAutonomousProjectWorkflow,
}) => {
  const [subTab, setSubTab] = useState<EcosystemSubTab>('chat');
  const [chatRoom, setChatRoom] = useState('geral');
  const [chatDraft, setChatDraft] = useState('');
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
  const [rmMqttEnabled, setRmMqttEnabled] = useState(true);
  const [rmMqttBrokerUrl, setRmMqttBrokerUrl] = useState('mqtt://broker.parametrix.local:1883');
  const [rmMqttTopic, setRmMqttTopic] = useState('parametrix/machines/nova-celula/telemetry');
  const [rmMqttQos, setRmMqttQos] = useState<0 | 1 | 2>(1);
  const [rmBusy, setRmBusy] = useState(false);
  const [rmFeedback, setRmFeedback] = useState<string | null>(null);
  const [rmError, setRmError] = useState<string | null>(null);

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

  const handleSend = async (asAgent = false, askCamAgent = false) => {
    const text = chatDraft.trim();
    if (!text && !asAgent && !askCamAgent) return;
    const msg =
      text ||
      (askCamAgent
        ? 'Qual o estado atual do processo CAM, ferramenta ATC e prova VUC?'
        : `[Agente Autônomo ${profile.handleAt}] Executando checklist completo do perfil (${ECOSYSTEM_ROLE_DEFINITIONS[profile.role].shortTag}) no endereço ${agentAddress} · Contato ${agentPhone}.`);
    setChatDraft('');
    await onSendChat(chatRoom, msg, asAgent, askCamAgent);
  };

  const resetRemoteForm = () => {
    setEditingMachineId(undefined);
    setRmName('');
    setRmType('cnc-5axis');
    setRmProtocol('HTTP-Moonraker');
    setRmEndpointUrl('');
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
              { id: 'chat', label: 'Chat Multi-Perfil & Agentes', icon: MessageSquare },
              { id: 'logistics', label: 'Hub Logística GPS 4-Modais', icon: Truck },
              { id: 'erp', label: 'ERP / CRM Open Free', icon: Briefcase },
              { id: 'compute', label: 'Malha Compute 20%', icon: Cpu },
              { id: 'remote', label: 'Máquinas Remotas CAM', icon: Server },
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

        {/* 1. Real-Time WebSocket Chat */}
        {subTab === 'chat' && (
          <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {['geral', 'cam-foxconn', 'logistica-gps', 'insumos-suprimentos'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setChatRoom(r)}
                    className={`px-2.5 py-1 text-xs font-mono-tabular rounded border cursor-pointer ${
                      chatRoom === r
                        ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                        : 'border-white/10 bg-[#0c1017] text-slate-400'
                    }`}
                  >
                    #{r}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleSend(true)}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 rounded-lg cursor-pointer"
              >
                Acionar Resposta Agente {profile.handleAt}
              </button>
            </div>

            <div className="h-72 overflow-y-auto space-y-2 p-3 bg-[#090d14] border border-white/8 rounded-lg">
              {chatMessages
                .filter((m) => m.room === chatRoom || chatRoom === 'geral')
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 bg-[#111620] border border-white/8 rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                      <span className={m.isAgent ? 'text-emerald-300 font-semibold' : 'text-sky-300 font-semibold'}>
                        {m.senderName} · {ECOSYSTEM_ROLE_DEFINITIONS[m.senderRole]?.shortTag ?? m.senderRole}
                      </span>
                      <span className="text-slate-500">{m.vucHash.slice(0, 14)}</span>
                    </div>
                    <p className="text-xs text-slate-200">{m.content}</p>
                  </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder={`Enviar em #${chatRoom} (use @cam ou @vuc para resposta técnica automática)...`}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSend(false, false);
                }}
                className="flex-1 min-w-[200px] px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => void handleSend(false, true)}
                className="px-3 py-2 text-xs font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 rounded-lg hover:bg-emerald-500/25 flex items-center gap-1.5 cursor-pointer"
                title="Envia pergunta e aciona o Agente Orquestrador CAM com prova VUC na sala"
              >
                <Send className="w-3.5 h-3.5" />
                Perguntar Agente CAM
              </button>
              <button
                type="button"
                onClick={() => void handleSend(false, false)}
                className="px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
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

        {/* 3. Open Free ERP & CRM */}
        {subTab === 'erp' && (
          <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">Pipeline ERP Total</div>
                <div className="font-mono-tabular text-base font-bold text-emerald-300">
                  R$ {erpStats.totalPipelineBrl.toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">Ordens Abertas</div>
                <div className="font-mono-tabular text-base font-bold text-sky-300">
                  {erpStats.openOrders}
                </div>
              </div>
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">Entregadores Ativos</div>
                <div className="font-mono-tabular text-base font-bold text-amber-300">
                  {erpStats.activeCouriers}
                </div>
              </div>
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
                <div className="text-slate-500">Licença ERP / CRM</div>
                <div className="font-mono-tabular text-base font-bold text-slate-100">
                  Open / Free
                </div>
              </div>
            </div>

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
                placeholder="Parceiro / Cliente / Foxconn..."
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
                    segment: 'industrial-cnc',
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
                      <td className="py-2 pr-3 font-mono-tabular uppercase text-sky-300">{r.kind}</td>
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

            {/* Saved Endpoints Grid + Dispatch + MQTT Ping */}
            <div className="bg-[#111620] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="text-xs text-slate-400">
                Conecte e despache o pós-processado (.NC / .SRC / SLM / SLA) diretamente para os endpoints cadastrados com assinatura VUC e retorno em tempo real via MQTT.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {remoteMachines.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 bg-[#0c1017] border border-white/10 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-slate-100 truncate">{m.name}</span>
                      <span className="font-mono-tabular text-[11px] text-emerald-400 shrink-0">
                        {m.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-slate-300 truncate">
                      {m.protocol} · {m.endpointUrl}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-slate-400 flex items-center justify-between gap-2">
                      <span className="truncate">
                        {m.mqttEnabled
                          ? `MQTT (QoS ${m.mqttQos ?? 1}): ${m.mqttTopic || 'tópico padrão'}`
                          : 'MQTT: desativado'}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0">{m.machineType}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/8">
                      <span className="text-[10px] font-mono-tabular text-slate-500 truncate max-w-[160px]">
                        {m.lastJobVuc}
                      </span>
                      <div className="flex items-center gap-1.5">
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
                ))}
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
