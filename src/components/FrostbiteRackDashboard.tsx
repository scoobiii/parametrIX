import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  Droplets,
  Flame,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { listCamProductionPrograms } from '../kernel/camProcessEngine';
import {
  evaluateChipCamProfile,
  evaluateFrostbiteDatacenterState,
  evaluateRackComparison,
} from '../kernel/rackFrostbiteEngine';
import type { ChipFabricationType, MachineType } from '../types/cad';

interface FrostbiteRackDashboardProps {
  onLoadPresetById: (presetId: string) => void;
  onStartProcessCam: (machineType: MachineType) => void;
  onLaunchCamProgram?: (programId: string) => void;
  onVerifyVucOnServer?: (domain: string, summary: string, payload: unknown) => Promise<void>;
  lastServerVucHex?: string | null;
}

export const FrostbiteRackDashboard: React.FC<FrostbiteRackDashboardProps> = ({
  onLoadPresetById,
  onStartProcessCam,
  onLaunchCamProgram,
  onVerifyVucOnServer,
  lastServerVucHex,
}) => {
  const [inputPowerMw, setInputPowerMw] = useState(1.0);
  const [busVoltageVdc, setBusVoltageVdc] = useState(800);
  const [ambientTempC, setAmbientTempC] = useState(24);
  const [substrateType, setSubstrateType] = useState<ChipFabricationType>('silicon-cmos');
  const [nodeNm, setNodeNm] = useState(7);
  const [dieAreaMm2, setDieAreaMm2] = useState(420);
  const [maintenanceCycle, setMaintenanceCycle] = useState(0);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const rackReport = useMemo(
    () =>
      evaluateRackComparison({
        inputPowerMw,
        busVoltageVdc,
        ambientTempC,
      }),
    [inputPowerMw, busVoltageVdc, ambientTempC]
  );

  const dcState = useMemo(
    () =>
      evaluateFrostbiteDatacenterState({
        inputPowerMw,
        busVoltageVdc,
        ambientTempC,
        maintenanceCycle,
      }),
    [inputPowerMw, busVoltageVdc, ambientTempC, maintenanceCycle]
  );

  const dcPrograms = useMemo(() => listCamProductionPrograms('datacenter'), []);
  const humanoidPrograms = useMemo(() => listCamProductionPrograms('humanoid'), []);

  const chipReport = useMemo(
    () => evaluateChipCamProfile(substrateType, nodeNm, dieAreaMm2),
    [substrateType, nodeNm, dieAreaMm2]
  );

  const handleServerProof = async () => {
    if (!onVerifyVucOnServer) return;
    setVerifyBusy(true);
    try {
      await onVerifyVucOnServer(
        'FROSTBITE_VS_NVIDIA_1MW',
        rackReport.vucProof.summary,
        { rackReport, chipReport }
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-sky-400">
              Comparativo Arquitetural · Barramento {busVoltageVdc} VDC · Prova VUC Determinística
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100">
              Rack #FrostbiteEngine vs Rack @nvidia (1 MW · 800 VDC HVAC)
            </h1>
            <p className="text-xs text-slate-400 max-w-3xl">
              Simulação física de entrega elétrica, dissipação térmica HVAC e throughput computacional por Watt, mais matriz CAM para CPUs, GPUs e SoCs em Silício CMOS, Óptico e Híbrido.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onLoadPresetById('preset-frostbite-rack')}
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors cursor-pointer"
            >
              Abrir Rack 3D na Viewport
            </button>
            <button
              type="button"
              onClick={() =>
                onLaunchCamProgram
                  ? onLaunchCamProgram('dc-coldplate')
                  : onStartProcessCam('cnc-5axis')
              }
              className="min-h-[42px] px-3.5 py-2 text-xs font-medium bg-[#141a24] border border-white/15 text-slate-200 hover:border-emerald-400/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              Produzir Cold-Plate CAM
            </button>
          </div>
        </div>

        {/* Interactive Rack Controls + VUC Hash Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 bg-[#111620] border border-white/10 rounded-xl p-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Potência Entrada Rack</span>
              <span className="font-mono-tabular text-sky-300">{inputPowerMw.toFixed(2)} MW</span>
            </div>
            <input
              type="range"
              className="cad-slider w-full"
              min={0.5}
              max={2.0}
              step={0.1}
              value={inputPowerMw}
              onChange={(e) => setInputPowerMw(parseFloat(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Barramento DC</span>
              <span className="font-mono-tabular text-amber-300">{busVoltageVdc} VDC</span>
            </div>
            <input
              type="range"
              className="cad-slider w-full"
              min={400}
              max={1000}
              step={50}
              value={busVoltageVdc}
              onChange={(e) => setBusVoltageVdc(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Temperatura Ambiente HVAC</span>
              <span className="font-mono-tabular text-emerald-300">{ambientTempC} °C</span>
            </div>
            <input
              type="range"
              className="cad-slider w-full"
              min={16}
              max={38}
              step={1}
              value={ambientTempC}
              onChange={(e) => setAmbientTempC(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="flex flex-col justify-between gap-1.5 border-t lg:border-t-0 lg:border-l border-white/10 pt-2 lg:pt-0 lg:pl-3">
            <div className="text-[11px] font-mono-tabular text-emerald-400 truncate">
              {rackReport.vucProof.vucHash}
            </div>
            <button
              type="button"
              disabled={verifyBusy}
              onClick={handleServerProof}
              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/25 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {verifyBusy ? 'Registrando...' : 'Provar Hash VUC no SQLite'}
            </button>
            {lastServerVucHex && (
              <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                SHA-256: {lastServerVucHex.slice(0, 24)}...
              </div>
            )}
          </div>
        </div>

        {/* Rack Comparison Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[rackReport.nvidiaRack, rackReport.frostbiteRack].map((rack) => {
            const isFrostbite = rack.id === 'frostbite-1mw';
            return (
              <div
                key={rack.id}
                className={`bg-[#111620] border rounded-xl p-5 space-y-4 ${
                  isFrostbite ? 'border-sky-400/45' : 'border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono-tabular text-slate-400">
                      {rack.nodeProcess} · {rack.clockMhz} MHz
                    </div>
                    <h2 className="font-display text-base font-bold text-slate-100 mt-0.5">
                      {rack.label}
                    </h2>
                  </div>
                  <span
                    className={`text-xs font-mono-tabular font-semibold ${
                      isFrostbite ? 'text-sky-300' : 'text-slate-300'
                    }`}
                  >
                    {rack.perfPerWattMultiplier.toFixed(1)}× / Watt
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-[#0c1017] border border-white/8 rounded-lg p-3">
                  {rack.explanatoryAnalogy}
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" /> Consumo Barramento
                    </div>
                    <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                      {rack.rackInputPowerKw} kW @ {rack.busVoltageVdc} VDC
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-rose-400" /> Rejeição HVAC (PUE {rack.pue})
                    </div>
                    <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                      {rack.hvacCoolingKw} kW
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-emerald-400" /> Entrega Útil Equivalente
                    </div>
                    <div className="font-mono-tabular text-sm font-semibold text-emerald-300 mt-0.5">
                      {rack.effectiveEquivalentWorkUnits.toLocaleString('pt-BR')} u.c.
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-[10px] text-slate-500">Overhead Coerência / Cache</div>
                    <div className="font-mono-tabular text-sm font-semibold text-slate-200 mt-0.5">
                      {rack.memoryCoherenceOverheadPct}% · {rack.thermalDensityWPerCm2} W/cm²
                    </div>
                  </div>
                </div>

                {rack.missingPublicDataFields.length > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-lg space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      Status Pré-Silício (Sem dados comerciais inventados)
                    </div>
                    <ul className="text-[11px] text-amber-100/85 space-y-0.5 list-disc pl-4">
                      {rack.missingPublicDataFields.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary & Honest Disclosure */}
        <div className="bg-[#111620] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-300 leading-relaxed">{rackReport.honestDisclosureNote}</div>
          <div className="font-mono-tabular text-sky-300 shrink-0">
            Ganho líquido: {rackReport.netComputeGainRatio}× · Economia HVAC: {rackReport.hvacSavingKw} kW
          </div>
        </div>

        {/* Datacenter Pronto Funcional: Liquid Cooling + Robôs Humanoides (Sem Braço Mecânico) */}
        <div className="bg-[#111620] border border-emerald-400/35 rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-400" />
                <h2 className="font-display text-base font-bold text-slate-100">
                  Datacenter Pronto Funcional · Liquid Cooling 800 VDC (Sem Braço Mecânico)
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Operação contínua sem braço mecânico industrial: robôs humanoides autônomos realizam manutenção hidráulica e atualização hot-swap de servidores liquid cooling.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMaintenanceCycle((c) => c + 1)}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/25 rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar Ciclo Humanoide (#{dcState.maintenanceCycle})
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Braço Mecânico</div>
              <div className="font-mono-tabular font-semibold text-emerald-300 mt-0.5">
                {dcState.hasMechanicalArm ? 'Ativo' : 'Nenhum (Humanoides)'}
              </div>
            </div>
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Supply / Return</div>
              <div className="font-mono-tabular font-semibold text-cyan-300 mt-0.5">
                {dcState.liquidCooling.supplyTempC}°C / {dcState.liquidCooling.returnTempC}°C
              </div>
            </div>
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Delta Térmico ΔT</div>
              <div className="font-mono-tabular font-semibold text-amber-300 mt-0.5">
                +{dcState.liquidCooling.deltaTC} °C
              </div>
            </div>
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Vazão Liquid Loop</div>
              <div className="font-mono-tabular font-semibold text-slate-100 mt-0.5">
                {dcState.liquidCooling.flowRateLpm} L/min
              </div>
            </div>
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Pressão / CDUs</div>
              <div className="font-mono-tabular font-semibold text-slate-100 mt-0.5">
                {dcState.liquidCooling.loopPressureBar} bar · {dcState.liquidCooling.cdusActive} CDUs
              </div>
            </div>
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">PUE Operacional</div>
              <div className="font-mono-tabular font-semibold text-emerald-400 mt-0.5">
                {dcState.liquidCooling.pue} · Pronto
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {dcState.humanoidCrew.map((bot) => (
              <div
                key={bot.id}
                className="p-3.5 bg-[#0c1017] border border-white/10 rounded-lg space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                    <Bot className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{bot.callsign}</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-emerald-400">
                    Bat. {bot.batteryPct}%
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-sky-300">{bot.assignedBay}</div>
                <div className="text-[11px] text-slate-300 leading-snug">{bot.currentTask}</div>
                <div className="text-[10px] font-mono-tabular text-slate-500 flex justify-between pt-1 border-t border-white/8">
                  <span>{bot.status}</span>
                  <span>{bot.servicedLoopsCount} loops atendidos</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono-tabular text-emerald-400 truncate">
            {dcState.vucProof.vucHash} · {dcState.vucProof.summary}
          </div>
        </div>

        {/* Processos CAM Pré-Programados: Componentes do Datacenter & Robôs Humanoides */}
        <div className="bg-[#111620] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-100">
                Processos CAM Pré-Programados · Componentes do Datacenter & Robôs Humanoides
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cada processo fabrica integralmente os módulos do datacenter liquid cooling ou dos próprios robôs humanoides e pode ser reiniciado do começo ao fim (0% → 100%).
              </p>
            </div>
            <a
              href="/swagger"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-lg inline-flex items-center justify-center shrink-0"
            >
              Swagger / API CAM
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-cyan-300">
                Componentes do Datacenter ({dcPrograms.length})
              </div>
              <div className="space-y-2">
                {dcPrograms.map((prog) => (
                  <div
                    key={prog.id}
                    className="p-3 bg-[#0c1017] border border-white/10 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-slate-100 truncate">{prog.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {prog.subsystem} · {prog.machineType} · {prog.estimatedCycleMin} min
                      </div>
                      <div className="text-[10px] font-mono-tabular text-slate-500">
                        {prog.toleranceSpec}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onLaunchCamProgram
                          ? onLaunchCamProgram(prog.id)
                          : onStartProcessCam(prog.machineType)
                      }
                      className="min-h-[34px] px-3 py-1.5 text-[11px] font-semibold bg-cyan-500/15 border border-cyan-400/45 text-cyan-200 hover:bg-cyan-500/25 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Iniciar / Reiniciar 0→100%
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-emerald-300">
                Componentes dos Robôs Humanoides ({humanoidPrograms.length})
              </div>
              <div className="space-y-2">
                {humanoidPrograms.map((prog) => (
                  <div
                    key={prog.id}
                    className="p-3 bg-[#0c1017] border border-white/10 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-slate-100 truncate">{prog.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {prog.subsystem} · {prog.machineType} · {prog.estimatedCycleMin} min
                      </div>
                      <div className="text-[10px] font-mono-tabular text-slate-500">
                        {prog.toleranceSpec}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onLaunchCamProgram
                          ? onLaunchCamProgram(prog.id)
                          : onStartProcessCam(prog.machineType)
                      }
                      className="min-h-[34px] px-3 py-1.5 text-[11px] font-semibold bg-emerald-500/15 border border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/25 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Iniciar / Reiniciar 0→100%
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 16: Next-Gen CPU/GPU/SoC Silicon, Optical & Hybrid CAM Workbench */}
        <div className="bg-[#111620] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                <h3 className="font-display text-base font-bold text-slate-100">
                  CAM de CPU · GPU · SoC (Silício CMOS, Óptico e Híbrido)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Planejamento de wafer 300 mm, passes litográficos, acopladores fotônicos WDM e inspeção laser sub-micrométrica.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onLoadPresetById('preset-soc-hybrid')}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-lg cursor-pointer shrink-0"
            >
              Carregar SoC na Viewport 3D
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                { id: 'silicon-cmos', label: 'Silício CMOS Binário (7nm)' },
                { id: 'optical-photonic', label: 'Óptico Fotônico (SiN / WDM)' },
                { id: 'hybrid-soc', label: 'Híbrido CPU/GPU + CPO Óptico' },
              ] as { id: ChipFabricationType; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSubstrateType(opt.id)}
                className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                  substrateType === opt.id
                    ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                    : 'border-white/10 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Nó Litográfico</span>
                <span className="font-mono-tabular text-slate-100">{nodeNm} nm</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={2}
                max={28}
                step={1}
                value={nodeNm}
                onChange={(e) => setNodeNm(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Área do Die</span>
                <span className="font-mono-tabular text-slate-100">{dieAreaMm2} mm²</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={100}
                max={820}
                step={20}
                value={dieAreaMm2}
                onChange={(e) => setDieAreaMm2(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Dies / Wafer 300mm · Tiles</div>
              <div className="font-mono-tabular text-sm font-semibold text-emerald-300 mt-1">
                {chipReport.diesPerWafer} dies · {chipReport.tileCount} tiles
              </div>
            </div>

            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg">
              <div className="text-[10px] text-slate-500">Acopladores Ópticos / Passes</div>
              <div className="font-mono-tabular text-sm font-semibold text-sky-300 mt-1">
                {chipReport.opticalCouplersCount} WDM · {chipReport.lithoPasses} passes
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400 bg-[#0c1017] border border-white/8 rounded-lg px-3 py-2.5">
            <span>{chipReport.manufacturingNotes}</span>
            <span className="font-mono-tabular text-emerald-400 shrink-0">
              {chipReport.vucProof.vucHash}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
