import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Box,
  CheckCircle2,
  Cpu,
  Factory,
  Gauge,
  History,
  Leaf,
  Recycle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { calculateCarbonFootprint } from '../kernel/carbonFootprint';
import {
  evaluateComponentFatigueCycles,
  type CyclicLoadRatio,
  type FatigueRegime,
} from '../kernel/fatigueAnalysis';
import { FatigueCyclesChartD3 } from './FatigueCyclesChartD3';
import { AgentHarnessDock, type AgentHarnessDockProps } from './AgentHarnessDock';
import type {
  CadFeatureOperation,
  CamServiceJob,
  CamSettings,
  EvaluatedMesh,
  FeaResult,
  FeaSettings,
  ImportedCadModel,
  MachineType,
  MaterialFinish,
  McpEyeEvent,
  NurbsSurfaceData,
  PartEngineeringProfile,
  RemoteMqttTelemetryEvent,
  ToolpathResult,
  VucLedgerEntry,
  WorkspaceTab,
} from '../types/cad';

export type SustainabilityViewMode = 'lca' | 'fatigue';

interface SustainabilityDashboardProps {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  importedModel: ImportedCadModel | null;
  materialFinish: MaterialFinish;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  featureOps: CadFeatureOperation[];
  feaResult: FeaResult;
  feaSettings: FeaSettings;
  partProfile: PartEngineeringProfile;
  vucLedger: VucLedgerEntry[];
  mqttTelemetryFeed: RemoteMqttTelemetryEvent[];
  camServiceJobs: CamServiceJob[];
  mcpEyeEvents: McpEyeEvent[];
  onSwitchMachine: (machineType: MachineType) => void;
  onChangeMaterial: (material: MaterialFinish) => void;
  onNavigate: (tab: WorkspaceTab) => void;
  onNewCaeStudy?: () => void;
  onResetCaeArea?: () => void;
  harnessDockProps?: Omit<AgentHarnessDockProps, 'layer' | 'title'>;
}

const GRID_PROFILES: { id: string; label: string; factor: number }[] = [
  { id: 'br-sin', label: 'Rede Brasil SIN (Hidrelétrica/Renovável)', factor: 0.085 },
  { id: 'eu-avg', label: 'Rede União Europeia (Média)', factor: 0.255 },
  { id: 'global', label: 'Rede Industrial Global (Média)', factor: 0.475 },
  { id: 'coal-heavy', label: 'Planta Térmica / Carvão', factor: 0.82 },
];

const FATIGUE_REGIME_STYLES: Record<FatigueRegime, { badge: string; text: string }> = {
  'vida-infinita': {
    badge: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
    text: 'Vida Infinita',
  },
  'alto-ciclo-hcf': {
    badge: 'text-sky-300 border-sky-400/40 bg-sky-500/10',
    text: 'Alto Ciclo (HCF)',
  },
  'baixo-ciclo-lcf': {
    badge: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
    text: 'Baixo Ciclo (LCF)',
  },
  'critico-imediato': {
    badge: 'text-rose-300 border-rose-400/40 bg-rose-500/10',
    text: 'Crítico',
  },
};

export const SustainabilityDashboard: React.FC<SustainabilityDashboardProps> = ({
  surface,
  meshData,
  importedModel,
  materialFinish,
  camSettings,
  toolpath,
  featureOps,
  feaResult,
  feaSettings,
  partProfile,
  vucLedger,
  mqttTelemetryFeed,
  camServiceJobs,
  mcpEyeEvents,
  onSwitchMachine,
  onChangeMaterial,
  onNavigate,
  onNewCaeStudy,
  onResetCaeArea,
  harnessDockProps,
}) => {
  const [activeView, setActiveView] = useState<SustainabilityViewMode>('lca');
  const [gridId, setGridId] = useState<string>('br-sin');
  const [loadRatio, setLoadRatio] = useState<CyclicLoadRatio>(0);
  const [dynamicLoadFactor, setDynamicLoadFactor] = useState<number>(1.0);
  const activeGrid = GRID_PROFILES.find((g) => g.id === gridId) ?? GRID_PROFILES[0];

  const report = useMemo(
    () =>
      calculateCarbonFootprint({
        materialFinish,
        meshData,
        importedModel,
        camSettings,
        toolpath,
        featureOps,
        gridEmissionFactorKgPerKwh: activeGrid.factor,
      }),
    [materialFinish, meshData, importedModel, camSettings, toolpath, featureOps, activeGrid.factor]
  );

  const fatigueReport = useMemo(
    () =>
      evaluateComponentFatigueCycles({
        feaResult,
        feaSettings,
        materialFinish,
        partProfile,
        loadRatio,
        dynamicLoadFactor,
        mqttTelemetryFeed,
        camServiceJobs,
        vucLedger,
        mcpEyeEvents,
      }),
    [
      feaResult,
      feaSettings,
      materialFinish,
      partProfile,
      loadRatio,
      dynamicLoadFactor,
      mqttTelemetryFeed,
      camServiceJobs,
      vucLedger,
      mcpEyeEvents,
    ]
  );

  const totalDenominator = Math.max(0.001, report.totalCo2Kg);
  const pctMat = Math.round((report.materialEmbodiedCo2Kg / totalDenominator) * 100);
  const pctWaste = Math.round((report.wasteNetCo2Kg / totalDenominator) * 100);
  const pctEnergy = Math.max(1, 100 - pctMat - pctWaste);

  const gradeStyles: Record<string, string> = {
    'A+': 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300',
    A: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300',
    B: 'bg-sky-500/15 border-sky-400/50 text-sky-300',
    C: 'bg-amber-500/15 border-amber-400/50 text-amber-300',
    D: 'bg-orange-500/15 border-orange-400/50 text-orange-300',
    E: 'bg-rose-500/15 border-rose-400/50 text-rose-300',
  };

  const maxBenchKwh = Math.max(...report.machineBenchmarks.map((b) => b.energyKwh), 0.1);

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {harnessDockProps && (
          <AgentHarnessDock
            layer="cae"
            title="CAE · Qwen 0.5B SimpleTool Harness"
            {...harnessDockProps}
          />
        )}
        {/* Header + View Switcher */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-white/10">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              {activeView === 'lca' ? (
                <>
                  <Leaf className="w-4 h-4" />
                  Análise de Ciclo de Vida (LCA) · Fabricação & Usinagem Sustentável
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span className="text-sky-400">
                    Durabilidade & Integridade Cíclica (Basquin S-N · Palmgren-Miner)
                  </span>
                </>
              )}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100">
              {activeView === 'lca'
                ? `Pegada de Carbono Estimada — ${importedModel ? importedModel.filename : surface.name}`
                : `Ciclos de Fadiga & Vida Útil — ${importedModel ? importedModel.filename : surface.name}`}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {activeView === 'lca'
                ? `Cruzamento determinístico entre carbono incorporado do material (${report.materialName}), volume de cavaco/desperdício CAM (Buy-to-Fly ${report.buyToFlyRatio}:1) e consumo energético cinemático de máquinas CNC / Robô 6-Eixos.`
                : `Previsão determinística de ciclos esperados até falha (N_f) por componente FEA sob carregamento cíclico (R=${loadRatio}, K_d=${dynamicLoadFactor.toFixed(2)}×), ponderada pelo histórico real de telemetria MQTT, jobs CAM, eventos MCP e Ledger VUC.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#111620] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveView('lca')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  activeView === 'lca'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Pegada de Carbono (LCA)
              </button>
              <button
                type="button"
                onClick={() => setActiveView('fatigue')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  activeView === 'fatigue'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Ciclos de Fadiga (S-N)
              </button>
            </div>

            {activeView === 'lca' ? (
              <>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Matriz Elétrica (Fator Rede)
                  </label>
                  <select
                    aria-label="Matriz energética da fábrica"
                    value={gridId}
                    onChange={(e) => setGridId(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-[#111620] border border-white/12 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-400"
                  >
                    {GRID_PROFILES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} ({g.factor} kgCO₂/kWh)
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className={`px-4 py-2 rounded-xl border text-center ${
                    gradeStyles[report.ecoGrade] ?? gradeStyles.B
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Classe Eco</div>
                  <div className="font-display text-xl font-bold leading-tight">{report.ecoGrade}</div>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Razão de Carga Cíclica (R)
                  </label>
                  <select
                    aria-label="Razão de carga cíclica R"
                    value={String(loadRatio)}
                    onChange={(e) => setLoadRatio(Number(e.target.value) as CyclicLoadRatio)}
                    className="px-3 py-1.5 text-xs bg-[#111620] border border-white/12 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400"
                  >
                    <option value="-1">R = -1 (Alternada Reversa Total)</option>
                    <option value="0">R = 0 (Pulsante 0 → σ_máx)</option>
                    <option value="0.5">R = +0.5 (Tração Flutuante Alta)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Fator Dinâmico K_d
                  </label>
                  <select
                    aria-label="Fator dinâmico de carregamento cíclico"
                    value={String(dynamicLoadFactor)}
                    onChange={(e) => setDynamicLoadFactor(Number(e.target.value))}
                    className="px-3 py-1.5 text-xs bg-[#111620] border border-white/12 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400"
                  >
                    <option value="1">1.00× (Nominal FEA)</option>
                    <option value="1.25">1.25× (Operação Severa)</option>
                    <option value="1.5">1.50× (Choque Cíclico)</option>
                  </select>
                </div>
              </div>
            )}
            {(onNewCaeStudy || onResetCaeArea) && (
              <div className="flex items-center gap-1.5">
                {onNewCaeStudy && (
                  <button
                    type="button"
                    onClick={onNewCaeStudy}
                    className="min-h-[34px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Novo CAE
                  </button>
                )}
                {onResetCaeArea && (
                  <button
                    type="button"
                    onClick={() => {
                      setLoadRatio(0);
                      setDynamicLoadFactor(1.0);
                      onResetCaeArea();
                    }}
                    className="min-h-[34px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reiniciar CAE
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {activeView === 'lca' ? (
          <>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-[#111620] border border-emerald-500/30 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Pegada Total por Peça</span>
              <Factory className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-100">
              {report.totalCo2Kg.toFixed(3)}{' '}
              <span className="text-xs font-normal text-slate-400">kg CO₂e</span>
            </div>
            <div className="text-[11px] text-emerald-300 font-mono-tabular">
              {(report.totalCo2Kg / Math.max(0.05, report.partNetMassKg)).toFixed(2)} kgCO₂e / kg útil
            </div>
          </div>

          <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Material Útil vs Tarugo</span>
              <Box className="w-4 h-4 text-sky-400" />
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-100">
              {report.partNetMassKg.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {report.billetRawMassKg.toFixed(2)} kg
              </span>
            </div>
            <div className="text-[11px] text-sky-300 font-mono-tabular">
              Buy-to-Fly: {report.buyToFlyRatio}:1 ({report.partNetVolumeCm3} cm³ úteis)
            </div>
          </div>

          <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Desperdício CAM (Cavaco)</span>
              <Recycle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-100">
              {report.wasteVolumeCm3.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">cm³</span>
            </div>
            <div className="text-[11px] text-amber-300 font-mono-tabular">
              {report.machiningWasteRatePct}% do bloco ({report.wasteNetCo2Kg.toFixed(3)} kg CO₂e líq.)
            </div>
          </div>

          <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Energia & Eficiência</span>
              <BatteryCharging className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-100">
              {report.energyKwh.toFixed(3)}{' '}
              <span className="text-xs font-normal text-slate-400">kWh</span>
            </div>
            <div className="text-[11px] text-indigo-300 font-mono-tabular">
              Rendimento {report.robotOrAxisEfficiencyPct}% · {report.energyCo2Kg.toFixed(3)} kg CO₂e
            </div>
          </div>
        </div>

        {/* Stacked Attribution Bar + Material Quick Selector */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 p-5 bg-[#111620] border border-white/10 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Composição da Pegada de Carbono (Material × Cavaco CAM × Energia)
              </h2>
              <span className="font-mono-tabular text-xs text-slate-400">
                Total: {report.totalCo2Kg.toFixed(3)} kg CO₂e
              </span>
            </div>

            <div className="h-5 w-full rounded-full overflow-hidden flex bg-[#0c1017] border border-white/10">
              <div
                style={{ width: `${pctMat}%` }}
                className="bg-sky-500 h-full transition-all"
                title={`Material útil: ${pctMat}%`}
              />
              <div
                style={{ width: `${pctWaste}%` }}
                className="bg-amber-500 h-full transition-all"
                title={`Desperdício CAM: ${pctWaste}%`}
              />
              <div
                style={{ width: `${pctEnergy}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Energia elétrica: ${pctEnergy}%`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-sky-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 shrink-0" />
                  Material Útil ({pctMat}%)
                </div>
                <div className="font-mono-tabular text-slate-100 font-semibold">
                  {report.materialEmbodiedCo2Kg.toFixed(3)} kg CO₂e
                </div>
                <div className="text-[11px] text-slate-400">
                  {report.embodiedFactorKgCo2PerKg} kgCO₂/kg · {report.densityGcm3} g/cm³
                </div>
              </div>

              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-amber-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
                  Cavaco CAM ({pctWaste}%)
                </div>
                <div className="font-mono-tabular text-slate-100 font-semibold">
                  {report.wasteNetCo2Kg.toFixed(3)} kg CO₂e
                </div>
                <div className="text-[11px] text-slate-400">
                  {report.wasteMassKg.toFixed(2)} kg removidos (−{report.recyclingCreditKgCo2PerKg}{' '}
                  crédito recicl.)
                </div>
              </div>

              <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-emerald-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                  Energia Máquina ({pctEnergy}%)
                </div>
                <div className="font-mono-tabular text-slate-100 font-semibold">
                  {report.energyCo2Kg.toFixed(3)} kg CO₂e
                </div>
                <div className="text-[11px] text-slate-400">
                  Spindle {report.spindlePowerKw} kW · Ciclo {toolpath.estimatedMinutes} min
                </div>
              </div>
            </div>
          </div>

          {/* Material Sensitivity Switcher */}
          <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Simular Troca de Material
            </h2>
            <p className="text-[11px] text-slate-400">
              Compare o impacto ambiental e altere instantaneamente o material da peça ativa:
            </p>
            <select
              aria-label="Material para simulação de carbono"
              value={materialFinish}
              onChange={(e) => onChangeMaterial(e.target.value as MaterialFinish)}
              className="w-full px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
            >
              <option value="aluminum">Alumínio 6061/7075 (Reciclável)</option>
              <option value="titanium">Titânio Ti-6Al-4V (Alto Carbono)</option>
              <option value="carbon-fiber">Fibra de Carbono CFRP</option>
              <option value="matte-plastic">Polímero Técnico PA12</option>
              <option value="oak">Madeira Estrutural / Biomassa</option>
              <option value="glass">Vidro Laminado</option>
              <option value="clay">Argila / Protótipo</option>
            </select>

            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1.5 text-[11px]">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Recomendações de Descarbonização
              </div>
              <ul className="space-y-1 text-slate-300 list-disc list-inside leading-relaxed">
                {report.optimizationTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Machine / Robot Energy Efficiency Comparison Matrix */}
        <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                Comparativo Energético: CNC vs Robô 6-Eixos KUKA
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Clique em qualquer equipamento abaixo para aplicar imediatamente no módulo CAM & Robô.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('cam')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-sky-400/50 rounded-lg text-slate-200 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              Ajustar Parâmetros CAM
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.machineBenchmarks.map((b) => {
              const isActive = b.machineType === camSettings.machineType;
              const widthPct = Math.max(12, Math.round((b.energyKwh / maxBenchKwh) * 100));
              return (
                <button
                  key={b.machineType}
                  type="button"
                  onClick={() => onSwitchMachine(b.machineType)}
                  className={`text-left p-3.5 rounded-xl border transition-colors space-y-2 cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-400/60'
                      : 'bg-[#0c1017] border-white/8 hover:border-sky-400/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                      {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {b.label}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-sky-300">
                      {b.energyKwh.toFixed(3)} kWh · {b.cycleMinutes} min
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[#141a24] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full ${isActive ? 'bg-emerald-400' : 'bg-sky-500'}`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular">
                    <span>Emissão elétrica: {b.energyCo2Kg.toFixed(4)} kg CO₂e</span>
                    <span>Eficiência: {b.efficiencyScore} pts</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
          </>
        ) : (
          <div className="space-y-6">
            {/* Fatigue KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-[#111620] border border-sky-500/30 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Vida Esperada Mínima (N_f)</span>
                  <Activity className="w-4 h-4 text-sky-400" />
                </div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                  {fatigueReport.minExpectedCycles >= 1e7
                    ? '≥ 1.00e7'
                    : fatigueReport.minExpectedCycles.toExponential(2)}{' '}
                  <span className="text-xs font-normal text-slate-400">ciclos</span>
                </div>
                <div className="text-[11px] text-sky-300 font-mono-tabular">
                  Crítico: {fatigueReport.criticalComponent.label}
                </div>
              </div>

              <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Dano Palmgren-Miner (D)</span>
                  <Gauge className="w-4 h-4 text-amber-400" />
                </div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                  {(fatigueReport.maxMinerDamageFraction * 100).toFixed(4)}
                  <span className="text-xs font-normal text-slate-400">%</span>
                </div>
                <div className="text-[11px] text-amber-300 font-mono-tabular">
                  Vida remanescente média: {fatigueReport.fleetAverageRemainingLifePct}%
                </div>
              </div>

              <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Histórico de Telemetria</span>
                  <History className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                  {fatigueReport.totalTelemetryCycles.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-normal text-slate-400">ciclos</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono-tabular">
                  {fatigueReport.telemetrySourceStatus === 'telemetria-ativa'
                    ? `${fatigueReport.telemetryRecordCount} eventos reais (MQTT/CAM/VUC/MCP)`
                    : 'Sem eventos no histórico · Baseline FEA'}
                </div>
              </div>

              <div className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Tensão Equiv. Goodman</span>
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                  {fatigueReport.criticalComponent.goodmanEquivalentMpa.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-400">MPa</span>
                </div>
                <div className="text-[11px] text-indigo-300 font-mono-tabular">
                  σe'={(fatigueReport.materialSpec.enduranceLimitMpa * fatigueReport.materialSpec.surfaceFactorKa).toFixed(1)} MPa · {FATIGUE_REGIME_STYLES[fatigueReport.overallRegime].text}
                </div>
              </div>
            </div>

            {/* Interactive D3 Fatigue Cycles & Basquin S-N Chart */}
            <FatigueCyclesChartD3 report={fatigueReport} />

            {/* Component Fatigue Breakdown Table */}
            <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    Matriz de Fadiga por Componente Estrutural ({fatigueReport.components.length} itens FEA)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Baseada em Von Mises FEA, correção de tensão média Goodman e dano acumulado por telemetria.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('viewport')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-sky-400/50 rounded-lg text-slate-200 cursor-pointer"
                >
                  Inspecionar Malha 3D / FEA
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] text-slate-400">
                      <th className="py-2 pr-3 font-medium">Componente</th>
                      <th className="py-2 px-3 font-medium">Classe IFC</th>
                      <th className="py-2 px-3 font-medium text-right">Von Mises (MPa)</th>
                      <th className="py-2 px-3 font-medium text-right">σ_ar Goodman</th>
                      <th className="py-2 px-3 font-medium text-right">Ciclos N_f</th>
                      <th className="py-2 px-3 font-medium text-right">Restantes</th>
                      <th className="py-2 pl-3 font-medium text-right">Regime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8 font-mono-tabular">
                    {fatigueReport.components.map((comp) => {
                      const style = FATIGUE_REGIME_STYLES[comp.regime];
                      return (
                        <tr key={comp.elementId} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 pr-3 font-sans text-slate-100 font-medium">
                            {comp.label}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{comp.ifcClass}</td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            {comp.peakVonMisesMpa.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-sky-300">
                            {comp.goodmanEquivalentMpa.toFixed(2)} MPa
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-100">
                            {comp.expectedCycles >= 1e7
                              ? '≥ 1.00e7'
                              : comp.expectedCycles.toExponential(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-300">
                            {comp.remainingLifePct}%
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-[10px] font-sans font-medium ${style.badge}`}
                            >
                              {style.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Real Telemetry History Blocks Feeding Miner Damage */}
            <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    Blocos de Carregamento Extraídos da Telemetria Real
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Somatório efetivo de ciclos por fonte (MQTT, Jobs CAM, Ledger VUC e Olho MCP).
                  </p>
                </div>
                <span className="font-mono-tabular text-[11px] text-sky-300">
                  VUC Prova: {fatigueReport.vucProof.vucHash}
                </span>
              </div>

              {fatigueReport.telemetryBlocks.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#0c1017] border border-white/8 text-xs text-slate-400">
                  Nenhum evento histórico de telemetria MQTT, CAM ou VUC registrado nesta sessão ainda.
                  Os ciclos esperados N_f acima refletem a solicitação FEA nominal em regime estacionário; execute um processo CAM, envio MQTT ou verificação VUC para acumular dano Palmgren-Miner real.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] text-slate-400">
                        <th className="py-2 pr-3 font-medium">Fonte</th>
                        <th className="py-2 px-3 font-medium">Evento / Operação</th>
                        <th className="py-2 px-3 font-medium text-right">Ciclos Aplicados</th>
                        <th className="py-2 px-3 font-medium text-right">Fator Carga</th>
                        <th className="py-2 pl-3 font-medium text-right">Hash VUC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8 font-mono-tabular">
                      {fatigueReport.telemetryBlocks.map((block) => (
                        <tr key={block.id} className="hover:bg-white/[0.02]">
                          <td className="py-2 pr-3 text-sky-300 uppercase text-[10px]">
                            {block.source}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-200">{block.label}</td>
                          <td className="py-2 px-3 text-right text-slate-100">
                            {block.cyclesCount.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-300">
                            {block.loadMultiplier.toFixed(2)}×
                          </td>
                          <td className="py-2 pl-3 text-right text-slate-400 text-[11px]">
                            {block.vucHash.slice(0, 14)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
