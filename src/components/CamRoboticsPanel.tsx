import React, { useMemo, useState } from 'react';
import {
  Bot,
  Cpu,
  Download,
  ExternalLink,
  FileCode2,
  Globe,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  Wrench,
} from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { listCamProductionPrograms } from '../kernel/camProcessEngine';
import { CAM_TOOLS, getDefaultAdditiveSettings } from '../kernel/camRobotics';
import { AdditiveCamConfigPanel } from './AdditiveCamConfigPanel';
import type {
  CamProcessVisualState,
  CamProgramTargetCategory,
  CamServiceJob,
  CamServiceSourceKind,
  CamSettings,
  CamStrategy,
  MachineType,
  PostProcessorFormat,
  RemoteMachineTarget,
  ToolpathResult,
} from '../types/cad';

export interface CamServiceSubmissionInput {
  sourceKind: CamServiceSourceKind;
  title?: string;
  programId?: string;
  targetCategory?: CamProgramTargetCategory;
  filename?: string;
  fileText?: string;
  base64Data?: string;
  url?: string;
  machineType?: MachineType;
}

interface CamRoboticsPanelProps {
  settings: CamSettings;
  onChangeSettings: (patch: Partial<CamSettings>) => void;
  toolpath: ToolpathResult;
  simPlaying: boolean;
  simProgress: number;
  onTogglePlay: () => void;
  onScrub: (next: number) => void;
  onRestartProcess: () => void;
  showToolpath: boolean;
  showMachine: boolean;
  onToggleToolpath: () => void;
  onToggleMachine: () => void;
  camVisualState: CamProcessVisualState;
  remoteMachines?: RemoteMachineTarget[];
  onDispatchRemoteMachine?: (machineId: string) => Promise<void>;
  camServiceJobs?: CamServiceJob[];
  onLaunchProgram?: (programId: string) => void;
  onSubmitCamService?: (payload: CamServiceSubmissionInput) => Promise<void>;
  onRestartServiceJob?: (jobId: string) => Promise<void>;
}

const MACHINE_OPTIONS: {
  id: MachineType;
  label: string;
  subtitle: string;
  defaultPost: PostProcessorFormat;
}[] = [
  { id: 'powder-metal', label: 'Pó Metálico (LPBF)', subtitle: 'Laser + Recoater', defaultPost: 'slm-powder' },
  { id: 'resin-sla', label: 'Resina UV (SLA)', subtitle: 'Feixe UV 405nm', defaultPost: 'sla-resin' },
  { id: 'robot-weld', label: 'Robô Solda MIG/TIG', subtitle: 'Fio + Arco Visíveis', defaultPost: 'weld-tig-mig' },
  { id: 'laser-cut', label: 'Laser Fibra 4 kW', subtitle: 'Raio + Rota', defaultPost: 'laser-g' },
  { id: 'cnc-5axis', label: 'CNC 5-Eixos', subtitle: 'Troca ATC', defaultPost: 'fanuc-nc' },
  { id: 'cnc-3axis', label: 'CNC 3-Eixos', subtitle: 'Fresagem Padrão', defaultPost: 'fanuc-nc' },
  { id: 'robot-6axis', label: 'Robô 6-Eixos KUKA', subtitle: 'Cinemática KRL', defaultPost: 'kuka-krl' },
  { id: 'manual', label: 'Usinagem Manual', subtitle: 'Folha DRO', defaultPost: 'manual-sheet' },
];

export const CamRoboticsPanel: React.FC<CamRoboticsPanelProps> = ({
  settings,
  onChangeSettings,
  toolpath,
  simPlaying,
  simProgress,
  onTogglePlay,
  onScrub,
  onRestartProcess,
  showToolpath,
  showMachine,
  onToggleToolpath,
  onToggleMachine,
  camVisualState,
  remoteMachines = [],
  onDispatchRemoteMachine,
  camServiceJobs = [],
  onLaunchProgram,
  onSubmitCamService,
  onRestartServiceJob,
}) => {
  const activeTool = CAM_TOOLS.find((t) => t.id === settings.toolId) ?? CAM_TOOLS[0];
  const [progCategory, setProgCategory] = useState<CamProgramTargetCategory>('datacenter');
  const [srvSource, setSrvSource] = useState<CamServiceSourceKind>('file');
  const [srvTitle, setSrvTitle] = useState('Ordem CAM Externa Liquid Cooling');
  const [srvUrl, setSrvUrl] = useState('https://example.com/peca-datacenter.step');
  const [srvBusy, setSrvBusy] = useState(false);
  const [srvError, setSrvError] = useState<string | null>(null);

  const productionPrograms = useMemo(
    () => listCamProductionPrograms(progCategory),
    [progCategory]
  );

  const handleServiceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSubmitCamService) return;
    setSrvBusy(true);
    setSrvError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64Data = btoa(binary);
      const isTextLike = /\.(stl|obj|dxf|step|stp|ifc|svg|nc|gcode)$/i.test(file.name);
      const fileText = isTextLike ? new TextDecoder().decode(bytes.slice(0, 65536)) : undefined;
      await onSubmitCamService({
        sourceKind: 'file',
        title: `Upload CAM: ${file.name}`,
        targetCategory: progCategory,
        filename: file.name,
        base64Data,
        fileText,
        machineType: settings.machineType,
      });
    } catch (err) {
      setSrvError(err instanceof Error ? err.message : 'Falha ao enviar arquivo para serviço CAM.');
    } finally {
      setSrvBusy(false);
      e.target.value = '';
    }
  };

  const handleServiceUrlOrApiSubmit = async () => {
    if (!onSubmitCamService) return;
    setSrvBusy(true);
    setSrvError(null);
    try {
      await onSubmitCamService({
        sourceKind: srvSource,
        title: srvTitle.trim() || undefined,
        url: srvSource === 'url' ? srvUrl.trim() : undefined,
        targetCategory: progCategory,
        machineType: settings.machineType,
      });
    } catch (err) {
      setSrvError(err instanceof Error ? err.message : 'Falha ao enviar ordem CAM.');
    } finally {
      setSrvBusy(false);
    }
  };

  const handleDownloadProgram = () => {
    const extMap: Record<PostProcessorFormat, string> = {
      'fanuc-nc': 'nc',
      'grbl-gcode': 'gcode',
      'kuka-krl': 'src',
      'abb-rapid': 'mod',
      'manual-sheet': 'txt',
      'slm-powder': 'slm.nc',
      'sla-resin': 'sla.gcode',
      'weld-tig-mig': 'weld.src',
      'laser-g': 'laser.nc',
    };
    const blob = new Blob([toolpath.postCode], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, `parametrix_cam.${extMap[settings.postFormat]}`);
  };

  return (
    <div className="w-full md:w-[375px] lg:w-[425px] h-full border-r border-white/10 bg-[#111620] flex flex-col shrink-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="font-display text-sm font-semibold text-slate-100 truncate">
            CAM, Troca ATC & Robótica
          </h2>
        </div>
        <span className="text-[11px] font-mono-tabular text-emerald-400 shrink-0">
          {toolpath.estimatedMinutes.toFixed(1)} min
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Restart CAM + VUC Proof Banner */}
        <div className="p-3 bg-[#0c1017] border border-amber-400/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono-tabular text-amber-300 font-semibold">
              Reinício CAM #{camVisualState.restartCount} · {camVisualState.activeToolEvent.toolNumber}
            </span>
            <span className="text-[10px] font-mono-tabular text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              {camVisualState.vucProof.vucHash.slice(0, 12)}
            </span>
          </div>
          <button
            type="button"
            onClick={onRestartProcess}
            className="w-full min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar Processo Produtivo CAM (Zero + VUC)
          </button>
        </div>

        {/* Machine Mode Selector (8 Processes) */}
        <section className="space-y-2">
          <div className="text-xs font-medium text-slate-400">
            Processo Produtivo (CNC, Pó Metálico, Resina, Solda, Laser)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MACHINE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  onChangeSettings({
                    machineType: m.id,
                    postFormat: m.defaultPost,
                    ...(m.id === 'powder-metal' || m.id === 'resin-sla'
                      ? { additiveConfig: getDefaultAdditiveSettings(m.id) }
                      : {}),
                  })
                }
                className={`min-h-[46px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors text-left cursor-pointer ${
                  settings.machineType === m.id
                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-100'
                    : 'border-white/8 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="truncate font-semibold">{m.label}</div>
                <div className="text-[10px] text-slate-500 truncate">{m.subtitle}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Dedicated Additive Manufacturing Config Panel (Powder Metal vs SLA Resin + Supports + Sintering) */}
        <AdditiveCamConfigPanel
          settings={settings}
          onChangeSettings={onChangeSettings}
          toolpath={toolpath}
        />

        {/* Datacenter & Humanoid Robot Pre-Programmed CAM Processes */}
        {onLaunchProgram && (
          <section className="space-y-2.5 pt-3 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Programas CAM · Datacenter & Humanoides
              </span>
              <div className="flex gap-1 bg-[#0c1017] p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setProgCategory('datacenter')}
                  className={`px-2 py-1 text-[10px] font-semibold rounded flex items-center gap-1 cursor-pointer ${
                    progCategory === 'datacenter'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  Datacenter
                </button>
                <button
                  type="button"
                  onClick={() => setProgCategory('humanoid')}
                  className={`px-2 py-1 text-[10px] font-semibold rounded flex items-center gap-1 cursor-pointer ${
                    progCategory === 'humanoid'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bot className="w-3 h-3" />
                  Humanoides
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {productionPrograms.map((prog) => (
                <div
                  key={prog.id}
                  className="p-2.5 bg-[#0c1017] border border-white/10 rounded-lg flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">{prog.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {prog.subsystem} · {prog.machineType} · {prog.estimatedCycleMin} min
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLaunchProgram(prog.id)}
                    className="px-2 py-1.5 text-[10px] font-semibold bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reiniciar 0→100%
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CAM Service Ingestion (Upload, URL, API + Swagger Docs) */}
        {onSubmitCamService && (
          <section className="space-y-2.5 pt-3 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Serviços CAM (Upload, URL, API)
              </span>
              <a
                href="/swagger"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Swagger UI
              </a>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0c1017] border border-white/10 rounded-lg text-[11px]">
              {(
                [
                  { id: 'file', label: 'Upload', icon: Upload },
                  { id: 'url', label: 'URL', icon: Globe },
                  { id: 'api', label: 'API JSON', icon: FileCode2 },
                ] as const
              ).map((src) => {
                const Icon = src.icon;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSrvSource(src.id)}
                    className={`py-1.5 rounded flex items-center justify-center gap-1 font-medium cursor-pointer ${
                      srvSource === src.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {src.label}
                  </button>
                );
              })}
            </div>

            {srvSource === 'file' ? (
              <label className="w-full min-h-[40px] px-3 py-2 bg-[#0c1017] border border-dashed border-sky-400/45 hover:border-sky-300 rounded-lg text-xs text-sky-200 flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{srvBusy ? 'Processando arquivo CAM...' : 'Enviar .STEP / .IPT / .STL / .DXF'}</span>
                <input
                  type="file"
                  accept=".step,.stp,.ipt,.stl,.obj,.dxf,.3dm,.svg"
                  onChange={handleServiceFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={srvTitle}
                  onChange={(e) => setSrvTitle(e.target.value)}
                  placeholder="Título da ordem CAM"
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none"
                />
                {srvSource === 'url' && (
                  <input
                    type="url"
                    value={srvUrl}
                    onChange={(e) => setSrvUrl(e.target.value)}
                    placeholder="https://servidor/peca.step"
                    className="w-full px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none"
                  />
                )}
                <button
                  type="button"
                  disabled={srvBusy}
                  onClick={() => void handleServiceUrlOrApiSubmit()}
                  className="w-full min-h-[34px] px-3 py-1.5 text-xs font-semibold bg-amber-500/20 border border-amber-400/45 text-amber-200 hover:bg-amber-500/30 rounded-lg cursor-pointer"
                >
                  {srvBusy ? 'Gerando Toolpath + VUC...' : 'Criar Serviço CAM & Gerar VUC'}
                </button>
              </div>
            )}

            {srvError && <div className="text-[11px] text-rose-400">{srvError}</div>}

            {camServiceJobs.length > 0 && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                {camServiceJobs.slice(0, 6).map((job) => (
                  <div
                    key={job.id}
                    className="p-2.5 bg-[#0c1017] border border-white/10 rounded-lg space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100 truncate">{job.title}</span>
                      <span className="text-[10px] font-mono-tabular text-emerald-400 shrink-0">
                        {job.status} #{job.restartCount}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {job.sourceKind} · {job.machineType} · {job.geometrySummary}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] font-mono-tabular text-slate-500 truncate">
                        {job.vucHash.slice(0, 18)}...
                      </span>
                      {onRestartServiceJob && (
                        <button
                          type="button"
                          onClick={() => void onRestartServiceJob(job.id)}
                          className="px-2 py-1 text-[10px] font-semibold bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25 rounded flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reiniciar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Live ATC Tool Change Sequence */}
        <section className="space-y-2 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-400">Troca de Ferramentas em Tempo Real</span>
            <span className="font-mono-tabular text-sky-400">
              {camVisualState.activeToolEvent.toolNumber} ativo
            </span>
          </div>
          <div className="space-y-1.5">
            {camVisualState.toolChanges.map((tc) => {
              const isCurrent = tc.toolNumber === camVisualState.activeToolEvent.toolNumber;
              return (
                <button
                  key={tc.toolNumber}
                  type="button"
                  onClick={() => onScrub(tc.atProgress)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'border-emerald-400/60 bg-emerald-500/12 text-slate-100'
                      : 'border-white/8 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="truncate">
                      {tc.toolNumber} · {tc.toolName}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-sky-400 shrink-0 ml-2">
                      {Math.round(tc.atProgress * 100)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{tc.operationLabel}</div>
                  <div className="text-[10px] font-mono-tabular text-slate-500 mt-0.5">
                    {tc.rpmOrPowerLabel} · {tc.toolKind}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tool Library Selection */}
        <section className="space-y-2 pt-3 border-t border-white/8">
          <div className="text-xs font-medium text-slate-400">Biblioteca de Ferramentas</div>
          <div className="space-y-1.5">
            {CAM_TOOLS.map((tool) => {
              const selected = tool.id === settings.toolId;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onChangeSettings({ toolId: tool.id })}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selected
                      ? 'border-sky-400/70 bg-sky-500/12 text-slate-100'
                      : 'border-white/8 bg-[#0c1017] text-slate-300 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="truncate">{tool.name}</span>
                    <span className="font-mono-tabular text-sky-400 shrink-0 ml-2">
                      Ø{tool.diameterMm}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {tool.flutes} cortes · Vc {tool.recommendedVc} m/min · {tool.material}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Strategy & Cutting Params */}
        <section className="space-y-3 pt-3 border-t border-white/8">
          <div className="text-xs font-medium text-slate-400">Estratégia & Regime</div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#0c1017] border border-white/8 rounded-lg">
            {(
              [
                { id: 'raster', label: 'Paralelo' },
                { id: 'isoparm', label: 'NURBS UV' },
                { id: 'contour', label: 'Contorno' },
              ] as { id: CamStrategy; label: string }[]
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onChangeSettings({ strategy: st.id })}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  settings.strategy === st.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Passo Lateral (Stepover)</span>
              <span className="font-mono-tabular text-slate-200">
                {settings.stepoverPct}% (
                {((activeTool.diameterMm * settings.stepoverPct) / 100).toFixed(1)} mm)
              </span>
            </div>
            <input
              type="range"
              className="cad-slider w-full"
              min={10}
              max={60}
              step={2}
              value={settings.stepoverPct}
              onChange={(e) => onChangeSettings({ stepoverPct: parseInt(e.target.value, 10) })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Sobremetal Acabamento</span>
              <span className="font-mono-tabular text-slate-200">
                {settings.stockMarginMm.toFixed(1)} mm
              </span>
            </div>
            <input
              type="range"
              className="cad-slider w-full"
              min={0}
              max={4}
              step={0.2}
              value={settings.stockMarginMm}
              onChange={(e) =>
                onChangeSettings({ stockMarginMm: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#0c1017] border border-white/8 rounded-lg text-xs">
            <div>
              <div className="text-[10px] text-slate-500">Rotação / Potência</div>
              <div className="font-mono-tabular text-slate-100">
                {toolpath.spindleRpm.toLocaleString('pt-BR')} RPM
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Avanço Programado</div>
              <div className="font-mono-tabular text-slate-100">
                {toolpath.feedRateMmMin} mm/min
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Percurso Ativo</div>
              <div className="font-mono-tabular text-emerald-400">
                {toolpath.cuttingLengthMm.toLocaleString('pt-BR')} mm
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Volume / Depósito</div>
              <div className="font-mono-tabular text-sky-400">
                {toolpath.removedVolumeCm3} cm³
              </div>
            </div>
          </div>
        </section>

        {/* Simulation Playback Controls */}
        <section className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-400">Simulação Cinemática & Feixes 3D</span>
            <span className="font-mono-tabular text-slate-300">
              {Math.round(simProgress * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              {simPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {simPlaying ? 'Pausar' : 'Simular'}
            </button>
            <button
              type="button"
              onClick={() => onScrub(0)}
              className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white cursor-pointer"
              title="Zerar barra"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleToolpath}
              className={`px-2 py-1.5 text-[11px] rounded-lg border cursor-pointer ${
                showToolpath
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 text-slate-400'
              }`}
            >
              Trajetória
            </button>
            <button
              type="button"
              onClick={onToggleMachine}
              className={`px-2 py-1.5 text-[11px] rounded-lg border cursor-pointer ${
                showMachine
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-white/10 text-slate-400'
              }`}
            >
              Cabeçote / Feixe
            </button>
          </div>

          <input
            type="range"
            className="cad-slider w-full"
            min={0}
            max={1}
            step={0.005}
            value={simProgress}
            onChange={(e) => onScrub(parseFloat(e.target.value))}
          />
        </section>

        {/* Remote Machine Execution */}
        {remoteMachines.length > 0 && onDispatchRemoteMachine && (
          <section className="space-y-2 pt-3 border-t border-white/8">
            <div className="text-xs font-medium text-slate-400">
              Execução em Máquina Remota (OPC-UA / KUKA / Moonraker)
            </div>
            <div className="space-y-1.5">
              {remoteMachines.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 bg-[#0c1017] border border-white/10 rounded-lg flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">{m.name}</div>
                    <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                      {m.protocol} · {m.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDispatchRemoteMachine(m.id)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    Enviar
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Post-Processor Code Output */}
        <section className="space-y-2 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between gap-2">
            <select
              aria-label="Formato de Pós-Processador"
              value={settings.postFormat}
              onChange={(e) =>
                onChangeSettings({ postFormat: e.target.value as PostProcessorFormat })
              }
              className="flex-1 px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-200 outline-none cursor-pointer"
            >
              <option value="slm-powder">LPBF Pó Metálico (.slm.nc)</option>
              <option value="sla-resin">SLA Resina UV (.sla.gcode)</option>
              <option value="weld-tig-mig">Robô Solda MIG/TIG (.weld.src)</option>
              <option value="laser-g">Laser Fibra 4kW (.laser.nc)</option>
              <option value="fanuc-nc">ISO G-Code Fanuc (.nc)</option>
              <option value="grbl-gcode">GRBL / LinuxCNC (.gcode)</option>
              <option value="kuka-krl">Robô KUKA KRL (.src)</option>
              <option value="abb-rapid">Robô ABB RAPID (.mod)</option>
              <option value="manual-sheet">Folha Manual / DRO (.txt)</option>
            </select>

            <button
              type="button"
              onClick={handleDownloadProgram}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-sky-500/15 border border-sky-400/40 text-sky-300 hover:bg-sky-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar
            </button>
          </div>

          <pre className="p-3 bg-[#090c11] border border-white/8 rounded-lg text-[11px] font-mono-tabular text-slate-300 max-h-56 overflow-auto leading-relaxed">
            {toolpath.postCode}
          </pre>
        </section>
      </div>
    </div>
  );
};
