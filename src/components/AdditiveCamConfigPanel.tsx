import React, { useEffect, useState } from 'react';
import { Flame, Layers, PanelRightClose, PanelRightOpen, ShieldAlert, Sliders } from 'lucide-react';
import { getDefaultAdditiveSettings, resolveAdditiveSettings } from '../kernel/camRobotics';
import type {
  AdditiveManufacturingSettings,
  AdditiveProcessKind,
  AdditiveSinteringAtmosphere,
  AdditiveSupportPattern,
  CamSettings,
  ToolpathResult,
} from '../types/cad';

interface AdditiveCamConfigPanelProps {
  settings: CamSettings;
  onChangeSettings: (patch: Partial<CamSettings>) => void;
  toolpath: ToolpathResult;
}

const SUPPORT_PATTERNS: { id: AdditiveSupportPattern; label: string }[] = [
  { id: 'tree-branch', label: 'Árvore Orgânica' },
  { id: 'lattice-grid', label: 'Grade Lattice' },
  { id: 'linear-fin', label: 'Aletas Lineares' },
  { id: 'none', label: 'Sem Suporte' },
];

const ATMOSPHERE_OPTIONS: { id: AdditiveSinteringAtmosphere; label: string }[] = [
  { id: 'argon', label: 'Argônio Inerte (Ar)' },
  { id: 'nitrogen', label: 'Nitrogênio (N₂)' },
  { id: 'vacuum', label: 'Alto Vácuo (<10⁻³ mbar)' },
  { id: 'uv-chamber', label: 'Câmara UV 405nm' },
];

export const AdditiveCamConfigPanel: React.FC<AdditiveCamConfigPanelProps> = ({
  settings,
  onChangeSettings,
  toolpath,
}) => {
  const isAdditiveActive =
    settings.machineType === 'powder-metal' || settings.machineType === 'resin-sla';
  const selectedKind: AdditiveProcessKind =
    settings.machineType === 'resin-sla' ? 'resin-sla' : 'powder-metal';
  const cfg = resolveAdditiveSettings(settings);
  const isPowder = selectedKind === 'powder-metal';
  const summary = toolpath.additiveSummary;

  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [perProcessThermalLayer, setPerProcessThermalLayer] = useState<
    Record<AdditiveProcessKind, { sinterTempC: number; layerThicknessUm: number }>
  >(() => ({
    'powder-metal': {
      sinterTempC:
        selectedKind === 'powder-metal'
          ? cfg.sinterTempC
          : getDefaultAdditiveSettings('powder-metal').sinterTempC,
      layerThicknessUm:
        selectedKind === 'powder-metal'
          ? cfg.layerThicknessUm
          : getDefaultAdditiveSettings('powder-metal').layerThicknessUm,
    },
    'resin-sla': {
      sinterTempC:
        selectedKind === 'resin-sla'
          ? cfg.sinterTempC
          : getDefaultAdditiveSettings('resin-sla').sinterTempC,
      layerThicknessUm:
        selectedKind === 'resin-sla'
          ? cfg.layerThicknessUm
          : getDefaultAdditiveSettings('resin-sla').layerThicknessUm,
    },
  }));

  useEffect(() => {
    setPerProcessThermalLayer((prev) => ({
      ...prev,
      [selectedKind]: {
        sinterTempC: cfg.sinterTempC,
        layerThicknessUm: cfg.layerThicknessUm,
      },
    }));
  }, [selectedKind, cfg.sinterTempC, cfg.layerThicknessUm]);

  const handleSelectProcess = (kind: AdditiveProcessKind) => {
    const saved = perProcessThermalLayer[kind];
    const nextDefaults = {
      ...getDefaultAdditiveSettings(kind),
      sinterTempC: saved.sinterTempC,
      layerThicknessUm: saved.layerThicknessUm,
    };
    onChangeSettings({
      machineType: kind,
      postFormat: kind === 'powder-metal' ? 'slm-powder' : 'sla-resin',
      additiveConfig: nextDefaults,
    });
  };

  const updateAdditive = (
    patch: Partial<AdditiveManufacturingSettings>,
    targetKind: AdditiveProcessKind = selectedKind
  ) => {
    const baseForKind =
      targetKind === selectedKind
        ? cfg
        : {
            ...getDefaultAdditiveSettings(targetKind),
            ...perProcessThermalLayer[targetKind],
          };
    const nextCfg: AdditiveManufacturingSettings = {
      ...baseForKind,
      ...patch,
    };
    setPerProcessThermalLayer((prev) => ({
      ...prev,
      [targetKind]: {
        sinterTempC: nextCfg.sinterTempC,
        layerThicknessUm: nextCfg.layerThicknessUm,
      },
    }));
    onChangeSettings({
      machineType: targetKind,
      postFormat: targetKind === 'powder-metal' ? 'slm-powder' : 'sla-resin',
      additiveConfig: nextCfg,
    });
  };

  const tempBounds = isPowder
    ? { min: 400, max: 1450, step: 25, presets: [850, 1150, 1300] }
    : { min: 30, max: 120, step: 5, presets: [45, 60, 85] };
  const layerBounds = isPowder
    ? { min: 15, max: 120, step: 5, presets: [20, 30, 60] }
    : { min: 15, max: 100, step: 5, presets: [20, 25, 50] };

  return (
    <section
      aria-label="Configuração de Fabricação Aditiva"
      className={`p-3 rounded-lg border transition-colors space-y-2.5 ${
        isAdditiveActive
          ? 'bg-[#0c1017] border-sky-400/50'
          : 'bg-[#0c1017]/80 border-white/10'
      }`}
    >
      {/* Top Header + Lateral Panel Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-xs font-semibold text-slate-100 truncate">
            Fabricação Aditiva (Suporte & Sinterização)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setSidePanelOpen((v) => !v)}
          aria-expanded={sidePanelOpen}
          title={sidePanelOpen ? 'Recolher painel lateral' : 'Expandir painel lateral'}
          className="px-2 py-1 text-[10px] font-medium bg-[#111620] border border-white/15 hover:border-sky-400/60 text-sky-300 rounded flex items-center gap-1 shrink-0 cursor-pointer"
        >
          {sidePanelOpen ? (
            <PanelRightClose className="w-3 h-3" />
          ) : (
            <PanelRightOpen className="w-3 h-3" />
          )}
          <span>Lateral</span>
        </button>
      </div>

      {/* Main Column + Docked Lateral Side Panel */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
        {/* Primary Additive Controls */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Explicit Mode Selector: Impressão Metálica a Pó vs Resina SLA */}
          <div
            className="grid grid-cols-2 gap-1.5"
            role="group"
            aria-label="Tipo de Impressão Aditiva"
          >
            <button
              type="button"
              onClick={() => handleSelectProcess('powder-metal')}
              className={`min-h-[42px] px-2 py-1.5 text-[11px] font-semibold rounded-md border text-left transition-colors cursor-pointer ${
                settings.machineType === 'powder-metal'
                  ? 'border-amber-400/80 bg-amber-500/15 text-amber-100'
                  : 'border-white/10 bg-[#111620] text-slate-300 hover:border-white/20'
              }`}
            >
              <div className="truncate">Impressão Metálica a Pó</div>
              <div className="text-[10px] font-normal text-slate-400 truncate">LPBF / Sinter</div>
            </button>
            <button
              type="button"
              onClick={() => handleSelectProcess('resin-sla')}
              className={`min-h-[42px] px-2 py-1.5 text-[11px] font-semibold rounded-md border text-left transition-colors cursor-pointer ${
                settings.machineType === 'resin-sla'
                  ? 'border-violet-400/80 bg-violet-500/15 text-violet-100'
                  : 'border-white/10 bg-[#111620] text-slate-300 hover:border-white/20'
              }`}
            >
              <div className="truncate">Resina SLA</div>
              <div className="text-[10px] font-normal text-slate-400 truncate">UV 405nm</div>
            </button>
          </div>

          {/* Support Parameters */}
          <div className="space-y-2 pt-2 border-t border-white/8">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Parâmetros de Suporte</span>
            </div>

            <div className="grid grid-cols-2 gap-1">
              {SUPPORT_PATTERNS.map((pat) => (
                <button
                  key={pat.id}
                  type="button"
                  onClick={() => updateAdditive({ supportPattern: pat.id })}
                  className={`px-1.5 py-1 text-[10px] font-medium rounded border transition-colors cursor-pointer truncate ${
                    cfg.supportPattern === pat.id
                      ? 'border-sky-400/70 bg-sky-500/15 text-sky-100'
                      : 'border-white/8 bg-[#111620] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pat.label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Densidade</span>
                <span className="font-mono-tabular text-slate-100">{cfg.supportDensityPct}%</span>
              </div>
              <input
                aria-label="Densidade de Suporte"
                type="range"
                className="cad-slider w-full"
                min={0}
                max={50}
                step={2}
                value={cfg.supportDensityPct}
                onChange={(e) =>
                  updateAdditive({ supportDensityPct: parseInt(e.target.value, 10) })
                }
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Overhang Crítico</span>
                <span className="font-mono-tabular text-slate-100">{cfg.overhangAngleDeg}°</span>
              </div>
              <input
                aria-label="Ângulo Crítico de Overhang"
                type="range"
                className="cad-slider w-full"
                min={20}
                max={70}
                step={1}
                value={cfg.overhangAngleDeg}
                onChange={(e) =>
                  updateAdditive({ overhangAngleDeg: parseInt(e.target.value, 10) })
                }
              />
            </div>
          </div>

          {/* Scan, Laser & Atmosphere Parameters */}
          <div className="space-y-2 pt-2 border-t border-white/8">
            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5 text-[10px] text-slate-300">
                <span>{isPowder ? 'Laser (W)' : 'UV (W)'}</span>
                <input
                  type="number"
                  min={isPowder ? 50 : 0.05}
                  max={isPowder ? 1000 : 5}
                  step={isPowder ? 10 : 0.05}
                  value={cfg.sinterLaserPowerW}
                  onChange={(e) =>
                    updateAdditive({ sinterLaserPowerW: parseFloat(e.target.value) || 0.1 })
                  }
                  className="w-full px-1.5 py-1 text-[11px] font-mono-tabular bg-[#111620] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-0.5 text-[10px] text-slate-300">
                <span>Varredura (mm/s)</span>
                <input
                  type="number"
                  min={150}
                  max={4500}
                  step={50}
                  value={cfg.sinterScanSpeedMmS}
                  onChange={(e) =>
                    updateAdditive({ sinterScanSpeedMmS: parseInt(e.target.value, 10) || 400 })
                  }
                  className="w-full px-1.5 py-1 text-[11px] font-mono-tabular bg-[#111620] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-0.5 text-[10px] text-slate-300">
                <span>Patamar (min)</span>
                <input
                  type="number"
                  min={10}
                  max={300}
                  step={5}
                  value={cfg.sinterHoldMinutes}
                  onChange={(e) =>
                    updateAdditive({ sinterHoldMinutes: parseInt(e.target.value, 10) || 30 })
                  }
                  className="w-full px-1.5 py-1 text-[11px] font-mono-tabular bg-[#111620] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-0.5 text-[10px] text-slate-300">
                <span>Hachura (mm)</span>
                <input
                  type="number"
                  min={0.04}
                  max={0.3}
                  step={0.01}
                  value={cfg.hatchSpacingMm}
                  onChange={(e) =>
                    updateAdditive({ hatchSpacingMm: parseFloat(e.target.value) || 0.1 })
                  }
                  className="w-full px-1.5 py-1 text-[11px] font-mono-tabular bg-[#111620] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
            </div>

            <label className="block space-y-0.5 text-[10px] text-slate-300">
              <span>Atmosfera de Câmara</span>
              <select
                aria-label="Atmosfera de Sinterização"
                value={cfg.atmosphere}
                onChange={(e) =>
                  updateAdditive({ atmosphere: e.target.value as AdditiveSinteringAtmosphere })
                }
                className="w-full px-2 py-1 text-[11px] bg-[#111620] border border-white/12 rounded text-slate-100 outline-none cursor-pointer"
              >
                {ATMOSPHERE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Dedicated Lateral Side Panel: Sintering Temp + Layer Thickness for Pó Metálico & Resina SLA */}
        {sidePanelOpen && (
          <aside
            aria-label="Painel Lateral: Sinterização e Espessura de Camada"
            className="sm:w-[156px] shrink-0 p-2.5 bg-[#111620] border border-amber-400/35 rounded-md flex flex-col justify-between gap-2.5"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-white/10">
                <div className="flex items-center gap-1 min-w-0">
                  <Sliders className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-200 truncate">
                    Painel Lateral CAM
                  </span>
                </div>
                <span className="text-[9px] font-mono-tabular text-sky-400 shrink-0">
                  {isPowder ? 'PÓ' : 'SLA'}
                </span>
              </div>

              {/* Process Quick Switcher inside Lateral Panel */}
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectProcess('powder-metal')}
                  className={`px-1.5 py-1 text-[10px] font-medium rounded border cursor-pointer truncate ${
                    selectedKind === 'powder-metal'
                      ? 'border-amber-400/70 bg-amber-500/20 text-amber-100'
                      : 'border-white/10 bg-[#0c1017] text-slate-400'
                  }`}
                >
                  Pó Metálico
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProcess('resin-sla')}
                  className={`px-1.5 py-1 text-[10px] font-medium rounded border cursor-pointer truncate ${
                    selectedKind === 'resin-sla'
                      ? 'border-violet-400/70 bg-violet-500/20 text-violet-100'
                      : 'border-white/10 bg-[#0c1017] text-slate-400'
                  }`}
                >
                  Resina SLA
                </button>
              </div>

              {/* Sintering Temperature Control */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1 text-[10px] font-medium text-orange-300">
                  <Flame className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {isPowder ? 'Temp. Sinterização' : 'Temp. Pós-Sinter/Cura'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    aria-label="Temperatura de Sinterização (°C)"
                    type="number"
                    min={tempBounds.min}
                    max={tempBounds.max}
                    step={tempBounds.step}
                    value={cfg.sinterTempC}
                    onChange={(e) =>
                      updateAdditive({
                        sinterTempC: parseInt(e.target.value, 10) || tempBounds.min,
                      })
                    }
                    className="w-full px-1.5 py-1 text-xs font-mono-tabular bg-[#0c1017] border border-white/15 rounded text-slate-100 outline-none focus:border-amber-400"
                  />
                  <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">°C</span>
                </div>
                <input
                  aria-label="Controle Deslizante Temperatura de Sinterização"
                  type="range"
                  className="cad-slider w-full"
                  min={tempBounds.min}
                  max={tempBounds.max}
                  step={tempBounds.step}
                  value={cfg.sinterTempC}
                  onChange={(e) =>
                    updateAdditive({ sinterTempC: parseInt(e.target.value, 10) })
                  }
                />
                <div className="grid grid-cols-3 gap-1">
                  {tempBounds.presets.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateAdditive({ sinterTempC: t })}
                      className={`py-0.5 text-[9px] font-mono-tabular rounded border cursor-pointer ${
                        cfg.sinterTempC === t
                          ? 'border-orange-400/70 bg-orange-500/20 text-orange-200'
                          : 'border-white/10 bg-[#0c1017] text-slate-400'
                      }`}
                    >
                      {t}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Layer Thickness Control */}
              <div className="space-y-1.5 pt-2 border-t border-white/8">
                <div className="flex items-center gap-1 text-[10px] font-medium text-sky-300">
                  <Layers className="w-3 h-3 shrink-0" />
                  <span className="truncate">Espessura da Camada</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    aria-label="Espessura da Camada (µm)"
                    type="number"
                    min={layerBounds.min}
                    max={layerBounds.max}
                    step={layerBounds.step}
                    value={cfg.layerThicknessUm}
                    onChange={(e) =>
                      updateAdditive({
                        layerThicknessUm: parseInt(e.target.value, 10) || layerBounds.min,
                      })
                    }
                    className="w-full px-1.5 py-1 text-xs font-mono-tabular bg-[#0c1017] border border-white/15 rounded text-slate-100 outline-none focus:border-sky-400"
                  />
                  <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">µm</span>
                </div>
                <input
                  aria-label="Controle Deslizante Espessura da Camada"
                  type="range"
                  className="cad-slider w-full"
                  min={layerBounds.min}
                  max={layerBounds.max}
                  step={layerBounds.step}
                  value={cfg.layerThicknessUm}
                  onChange={(e) =>
                    updateAdditive({ layerThicknessUm: parseInt(e.target.value, 10) })
                  }
                />
                <div className="grid grid-cols-3 gap-1">
                  {layerBounds.presets.map((um) => (
                    <button
                      key={um}
                      type="button"
                      onClick={() => updateAdditive({ layerThicknessUm: um })}
                      className={`py-0.5 text-[9px] font-mono-tabular rounded border cursor-pointer ${
                        cfg.layerThicknessUm === um
                          ? 'border-sky-400/70 bg-sky-500/20 text-sky-200'
                          : 'border-white/10 bg-[#0c1017] text-slate-400'
                      }`}
                    >
                      {um}µm
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Direct CAM Engine Feedback */}
            <div className="p-2 bg-[#0c1017] border border-white/8 rounded text-[10px] space-y-0.5 font-mono-tabular">
              <div className="text-slate-400">Saída Motor CAM:</div>
              <div className="text-slate-100">
                {summary ? `${summary.layerCount} camadas` : 'Ative aditiva'}
              </div>
              {summary && (
                <>
                  <div className="text-amber-300">{summary.energyDensityJMm3} J/mm³</div>
                  <div className="text-emerald-400">{summary.totalCycleMinutes} min ciclo</div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Integrated CAM Calculation Readout */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-[#111620] border border-sky-400/25 rounded text-[11px]">
          <div>
            <div className="text-[10px] text-slate-400">Camadas / Suportes</div>
            <div className="font-mono-tabular text-slate-100 font-semibold">
              {summary.layerCount} cam. · {summary.supportVolumeCm3} cm³ ({summary.supportMassGrams} g)
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Densidade Energia (VED)</div>
            <div className="font-mono-tabular text-amber-300 font-semibold">
              {summary.energyDensityJMm3} J/mm³
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Impressão + Sinterização</div>
            <div className="font-mono-tabular text-emerald-400 font-semibold">
              {summary.buildMinutes} + {summary.sinteringOrPostCureMinutes} min
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Ciclo CAM Total</div>
            <div className="font-mono-tabular text-sky-300 font-semibold">
              {summary.totalCycleMinutes} min ({summary.sinteringTempC}°C)
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
