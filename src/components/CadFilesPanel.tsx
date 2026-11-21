import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Cloud,
  Copy,
  Cpu,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from 'lucide-react';
import {
  SAMPLE_CAD_FILES,
  buildIsolatedEvaluatedMesh,
  exportAsciiDXF,
  exportBinarySTL,
  exportOpenNurbs3DM,
  parse3DM,
  parseDXF,
  parseIPTAsync,
  parseOBJ,
  parseSTEPAsync,
  parseSTEPorIFC,
  parseSTL,
  parseSVGToCad,
  triggerBlobDownload,
} from '../kernel/cadFormats';
import { convertImageToCadModel, isRasterImageFilename } from '../kernel/imageToCad';
import {
  deleteDriveFile,
  ensureUserDriveProjectFolder,
  listDriveProjectFiles,
  saveFileToDriveFolder,
} from '../services/googleDriveProjects';
import type {
  CamSettings,
  EvaluatedMesh,
  GoogleDriveFolderFile,
  GoogleDriveFolderInfo,
  ImportedCadModel,
  LocalProjectFolderFile,
  NurbsSurfaceData,
  ParametricDesignParams,
  RamdiskMcpStatus,
  ToolpathResult,
} from '../types/cad';

interface CadFilesPanelProps {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  toolpath: ToolpathResult;
  importedModel: ImportedCadModel | null;
  isolationTarget: string;
  showImportedOverlay: boolean;
  onSetImportedModel: (model: ImportedCadModel | null) => void;
  onToggleImportedOverlay: () => void;
  onOpenViewport: () => void;
  userSlug?: string;
  googleAccessToken?: string | null;
  onConnectGoogleDrive?: () => Promise<void>;
  designParams?: ParametricDesignParams;
  camSettings?: CamSettings;
  sessionToken?: string | null;
}

type ConfirmActionState =
  | {
      kind: 'overwrite-drive' | 'delete-drive' | 'delete-local';
      filename: string;
      driveFileId?: string;
      folderId?: string;
      message: string;
    }
  | null;

export const CadFilesPanel: React.FC<CadFilesPanelProps> = ({
  surface,
  meshData,
  toolpath,
  importedModel,
  isolationTarget,
  showImportedOverlay,
  onSetImportedModel,
  onToggleImportedOverlay,
  onOpenViewport,
  userSlug = 'local-operator',
  googleAccessToken = null,
  onConnectGoogleDrive,
  designParams,
  camSettings,
  sessionToken = null,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState<boolean>(false);
  const [exportIsolatedOnly, setExportIsolatedOnly] = useState<boolean>(
    isolationTarget !== 'all'
  );
  const [localSlug, setLocalSlug] = useState<string>(userSlug);
  const [localFolderPath, setLocalFolderPath] = useState<string>('');
  const [localFiles, setLocalFiles] = useState<LocalProjectFolderFile[]>([]);
  const [folderBusy, setFolderBusy] = useState(false);

  const [driveFolder, setDriveFolder] = useState<GoogleDriveFolderInfo | null>(null);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFolderFile[]>([]);
  const [driveBusy, setDriveBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmActionState>(null);

  const [ramdiskStatus, setRamdiskStatus] = useState<RamdiskMcpStatus | null>(null);
  const [ramdiskBusy, setRamdiskBusy] = useState(false);
  const [colabBridgeInput, setColabBridgeInput] = useState('');
  const [colabScriptText, setColabScriptText] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    return headers;
  }, [sessionToken]);

  const refreshLocalFolder = useCallback(async () => {
    try {
      const resp = await fetch('/api/projects/folder', {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        userSlug: string;
        folderPath: string;
        files: LocalProjectFolderFile[];
      };
      setLocalSlug(data.userSlug);
      setLocalFolderPath(data.folderPath);
      setLocalFiles(data.files ?? []);
    } catch {
      // Ignore offline error
    }
  }, [authHeaders]);

  const refreshRamdiskStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/mcp/ramdisk-status');
      if (!resp.ok) return;
      const st = (await resp.json()) as RamdiskMcpStatus;
      setRamdiskStatus(st);
      if (st.colabBridgeUrl) setColabBridgeInput(st.colabBridgeUrl);
    } catch {
      // Ignore offline error
    }
  }, []);

  useEffect(() => {
    void refreshLocalFolder();
    void refreshRamdiskStatus();
  }, [refreshLocalFolder, refreshRamdiskStatus]);

  const refreshDriveFolder = useCallback(async () => {
    if (!googleAccessToken) return;
    setDriveBusy(true);
    setErrorMsg(null);
    try {
      const folder = await ensureUserDriveProjectFolder(googleAccessToken, localSlug || userSlug);
      setDriveFolder(folder);
      const files = await listDriveProjectFiles(googleAccessToken, folder.folderId);
      setDriveFiles(files);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao acessar Google Drive.');
    } finally {
      setDriveBusy(false);
    }
  }, [googleAccessToken, localSlug, userSlug]);

  useEffect(() => {
    if (googleAccessToken) {
      void refreshDriveFolder();
    } else {
      setDriveFolder(null);
      setDriveFiles([]);
    }
  }, [googleAccessToken, refreshDriveFolder]);

  const buildSnapshotFilename = () =>
    `${surface.id.replace(/[^a-z0-9_-]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.parametrix.json`;

  const buildSnapshotPayload = () =>
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        userSlug: localSlug,
        surfaceName: surface.name,
        designParams,
        camSettings,
        importedFilename: importedModel?.filename ?? null,
        triangleCount: importedModel?.triangleCount ?? meshData.triangleCount,
      },
      null,
      2
    );

  const handleSaveToLocalFolder = async () => {
    setFolderBusy(true);
    setErrorMsg(null);
    try {
      const filename = buildSnapshotFilename();
      const resp = await fetch('/api/projects/folder', {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: buildSnapshotPayload() }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar na pasta do login.');
      setStatusMsg(`Projeto salvo na pasta local (${localSlug}/${filename}).`);
      await refreshLocalFolder();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setFolderBusy(false);
    }
  };

  const handleSaveToDrive = async (confirmedOverwriteFileId?: string) => {
    if (!googleAccessToken) return;
    setDriveBusy(true);
    setErrorMsg(null);
    try {
      const folder = driveFolder ?? (await ensureUserDriveProjectFolder(googleAccessToken, localSlug));
      setDriveFolder(folder);
      const filename = buildSnapshotFilename();
      const existing = driveFiles.find((f) => f.name === filename);
      if (existing && !confirmedOverwriteFileId) {
        setDriveBusy(false);
        setConfirmModal({
          kind: 'overwrite-drive',
          filename,
          driveFileId: existing.id,
          folderId: folder.folderId,
          message: `O arquivo "${filename}" já existe na sua pasta do Google Drive (${folder.folderName}). Deseja sobrescrevê-lo?`,
        });
        return;
      }
      await saveFileToDriveFolder(
        googleAccessToken,
        folder.folderId,
        filename,
        buildSnapshotPayload(),
        'application/json',
        confirmedOverwriteFileId
      );
      setStatusMsg(`Projeto salvo no Google Drive (${folder.folderName}/${filename}).`);
      await refreshDriveFolder();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(false);
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmModal) return;
    const action = confirmModal;
    setConfirmModal(null);
    if (action.kind === 'overwrite-drive' && action.driveFileId) {
      await handleSaveToDrive(action.driveFileId);
    } else if (action.kind === 'delete-drive' && action.driveFileId && googleAccessToken) {
      setDriveBusy(true);
      try {
        await deleteDriveFile(googleAccessToken, action.driveFileId);
        setStatusMsg(`Arquivo "${action.filename}" removido do Google Drive.`);
        await refreshDriveFolder();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setDriveBusy(false);
      }
    } else if (action.kind === 'delete-local') {
      setFolderBusy(true);
      try {
        const resp = await fetch(`/api/projects/folder?filename=${encodeURIComponent(action.filename)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        });
        if (!resp.ok) throw new Error('Falha ao excluir arquivo local.');
        setStatusMsg(`Arquivo local "${action.filename}" excluído.`);
        await refreshLocalFolder();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setFolderBusy(false);
      }
    }
  };

  const handleStartRamdisk = async () => {
    setRamdiskBusy(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/mcp/ramdisk-start', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      const data = (await resp.json()) as RamdiskMcpStatus & { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Falha ao iniciar worker MCP no Ramdisk.');
      setRamdiskStatus(data);
      setStatusMsg(`Worker MCP ativo em ${data.mountPath} (PID ${data.workerPid}, porta ${data.workerPort}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRamdiskBusy(false);
    }
  };

  const handleStopRamdisk = async () => {
    setRamdiskBusy(true);
    try {
      const resp = await fetch('/api/mcp/ramdisk-stop', { method: 'POST' });
      if (resp.ok) {
        const data = (await resp.json()) as RamdiskMcpStatus;
        setRamdiskStatus(data);
        setStatusMsg('Worker MCP Ramdisk encerrado com limpeza de /dev/shm.');
      }
    } finally {
      setRamdiskBusy(false);
    }
  };

  const handleFetchColabScript = async () => {
    const resp = await fetch('/api/mcp/colab-script');
    if (resp.ok) {
      const data = (await resp.json()) as { script: string };
      setColabScriptText(data.script);
    }
  };

  const handleConnectColabBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    setRamdiskBusy(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/mcp/colab-gcloud-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeUrl: colabBridgeInput.trim() }),
      });
      const data = (await resp.json()) as {
        reachable?: boolean;
        status?: RamdiskMcpStatus;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error || 'Erro ao conectar bridge GCloud/Colab.');
      if (data.status) setRamdiskStatus(data.status);
      setStatusMsg(
        data.reachable
          ? 'Bridge Colab/GCloud FastAPI acessível (/health OK).'
          : 'URL GCloud/Colab salva no servidor; aguardando worker responder em /health.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRamdiskBusy(false);
    }
  };

  const handleFileImport = async (file: File) => {
    setErrorMsg(null);
    setStatusMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    setImportBusy(true);
    try {
      if (ext === 'stl') {
        const buf = await file.arrayBuffer();
        const model = parseSTL(buf, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'obj') {
        const text = await file.text();
        const model = parseOBJ(text, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'dxf') {
        const text = await file.text();
        const model = parseDXF(text, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === '3dm') {
        const buf = await file.arrayBuffer();
        const model = parse3DM(buf, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'step' || ext === 'stp' || ext === 'ifc') {
        setStatusMsg('Tesselando geometria B-Rep via OpenCASCADE...');
        const buf = await file.arrayBuffer();
        const model = await parseSTEPAsync(buf, file.name, ext === 'ifc' ? 'IFC' : 'STEP');
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'ipt') {
        setStatusMsg('Decodificando streams OLE2 / ACIS do Inventor (.IPT)...');
        const buf = await file.arrayBuffer();
        const model = await parseIPTAsync(buf, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'svg') {
        const text = await file.text();
        const model = parseSVGToCad(text, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (isRasterImageFilename(file.name, file.type)) {
        setStatusMsg('Analisando imagem e convertendo em projeto CAD 3D fidedigno...');
        const { model } = await convertImageToCadModel({
          filename: file.name,
          mimeType: file.type,
          blobOrBuffer: file,
        });
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else {
        setErrorMsg(
          `Extensão .${ext} não suportada. Utilize STL, OBJ, DXF, 3DM, STEP/STP, IFC, IPT, SVG, PNG, JPG ou WEBP.`
        );
      }
    } catch (err) {
      setStatusMsg(null);
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao analisar o arquivo CAD ou imagem.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleLoadSample = (sample: (typeof SAMPLE_CAD_FILES)[number]) => {
    setErrorMsg(null);
    if (sample.format === 'DXF') {
      const m = parseDXF(sample.content, sample.filename);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    } else if (sample.format === 'OBJ') {
      const m = parseOBJ(sample.content, sample.filename);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    } else {
      const m = parseSTEPorIFC(sample.content, sample.filename, sample.format);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    }
  };

  const handleExport = (fmt: 'stl' | 'dxf' | '3dm') => {
    const useIsolated = exportIsolatedOnly && isolationTarget !== 'all';
    const { evaluated, partLabel } = buildIsolatedEvaluatedMesh(
      meshData,
      useIsolated ? isolationTarget : 'all',
      importedModel
    );
    const baseName = `${surface.id.replace(/[^a-z0-9-_]/gi, '_')}${
      useIsolated ? `_${partLabel}` : ''
    }`;
    if (fmt === 'stl') {
      triggerBlobDownload(exportBinarySTL(evaluated, surface.name), `${baseName}.stl`);
      setStatusMsg(
        `Arquivo ${baseName}.stl (Binário · ${evaluated.triangleCount} triângulos) exportado.`
      );
    } else if (fmt === 'dxf') {
      triggerBlobDownload(
        exportAsciiDXF(evaluated, evaluated.isocurves, useIsolated ? undefined : toolpath.points),
        `${baseName}.dxf`
      );
      setStatusMsg(`Arquivo ${baseName}.dxf (AutoCAD R2000) exportado.`);
    } else {
      triggerBlobDownload(exportOpenNurbs3DM(surface, evaluated), `${baseName}.3dm`);
      setStatusMsg(`Arquivo ${baseName}.3dm (OpenNURBS Rhino v7) exportado.`);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-[#0b0e14] p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 min-w-0">
        <div className="min-w-0">
          <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-100 break-words">
            Interoperabilidade CAD & Exportação Industrial
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 break-words">
            Importe arquivos CAD (.STL, .OBJ, .DXF, .3DM, .STEP/.STP, .IFC, .IPT, .SVG) ou imagens (.PNG, .JPG, .WEBP) para converter em projeto CAD 3D fidedigno com Object Mask e FEA.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 min-w-0">
          {/* Import Zone */}
          <div className="p-4 sm:p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4 sm:space-y-5 min-w-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Importar Arquivo CAD ou Imagem
              </h3>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && !importBusy) void handleFileImport(file);
              }}
              className="flex flex-col items-center justify-center p-5 sm:p-8 border border-dashed border-sky-400/35 rounded-xl bg-[#0c1017] hover:border-sky-400/70 transition-colors cursor-pointer text-center min-w-0"
            >
              {importBusy ? (
                <div className="flex flex-col items-center gap-2 text-sky-300">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs sm:text-sm font-medium">
                    Processando geometria 3D fidedigna...
                  </span>
                </div>
              ) : (
                <>
                  <span className="text-xs sm:text-sm font-medium text-slate-200 break-words">
                    Arraste um arquivo CAD/imagem ou clique para selecionar
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1.5 leading-relaxed break-words">
                    CAD: .STL · .OBJ · .DXF · .3DM · .STEP/.STP · .IFC · .IPT · .SVG
                    <br />
                    Imagem → 3D Fidedigno: .PNG · .JPG · .WEBP
                  </span>
                </>
              )}
              <input
                type="file"
                disabled={importBusy}
                accept=".stl,.obj,.dxf,.3dm,.step,.stp,.ifc,.ipt,.svg,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileImport(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-400">
                Carregar Exemplos Prontos para Teste
              </div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_CAD_FILES.map((s) => (
                  <button
                    key={s.filename}
                    type="button"
                    disabled={importBusy}
                    onClick={() => handleLoadSample(s)}
                    className="px-3 py-1.5 text-xs bg-[#0c1017] border border-white/10 hover:border-sky-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 break-words">
                {errorMsg}
              </div>
            )}
            {statusMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 break-words">
                {statusMsg}
              </div>
            )}
          </div>

          {/* Export Zone */}
          <div className="p-4 sm:p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4 sm:space-y-5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Exportar Modelo Paramétrico Atual
                </h3>
              </div>
              {isolationTarget !== 'all' && (
                <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportIsolatedOnly}
                    onChange={(e) => setExportIsolatedOnly(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Apenas peça isolada ({isolationTarget})
                </label>
              )}
            </div>

            <div className="space-y-3">
              <ExportCard
                title="Rhino OpenNURBS (.3DM)"
                desc="Arquivo binário OpenNURBS v7 contendo malha tesselada e rede completa de pontos de controle racionais NURBS."
                actionLabel="Exportar .3DM"
                onClick={() => handleExport('3dm')}
              />
              <ExportCard
                title="Malha Sólida Binária (.STL)"
                desc="STL binário estanque com normais recalculadas, pronto para fatiadores 3D (Cura, PrusaSlicer) e CAM."
                actionLabel="Exportar .STL"
                onClick={() => handleExport('stl')}
              />
              <ExportCard
                title="AutoCAD Intercâmbio (.DXF)"
                desc="DXF ASCII R2000 em milímetros com camadas separadas: NURBS_SURFACE (3DFACE), ISOCURVES e CAM_TOOLPATH."
                actionLabel="Exportar .DXF"
                onClick={() => handleExport('dxf')}
              />
            </div>
          </div>
        </div>

        {/* Active Imported Model Inspector */}
        {importedModel && (
          <div className="p-4 sm:p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-semibold text-slate-100 break-all">
                    Referência Importada: {importedModel.filename}
                  </h3>
                  <p className="text-xs text-slate-400 break-words">{importedModel.notes}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenViewport}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 cursor-pointer"
                >
                  <Box className="w-3.5 h-3.5" />
                  Abrir no Editor 3D
                </button>
                <button
                  type="button"
                  onClick={onToggleImportedOverlay}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                    showImportedOverlay
                      ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                      : 'border-white/10 text-slate-300'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showImportedOverlay ? 'Visível no 3D' : 'Oculto no 3D'}
                </button>
                <button
                  type="button"
                  onClick={() => onSetImportedModel(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-white/8 text-xs">
              <div>
                <div className="text-slate-500">Formato</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.format}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Componentes / Triângulos</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.components?.length ?? 1} / {importedModel.triangleCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Envelope (mm)</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.boundingBox.size[0].toFixed(1)} ×{' '}
                  {importedModel.boundingBox.size[2].toFixed(1)} ×{' '}
                  {importedModel.boundingBox.size[1].toFixed(1)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-slate-500 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Camadas
                </div>
                <div className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                  {importedModel.layers.slice(0, 4).join(', ')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Per-Login Project Folders (Local Server + Google Drive) */}
        <div className="p-4 sm:p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Pasta de Projetos do Login ({localSlug})
                </h3>
                <p className="text-[11px] text-slate-400 font-mono-tabular break-all">
                  Local: {localFolderPath || `data/projects/${localSlug}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={folderBusy}
                onClick={() => void handleSaveToLocalFolder()}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar na Pasta Local
              </button>
              <button
                type="button"
                disabled={folderBusy}
                onClick={() => void refreshLocalFolder()}
                className="px-2.5 py-1.5 text-xs border border-white/12 bg-[#0c1017] text-slate-200 hover:text-white rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Local User Folder List */}
            <div className="p-3 bg-[#0c1017] border border-white/8 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-slate-200">
                Arquivos Locais ({localFiles.length})
              </div>
              {localFiles.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Nenhum arquivo salvo ainda na pasta deste usuário.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {localFiles.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#111620] border border-white/8 rounded text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="text-slate-100 truncate font-medium">{f.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono-tabular">
                          {f.sizeBytes} B · SHA256 {f.sha256.slice(0, 10)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            kind: 'delete-local',
                            filename: f.name,
                            message: `Excluir o arquivo local "${f.name}" da pasta do usuário?`,
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Excluir arquivo local"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Google Drive User Folder List */}
            <div className="p-3 bg-[#0c1017] border border-sky-500/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Google Drive ({driveFolder?.folderName || `Parametrix_Projects_${localSlug}`})</span>
                </div>
                {googleAccessToken ? (
                  <button
                    type="button"
                    disabled={driveBusy}
                    onClick={() => void handleSaveToDrive()}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500 text-slate-950 rounded hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                  >
                    Salvar no Drive
                  </button>
                ) : (
                  onConnectGoogleDrive && (
                    <button
                      type="button"
                      onClick={() => void onConnectGoogleDrive()}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500/20 border border-sky-400/50 text-sky-200 rounded hover:bg-sky-500/30 cursor-pointer"
                    >
                      Conectar Google Drive
                    </button>
                  )
                )}
              </div>

              {!googleAccessToken ? (
                <p className="text-[11px] text-slate-400">
                  Conecte sua conta Google com permissão Drive para sincronizar sua pasta pessoal na nuvem.
                </p>
              ) : driveFiles.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  {driveBusy ? 'Carregando pasta no Google Drive...' : 'Pasta criada no Drive. Salve o projeto atual acima.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {driveFiles.map((df) => (
                    <div
                      key={df.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#111620] border border-white/8 rounded text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="text-slate-100 truncate font-medium">{df.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono-tabular">
                          {df.size ? `${df.size} B` : 'Drive'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            kind: 'delete-drive',
                            filename: df.name,
                            driveFileId: df.id,
                            message: `Excluir "${df.name}" da sua pasta no Google Drive?`,
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Excluir do Google Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ephemeral Ramdisk (/dev/shm) & GCloud / Colab MCP Accelerator */}
        <div className="p-4 sm:p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Acelerador MCP Temporário (Ramdisk /dev/shm + GCloud / Colab)
                </h3>
                <p className="text-[11px] text-slate-400 font-mono-tabular">
                  {ramdiskStatus
                    ? `${ramdiskStatus.mountPath} (${ramdiskStatus.available ? `${ramdiskStatus.freeMb}/${ramdiskStatus.totalMb} MB livres` : 'tmpfs fallback'}) · Worker ${ramdiskStatus.workerActive ? `ATIVO PID ${ramdiskStatus.workerPid} · ${ramdiskStatus.workerUrl}` : 'PARADO'}`
                    : 'Consultando telemetria Ramdisk...'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!ramdiskStatus?.workerActive ? (
                <button
                  type="button"
                  disabled={ramdiskBusy}
                  onClick={() => void handleStartRamdisk()}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-400 text-slate-950 rounded-lg hover:bg-amber-300 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Subir Worker Ramdisk
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ramdiskBusy}
                  onClick={() => void handleStopRamdisk()}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-500/20 border border-rose-400/50 text-rose-200 rounded-lg hover:bg-rose-500/30 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Parar Worker
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleFetchColabScript()}
                className="px-3 py-1.5 text-xs border border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 rounded-lg cursor-pointer"
              >
                Gerar Script Colab / Cloud Run
              </button>
            </div>
          </div>

          <form onSubmit={handleConnectColabBridge} className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={colabBridgeInput}
              onChange={(e) => setColabBridgeInput(e.target.value)}
              placeholder="URL pública do worker GCloud Run / Colab FastAPI (https://...)"
              className="flex-1 px-3 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 font-mono-tabular"
            />
            <button
              type="submit"
              disabled={ramdiskBusy}
              className="px-4 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 disabled:opacity-50 cursor-pointer shrink-0"
            >
              Validar / Conectar Bridge GCloud
            </button>
          </form>

          {colabScriptText && (
            <div className="p-3 bg-[#090c11] border border-white/10 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Script Colab / Cloud Run (FastAPI + CadQuery/OCCT + Qwen 0.5B em /dev/shm)</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(colabScriptText);
                    setStatusMsg('Script Colab/GCloud copiado para a área de transferência.');
                  }}
                  className="px-2 py-0.5 border border-white/15 rounded flex items-center gap-1 hover:text-white cursor-pointer"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              </div>
              <pre className="text-[10px] font-mono-tabular text-emerald-300 overflow-x-auto max-h-40 whitespace-pre-wrap">
                {colabScriptText}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal for Drive Overwrite / Delete */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md p-5 bg-[#111620] border border-white/15 rounded-xl shadow-2xl space-y-4">
            <h4 className="font-display text-sm font-semibold text-slate-100">
              Confirmar Alteração de Arquivo
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 text-xs text-slate-300 border border-white/15 rounded-lg hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteConfirmedAction()}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-500 text-white rounded-lg hover:bg-rose-400 cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ExportCardProps {
  title: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
}

const ExportCard: React.FC<ExportCardProps> = ({ title, desc, actionLabel, onClick }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 bg-[#0c1017] border border-white/8 rounded-xl min-w-0">
    <div className="space-y-0.5 min-w-0">
      <div className="text-xs font-semibold text-slate-100 break-words">{title}</div>
      <p className="text-[11px] text-slate-400 leading-relaxed break-words">{desc}</p>
    </div>
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 text-xs font-medium bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
    >
      {actionLabel}
    </button>
  </div>
);
