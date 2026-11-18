import React from 'react';
import { Download, Pause, Play, RotateCcw, Wrench } from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { CAM_TOOLS } from '../kernel/camRobotics';
import type {
  CamSettings,
  CamStrategy,
  MachineType,
  PostProcessorFormat,
  ToolpathResult,
} from '../types/cad';

interface CamRoboticsPanelProps {
  settings: CamSettings;
  onChangeSettings: (patch: Partial<CamSettings>) => void;
  toolpath: ToolpathResult;
  simPlaying: boolean;
  simProgress: number;
  onTogglePlay: () => void;
  onScrub: (next: number) => void;
  showToolpath: boolean;
  showMachine: boolean;
  onToggleToolpath: () => void;
  onToggleMachine: () => void;
}

const MACHINE_OPTIONS: { id: MachineType; label: string; defaultPost: PostProcessorFormat }[] = [
  { id: 'manual', label: 'Usinagem Manual', defaultPost: 'manual-sheet' },
  { id: 'cnc-3axis', label: 'CNC 3-Eixos', defaultPost: 'fanuc-nc' },
  { id: 'cnc-5axis', label: 'CNC 5-Eixos', defaultPost: 'fanuc-nc' },
  { id: 'robot-6axis', label: 'Robô 6-Eixos', defaultPost: 'kuka-krl' },
];

export const CamRoboticsPanel: React.FC<CamRoboticsPanelProps> = ({
  settings,
  onChangeSettings,
  toolpath,
  simPlaying,
  simProgress,
  onTogglePlay,
  onScrub,
  showToolpath,
  showMachine,
  onToggleToolpath,
  onToggleMachine,
}) => {
  const activeTool = CAM_TOOLS.find((t) => t.id === settings.toolId) ?? CAM_TOOLS[0];

  const handleDownloadProgram = () => {
    const extMap: Record<PostProcessorFormat, string> = {
      'fanuc-nc': 'nc',
      'grbl-gcode': 'gcode',
      'kuka-krl': 'src',
      'abb-rapid': 'mod',
      'manual-sheet': 'txt',
    };
    const blob = new Blob([toolpath.postCode], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, `parametrix_usinagem.${extMap[settings.postFormat]}`);
  };

  return (
    <div className="w-[380px] h-full border-r border-white/10 bg-[#111620] flex flex-col shrink-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-sm font-semibold text-slate-100">
            CAM, Ferramentas & Robótica
          </h2>
        </div>
        <span className="text-[11px] font-mono-tabular text-emerald-400">
          {toolpath.estimatedMinutes.toFixed(1)} min
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Machine Mode Selector */}
        <section className="space-y-2">
          <div className="text-xs font-medium text-slate-400">Processo de Fabricação</div>
          <div className="grid grid-cols-2 gap-1.5">
            {MACHINE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  onChangeSettings({
                    machineType: m.id,
                    postFormat: m.defaultPost,
                  })
                }
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors text-left cursor-pointer ${
                  settings.machineType === m.id
                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                    : 'border-white/8 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
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
          <div className="text-xs font-medium text-slate-400">Estratégia & Regime de Corte</div>
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

          {/* Real Calculated Machining Metrics */}
          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#0c1017] border border-white/8 rounded-lg text-xs">
            <div>
              <div className="text-[10px] text-slate-500">Rotação Eixo</div>
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
              <div className="text-[10px] text-slate-500">Percurso de Corte</div>
              <div className="font-mono-tabular text-emerald-400">
                {toolpath.cuttingLengthMm.toLocaleString('pt-BR')} mm
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Volume Removido</div>
              <div className="font-mono-tabular text-sky-400">
                {toolpath.removedVolumeCm3} cm³
              </div>
            </div>
          </div>
        </section>

        {/* Simulation Playback Controls */}
        <section className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-400">Simulação Cinemática 3D</span>
            <span className="font-mono-tabular text-slate-300">
              {Math.round(simProgress * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              title="Reiniciar"
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
              Cabeçote
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

        {/* Post-Processor Code / Manual Sheet Output */}
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
              <option value="fanuc-nc">ISO G-Code (Fanuc / Mach3 .nc)</option>
              <option value="grbl-gcode">GRBL / LinuxCNC (.gcode)</option>
              <option value="kuka-krl">Robô KUKA KRL (.src)</option>
              <option value="abb-rapid">Robô ABB RAPID (.mod)</option>
              <option value="manual-sheet">Folha de Usinagem Manual / DRO</option>
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
