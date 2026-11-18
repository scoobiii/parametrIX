import React from 'react';
import { CheckCircle2, Download, FileJson, ShieldAlert, Sigma, X } from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import { formatScoobiiiVucCertificateMarkdown } from '../kernel/scoobiiiVuc';
import type { ScoobiiiVucProofReport } from '../types/cad';

interface ScoobiiiVucModalProps {
  report: ScoobiiiVucProofReport;
  onClose: () => void;
  onExportCertificate?: (filename: string, kind: 'REPORT' | 'MCP', summary: string) => void;
}

export const ScoobiiiVucModal: React.FC<ScoobiiiVucModalProps> = ({
  report,
  onClose,
  onExportCertificate,
}) => {
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
    triggerBlobDownload(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }),
      filename
    );
    onExportCertificate?.(
      filename,
      'MCP',
      `Snapshot matemático SCOOBIII/VUC (${report.checks.length} verificações)`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0f141e] border border-sky-400/35 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-white/10 bg-[#131926] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sigma className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="font-display text-sm sm:text-base font-bold tracking-tight truncate">
                SCOOBIII / VUC — Prova Matemática Paramétrica (NURBS · BIM · Física · Normas)
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

          <div className="flex items-center gap-2 shrink-0">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
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
                    ({report.nurbsProof.degreeU}, {report.nurbsProof.degreeV}) · {report.nurbsProof.controlGrid}
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
      </div>
    </div>
  );
};
