import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Cpu,
  DollarSign,
  Download,
  FileJson,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  X,
} from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { formatScoobiiiVucCertificateMarkdown } from '../kernel/scoobiiiVuc';
import type { ScoobiiiFullTelemetry } from '../kernel/scoobiiiProofTelemetry';
import type { ScoobiiiVucProofReport } from '../types/cad';
import { ScoobiiiScatterPlotD3 } from './ScoobiiiScatterPlotD3';

export type ScoobiiiModalTab = 'correlation' | 'cad-cae-cam' | 'commercial' | 'ledger';

interface ScoobiiiVucModalProps {
  report: ScoobiiiVucProofReport;
  telemetry?: ScoobiiiFullTelemetry | null;
  onClose: () => void;
  onExportCertificate?: (filename: string, kind: 'REPORT' | 'MCP', summary: string) => void;
  onIssueFormalVuc?: () => Promise<void> | void;
}

export const ScoobiiiVucModal: React.FC<ScoobiiiVucModalProps> = ({
  report,
  telemetry,
  onClose,
  onExportCertificate,
  onIssueFormalVuc,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ScoobiiiModalTab>('correlation');
  const [formalBusy, setFormalBusy] = useState(false);

  const handleDownloadMd = () => {
    const md = formatScoobiiiVucCertificateMarkdown(report);
    const filename = `${report.certificateId.toLowerCase()}.md`;
    triggerBlobDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename);
    onExportCertificate?.(
      filename,
      'REPORT',
      `Prova SCOOBIII/VUC (${report.allPassed ? 'APROVADO' : 'ALERTA'})`
    );
  };

  const handleDownloadJson = () => {
    const filename = `${report.certificateId.toLowerCase()}.json`;
    const payload = telemetry ? { report, telemetry } : report;
    triggerBlobDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      filename
    );
    onExportCertificate?.(
      filename,
      'MCP',
      `Snapshot matemático SCOOBIII/VUC (${report.checks.length} verificações)`
    );
  };

  const handleIssueFormal = async () => {
    if (!onIssueFormalVuc || formalBusy) return;
    setFormalBusy(true);
    try {
      await onIssueFormalVuc();
    } finally {
      setFormalBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-5">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0f141e] border border-sky-400/35 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-white/10 bg-[#131926] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sigma className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="font-display text-sm sm:text-base font-bold tracking-tight truncate">
                SCOOBIII / VUC — Prova Matemática, Dispersão D3.js & 100% Processos (CAD · CAE · CAM · Financeiro)
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span className="font-mono-tabular text-sky-300 font-semibold">
                {report.certificateId}
              </span>
              <span>·</span>
              <span className="truncate">{report.modelTitle}</span>
              <span>·</span>
              <span className="font-mono-tabular">{report.timestamp}</span>
              {telemetry && (
                <>
                  <span>·</span>
                  <span className="font-mono-tabular text-emerald-300">
                    Cobertura Provas: {telemetry.vucAuditSummary.overallProofPct}%
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar SCOOBIII/VUC"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Verdict Banner */}
        <div
          className={`px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            report.allPassed
              ? 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200'
              : 'bg-amber-500/12 border-amber-400/30 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs">
            {report.allPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="font-medium leading-snug">{report.verdict}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onIssueFormalVuc && (
              <button
                type="button"
                onClick={handleIssueFormal}
                disabled={formalBusy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 hover:bg-emerald-500/30 text-[11px] font-semibold text-emerald-100 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                {formalBusy ? 'Assinando...' : 'Provar Ed25519'}
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadMd}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0b0e14] border border-white/15 hover:border-sky-400/60 text-[11px] font-medium text-slate-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Certificado .MD
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0b0e14] border border-white/15 hover:border-emerald-400/60 text-[11px] font-medium text-slate-100 cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5 text-emerald-400" />
              JSON
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-2.5 border-b border-white/10 bg-[#111622] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {(
            [
              { id: 'correlation', label: 'Dispersão D3 (U×V × Falha) & Desigualdades', icon: BarChart3 },
              { id: 'cad-cae-cam', label: '100% CAD · CAE · CAM', icon: Cpu },
              { id: 'commercial', label: 'Comercial & Financeiro (ERP/VUC)', icon: DollarSign },
              { id: 'ledger', label: 'Ledger VUC (SHA-256 / Ed25519)', icon: Activity },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeSubTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveSubTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-sky-400 text-sky-300 bg-sky-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* 100% Multi-Domain Overview Strip */}
          {telemetry && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {telemetry.domainOverviews.map((dom) => (
                <div
                  key={dom.domain}
                  className="p-3 rounded-xl bg-[#0b0e14] border border-white/10 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-300 truncate">
                      {dom.label}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-bold ${
                        dom.status === 'CONFORME'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {dom.passed}/{dom.total} ({dom.coveragePct}%)
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-sky-200 truncate">
                    {dom.highlight}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 1: D3 Scatter Plot + Core NURBS/Physics/Checks */}
          {activeSubTab === 'correlation' && (
            <div className="space-y-5">
              {telemetry && (
                <ScoobiiiScatterPlotD3
                  points={telemetry.scatterPoints}
                  correlation={telemetry.correlation}
                />
              )}

              {/* NURBS + Physics Telemetry Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-2.5">
                  <div className="text-xs font-semibold text-sky-300 uppercase tracking-wider">
                    1. Kernel NURBS Racional (Cox-de Boor)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Grau / Rede</span>
                      <span className="font-mono-tabular text-slate-100">
                        ({report.nurbsProof.degreeU}, {report.nurbsProof.degreeV}) ·{' '}
                        {report.nurbsProof.controlGrid}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Resíduo ΣRᵢ,ⱼ − 1</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {report.nurbsProof.maxPartitionUnityResidual}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Jacobiano det(J)</span>
                      <span className="font-mono-tabular text-slate-100">
                        {report.nurbsProof.minJacobian} .. {report.nurbsProof.maxJacobian}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Volume Líquido Real</span>
                      <span className="font-mono-tabular text-amber-300">
                        {report.nurbsProof.netVolumeCm3} cm³
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-tabular pt-1 border-t border-white/8">
                    Bruto {report.nurbsProof.grossVolumeCm3} cm³ − Recortes{' '}
                    {report.nurbsProof.featureRemovedVolumeCm3} cm³ + Roscas/Nervuras{' '}
                    {report.nurbsProof.featureAddedVolumeCm3} cm³
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-2.5">
                  <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                    2. Mecânica dos Sólidos & BIM (Física Real)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Material / Módulo E</span>
                      <span className="font-mono-tabular text-slate-100">
                        {report.physicsProof.youngsModulusGpa} GPa · ν={report.physicsProof.poissonRatio}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Inércia I_eff</span>
                      <span className="font-mono-tabular text-slate-100">
                        {report.physicsProof.effectiveInertiaMm4.toLocaleString('pt-BR')} mm⁴
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Concentração Kt / Seção</span>
                      <span className="font-mono-tabular text-amber-300">
                        Kt={report.physicsProof.stressConcentrationKt} ·{' '}
                        {Math.round(report.physicsProof.netSectionRatio * 100)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Von Mises / SF</span>
                      <span className="font-mono-tabular text-sky-300">
                        {report.physicsProof.vonMisesMaxMpa} MPa · SF {report.physicsProof.safetyFactor}×
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-tabular pt-1 border-t border-white/8">
                    Carga {report.physicsProof.loadNewtons} N · Flecha δ ={' '}
                    {report.physicsProof.deflectionMm} mm · Massa líq.{' '}
                    {report.physicsProof.netMassKg} kg
                  </div>
                </div>
              </div>

              {/* Mathematical Inequality Checks */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-200">
                  3. Matriz de Desigualdades Verificadas (Zero Chute / Prova por Substituição)
                </div>
                <div className="space-y-2">
                  {report.checks.map((chk) => (
                    <div
                      key={chk.id}
                      className={`p-3.5 rounded-xl border ${
                        chk.passed
                          ? 'bg-[#0b0e14] border-white/10'
                          : 'bg-rose-950/25 border-rose-500/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-bold ${
                              chk.passed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/25 text-rose-300'
                            }`}
                          >
                            {chk.passed ? 'OK' : 'FALHA'}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-sky-400 uppercase">
                            [{chk.domain}]
                          </span>
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {chk.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono-tabular shrink-0">
                          <span className="text-slate-100 font-semibold">{chk.resultText}</span>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-400">Norma: {chk.limitText}</span>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div className="px-2.5 py-1.5 rounded bg-[#121722] border border-white/6 font-mono-tabular text-sky-200">
                          {chk.formula}
                        </div>
                        <div className="px-2.5 py-1.5 rounded bg-[#121722] border border-white/6 font-mono-tabular text-slate-300">
                          {chk.substitutedValues}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 100% CAD · CAE · CAM Processes */}
          {activeSubTab === 'cad-cae-cam' && telemetry && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* CAD Card */}
                <div className="p-4 rounded-xl bg-[#0b0e14] border border-sky-400/25 space-y-2">
                  <div className="text-sky-300 font-semibold uppercase tracking-wider">
                    CAD · Geometria & GD&T
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Origem / Formato</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.cadSummary.importedFormat}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Malha Subdivisões</span>
                      <span className="font-mono-tabular text-sky-300">
                        {telemetry.cadSummary.subdivisionsLabel} ({telemetry.cadSummary.subdivisionComplexity} cél.)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Erro Cordal Máx</span>
                      <span className="font-mono-tabular text-amber-300">
                        {telemetry.cadSummary.maxChordalErrorMm} mm
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Camadas GD&T</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {telemetry.cadSummary.gdtPassCount}/{telemetry.cadSummary.gdtTotalLayers} conformes
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Caneta Mágica / Features</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.cadSummary.featureOpsCount} ops
                      </span>
                    </div>
                  </div>
                </div>

                {/* CAE Card */}
                <div className="p-4 rounded-xl bg-[#0b0e14] border border-amber-400/25 space-y-2">
                  <div className="text-amber-300 font-semibold uppercase tracking-wider">
                    CAE · FEA & Carbono LCA
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Von Mises / Limite</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.caeSummary.vonMisesMaxMpa} / {telemetry.caeSummary.allowableStressMpa} MPa
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fator de Segurança</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {telemetry.caeSummary.safetyFactor}×
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Flecha Máxima δ</span>
                      <span className="font-mono-tabular text-sky-300">
                        {telemetry.caeSummary.maxDeflectionMm} mm
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pegada CO₂ / EcoGrade</span>
                      <span className="font-mono-tabular text-amber-300">
                        {telemetry.caeSummary.totalCo2Kg} kgCO₂e ({telemetry.caeSummary.ecoGrade})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Buy-to-Fly / Energia</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.caeSummary.buyToFlyRatio}:1 · {telemetry.caeSummary.energyKwh} kWh
                      </span>
                    </div>
                  </div>
                </div>

                {/* CAM Card */}
                <div className="p-4 rounded-xl bg-[#0b0e14] border border-purple-400/25 space-y-2">
                  <div className="text-purple-300 font-semibold uppercase tracking-wider">
                    CAM · Processo & Pós-Proc
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Processo Ativo</span>
                      <span className="font-mono-tabular text-purple-200">
                        {telemetry.camSummary.machineType}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pós-Processador</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.camSummary.postFormat}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ciclo / Percurso</span>
                      <span className="font-mono-tabular text-sky-300">
                        {telemetry.camSummary.estimatedMinutes.toFixed(1)} min ·{' '}
                        {telemetry.camSummary.cuttingLengthMm.toFixed(0)} mm
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Spindle / Avanço</span>
                      <span className="font-mono-tabular text-slate-100">
                        {telemetry.camSummary.spindleRpm} RPM · {telemetry.camSummary.feedRateMmMin} mm/min
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fila CAM / Máquinas Remotas</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {telemetry.camSummary.serviceJobsCount} jobs · {telemetry.camSummary.remoteMachinesCount} nós
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remote Machines + CAM Service Jobs Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Máquinas Remotas (OPC-UA · MQTT · SSH-KUKA · Moonraker)
                  </div>
                  {telemetry.camSummary.remoteMachines.length === 0 ? (
                    <div className="text-[11px] text-slate-500">
                      Nenhuma máquina remota carregada nesta sessão.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {telemetry.camSummary.remoteMachines.map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 rounded-lg bg-[#121722] border border-white/8 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100 truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono-tabular truncate">
                              {m.protocol} · {m.machineType} · {m.status}
                            </div>
                          </div>
                          <span className="font-mono-tabular text-[10px] text-emerald-300 shrink-0">
                            {m.lastJobVuc.slice(0, 14)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Fila de Serviços CAM & Programas Pré-Programados
                  </div>
                  {telemetry.camSummary.serviceJobs.length === 0 ? (
                    <div className="text-[11px] text-slate-500">
                      Nenhum serviço CAM na fila ainda — use a aba CAM & Robôs para criar ou reiniciar lotes.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {telemetry.camSummary.serviceJobs.map((job) => (
                        <div
                          key={job.id}
                          className="p-2.5 rounded-lg bg-[#121722] border border-white/8 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100 truncate">{job.title}</div>
                            <div className="text-[10px] text-slate-400 font-mono-tabular">
                              {job.machineType} · {job.status} · {job.progressPct}%
                            </div>
                          </div>
                          <span className="font-mono-tabular text-[10px] text-sky-300 shrink-0">
                            {job.vucHash.slice(0, 14)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Commercial & Financial Processes (ERP / Costing / Logistics / Compute) */}
          {activeSubTab === 'commercial' && telemetry && (
            <div className="space-y-4">
              {/* Unit Economics & Pricing Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0b0e14] border border-emerald-400/25">
                  <div className="text-slate-400 text-[10px]">Custo Unitário Fabril</div>
                  <div className="font-mono-tabular text-lg font-bold text-amber-300 mt-0.5">
                    R$ {telemetry.financialSummary.unitCost.totalUnitCostBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono-tabular">
                    Mat R$ {telemetry.financialSummary.unitCost.materialBrl} · CNC R${' '}
                    {telemetry.financialSummary.unitCost.machiningBrl}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b0e14] border border-sky-400/25">
                  <div className="text-slate-400 text-[10px]">Preço Comercial Sugerido</div>
                  <div className="font-mono-tabular text-lg font-bold text-sky-300 mt-0.5">
                    R$ {telemetry.financialSummary.unitCost.suggestedSalePriceBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono-tabular">
                    Margem Bruta {telemetry.financialSummary.unitCost.grossMarginPct}% · Break-even{' '}
                    {telemetry.financialSummary.unitCost.breakEvenBatchUnits} un.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b0e14] border border-white/10">
                  <div className="text-slate-400 text-[10px]">Pipeline Comercial ERP/CRM</div>
                  <div className="font-mono-tabular text-lg font-bold text-emerald-300 mt-0.5">
                    R$ {telemetry.financialSummary.totalPipelineBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono-tabular">
                    {telemetry.financialSummary.openOrdersCount} abertas ·{' '}
                    {telemetry.financialSummary.completedOrdersCount} concluídas
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b0e14] border border-white/10">
                  <div className="text-slate-400 text-[10px]">Logística & Compute 20%</div>
                  <div className="font-mono-tabular text-lg font-bold text-slate-100 mt-0.5">
                    {telemetry.financialSummary.activeCouriersCount} rotas ·{' '}
                    {telemetry.financialSummary.computeTflopsTotal} TF
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono-tabular truncate">
                    VUC: {telemetry.financialSummary.unitCost.deterministicVucHash.slice(0, 16)}
                  </div>
                </div>
              </div>

              {/* ERP Category Breakdown + Detailed Table */}
              <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Ordens Comerciais, Insumos, Leads, Fretes & Faturas VUC
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {telemetry.financialSummary.byErpKind.map((g) => (
                      <span
                        key={g.kind}
                        className="px-2 py-0.5 rounded bg-[#121722] border border-white/10 text-[10px] font-mono-tabular text-sky-200 uppercase"
                      >
                        {g.kind}: {g.count}× (R$ {g.totalBrl.toLocaleString('pt-BR')})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Descrição</th>
                        <th className="py-2 pr-3">Parceiro</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Valor (R$)</th>
                        <th className="py-2">Prova VUC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {telemetry.financialSummary.erpRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td className="py-2 pr-3 font-mono-tabular uppercase text-sky-300">
                            {rec.kind}
                          </td>
                          <td className="py-2 pr-3 text-slate-100">{rec.title}</td>
                          <td className="py-2 pr-3 text-slate-400">{rec.partyName}</td>
                          <td className="py-2 pr-3 font-mono-tabular text-amber-300">
                            {rec.status}
                          </td>
                          <td className="py-2 pr-3 font-mono-tabular text-emerald-300">
                            R$ {rec.amountBrl.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 font-mono-tabular text-[10px] text-slate-400">
                            {rec.vucHash.slice(0, 18)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: VUC Cryptographic Ledger */}
          {activeSubTab === 'ledger' && telemetry && (
            <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Ledger Persistido SQLite (`vuc_ledger`) + Assinatura Ed25519
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Certificado ativo: {telemetry.vucAuditSummary.scoobiiiCertificateId}
                    {telemetry.vucAuditSummary.latestServerVucHex
                      ? ` · Último servidor: ${telemetry.vucAuditSummary.latestServerVucHex}`
                      : ''}
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-400/35 font-mono-tabular text-[11px] text-emerald-300">
                  {telemetry.vucAuditSummary.totalLedgerEntries} registros auditáveis
                </span>
              </div>

              {telemetry.vucAuditSummary.ledgerEntries.length === 0 ? (
                <div className="text-[11px] text-slate-500 py-4 text-center">
                  Nenhum registro VUC persistido no Ledger nesta consulta offline.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-white/10 text-slate-400 sticky top-0 bg-[#0b0e14]">
                      <tr>
                        <th className="py-2 pr-3">Domínio</th>
                        <th className="py-2 pr-3">Resumo</th>
                        <th className="py-2 pr-3">Hash VUC</th>
                        <th className="py-2 pr-3">SHA-256</th>
                        <th className="py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {telemetry.vucAuditSummary.ledgerEntries.map((entry) => (
                        <tr key={entry.vucHash}>
                          <td className="py-2 pr-3 font-mono-tabular text-sky-300">
                            {entry.domain}
                          </td>
                          <td className="py-2 pr-3 text-slate-200">{entry.summary}</td>
                          <td className="py-2 pr-3 font-mono-tabular text-emerald-300">
                            {entry.vucHash.slice(0, 18)}
                          </td>
                          <td className="py-2 pr-3 font-mono-tabular text-slate-400">
                            {entry.sha256Hex.slice(0, 16)}...
                          </td>
                          <td className="py-2 font-mono-tabular text-slate-500">
                            {entry.createdAt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
