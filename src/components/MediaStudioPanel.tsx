import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  GitBranch,
  Layers,
  Lock,
  Network,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trophy,
  Unlock,
  UserPlus,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import {
  type BrandIdentityConfig,
  DEFAULT_PARAMETRIF_REPRESENTATIVES,
  GAN_CREATIVE_PRESETS,
  GITHUB_GOVERNANCE_AGENTS,
  type GanPresetId,
  MEDIA_STUDIO_PIECE_LIBRARY,
  type MediaOutputFormat,
  type MediaPieceCategoryId,
  type MediaViewSide,
  PARAMETRIF_FOUNDATION_CHARTER,
  PARAMETRIX_BUSINESS_PLAN,
  PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
  type ParametrIfRepresentative,
  buildAgentOrganogramBoard,
  buildGithubBrandGuardWorkflowYaml,
  buildVectorPdfDocument,
  certifyFoundationRepresentative,
  createClientBrandIdentityPreset,
  evaluateConstructiveMediaEngineering,
  generateBrandAssetSvg,
  synthesizeGanLatentMatrix,
} from '../kernel/mediaStudioEngine';
import type { OpenErpWorkspaceSnapshot } from '../kernel/openErpEngine';
import type { ErpCrmRecord, SessionDeliverable, WorkspaceTab } from '../types/cad';

export type MediaStudioSubTab = 'studio' | 'manual' | 'foundation' | 'business-plan';

interface MediaStudioPanelProps {
  liveErpSnapshot?: OpenErpWorkspaceSnapshot;
  activeUserEmail?: string | null;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onRecordDeliverable: (d: Omit<SessionDeliverable, 'id' | 'timestamp'>) => void;
  onAddErpRecord?: (rec: Omit<ErpCrmRecord, 'id' | 'vucHash' | 'updatedAt'>) => Promise<void>;
  initialSubTab?: MediaStudioSubTab;
}

const SEVEN_PIPELINE_STEPS = [
  '1. Identidade',
  '2. Mídia',
  '3. GAN + Construtiva',
  '4. Personalização',
  '5. Preview 3 Vistas',
  '6. Aprovação',
  '7. Exportação',
] as const;

async function rasterizeSvgToCanvasBlob(
  svgMarkup: string,
  mimeType: 'image/png' | 'image/jpeg',
  width: number,
  height: number
): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao rasterizar SVG no canvas.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexto Canvas 2D indisponível.');
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, 0.94)
    );
    if (!blob) throw new Error('Falha ao gerar arquivo rasterizado.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MediaStudioPanel: React.FC<MediaStudioPanelProps> = ({
  liveErpSnapshot,
  activeUserEmail = null,
  onNavigateTab,
  onRecordDeliverable,
  onAddErpRecord,
  initialSubTab = 'studio',
}) => {
  const [subTab, setSubTab] = useState<MediaStudioSubTab>(initialSubTab);
  const [activeStep, setActiveStep] = useState<number>(0);

  // Identity State (Official 1.0 or Client Custom Product)
  const [identity, setIdentity] = useState<BrandIdentityConfig>(() => ({
    ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
    contactEmail: activeUserEmail || PARAMETRIX_OFFICIAL_IDENTITY_PRESET.contactEmail,
  }));
  const [clientDraftName, setClientDraftName] = useState('Metalúrgica Nova Era');
  const [clientPrimaryHex, setClientPrimaryHex] = useState('#1D4ED8');
  const [clientAccentHex, setClientAccentHex] = useState('#06B6D4');

  // Selected Media Piece + View Side + Batch
  const [selectedPieceId, setSelectedPieceId] = useState<MediaPieceCategoryId>('05-football');
  const [viewSide, setViewSide] = useState<MediaViewSide>('front');
  const [batchQty, setBatchQty] = useState<number>(25);

  // GAN Creative Latent Matrix State
  const [ganSeed, setGanSeed] = useState<number>(40961);
  const [ganPreset, setGanPreset] = useState<GanPresetId>('kinetic-stadium');
  const [creativeIntensity, setCreativeIntensity] = useState<number>(0.72);
  const [curvatureHarmonic, setCurvatureHarmonic] = useState<number>(0.68);
  const [circuitDensity, setCircuitDensity] = useState<number>(0.64);
  const [motionSweep, setMotionSweep] = useState<number>(0.75);

  // Export & ERP status
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<MediaOutputFormat | null>(null);
  const [erpSyncBusy, setErpSyncBusy] = useState(false);

  // ParametrIF Representatives Registry State
  const [representatives, setRepresentatives] = useState<ParametrIfRepresentative[]>(
    DEFAULT_PARAMETRIF_REPRESENTATIVES
  );
  const [repName, setRepName] = useState('');
  const [repRegion, setRepRegion] = useState('Brasil — Sul / Paraná');
  const [repGithub, setRepGithub] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repRole, setRepRole] = useState<ParametrIfRepresentative['role']>(
    'Embaixador Regional'
  );
  const [workflowCopied, setWorkflowCopied] = useState(false);

  const selectedPiece = useMemo(
    () =>
      MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === selectedPieceId) ??
      MEDIA_STUDIO_PIECE_LIBRARY[0],
    [selectedPieceId]
  );

  const ganMatrix = useMemo(
    () =>
      synthesizeGanLatentMatrix({
        seed: ganSeed,
        preset: ganPreset,
        creativeIntensity,
        curvatureHarmonic,
        circuitDensity,
        motionSweep,
      }),
    [ganSeed, ganPreset, creativeIntensity, curvatureHarmonic, circuitDensity, motionSweep]
  );

  const constructiveReport = useMemo(
    () => evaluateConstructiveMediaEngineering(identity, selectedPiece, ganMatrix, batchQty),
    [identity, selectedPiece, ganMatrix, batchQty]
  );

  const liveSvgMarkup = useMemo(
    () => generateBrandAssetSvg(identity, selectedPiece, ganMatrix, viewSide),
    [identity, selectedPiece, ganMatrix, viewSide]
  );

  const organogramNodes = useMemo(
    () => buildAgentOrganogramBoard(liveErpSnapshot),
    [liveErpSnapshot]
  );

  const githubWorkflowYaml = useMemo(
    () => buildGithubBrandGuardWorkflowYaml('scoobiii/parametrIX'),
    []
  );

  const handleApplyOfficialMode = () => {
    setIdentity({
      ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      officialDomain: identity.officialDomain,
      officialDomainConfirmed: identity.officialDomainConfirmed,
      partnerSponsorName: identity.partnerSponsorName,
      athleteImageRightsCleared: identity.athleteImageRightsCleared,
      clubRulesVerified: identity.clubRulesVerified,
    });
    setActiveStep(1);
    setExportStatus('Identidade Oficial ParametrIX 1.0 restaurada.');
  };

  const handleApplyClientMode = () => {
    const custom = createClientBrandIdentityPreset(
      clientDraftName,
      clientPrimaryHex,
      clientAccentHex,
      identity.partnerSponsorName
    );
    setIdentity({
      ...custom,
      officialDomain: identity.officialDomain,
      officialDomainConfirmed: identity.officialDomainConfirmed,
      athleteImageRightsCleared: identity.athleteImageRightsCleared,
      clubRulesVerified: identity.clubRulesVerified,
    });
    setActiveStep(1);
    setExportStatus(`Identidade construtiva criada para cliente "${custom.brandName}".`);
  };

  const handleExportAsset = async (format: MediaOutputFormat) => {
    setExportBusy(format);
    setExportStatus(null);
    const slug = `${identity.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${selectedPiece.id}-${viewSide}`;
    try {
      if (format === 'SVG') {
        const blob = new Blob([liveSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
        triggerBlobDownload(blob, `${slug}.svg`);
        onRecordDeliverable({
          filename: `${slug}.svg`,
          kind: 'SVG',
          summary: `Media Studio SVG (${selectedPiece.title}) · VUC ${constructiveReport.vucProofHex}`,
        });
      } else if (format === 'PDF') {
        const pdfText = buildVectorPdfDocument(
          identity,
          selectedPiece,
          constructiveReport,
          viewSide
        );
        const blob = new Blob([pdfText], { type: 'application/pdf' });
        triggerBlobDownload(blob, `${slug}.pdf`);
        onRecordDeliverable({
          filename: `${slug}.pdf`,
          kind: 'PDF',
          summary: `PDF Vetorial ${selectedPiece.targetDpi} DPI · Sangria ${selectedPiece.bleedMm}mm · VUC ${constructiveReport.vucProofHex}`,
        });
      } else {
        const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
        const isWide =
          selectedPiece.id === '03-stationery' ||
          selectedPiece.id === '06-advertising' ||
          selectedPiece.id === '08-digital' ||
          selectedPiece.id === '09-manual' ||
          (selectedPiece.id === '05-football' && viewSide === 'application');
        const blob = await rasterizeSvgToCanvasBlob(
          liveSvgMarkup,
          mime,
          isWide ? 1800 : 1440,
          isWide ? 1000 : 1440
        );
        triggerBlobDownload(blob, `${slug}.${format.toLowerCase()}`);
        onRecordDeliverable({
          filename: `${slug}.${format.toLowerCase()}`,
          kind: format,
          summary: `Arte ${format} (${selectedPiece.title}) · GAN #${ganMatrix.seed} · VUC ${constructiveReport.vucProofHex}`,
        });
      }
      setActiveStep(6);
      setExportStatus(
        `Exportado ${slug}.${format.toLowerCase()} com prova VUC ${constructiveReport.vucProofHex}.`
      );
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : 'Erro ao exportar artefato de mídia.'
      );
    } finally {
      setExportBusy(null);
    }
  };

  const handleSyncToErp = async () => {
    if (!onAddErpRecord) return;
    setErpSyncBusy(true);
    try {
      await onAddErpRecord({
        kind: 'order',
        title: `Media Studio: ${selectedPiece.title} (${identity.brandName}) × ${constructiveReport.batchQty}`,
        partyName: identity.contactName || identity.brandName,
        segment: liveErpSnapshot?.segment ?? 'industrial-cnc',
        amountBrl: constructiveReport.batchTotalBrl,
        status: constructiveReport.allPassed ? 'em-producao' : 'aberto',
        modal: liveErpSnapshot?.logistics.modal ?? 'road',
        ownerRole: 'client',
      });
      setExportStatus(
        `Ordem lançada no ERP Open: R$ ${constructiveReport.batchTotalBrl.toLocaleString('pt-BR')} (${constructiveReport.batchQty} un).`
      );
    } finally {
      setErpSyncBusy(false);
    }
  };

  const handleCertifyRepresentative = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repName.trim() || !repEmail.trim()) return;
    setRepresentatives((prev) =>
      certifyFoundationRepresentative(prev, {
        fullName: repName,
        role: repRole,
        region: repRegion,
        githubHandle: repGithub || repName.toLowerCase().replace(/\s+/g, '-'),
        email: repEmail,
      })
    );
    setRepName('');
    setRepGithub('');
    setRepEmail('');
  };

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-[#0b0e14] text-slate-100">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Top Header + Sub-Tab Navigation */}
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-white/10">
          <div>
            <div className="text-[11px] font-mono-tabular text-cyan-300">
              ParametrIX Media Studio · Identidade 1.0 · GAN + Engenharia Construtiva
            </div>
            <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-slate-100">
              {identity.brandName} — {identity.tagline}
            </h1>
            <p className="text-xs text-slate-400">
              {identity.slogan}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'studio', label: 'Estúdio 7 Etapas', icon: Sparkles },
                { id: 'manual', label: 'Manual 1.0 & Futebol', icon: BookOpen },
                { id: 'foundation', label: 'ParametrIF & GitHub', icon: GitBranch },
                { id: 'business-plan', label: 'Business Plan & Organograma', icon: Network },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2563EB]/20 border-[#22D3EE] text-cyan-200'
                      : 'bg-[#111620] border-white/10 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* SUBTAB 1: 7-STEP MEDIA STUDIO (GAN CREATIVE + CONSTRUCTIVE ENGINEERING) */}
        {subTab === 'studio' && (
          <div className="space-y-4">
            {/* 7-Step Flow Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
              {SEVEN_PIPELINE_STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveStep(idx)}
                  className={`px-2.5 py-2 rounded-lg border text-left text-[11px] font-mono-tabular transition-colors cursor-pointer ${
                    activeStep === idx
                      ? 'bg-[#2563EB]/25 border-[#22D3EE] text-cyan-200 font-semibold'
                      : idx < activeStep
                        ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-200'
                        : 'bg-[#111620] border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {exportStatus && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-400/35 rounded-lg text-xs text-emerald-200 flex items-center justify-between gap-2">
                <span>{exportStatus}</span>
                <span className="font-mono-tabular text-[11px] text-cyan-300">
                  VUC {constructiveReport.vucProofHex}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* LEFT COLUMN: Controls (Identity + 01-09 Library + Dual GAN/Constructive + Compliance) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Step 1: Official ParametrIX vs Client Custom Brand */}
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-cyan-400" />
                      1. Identidade (ParametrIX 1.0 ou Cliente)
                    </h2>
                    <span className="text-[11px] font-mono-tabular text-cyan-300">
                      {identity.mode === 'parametrix-official' ? 'OFICIAL 1.0' : 'CLIENTE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleApplyOfficialMode}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        identity.mode === 'parametrix-official'
                          ? 'bg-[#2563EB] text-white border-[#22D3EE]'
                          : 'bg-[#0b0e14] border-white/10 text-slate-300'
                      }`}
                    >
                      ParametrIX Oficial
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyClientMode}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        identity.mode === 'client-custom'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                          : 'bg-[#0b0e14] border-white/10 text-slate-300'
                      }`}
                    >
                      Produto de Cliente
                    </button>
                  </div>

                  {identity.mode === 'client-custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <input
                        type="text"
                        value={clientDraftName}
                        onChange={(e) => {
                          setClientDraftName(e.target.value);
                          setIdentity((prev) => ({ ...prev, brandName: e.target.value || 'Cliente' }));
                        }}
                        placeholder="Marca / Produto Cliente"
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100"
                      />
                      <label className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>Primária</span>
                        <input
                          type="color"
                          value={clientPrimaryHex}
                          onChange={(e) => {
                            setClientPrimaryHex(e.target.value);
                            const next = createClientBrandIdentityPreset(
                              clientDraftName,
                              e.target.value,
                              clientAccentHex,
                              identity.partnerSponsorName
                            );
                            setIdentity((prev) => ({ ...next, officialDomain: prev.officialDomain, officialDomainConfirmed: prev.officialDomainConfirmed }));
                          }}
                          className="w-8 h-6 bg-transparent border-0 cursor-pointer"
                        />
                      </label>
                      <label className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>Acento</span>
                        <input
                          type="color"
                          value={clientAccentHex}
                          onChange={(e) => {
                            setClientAccentHex(e.target.value);
                            const next = createClientBrandIdentityPreset(
                              clientDraftName,
                              clientPrimaryHex,
                              e.target.value,
                              identity.partnerSponsorName
                            );
                            setIdentity((prev) => ({ ...next, officialDomain: prev.officialDomain, officialDomainConfirmed: prev.officialDomainConfirmed }));
                          }}
                          className="w-8 h-6 bg-transparent border-0 cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                </section>

                {/* Step 2: 9-Piece Library Matrix */}
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-2.5">
                  <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    2. Biblioteca Derivada da Matriz (01 a 09)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                    {MEDIA_STUDIO_PIECE_LIBRARY.map((piece) => {
                      const active = piece.id === selectedPieceId;
                      return (
                        <button
                          key={piece.id}
                          type="button"
                          onClick={() => {
                            setSelectedPieceId(piece.id);
                            setActiveStep(2);
                          }}
                          className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#2563EB]/20 border-[#22D3EE] text-slate-100'
                              : 'bg-[#0b0e14] border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="text-[11px] font-mono-tabular text-cyan-300">
                            {piece.code} · {piece.widthMm.toFixed(0)}×{piece.heightMm.toFixed(0)}mm
                          </div>
                          <div className="text-xs font-medium truncate">{piece.title}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Step 3: Dual Motor — GAN Creative Engine */}
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      3. Motor Criativo GAN (Vetor Latente z)
                    </h2>
                    <button
                      type="button"
                      onClick={() => setGanSeed((s) => ((s * 73 + 193) % 99991) + 1000)}
                      className="text-[11px] font-mono-tabular text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Seed #{ganSeed}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {GAN_CREATIVE_PRESETS.map((gp) => (
                      <button
                        key={gp.id}
                        type="button"
                        onClick={() => setGanPreset(gp.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] cursor-pointer ${
                          ganPreset === gp.id
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                            : 'bg-[#0b0e14] border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {gp.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                    <label className="space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Criatividade GAN</span>
                        <span className="font-mono-tabular text-slate-200">
                          {Math.round(creativeIntensity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={creativeIntensity}
                        onChange={(e) => setCreativeIntensity(parseFloat(e.target.value))}
                        className="cad-slider w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Malha NURBS</span>
                        <span className="font-mono-tabular text-slate-200">
                          {Math.round(curvatureHarmonic * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={curvatureHarmonic}
                        onChange={(e) => setCurvatureHarmonic(parseFloat(e.target.value))}
                        className="cad-slider w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Circuito VUC</span>
                        <span className="font-mono-tabular text-slate-200">
                          {Math.round(circuitDensity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={circuitDensity}
                        onChange={(e) => setCircuitDensity(parseFloat(e.target.value))}
                        className="cad-slider w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Movimento</span>
                        <span className="font-mono-tabular text-slate-200">
                          {Math.round(motionSweep * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={motionSweep}
                        onChange={(e) => setMotionSweep(parseFloat(e.target.value))}
                        className="cad-slider w-full"
                      />
                    </label>
                  </div>
                </section>

                {/* Step 4 & 6: Personalization, Partner Sponsor, Domain Lock & Football Compliance */}
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-2.5 text-xs">
                  <h2 className="font-semibold text-slate-100 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-300" />
                    4 & 6. Personalização, Patrocinador & Trava QR/URL
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={identity.contactName}
                      onChange={(e) =>
                        setIdentity((p) => ({ ...p, contactName: e.target.value }))
                      }
                      placeholder="Nome / Titular do Cartão"
                      className="px-2.5 py-1.5 bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100"
                    />
                    <input
                      type="text"
                      value={identity.contactRole}
                      onChange={(e) =>
                        setIdentity((p) => ({ ...p, contactRole: e.target.value }))
                      }
                      placeholder="Cargo / Área"
                      className="px-2.5 py-1.5 bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100"
                    />
                  </div>

                  {selectedPiece.supportsPartnerSponsor && (
                    <input
                      type="text"
                      value={identity.partnerSponsorName}
                      onChange={(e) =>
                        setIdentity((p) => ({ ...p, partnerSponsorName: e.target.value }))
                      }
                      placeholder="Patrocinador Parceiro (sem distorcer o símbolo P)"
                      className="w-full px-2.5 py-1.5 bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100"
                    />
                  )}

                  {/* Official Domain Lock */}
                  <div className="p-2.5 bg-[#0b0e14] border border-white/10 rounded-lg space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
                        {identity.officialDomainConfirmed ? (
                          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        Domínio Oficial Confirmado (Libera QR Code e URL)
                      </span>
                      <input
                        type="checkbox"
                        checked={identity.officialDomainConfirmed}
                        onChange={(e) =>
                          setIdentity((p) => ({
                            ...p,
                            officialDomainConfirmed: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    {identity.officialDomainConfirmed && (
                      <input
                        type="url"
                        value={identity.officialDomain}
                        onChange={(e) =>
                          setIdentity((p) => ({ ...p, officialDomain: e.target.value }))
                        }
                        placeholder="https://parametrix.org"
                        className="w-full px-2.5 py-1.5 text-xs bg-[#111620] border border-cyan-400/40 rounded-lg text-slate-100"
                      />
                    )}
                  </div>

                  {/* Football / Club Compliance Checkboxes */}
                  {selectedPiece.requiresComplianceChecks && (
                    <div className="p-2.5 bg-[#0b0e14] border border-amber-400/25 rounded-lg space-y-1.5 text-[11px]">
                      <div className="font-semibold text-amber-300 flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5" /> Compliance Futebol & Estádio
                      </div>
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={identity.athleteImageRightsCleared}
                          onChange={(e) =>
                            setIdentity((p) => ({
                              ...p,
                              athleteImageRightsCleared: e.target.checked,
                            }))
                          }
                        />
                        Direitos de imagem de atletas autorizados
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={identity.clubRulesVerified}
                          onChange={(e) =>
                            setIdentity((p) => ({
                              ...p,
                              clubRulesVerified: e.target.checked,
                            }))
                          }
                        />
                        Regras de clube, competição e estádio verificadas
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-slate-400">Quantidade do Lote:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={batchQty}
                        onChange={(e) => setBatchQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-24 px-2 py-1 text-right font-mono-tabular bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100"
                      />
                      <span className="font-mono-tabular text-cyan-300 font-semibold">
                        R$ {constructiveReport.batchTotalBrl.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN: Live Preview (Front / Back / Application) + Constructive Checks + 4 Production Exports */}
              <div className="lg:col-span-7 space-y-4">
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono-tabular text-cyan-300">
                        5. Pré-Visualização Construtiva · {selectedPiece.code} {selectedPiece.title}
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedPiece.widthMm}×{selectedPiece.heightMm} mm · Sangria{' '}
                        {selectedPiece.bleedMm} mm · {selectedPiece.targetDpi} DPI ·{' '}
                        {selectedPiece.colorSpace}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      {(
                        [
                          { id: 'front', label: 'Frente' },
                          { id: 'back', label: 'Verso' },
                          { id: 'application', label: 'Aplicação Real' },
                        ] as const
                      ).map((vs) => (
                        <button
                          key={vs.id}
                          type="button"
                          onClick={() => {
                            setViewSide(vs.id);
                            setActiveStep(4);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                            viewSide === vs.id
                              ? 'bg-[#2563EB] text-white border-[#22D3EE]'
                              : 'bg-[#0b0e14] border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {vs.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Rendered Vector Preview */}
                  <div
                    className="w-full bg-[#05070B] border border-white/12 rounded-xl overflow-hidden flex items-center justify-center p-2"
                    dangerouslySetInnerHTML={{ __html: liveSvgMarkup }}
                  />

                  {/* Export Production Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                    {(['SVG', 'PDF', 'PNG', 'JPG'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        disabled={exportBusy !== null}
                        onClick={() => void handleExportAsset(fmt)}
                        className="min-h-[42px] px-3 py-2 rounded-lg bg-[#0b0e14] border border-cyan-400/35 hover:border-cyan-300 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{exportBusy === fmt ? 'Gerando...' : `.${fmt}`}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={erpSyncBusy || !onAddErpRecord}
                      onClick={() => void handleSyncToErp()}
                      className="col-span-2 sm:col-span-1 min-h-[42px] px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{erpSyncBusy ? 'Enviando...' : 'Enviar ERP'}</span>
                    </button>
                  </div>
                </section>

                {/* Constructive Engineering Validation Checklist */}
                <section className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Auditoria Construtiva ParametrIX (6 Checagens)
                    </h3>
                    <span
                      className={`text-[11px] font-mono-tabular font-semibold ${
                        constructiveReport.allPassed ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {constructiveReport.allPassed ? 'APROVADO PARA PRODUÇÃO' : 'AJUSTE PENDENTE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {constructiveReport.checks.map((chk) => (
                      <div
                        key={chk.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          chk.passed
                            ? 'bg-emerald-500/8 border-emerald-400/25'
                            : 'bg-amber-500/10 border-amber-400/35'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-medium text-slate-100">
                          {chk.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          )}
                          <span>{chk.label}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{chk.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: MANUAL DA MARCA 1.0 & PROJETO ESPECIAL FUTEBOL */}
        {subTab === 'manual' && (
          <div className="space-y-5">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {identity.palette.map((sw) => (
                <div
                  key={sw.id}
                  className="p-3.5 bg-[#111620] border border-white/10 rounded-xl space-y-2"
                >
                  <div
                    className="h-16 rounded-lg border border-white/15"
                    style={{ backgroundColor: sw.hex }}
                  />
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>{sw.name}</span>
                    <span className="font-mono-tabular text-cyan-300">{sw.hex}</span>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    RGB({sw.rgb.join(', ')}) · CMYK({sw.cmyk.c}/{sw.cmyk.m}/{sw.cmyk.y}/{sw.cmyk.k})
                  </div>
                  <p className="text-[11px] text-slate-400">{sw.role}</p>
                </div>
              ))}
            </section>

            <section className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-cyan-400" />
                  Projeto Especial — ParametrIX no Futebol & Matriz Completa
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPieceId('05-football');
                    setSubTab('studio');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                >
                  Abrir Futebol no Estúdio
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="py-2 pr-3">Código</th>
                      <th className="py-2 pr-3">Categoria</th>
                      <th className="py-2 pr-3">Variações Derivadas da Matriz Única</th>
                      <th className="py-2 pr-3">Formato / DPI</th>
                      <th className="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {MEDIA_STUDIO_PIECE_LIBRARY.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-3 font-mono-tabular text-cyan-300">{p.code}</td>
                        <td className="py-2 pr-3 font-medium text-slate-100">{p.title}</td>
                        <td className="py-2 pr-3 text-slate-400">{p.variants.join(' · ')}</td>
                        <td className="py-2 pr-3 font-mono-tabular text-slate-300">
                          {p.widthMm.toFixed(0)}×{p.heightMm.toFixed(0)}mm · {p.targetDpi} DPI
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPieceId(p.id);
                              setSubTab('studio');
                            }}
                            className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                          >
                            Editar →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* SUBTAB 3: FUNDAÇÃO PARAMETRIF & AGENTES GITHUB */}
        {subTab === 'foundation' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <section className="lg:col-span-6 p-4 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-cyan-400" />
                  {PARAMETRIF_FOUNDATION_CHARTER.foundationName}
                </h2>
                <span className="text-[11px] font-mono-tabular text-emerald-300">
                  {representatives.length} Representantes
                </span>
              </div>
              <p className="text-xs text-slate-400">{PARAMETRIF_FOUNDATION_CHARTER.mandate}</p>

              <ul className="space-y-1.5 text-xs text-slate-300">
                {PARAMETRIF_FOUNDATION_CHARTER.principles.map((pr) => (
                  <li key={pr} className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>{pr}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 pt-2 border-t border-white/10">
                {representatives.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-2.5 bg-[#0b0e14] border border-white/10 rounded-lg flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">
                        {rep.fullName} · <span className="text-cyan-300">{rep.githubHandle}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {rep.role} · {rep.region}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono-tabular text-[11px]">
                      <div className="text-emerald-300">{rep.badgeHash}</div>
                      <div className="text-slate-500">{rep.status}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Certify New Official Representative */}
              <form
                onSubmit={handleCertifyRepresentative}
                className="p-3 bg-[#0b0e14] border border-white/10 rounded-lg space-y-2 text-xs"
              >
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                  Credenciar Novo Representante ParametrIF
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    placeholder="Nome completo"
                    className="px-2.5 py-1.5 bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                  />
                  <input
                    type="email"
                    required
                    value={repEmail}
                    onChange={(e) => setRepEmail(e.target.value)}
                    placeholder="E-mail oficial"
                    className="px-2.5 py-1.5 bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                  />
                  <input
                    type="text"
                    value={repGithub}
                    onChange={(e) => setRepGithub(e.target.value)}
                    placeholder="@handle GitHub"
                    className="px-2.5 py-1.5 bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                  />
                  <select
                    value={repRole}
                    onChange={(e) =>
                      setRepRole(e.target.value as ParametrIfRepresentative['role'])
                    }
                    className="px-2.5 py-1.5 bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                  >
                    <option value="Embaixador Regional">Embaixador Regional</option>
                    <option value="Engenheiro Certificado VUC">Engenheiro Certificado VUC</option>
                    <option value="Parceiro Manufatura CAM">Parceiro Manufatura CAM</option>
                    <option value="Gestão Esportiva & Clubes">Gestão Esportiva & Clubes</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repRegion}
                    onChange={(e) => setRepRegion(e.target.value)}
                    placeholder="Região / País"
                    className="flex-1 px-2.5 py-1.5 bg-[#111620] border border-white/12 rounded-lg text-slate-100"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold cursor-pointer"
                  >
                    Emitir Credencial VUC
                  </button>
                </div>
              </form>
            </section>

            {/* Right: GitHub Management Agents + Brand-Guard Workflow */}
            <section className="lg:col-span-6 p-4 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-sky-400" />
                  Agentes Gestores no GitHub (scoobiii/parametrIX)
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([githubWorkflowYaml], { type: 'text/yaml' });
                    triggerBlobDownload(blob, 'parametrif-brand-guard.yml');
                    setWorkflowCopied(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0b0e14] border border-cyan-400/40 text-xs text-cyan-200 flex items-center gap-1 cursor-pointer"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{workflowCopied ? 'Baixado .yml' : 'Exportar Workflow CI'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {GITHUB_GOVERNANCE_AGENTS.map((ag) => (
                  <div
                    key={ag.id}
                    className="p-3 bg-[#0b0e14] border border-white/10 rounded-lg space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">{ag.name}</span>
                      <span className="font-mono-tabular text-cyan-300">{ag.handle}</span>
                    </div>
                    <div className="text-slate-400">{ag.responsibility}</div>
                    <div className="text-[11px] font-mono-tabular text-emerald-300">
                      Gate: {ag.enforcedCheck}
                    </div>
                  </div>
                ))}
              </div>

              <pre className="p-3 bg-[#05070B] border border-white/10 rounded-lg text-[11px] font-mono-tabular text-slate-300 overflow-x-auto">
                {githubWorkflowYaml}
              </pre>
            </section>
          </div>
        )}

        {/* SUBTAB 4: BUSINESS PLAN & AGENT ORGANOGRAM INTEGRATED WITH ERP/CRM */}
        {subTab === 'business-plan' && (
          <div className="space-y-5">
            {/* Mission, Vision, Value Proposition */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 bg-[#111620] border border-[#2563EB]/40 rounded-xl space-y-1.5">
                <div className="text-[11px] font-mono-tabular text-cyan-300">MISSÃO</div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {PARAMETRIX_BUSINESS_PLAN.mission}
                </p>
              </div>
              <div className="p-4 bg-[#111620] border border-[#22D3EE]/35 rounded-xl space-y-1.5">
                <div className="text-[11px] font-mono-tabular text-cyan-300">VISÃO</div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {PARAMETRIX_BUSINESS_PLAN.vision}
                </p>
              </div>
              <div className="p-4 bg-[#111620] border border-emerald-400/35 rounded-xl space-y-1.5">
                <div className="text-[11px] font-mono-tabular text-emerald-300">
                  PROPOSTA DE VALOR
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {PARAMETRIX_BUSINESS_PLAN.valueProposition}
                </p>
              </div>
            </section>

            {/* 5 Business Plan Pillars */}
            <section className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Plano de Negócios ParametrIX — 5 Motores Integrados
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {PARAMETRIX_BUSINESS_PLAN.pillars.map((pillar) => (
                  <div
                    key={pillar.id}
                    className="p-3 bg-[#0b0e14] border border-white/10 rounded-xl flex flex-col justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-100">{pillar.title}</div>
                      <div className="text-slate-400">
                        <strong className="text-slate-300">Público:</strong> {pillar.targetSegment}
                      </div>
                      <div className="text-slate-400">
                        <strong className="text-slate-300">Receita:</strong> {pillar.revenueStream}
                      </div>
                      <div className="text-[11px] text-cyan-300">
                        <strong>Diferencial:</strong> {pillar.moat}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateTab(pillar.linkedTab)}
                      className="text-left text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Abrir módulo no sistema →
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Agent Organogram Bound Live to ERP / CRM */}
            <section className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Organograma de Agentes Autônomos (ERP / CRM / Engenharia em Tempo Real)
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateTab('ecosystem')}
                  className="px-3 py-1.5 rounded-lg bg-[#0b0e14] border border-white/15 text-xs text-sky-300 hover:border-sky-400 cursor-pointer"
                >
                  Abrir ERP / BI / CRM Completo →
                </button>
              </div>

              {(
                ['Diretoria & Governança', 'Engenharia & Mídia', 'Operações ERP/CRM'] as const
              ).map((tier) => {
                const nodes = organogramNodes.filter((n) => n.tier === tier);
                return (
                  <div key={tier} className="space-y-2">
                    <div className="text-[11px] font-mono-tabular text-slate-400 uppercase tracking-wider">
                      {tier}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {nodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => onNavigateTab(node.linkedTab)}
                          className="p-3 bg-[#0b0e14] border border-white/10 hover:border-[#22D3EE]/50 rounded-xl text-left flex flex-col justify-between gap-1.5 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-100">
                              {node.agentName}
                            </span>
                            <span
                              className={`text-[10px] font-mono-tabular ${
                                node.status === 'online' ? 'text-emerald-400' : 'text-amber-300'
                              }`}
                            >
                              {node.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{node.roleTitle}</div>
                          <div className="text-[11px] font-mono-tabular text-cyan-300 pt-1 border-t border-white/8 flex items-center justify-between">
                            <span>{node.liveKpiLabel}</span>
                            <span>{node.liveKpiValue}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
