import React from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { GanConformityReport } from '../types/cad';

interface GanConformityPanelProps {
  report: GanConformityReport;
  epochIndex: number;
  animating: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onScrubEpoch: (index: number) => void;
  onCommit: () => void;
  onClose: () => void;
}

export const GanConformityPanel: React.FC<GanConformityPanelProps> = ({
  report,
  epochIndex,
  animating,
  onPlayPause,
  onRestart,
  onScrubEpoch,
  onCommit,
  onClose,
}) => {
  const clampedIdx = Math.max(0, Math.min(report.epochs.length - 1, epochIndex));
  const activeEpoch = report.epochs[clampedIdx] ?? report.finalEpoch;
  const initialEpoch = report.initialEpoch;

  // SVG 1 geometry: Convergence Curve across Epochs
  const chartW = 320;
  const chartH = 122;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxY = Math.max(
    report.epochs.reduce((acc, e) => Math.max(acc, e.maxDeviationMm, e.allowedDeviationMm * 1.35), 0.1),
    0.1
  );

  const mapX = (idx: number) => {
    const denom = Math.max(1, report.epochs.length - 1);
    return padL + (idx / denom) * plotW;
  };
  const mapY = (valMm: number) => {
    const ratio = Math.max(0, Math.min(1, valMm / maxY));
    return padT + plotH * (1 - ratio);
  };

  const curvePoints = report.epochs
    .map((e, i) => `${mapX(i).toFixed(1)},${mapY(e.maxDeviationMm).toFixed(1)}`)
    .join(' ');

  const areaPath =
    report.epochs.length > 0
      ? `M ${mapX(0).toFixed(1)},${(padT + plotH).toFixed(1)} ` +
        report.epochs
          .map((e, i) => `L ${mapX(i).toFixed(1)},${mapY(e.maxDeviationMm).toFixed(1)}`)
          .join(' ') +
        ` L ${mapX(report.epochs.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : '';

  const isoLimitMm = activeEpoch.allowedDeviationMm;
  const isoLimitY = mapY(isoLimitMm);
  const activeX = mapX(clampedIdx);
  const activeY = mapY(activeEpoch.maxDeviationMm);

  // SVG 2 geometry: Before vs Active/After per Layer normalized to tolerance (100% = ISO limit)
  const layers = activeEpoch.layers;
  const maxRatioPct = Math.max(
    130,
    initialEpoch.layers.reduce((acc, l) => Math.max(acc, l.utilizationPct), 100)
  );
  const rowH = 22;
  const barChartW = 320;
  const barChartH = Math.max(66, layers.length * rowH + 24);
  const labelW = 94;
  const valueW = 72;
  const trackW = barChartW - labelW - valueW - 8;
  const limitLineX = labelW + (100 / maxRatioPct) * trackW;

  const isAllOk =
    activeEpoch.overallStatus === 'conforme' && activeEpoch.feaStatus === 'seguro';

  return (
    <div
      role="region"
      aria-label="Painel GAN Controlada e Gráfico de Convergência"
      className="pointer-events-auto w-[340px] sm:w-[390px] max-w-[calc(100vw-16px)] max-h-[78vh] overflow-y-auto bg-[#0b1019]/95 backdrop-blur-md border border-emerald-400/45 rounded-xl p-3 shadow-2xl space-y-2.5 text-[11px] text-slate-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-200 truncate">
              GAN Controlada · {report.referenceCode}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {report.partName} · VUC{' '}
            <span className="font-mono-tabular text-sky-300">
              {report.vucHash.slice(0, 12)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel GAN"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Transport + Scrubber */}
      <div className="p-2 bg-[#080c12] border border-white/8 rounded-lg space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPlayPause}
              className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
            >
              {animating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{animating ? 'Pausar' : clampedIdx >= report.totalEpochs ? 'Rever' : 'Animar'}</span>
            </button>
            <button
              type="button"
              onClick={onRestart}
              title="Reiniciar na Época 0"
              className="px-2 py-1 rounded bg-[#141a24] border border-white/12 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ep.0</span>
            </button>
          </div>
          <span className="font-mono-tabular text-[10px] font-bold text-sky-300">
            Época {activeEpoch.epoch}/{report.totalEpochs}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={report.totalEpochs}
          step={1}
          aria-label="Linha do tempo de épocas GAN"
          value={clampedIdx}
          onChange={(e) => onScrubEpoch(Number(e.target.value))}
          className="w-full accent-emerald-400 cursor-pointer"
        />

        <div className="text-[10px] font-medium text-slate-300 truncate">
          {activeEpoch.phaseLabel}
        </div>
      </div>

      {/* 4 Compact Telemetry Readout Pills */}
      <div className="grid grid-cols-2 gap-1.5 font-mono-tabular text-[10px]">
        <div className="p-2 rounded-lg bg-[#080c12] border border-white/8">
          <div className="text-slate-500">Camadas GD&amp;T</div>
          <div
            className={`font-bold flex items-center gap-1 ${
              isAllOk ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {isAllOk ? (
              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
            )}
            <span>
              {activeEpoch.conformeCount}/{activeEpoch.totalLayers}{' '}
              {activeEpoch.overallStatus.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[#080c12] border border-white/8">
          <div className="text-slate-500">Desvio Máx vs ISO</div>
          <div
            className={`font-bold ${
              activeEpoch.maxDeviationMm <= activeEpoch.allowedDeviationMm
                ? 'text-emerald-300'
                : 'text-amber-300'
            }`}
          >
            {activeEpoch.maxDeviationMm.toFixed(3)} ≤ {activeEpoch.allowedDeviationMm.toFixed(2)} mm
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[#080c12] border border-white/8">
          <div className="text-slate-500">Deflexão FEA δ</div>
          <div className="font-bold text-sky-300">
            {activeEpoch.maxDeflectionMm.toFixed(2)} mm · SF {activeEpoch.safetyFactor.toFixed(2)}×
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[#080c12] border border-white/8">
          <div className="text-slate-500">Loss D/G · GAN Boost</div>
          <div className="font-bold text-slate-100">
            {activeEpoch.discriminatorLoss.toFixed(4)} · {activeEpoch.ganStiffnessFactor.toFixed(1)}×
          </div>
        </div>
      </div>

      {/* SVG 1: Convergence Curve across Epochs */}
      <div className="p-2 rounded-lg bg-[#080c12] border border-white/8 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-200">
            Curva de Convergência GAN (Desvio Máx mm)
          </span>
          <span className="font-mono-tabular text-emerald-300">
            ISO ≤ {isoLimitMm.toFixed(2)} mm
          </span>
        </div>
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-auto block"
          role="img"
          aria-label="Gráfico de convergência GAN por época"
        >
          <defs>
            <linearGradient id="ganConvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {/* Baseline axes */}
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            stroke="rgba(148,163,184,0.28)"
            strokeWidth="1"
          />
          <line
            x1={padL}
            y1={padT + plotH}
            x2={chartW - padR}
            y2={padT + plotH}
            stroke="rgba(148,163,184,0.28)"
            strokeWidth="1"
          />
          {/* ISO tolerance dashed line */}
          <line
            x1={padL}
            y1={isoLimitY}
            x2={chartW - padR}
            y2={isoLimitY}
            stroke="#10b981"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
          <text
            x={padL - 4}
            y={padT + 4}
            textAnchor="end"
            fill="#94a3b8"
            fontSize="8"
            fontFamily="monospace"
          >
            {maxY.toFixed(2)}
          </text>
          <text
            x={padL - 4}
            y={isoLimitY + 3}
            textAnchor="end"
            fill="#34d399"
            fontSize="8"
            fontFamily="monospace"
          >
            {isoLimitMm.toFixed(2)}
          </text>
          <text
            x={padL - 4}
            y={padT + plotH + 3}
            textAnchor="end"
            fill="#94a3b8"
            fontSize="8"
            fontFamily="monospace"
          >
            0
          </text>

          {/* Area & curve */}
          {areaPath && <path d={areaPath} fill="url(#ganConvGrad)" />}
          {curvePoints && (
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={curvePoints}
            />
          )}

          {/* Epoch nodes */}
          {report.epochs.map((ep, i) => (
            <circle
              key={ep.epoch}
              cx={mapX(i)}
              cy={mapY(ep.maxDeviationMm)}
              r={i === clampedIdx ? 4.2 : 2}
              fill={ep.overallStatus === 'conforme' ? '#10b981' : '#f43f5e'}
              stroke="#080c12"
              strokeWidth="1"
            />
          ))}

          {/* Active epoch cursor halo */}
          <circle
            cx={activeX}
            cy={activeY}
            r="7"
            fill="none"
            stroke={isAllOk ? '#34d399' : '#38bdf8'}
            strokeWidth="1.2"
            opacity="0.85"
          />

          {/* X-axis tick labels */}
          <text
            x={mapX(0)}
            y={chartH - 5}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="8"
            fontFamily="monospace"
          >
            Ep.0
          </text>
          <text
            x={mapX(Math.floor(report.totalEpochs / 2))}
            y={chartH - 5}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="8"
            fontFamily="monospace"
          >
            Ep.{Math.floor(report.totalEpochs / 2)}
          </text>
          <text
            x={mapX(report.totalEpochs)}
            y={chartH - 5}
            textAnchor="middle"
            fill="#34d399"
            fontSize="8"
            fontFamily="monospace"
          >
            Ep.{report.totalEpochs}
          </text>
        </svg>
      </div>

      {/* SVG 2: Before vs After Layer Conformity Comparison */}
      <div className="p-2 rounded-lg bg-[#080c12] border border-white/8 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-200">
            Conformidade por Layer ({initialEpoch.conformeCount}/{initialEpoch.totalLayers} →{' '}
            {activeEpoch.conformeCount}/{activeEpoch.totalLayers})
          </span>
          <span className="font-mono-tabular text-slate-400">Linha = 100% ISO</span>
        </div>
        <svg
          viewBox={`0 0 ${barChartW} ${barChartH}`}
          className="w-full h-auto block"
          role="img"
          aria-label="Comparativo antes e depois por layer"
        >
          {/* 100% ISO threshold dashed vertical line */}
          <line
            x1={limitLineX}
            y1={4}
            x2={limitLineX}
            y2={barChartH - 14}
            stroke="#10b981"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
          <text
            x={limitLineX}
            y={barChartH - 3}
            textAnchor="middle"
            fill="#34d399"
            fontSize="7.5"
            fontFamily="monospace"
          >
            Limite 100%
          </text>

          {layers.map((layer, idx) => {
            const initLayer = initialEpoch.layers[idx] ?? layer;
            const yTop = 6 + idx * rowH;
            const initW = Math.max(
              2,
              Math.min(trackW, (initLayer.utilizationPct / maxRatioPct) * trackW)
            );
            const curW = Math.max(
              2,
              Math.min(trackW, (layer.utilizationPct / maxRatioPct) * trackW)
            );
            const shortName =
              layer.layerName.length > 14
                ? `${layer.layerName.slice(0, 13)}…`
                : layer.layerName;

            return (
              <g key={layer.layerName}>
                <text
                  x={2}
                  y={yTop + 11}
                  fill="#cbd5e1"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {shortName}
                </text>
                {/* Background track */}
                <rect
                  x={labelW}
                  y={yTop + 2}
                  width={trackW}
                  height={13}
                  rx="2"
                  fill="rgba(148,163,184,0.08)"
                />
                {/* Before (Epoch 0) bar */}
                <rect
                  x={labelW}
                  y={yTop + 3}
                  width={initW}
                  height={5}
                  rx="1.5"
                  fill="#f43f5e"
                  opacity="0.72"
                />
                {/* Current/After bar */}
                <rect
                  x={labelW}
                  y={yTop + 9}
                  width={curW}
                  height={5.5}
                  rx="1.5"
                  fill={
                    layer.status === 'conforme'
                      ? '#10b981'
                      : layer.status === 'atencao'
                        ? '#f59e0b'
                        : '#fb7185'
                  }
                />
                <text
                  x={barChartW - 2}
                  y={yTop + 12}
                  textAnchor="end"
                  fill={layer.status === 'conforme' ? '#34d399' : '#fda4af'}
                  fontSize="7.5"
                  fontFamily="monospace"
                >
                  {layer.deviationMm.toFixed(3)}/{layer.allowedMm.toFixed(2)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Commit Button */}
      <button
        type="button"
        onClick={onCommit}
        className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>
          Aplicar Correção &amp; Selar VUC ({report.finalEpoch.conformeCount}/
          {report.finalEpoch.totalLayers} CONFORME)
        </span>
      </button>
    </div>
  );
};
