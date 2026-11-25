import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Box,
  Briefcase,
  Cloud,
  Cpu,
  FolderOpen,
  Globe,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  LIBRARY_CATEGORIES,
  filterLibraryItems,
  listLibraryCategoriesWithBest,
  resolveLibraryPreset,
  type LibraryCatalogItem,
  type LibraryCategoryId,
} from '../kernel/libraryCatalog';
import { parseUploadedCadOrImageFile, type FullWorkspacePreset } from '../kernel/workspacePresets';
import {
  downloadDriveFileContent,
  listDriveCadFiles,
} from '../services/googleDriveProjects';
import type {
  EngineeringArea,
  GoogleDriveFolderFile,
  ImportedCadModel,
} from '../types/cad';

interface CatalogSearchHit {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface LibraryCatalogPanelProps {
  activePresetId?: string;
  googleUserEmail: string | null;
  googleAccessToken: string | null;
  sessionToken: string | null;
  onConnectGoogleDrive: () => Promise<string | null | void>;
  onExportPresetToArea: (
    preset: FullWorkspacePreset,
    target: EngineeringArea | 'erp'
  ) => void;
  onSavePresetToProjects: (preset: FullWorkspacePreset) => Promise<void>;
  onLoadImportedCad: (model: ImportedCadModel, target?: EngineeringArea | 'erp') => void;
  onSimulateGanPreset?: (preset: FullWorkspacePreset) => void;
}

export const LibraryCatalogPanel: React.FC<LibraryCatalogPanelProps> = ({
  activePresetId,
  googleUserEmail,
  googleAccessToken,
  sessionToken,
  onConnectGoogleDrive,
  onExportPresetToArea,
  onSavePresetToProjects,
  onLoadImportedCad,
  onSimulateGanPreset,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<LibraryCategoryId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cadUrlInput, setCadUrlInput] = useState('');
  const [catalogHits, setCatalogHits] = useState<CatalogSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFolderFile[]>([]);
  const [driveBusy, setDriveBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categoryGroups = useMemo(() => listLibraryCategoriesWithBest(), []);
  const filteredItems = useMemo(
    () => filterLibraryItems(selectedCategory, searchQuery),
    [selectedCategory, searchQuery]
  );

  // Deduplicate: when viewing all categories without search, the curated Best items
  // appear exclusively in the top section, while complementary items appear below.
  const showingAllWithoutSearch = selectedCategory === 'all' && !searchQuery.trim();
  const secondaryItems = useMemo(
    () =>
      showingAllWithoutSearch
        ? filteredItems.filter((item) => !item.isCategoryBest)
        : filteredItems,
    [showingAllWithoutSearch, filteredItems]
  );

  const activeCategoryMeta =
    selectedCategory === 'all'
      ? LIBRARY_CATEGORIES[0]
      : (LIBRARY_CATEGORIES.find((c) => c.id === selectedCategory) ?? LIBRARY_CATEGORIES[0]);

  const refreshDriveLibrary = useCallback(async () => {
    if (!googleAccessToken) {
      setDriveFiles([]);
      return;
    }
    setDriveBusy(true);
    try {
      const files = await listDriveCadFiles(googleAccessToken, searchQuery.trim() || undefined);
      setDriveFiles(files.slice(0, 12));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Falha ao listar modelos CAD do Google Drive.'
      );
    } finally {
      setDriveBusy(false);
    }
  }, [googleAccessToken, searchQuery]);

  useEffect(() => {
    if (googleAccessToken) {
      void refreshDriveLibrary();
    }
  }, [googleAccessToken, refreshDriveLibrary]);

  const handleCatalogSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim() || activeCategoryMeta.defaultCatalogQuery;
    setSearchBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const resp = await fetch('/api/hermes/search', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          query: q,
          includeWeb: true,
          maxResults: 6,
          googleUserEmail: googleUserEmail || undefined,
          googleDriveActive: Boolean(googleAccessToken),
        }),
      });
      const data = (await resp.json()) as {
        webHits?: CatalogSearchHit[];
        ragHits?: { docTitle?: string; text?: string }[];
        compactSummaryText?: string;
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Falha ao consultar busca Super-RAG & Drive.');
      }
      const hits: CatalogSearchHit[] = [
        ...(data.webHits ?? []),
        ...(data.ragHits ?? []).slice(0, 2).map((r) => ({
          title: r.docTitle || 'Documento RAG Local',
          url: '',
          snippet: (r.text || '').slice(0, 160),
          source: 'RAG Local',
        })),
      ];
      setCatalogHits(hits);
      setStatusMsg(
        hits.length > 0
          ? `${hits.length} referência(s) Super-RAG/Drive encontradas para "${q}".`
          : `Nenhuma prévia externa retornada; utilize o catálogo nativo Parametrix ou seu Google Drive.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha na busca do catálogo.');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleImportPublicCadUrl = async (target: EngineeringArea | 'erp' = 'cad') => {
    const rawUrl = cadUrlInput.trim();
    if (!rawUrl) {
      setErrorMsg('Cole uma URL pública direta .STEP/.STL/.DXF/.OBJ/.SVG ou link do Google Drive.');
      return;
    }
    setImportBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const resp = await fetch('/api/cad/import-url', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          url: rawUrl,
          googleUserEmail: googleUserEmail || undefined,
        }),
      });
      const data = (await resp.json()) as {
        status?: string;
        diagnosticNote?: string;
        title?: string;
        textFile?: { filename: string; mimeType: string; content: string };
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Não foi possível inspecionar a URL CAD.');
      }
      if (data.textFile?.content) {
        const file = new File([data.textFile.content], data.textFile.filename, {
          type: data.textFile.mimeType || 'text/plain',
        });
        const model = await parseUploadedCadOrImageFile(file);
        onLoadImportedCad(model, target);
        setStatusMsg(
          `Modelo "${data.textFile.filename}" importado (${model.triangleCount.toLocaleString('pt-BR')} triângulos) para ${target.toUpperCase()}.`
        );
      } else {
        setStatusMsg(
          `${data.title || 'URL CAD'}: ${data.diagnosticNote || 'Página inspecionada. Baixe o .STEP/.STL e importe direto na aba Arquivos CAD.'}`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar URL CAD.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportDriveItem = async (
    driveFile: GoogleDriveFolderFile,
    target: EngineeringArea | 'erp'
  ) => {
    if (!googleAccessToken) return;
    setImportBusy(true);
    setErrorMsg(null);
    try {
      const { arrayBuffer, mimeType } = await downloadDriveFileContent(
        googleAccessToken,
        driveFile.id,
        driveFile.name
      );
      const file = new File([arrayBuffer], driveFile.name, { type: mimeType });
      const model = await parseUploadedCadOrImageFile(file);
      onLoadImportedCad(model, target);
      setStatusMsg(
        `Drive "${driveFile.name}" carregado e enviado para ${target.toUpperCase()}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Não foi possível importar este arquivo do Google Drive.'
      );
    } finally {
      setImportBusy(false);
    }
  };

  const renderExportActions = (item: LibraryCatalogItem) => {
    const preset = resolveLibraryPreset(item.presetId);
    if (!preset) return null;
    const isSaving = savingItemId === item.id;
    return (
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/8">
        <button
          type="button"
          onClick={() => onExportPresetToArea(preset, 'cad')}
          className="px-2.5 py-1.5 text-[11px] font-medium bg-[#141a24] border border-sky-400/40 text-sky-200 hover:bg-sky-500/20 rounded-md flex items-center gap-1 cursor-pointer"
        >
          <Box className="w-3 h-3" />
          CAD 3D
        </button>
        <button
          type="button"
          onClick={() => onExportPresetToArea(preset, 'cae')}
          className="px-2.5 py-1.5 text-[11px] font-medium bg-[#141a24] border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/20 rounded-md flex items-center gap-1 cursor-pointer"
        >
          <Activity className="w-3 h-3" />
          CAE / Fadiga
        </button>
        <button
          type="button"
          onClick={() => onExportPresetToArea(preset, 'cam')}
          className="px-2.5 py-1.5 text-[11px] font-medium bg-[#141a24] border border-amber-400/40 text-amber-200 hover:bg-amber-500/20 rounded-md flex items-center gap-1 cursor-pointer"
        >
          <Cpu className="w-3 h-3" />
          CAM
        </button>
        {item.isDeterministicGanReference && onSimulateGanPreset && (
          <button
            type="button"
            onClick={() => onSimulateGanPreset(preset)}
            className="px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/30 rounded-md flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-emerald-300" />
            Simular GAN (0/7 → 7/7)
          </button>
        )}
        <button
          type="button"
          disabled={isSaving}
          onClick={async () => {
            setSavingItemId(item.id);
            setErrorMsg(null);
            try {
              await onSavePresetToProjects(preset);
              setStatusMsg(`Projeto "${preset.title}" salvo na base de Projetos.`);
            } catch (err) {
              setErrorMsg(
                err instanceof Error ? err.message : 'Falha ao salvar projeto na nuvem/local.'
              );
            } finally {
              setSavingItemId(null);
            }
          }}
          className="px-2.5 py-1.5 text-[11px] font-medium bg-[#141a24] border border-white/15 text-slate-200 hover:border-white/35 rounded-md flex items-center gap-1 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3 h-3" />
          {isSaving ? 'Salvando...' : 'Salvar Projeto'}
        </button>
        <button
          type="button"
          onClick={() => onExportPresetToArea(preset, 'erp')}
          className="px-2.5 py-1.5 text-[11px] font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 rounded-md flex items-center gap-1 cursor-pointer"
        >
          <Briefcase className="w-3 h-3" />
          Cotar no ERP &amp; BI
        </button>
      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header + Active Google Session (GAS) + Native CAD & Drive Connector */}
        <div className="bg-[#111620] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
                <BookOpen className="w-4 h-4" />
                <span>Lib / Biblioteca Parametrix por Categoria · Ref. GAN Controlada &amp; Google Drive</span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100">
                Catálogo Industrial por Categoria + Referências GAN &amp; Google Drive
              </h1>
              <p className="text-xs text-slate-400 max-w-3xl">
                Cada categoria destaca um único exemplo validado e deduplicado pronto para{' '}
                <strong className="text-slate-200">CAD, CAE, CAM, Simulação GAN 7/7 e ERP Open</strong>{' '}
                (com cálculo automático de insumos, impostos, logística, preço Parametrix e BI/CRM).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-xs font-mono-tabular flex items-center gap-2">
                <Cloud
                  className={`w-4 h-4 ${googleUserEmail ? 'text-emerald-400' : 'text-amber-400'}`}
                />
                <span>
                  {googleUserEmail
                    ? `Sessão Google: ${googleUserEmail}`
                    : 'Sem sessão Google ativa'}
                </span>
              </div>
              {!googleAccessToken ? (
                <button
                  type="button"
                  onClick={() => void onConnectGoogleDrive()}
                  className="min-h-[38px] px-3 py-2 text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 rounded-lg cursor-pointer"
                >
                  Ativar Google Drive (OAuth)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={driveBusy}
                  onClick={() => void refreshDriveLibrary()}
                  className="min-h-[38px] px-3 py-2 text-xs font-medium bg-[#141a24] border border-emerald-400/40 text-emerald-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${driveBusy ? 'animate-spin' : ''}`} />
                  Drive Ativo ({driveFiles.length})
                </button>
              )}
            </div>
          </div>

          {/* Search Bar + Direct Public CAD URL Importer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar biblioteca ou buscar no Super-RAG (ex: RockShox BoXXer, spur gear M2)..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
                />
              </div>
              <button
                type="button"
                disabled={searchBusy}
                onClick={() => void handleCatalogSearch()}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {searchBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                Buscar Super-RAG &amp; Drive
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={cadUrlInput}
                onChange={(e) => setCadUrlInput(e.target.value)}
                placeholder="Cole URL pública direta .STEP/.STL/.OBJ/.DXF/.SVG ou Google Drive..."
                className="flex-1 px-3 py-2 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
              />
              <button
                type="button"
                disabled={importBusy}
                onClick={() => void handleImportPublicCadUrl('cad')}
                className="px-3 py-2 text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 rounded-lg shrink-0 cursor-pointer"
              >
                {importBusy ? 'Importando...' : 'Importar p/ CAD'}
              </button>
              <button
                type="button"
                disabled={importBusy}
                onClick={() => void handleImportPublicCadUrl('erp')}
                className="px-3 py-2 text-xs font-semibold bg-[#141a24] border border-sky-400/45 text-sky-200 hover:bg-sky-500/15 rounded-lg shrink-0 cursor-pointer"
              >
                + ERP
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-400/40 rounded-lg text-xs text-emerald-200">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-400/40 rounded-lg text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {catalogHits.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs font-semibold text-slate-300">
                Resultados Super-RAG Local &amp; Catálogo ({catalogHits.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catalogHits.map((hit, idx) => (
                  <div
                    key={`${hit.url || hit.title}-${idx}`}
                    className="p-3 bg-[#0c1017] border border-white/10 rounded-lg space-y-1.5 text-xs"
                  >
                    <div className="font-semibold text-slate-100 truncate">{hit.title}</div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{hit.snippet}</p>
                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                      <span className="font-mono-tabular text-sky-400">{hit.source}</span>
                      {hit.url && (
                        <button
                          type="button"
                          onClick={() => {
                            setCadUrlInput(hit.url);
                          }}
                          className="text-emerald-300 hover:underline cursor-pointer"
                        >
                          Usar URL
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Category Filter Strip */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-white/10 bg-[#111620] text-slate-400 hover:text-slate-200'
            }`}
          >
            Todas as Categorias ({LIBRARY_CATEGORIES.length})
          </button>
          {LIBRARY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                selectedCategory === cat.id
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                  : 'border-white/10 bg-[#111620] text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Best Example per Category Highlight Grid (when viewing all categories & no search) */}
        {showingAllWithoutSearch && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Melhor Exemplo de Engenharia por Categoria
              </h2>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                {categoryGroups.length} categorias curadas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryGroups.map((group) => {
                const best = group.bestItem;
                const isActive = activePresetId === best.presetId;
                return (
                  <div
                    key={group.category.id}
                    className={`p-4 bg-[#111620] rounded-xl border space-y-2.5 ${
                      best.isDeterministicGanReference
                        ? 'border-emerald-400/60 ring-1 ring-emerald-500/25'
                        : isActive
                          ? 'border-emerald-400/70'
                          : 'border-white/12'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular">
                      <span className="text-amber-300 font-semibold">
                        ★ Melhor · {group.category.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {best.isDeterministicGanReference && best.ganReferenceCode && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/45 text-emerald-300 font-semibold">
                            Ref. GAN Controlada · {best.ganReferenceCode}
                          </span>
                        )}
                        <span className="text-sky-300">{best.standardBadge}</span>
                      </div>
                    </div>
                    <div className="font-display text-sm font-bold text-slate-100">
                      {best.title}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{best.summary}</p>
                    <div className="text-[11px] font-mono-tabular text-slate-300">
                      {best.keySpecs.join(' · ')}
                    </div>
                    {renderExportActions(best)}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Deduplicated Complementary Models / Filtered Category Section */}
        {secondaryItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-100">
                {showingAllWithoutSearch
                  ? `Modelos Complementares da Biblioteca (${secondaryItems.length})`
                  : `Modelos da Categoria Selecionada (${secondaryItems.length})`}
              </h2>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                Catálogo determinístico sem duplicatas
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {secondaryItems.map((item) => {
                const isActive = activePresetId === item.presetId;
                return (
                  <div
                    key={item.id}
                    className={`p-4 bg-[#111620] rounded-xl border space-y-2.5 ${
                      item.isDeterministicGanReference
                        ? 'border-emerald-400/60 ring-1 ring-emerald-500/20'
                        : isActive
                          ? 'border-emerald-400/70'
                          : 'border-white/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular">
                      <span className={item.isCategoryBest ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                        {item.isCategoryBest ? `★ Destaque · ${item.categoryLabel}` : item.categoryLabel}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.isDeterministicGanReference && item.ganReferenceCode && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/45 text-emerald-300 font-semibold">
                            Ref. GAN Controlada · {item.ganReferenceCode}
                          </span>
                        )}
                        <span className="text-sky-300">
                          {item.standardBadge} · Lote {item.defaultBatchQty} un
                        </span>
                      </div>
                    </div>
                    <div className="font-display text-sm font-bold text-slate-100">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
                    <div className="text-[11px] font-mono-tabular text-slate-300">
                      {item.keySpecs.join(' · ')}
                    </div>
                    {renderExportActions(item)}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Google Drive CAD Files Section */}
        {googleAccessToken && driveFiles.length > 0 && (
          <section className="p-4 sm:p-5 bg-[#111620] border border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <FolderOpen className="w-4 h-4" />
                Modelos CAD Detectados no Seu Google Drive ({driveFiles.length})
              </div>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                {googleUserEmail}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {driveFiles.map((df) => (
                <div
                  key={df.id}
                  className="p-3 bg-[#0c1017] border border-white/10 rounded-lg space-y-2 text-xs"
                >
                  <div className="font-semibold text-slate-100 truncate">{df.name}</div>
                  <div className="text-[10px] font-mono-tabular text-slate-400">
                    {df.size ? `${Math.max(1, Math.round(Number(df.size) / 1024))} KB` : 'Drive CAD'} ·{' '}
                    {df.mimeType}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={importBusy}
                      onClick={() => void handleImportDriveItem(df, 'cad')}
                      className="px-2 py-1 text-[10px] font-medium bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded cursor-pointer"
                    >
                      Abrir CAD
                    </button>
                    <button
                      type="button"
                      disabled={importBusy}
                      onClick={() => void handleImportDriveItem(df, 'cam')}
                      className="px-2 py-1 text-[10px] font-medium bg-amber-500/20 border border-amber-400/40 text-amber-200 rounded cursor-pointer"
                    >
                      Produzir CAM
                    </button>
                    <button
                      type="button"
                      disabled={importBusy}
                      onClick={() => void handleImportDriveItem(df, 'erp')}
                      className="px-2 py-1 text-[10px] font-semibold bg-emerald-500 text-slate-950 rounded cursor-pointer"
                    >
                      Cotar ERP
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
