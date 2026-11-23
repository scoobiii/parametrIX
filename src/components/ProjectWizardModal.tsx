import React, { useEffect, useState } from 'react';
import { Activity, Box, Cpu, Sparkles, X } from 'lucide-react';
import type {
  ApplicationSegment,
  CamStrategy,
  EngineeringArea,
  FeaLoadPattern,
  FeaSettings,
  FeaSupportMode,
  MachineType,
  MaterialFinish,
  ParametricDesignParams,
  PresetId,
} from '../types/cad';

export interface AreaWizardSubmission {
  area: EngineeringArea;
  name: string;
  segment: ApplicationSegment;
  machineType: MachineType;
  camStrategy: CamStrategy;
  materialFinish: MaterialFinish;
  designParamsPatch: Partial<ParametricDesignParams>;
  feaSettingsPatch: Partial<FeaSettings>;
  presetIdToLoad?: string;
  startCamImmediately: boolean;
  activateHeatmap: boolean;
}

interface ProjectWizardModalProps {
  open: boolean;
  initialArea?: EngineeringArea;
  onClose: () => void;
  onCreateProject: (config: AreaWizardSubmission) => void;
}

const ARCHETYPE_OPTIONS: {
  id: string;
  label: string;
  segment: ApplicationSegment;
  preset: PresetId;
  machineType: MachineType;
  material: MaterialFinish;
  presetId?: string;
}[] = [
  {
    id: 'rack-frostbite',
    label: 'Rack #FrostbiteEngine 1 MW / 800 VDC HVAC',
    segment: 'robotica',
    preset: 'diagrid',
    machineType: 'robot-weld',
    material: 'aluminum',
    presetId: 'preset-frostbite-rack',
  },
  {
    id: 'soc-hybrid',
    label: 'Chip / SoC Silício + Óptico Híbrido',
    segment: 'aeroespacial',
    preset: 'cavity',
    machineType: 'laser-cut',
    material: 'glass',
    presetId: 'preset-soc-hybrid',
  },
  {
    id: 'metal-powder',
    label: 'Peça Titânio — Impressão Pó Metálico (LPBF)',
    segment: 'aeroespacial',
    preset: 'shell',
    machineType: 'powder-metal',
    material: 'titanium',
  },
  {
    id: 'resin-sla',
    label: 'Prototipagem Óptica — Resina UV (SLA)',
    segment: 'medico',
    preset: 'cavity',
    machineType: 'resin-sla',
    material: 'matte-plastic',
  },
  {
    id: 'nurbs-custom',
    label: 'Casca NURBS / CNC Paramétrica do Zero',
    segment: 'industrial-cnc',
    preset: 'impeller',
    machineType: 'cnc-5axis',
    material: 'carbon-fiber',
  },
];

const AREA_META: Record<
  EngineeringArea,
  { label: string; subtitle: string; submitLabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  cad: {
    label: 'CAD · Geometria',
    subtitle: 'Cria/reinicia geometria NURBS, vãos e segmento sem alterar o setup de máquina CAM.',
    submitLabel: 'Gerar Nova Geometria CAD + Prova VUC',
    icon: Box,
  },
  cae: {
    label: 'CAE · FEA & Fadiga',
    subtitle: 'Inicia novo caso de carga estrutural, apoios e fator de segurança sem perder a geometria CAD.',
    submitLabel: 'Iniciar Novo Estudo CAE + Mapa FEA',
    icon: Activity,
  },
  cam: {
    label: 'CAM · Produção',
    subtitle: 'Configura novo job de máquina CNC/Aditiva/Robô mantendo a peça CAD atual intacta.',
    submitLabel: 'Criar & Iniciar Processo CAM + Prova VUC',
    icon: Cpu,
  },
};

export const ProjectWizardModal: React.FC<ProjectWizardModalProps> = ({
  open,
  initialArea = 'cad',
  onClose,
  onCreateProject,
}) => {
  const [area, setArea] = useState<EngineeringArea>(initialArea);
  const [name, setName] = useState('Projeto Engenharia Zero-VUC');
  const [archetypeIdx, setArchetypeIdx] = useState(4);
  const [spanX, setSpanX] = useState(210);
  const [spanY, setSpanY] = useState(145);
  const [archHeight, setArchHeight] = useState(48);
  const [thicknessMm, setThicknessMm] = useState(6);

  // CAE scoped controls
  const [caeLoadN, setCaeLoadN] = useState(4200);
  const [caeSupport, setCaeSupport] = useState<FeaSupportMode>('edge-clamped');
  const [caePattern, setCaePattern] = useState<FeaLoadPattern>('center-point');
  const [caeTargetSf, setCaeTargetSf] = useState(2.2);
  const [activateHeatmap, setActivateHeatmap] = useState(true);

  // CAM scoped controls
  const [camMachine, setCamMachine] = useState<MachineType>('cnc-5axis');
  const [camStrategy, setCamStrategy] = useState<CamStrategy>('contour');
  const [startCam, setStartCam] = useState(true);

  useEffect(() => {
    if (open) {
      setArea(initialArea);
    }
  }, [open, initialArea]);

  if (!open) return null;
  const chosen = ARCHETYPE_OPTIONS[archetypeIdx];
  const areaMeta = AREA_META[area];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-[#111620] border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <h3 className="font-display text-base font-bold text-slate-100">
              Assistente por Área — Novo Projeto ({area.toUpperCase()})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Specific Engineering Area Switcher */}
          <div className="grid grid-cols-3 gap-1.5">
            {(['cad', 'cae', 'cam'] as EngineeringArea[]).map((a) => {
              const Icon = AREA_META[a].icon;
              const active = area === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  className={`min-h-[40px] px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-white/10 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{AREA_META[a].label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed bg-[#0c1017] border border-white/8 rounded-lg p-2.5">
            {areaMeta.subtitle}
          </p>

          {area === 'cad' && (
            <>
              <div>
                <label className="block text-slate-400 mb-1">Nome da Peça / Projeto CAD</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400">Classe / Arquitetura CAD</label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {ARCHETYPE_OPTIONS.map((opt, idx) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setArchetypeIdx(idx)}
                      className={`w-full px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        archetypeIdx === idx
                          ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                          : 'border-white/10 bg-[#0c1017] text-slate-300'
                      }`}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                        {opt.segment} · Material: {opt.material}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Vão X</span>
                    <span className="font-mono-tabular text-slate-100">{spanX} mm</span>
                  </div>
                  <input
                    type="range"
                    className="cad-slider w-full"
                    min={100}
                    max={300}
                    step={5}
                    value={spanX}
                    onChange={(e) => setSpanX(parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Vão Y</span>
                    <span className="font-mono-tabular text-slate-100">{spanY} mm</span>
                  </div>
                  <input
                    type="range"
                    className="cad-slider w-full"
                    min={80}
                    max={240}
                    step={5}
                    value={spanY}
                    onChange={(e) => setSpanY(parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Altura Z</span>
                    <span className="font-mono-tabular text-slate-100">{archHeight} mm</span>
                  </div>
                  <input
                    type="range"
                    className="cad-slider w-full"
                    min={12}
                    max={100}
                    step={2}
                    value={archHeight}
                    onChange={(e) => setArchHeight(parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Espessura</span>
                    <span className="font-mono-tabular text-slate-100">{thicknessMm} mm</span>
                  </div>
                  <input
                    type="range"
                    className="cad-slider w-full"
                    min={2}
                    max={18}
                    step={0.5}
                    value={thicknessMm}
                    onChange={(e) => setThicknessMm(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}

          {area === 'cae' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Carga Estrutural do Estudo CAE</span>
                  <span className="font-mono-tabular text-sky-300">{caeLoadN} N</span>
                </div>
                <input
                  type="range"
                  className="cad-slider w-full"
                  min={500}
                  max={25000}
                  step={250}
                  value={caeLoadN}
                  onChange={(e) => setCaeLoadN(parseInt(e.target.value, 10))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Condição de Apoio</label>
                  <select
                    value={caeSupport}
                    onChange={(e) => setCaeSupport(e.target.value as FeaSupportMode)}
                    className="w-full px-2.5 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                  >
                    <option value="edge-clamped">Engaste na Borda</option>
                    <option value="four-corner-pins">4 Pinos / Coroa</option>
                    <option value="cantilever-u">Balanço em U</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Padrão de Carga</label>
                  <select
                    value={caePattern}
                    onChange={(e) => setCaePattern(e.target.value as FeaLoadPattern)}
                    className="w-full px-2.5 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                  >
                    <option value="center-point">Carga Concentrada Central</option>
                    <option value="uniform-pressure">Pressão Uniforme</option>
                    <option value="torsion-tip">Torção / Impacto Ponta</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Fator de Segurança Alvo (SF)</span>
                  <span className="font-mono-tabular text-emerald-300">{caeTargetSf.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  className="cad-slider w-full"
                  min={1.2}
                  max={4.5}
                  step={0.1}
                  value={caeTargetSf}
                  onChange={(e) => setCaeTargetSf(parseFloat(e.target.value))}
                />
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activateHeatmap}
                  onChange={(e) => setActivateHeatmap(e.target.checked)}
                  className="accent-sky-400"
                />
                Exibir Mapa de Calor de Estresse Von Mises no Viewport 3D após criar estudo
              </label>
            </div>
          )}

          {area === 'cam' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Processo / Máquina CAM Alvo</label>
                <select
                  value={camMachine}
                  onChange={(e) => setCamMachine(e.target.value as MachineType)}
                  className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                >
                  <option value="cnc-5axis">CNC 5-Eixos Simultâneo (Troca ATC)</option>
                  <option value="cnc-3axis">Fresadora CNC 3-Eixos</option>
                  <option value="powder-metal">Impressão 3D Pó Metálico (LPBF)</option>
                  <option value="resin-sla">Impressão 3D Resina UV (SLA)</option>
                  <option value="robot-6axis">Robô KUKA 6-Eixos (KRL)</option>
                  <option value="robot-weld">Robô Solda MIG/TIG (Fio & Arco)</option>
                  <option value="laser-cut">Corte / Sinterização Laser 4 kW</option>
                  <option value="manual">Usinagem Manual (Folha DRO)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Estratégia de Trajetória</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['contour', 'Contorno'],
                      ['isoparm', 'Isoparm UV'],
                      ['raster', 'Varredura Z'],
                    ] as [CamStrategy, string][]
                  ).map(([strat, label]) => (
                    <button
                      key={strat}
                      type="button"
                      onClick={() => setCamStrategy(strat)}
                      className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        camStrategy === strat
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-[#0c1017] text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={startCam}
                  onChange={(e) => setStartCam(e.target.checked)}
                  className="accent-amber-400"
                />
                Iniciar simulação CAM do zero (0%) com máquina e feixe/ferramenta visíveis
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onCreateProject({
                area,
                name,
                segment: chosen.segment,
                machineType: area === 'cam' ? camMachine : chosen.machineType,
                camStrategy,
                materialFinish: chosen.material,
                designParamsPatch: {
                  preset: chosen.preset,
                  spanX,
                  spanY,
                  archHeight,
                  thicknessMm,
                },
                feaSettingsPatch: {
                  loadNewtons: caeLoadN,
                  supportMode: caeSupport,
                  loadPattern: caePattern,
                  targetSafetyFactor: caeTargetSf,
                },
                presetIdToLoad: area === 'cad' ? chosen.presetId : undefined,
                startCamImmediately: area === 'cam' && startCam,
                activateHeatmap: area === 'cae' && activateHeatmap,
              });
              onClose();
            }}
            className="w-full min-h-[42px] px-4 py-2 font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors cursor-pointer"
          >
            {areaMeta.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
