import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Cloud,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
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
  downloadDriveFileContent,
  ensureUserDriveProjectFolder,
  extractGoogleDriveFileId,
  fetchDriveFileMetadata,
  listDriveCadFiles,
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
  SessionDeliverable,
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
  googleUserEmail?: string | null;
  googleAccessToken?: string | null;
  onConnectGoogleDrive?: () => Promise<string | null | void>;
  onRecordDeliverable?: (d: {
    filename: string;
    kind: SessionDeliverable['kind'];
    summary: string;
  }) => void;
  designParams?: ParametricDesignParams;
  camSettings?: CamSettings;
  sessionToken?: string | null;
  onApplyProjectSnapshot?: (snapshot: {
    designParams?: ParametricDesignParams;
    camSettings?: CamSettings;
    label?: string;
  }) => void;
}

interface UrlImportInspection {
  url: string;
  isGrabCad: boolean;
  status: string;
  httpStatus?: number;
  title: string;
  description: string;
  detectedFormats: string[];
  previewImageUrl?: string;
  directCadUrl?: string;
  diagnosticNote: string;
  vucCertificate?: { vuc_id?: string };
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
  googleUserEmail = null,
  googleAccessToken = null,
  onConnectGoogleDrive,
  onRecordDeliverable,
  designParams,
  camSettings,
  sessionToken = null,
  onApplyProjectSnapshot,
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
  const [driveCadMatches, setDriveCadMatches] = useState<GoogleDriveFolderFile[]>([]);
  const [driveSearchTerm, setDriveSearchTerm] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmActionState>(null);

  const [cadUrlInput, setCadUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlInspection, setUrlInspection] = useState<UrlImportInspection | null>(null);
  const [lastUrlTextFile, setLastUrlTextFile] = useState<{
    filename: string;
    mimeType: string;
    content: string;
  } | null>(null);

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
      const [files, cadMatches] = await Promise.all([
        listDriveProjectFiles(googleAccessToken, folder.folderId),
        listDriveCadFiles(googleAccessToken),
      ]);
      setDriveFiles(files);
      setDriveCadMatches(cadMatches);
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
      setDriveCadMatches([]);
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

  const handleSearchDriveCadFiles = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!googleAccessToken) return;
    setDriveBusy(true);
    setErrorMsg(null);
    try {
      const files = await listDriveCadFiles(googleAccessToken, driveSearchTerm);
      setDriveCadMatches(files);
      setStatusMsg(`${files.length} arquivo(s) encontrados no seu Google Drive.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(false);
    }
  };

  const emitDeliverable = (
    filename: string,
    kind: SessionDeliverable['kind'],
    summary: string
  ) => {
    onRecordDeliverable?.({
      filename: filename.slice(0, 160),
      kind,
      summary: summary.slice(0, 240),
    });
  };

  const handleOpenDriveFile = async (df: GoogleDriveFolderFile) => {
    if (!googleAccessToken) return;
    setDriveBusy(true);
    setErrorMsg(null);
    try {
      const { arrayBuffer, mimeType } = await downloadDriveFileContent(
        googleAccessToken,
        df.id,
        df.name
      );
      if (df.name.toLowerCase().endsWith('.parametrix.json')) {
        const text = new TextDecoder().decode(arrayBuffer);
        const parsed = JSON.parse(text) as {
          surfaceName?: string;
          designParams?: ParametricDesignParams;
          camSettings?: CamSettings;
        };
        if (onApplyProjectSnapshot) {
          onApplyProjectSnapshot({
            designParams: parsed.designParams,
            camSettings: parsed.camSettings,
            label: parsed.surfaceName || df.name,
          });
        }
        emitDeliverable(
          df.name,
          'REPORT',
          `Snapshot restaurado da sessão Google Drive (${googleUserEmail || localSlug})`
        );
        setStatusMsg(`Snapshot "${df.name}" restaurado direto do Google Drive.`);
      } else {
        const file = new File([arrayBuffer], df.name, { type: mimeType });
        await handleFileImport(file);
        setStatusMsg(`Arquivo CAD "${df.name}" importado do Google Drive para a Viewport 3D.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(false);
    }
  };

  const handleSaveDownloadedTextToDrive = async () => {
    if (!lastUrlTextFile || !googleAccessToken) return;
    setDriveBusy(true);
    setErrorMsg(null);
    try {
      const folder = driveFolder ?? (await ensureUserDriveProjectFolder(googleAccessToken, localSlug));
      setDriveFolder(folder);
      const existing = driveFiles.find((f) => f.name === lastUrlTextFile.filename);
      await saveFileToDriveFolder(
        googleAccessToken,
        folder.folderId,
        lastUrlTextFile.filename,
        lastUrlTextFile.content,
        lastUrlTextFile.mimeType || 'text/plain',
        existing?.id
      );
      setStatusMsg(`Arquivo "${lastUrlTextFile.filename}" salvo na pasta ${folder.folderName} do Google Drive.`);
      await refreshDriveFolder();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(false);
    }
  };

  const handleImportFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = cadUrlInput.trim();
    if (!targetUrl) return;
    setUrlBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setLastUrlTextFile(null);
    try {
      const driveFileId = extractGoogleDriveFileId(targetUrl);
      if (driveFileId) {
        let activeTok = googleAccessToken;
        if (!activeTok && onConnectGoogleDrive) {
          const maybeTok = await onConnectGoogleDrive();
          if (typeof maybeTok === 'string' && maybeTok) {
            activeTok = maybeTok;
          }
        }
        if (!activeTok) {
          throw new Error(
            'Link do Google Drive detectado. Conecte/autorize o token Google Drive na sessão ativa para abrir o arquivo.'
          );
        }
        const meta = await fetchDriveFileMetadata(activeTok, driveFileId);
        const { arrayBuffer, mimeType } = await downloadDriveFileContent(
          activeTok,
          driveFileId,
          meta.name
        );
        setUrlInspection({
          url: targetUrl,
          isGrabCad: false,
          status: 'google-drive-imported',
          title: meta.name,
          description: `Importado direto da sessão Google Drive (${googleUserEmail || localSlug})`,
          detectedFormats: [meta.name.split('.').pop()?.toUpperCase() || 'DRIVE'],
          directCadUrl: meta.webViewLink || targetUrl,
          diagnosticNote: `Arquivo "${meta.name}" baixado via OAuth Bearer da sessão Google ativa.`,
        });
        if (meta.name.toLowerCase().endsWith('.parametrix.json')) {
          const parsed = JSON.parse(new TextDecoder().decode(arrayBuffer)) as {
            surfaceName?: string;
            designParams?: ParametricDesignParams;
            camSettings?: CamSettings;
          };
          onApplyProjectSnapshot?.({
            designParams: parsed.designParams,
            camSettings: parsed.camSettings,
            label: parsed.surfaceName || meta.name,
          });
          emitDeliverable(meta.name, 'REPORT', `Snapshot Drive URL importado (${googleUserEmail || localSlug})`);
          setStatusMsg(`Snapshot "${meta.name}" restaurado da URL do Google Drive.`);
        } else {
          const driveFileObj = new File([arrayBuffer], meta.name, { type: mimeType });
          await handleFileImport(driveFileObj);
          setStatusMsg(`Arquivo "${meta.name}" importado da URL do Google Drive ativa.`);
        }
        return;
      }

      const resp = await fetch('/api/cad/import-url', {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          googleUserEmail: googleUserEmail || undefined,
        }),
      });
      const data = (await resp.json()) as {
        inspection?: UrlImportInspection;
        downloadedFile?: {
          filename: string;
          mimeType: string;
          byteSize: number;
          base64Content: string;
        };
        vucProof?: { vucHash?: string };
        error?: string;
      };
      if (data.inspection) {
        setUrlInspection(data.inspection);
      }
      if (!resp.ok) {
        throw new Error(data.error || 'Falha ao consultar URL CAD / GrabCAD.');
      }
      if (data.downloadedFile?.base64Content) {
        const binary = atob(data.downloadedFile.base64Content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const importedFile = new File([bytes], data.downloadedFile.filename, {
          type: data.downloadedFile.mimeType || 'application/octet-stream',
        });
        await handleFileImport(importedFile);
        if (/\.(step|stp|dxf|obj|svg|json)$/i.test(data.downloadedFile.filename)) {
          setLastUrlTextFile({
            filename: data.downloadedFile.filename,
            mimeType: data.downloadedFile.mimeType || 'text/plain',
            content: new TextDecoder().decode(bytes),
          });
        }
        setStatusMsg(
          `Arquivo "${data.downloadedFile.filename}" (${data.downloadedFile.byteSize} B) importado via URL · VUC ${data.vucProof?.vucHash?.slice(0, 14) ?? 'OK'}.`
        );
      } else if (data.inspection) {
        setStatusMsg(data.inspection.diagnosticNote);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setUrlBusy(false);
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
      let importedModelResult: ImportedCadModel | null = null;
      let deliverableKind: SessionDeliverable['kind'] = 'REPORT';
      if (ext === 'stl') {
        const buf = await file.arrayBuffer();
        importedModelResult = parseSTL(buf, file.name);
        deliverableKind = 'STL';
      } else if (ext === 'obj') {
        const text = await file.text();
        importedModelResult = parseOBJ(text, file.name);
      } else if (ext === 'dxf') {
        const text = await file.text();
        importedModelResult = parseDXF(text, file.name);
        deliverableKind = 'DXF';
      } else if (ext === '3dm') {
        const buf = await file.arrayBuffer();
        importedModelResult = parse3DM(buf, file.name);
        deliverableKind = '3DM';
      } else if (ext === 'step' || ext === 'stp' || ext === 'ifc') {
        setStatusMsg('Tesselando geometria B-Rep via OpenCASCADE...');
        const buf = await file.arrayBuffer();
        importedModelResult = await parseSTEPAsync(buf, file.name, ext === 'ifc' ? 'IFC' : 'STEP');
      } else if (ext === 'ipt') {
        setStatusMsg('Decodificando streams OLE2 / ACIS do Inventor (.IPT)...');
        const buf = await file.arrayBuffer();
        importedModelResult = await parseIPTAsync(buf, file.name);
      } else if (ext === 'svg') {
        const text = await file.text();
        importedModelResult = parseSVGToCad(text, file.name);
      } else if (isRasterImageFilename(file.name, file.type)) {
        setStatusMsg('Analisando imagem e convertendo em projeto CAD 3D fidedigno...');
        const { model } = await convertImageToCadModel({
          filename: file.name,
          mimeType: file.type,
          blobOrBuffer: file,
        });
        importedModelResult = model;
      } else {
        setErrorMsg(
          `Extensão .${ext} não suportada. Utilize STL, OBJ, DXF, 3DM, STEP/STP, IFC, IPT, SVG, PNG, JPG ou WEBP.`
        );
      }
      if (importedModelResult) {
        onSetImportedModel(importedModelResult);
        setStatusMsg(importedModelResult.notes);
        emitDeliverable(
          file.name,
          deliverableKind,
          `Importado (${importedModelResult.format}) · ${importedModelResult.triangleCount} triângulos${googleUserEmail ? ` · Google: ${googleUserEmail}` : ''}`
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-400">
                  Importar via URL Pública / GrabCAD / Google Drive (Hermes Search + VUC)
                </div>
                {googleUserEmail && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular">
                    <span className="text-sky-300 truncate max-w-[190px]">
                      Google: {googleUserEmail}
                    </span>
                    {googleAccessToken ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                        Drive OK
                      </span>
                    ) : (
                      onConnectGoogleDrive && (
                        <button
                          type="button"
                          onClick={() => void onConnectGoogleDrive()}
                          className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 hover:bg-sky-500/30 cursor-pointer"
                        >
                          Ativar Drive
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <form onSubmit={handleImportFromUrl} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={cadUrlInput}
                  onChange={(e) => setCadUrlInput(e.target.value)}
                  placeholder="https://grabcad.com/library/..., drive.google.com/... ou .stl/.step/.dxf/.3dm"
                  className="flex-1 px-3 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 font-mono-tabular outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={urlBusy}
                  className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {urlBusy ? 'Consultando...' : 'Inspecionar / Importar URL'}
                </button>
              </form>
              {urlInspection && (
                <div className="p-3 bg-[#090d14] border border-sky-400/25 rounded-lg text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sky-200 truncate">{urlInspection.title}</span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[#141a24] text-emerald-300 shrink-0">
                      {urlInspection.status}
                    </span>
                  </div>
                  <div className="text-slate-300">{urlInspection.diagnosticNote}</div>
                  {urlInspection.detectedFormats.length > 0 && (
                    <div className="font-mono-tabular text-[10px] text-slate-400">
                      Formatos detectados: {urlInspection.detectedFormats.join(' · ')}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono-tabular text-slate-400">
                    {urlInspection.vucCertificate?.vuc_id && (
                      <span>VUC: {urlInspection.vucCertificate.vuc_id}</span>
                    )}
                    {/^https?:\/\//i.test(urlInspection.directCadUrl || urlInspection.url) && (
                      <a
                        href={urlInspection.directCadUrl || urlInspection.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-300 hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Abrir página fonte
                      </a>
                    )}
                    {lastUrlTextFile && googleAccessToken && (
                      <button
                        type="button"
                        disabled={driveBusy}
                        onClick={() => void handleSaveDownloadedTextToDrive()}
                        className="px-2 py-0.5 bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded hover:bg-sky-500/30 cursor-pointer disabled:opacity-50"
                      >
                        Salvar também no Google Drive
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                  {googleUserEmail
                    ? `Sessão Google (${googleUserEmail}) ativa — clique em "Conectar Google Drive" para liberar o token OAuth de leitura/gravação e abrir arquivos CAD do seu Drive.`
                    : 'Conecte sua conta Google com permissão Drive para abrir arquivos CAD do seu Drive e sincronizar sua pasta na nuvem.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {driveFiles.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      {driveBusy ? 'Carregando pasta no Google Drive...' : 'Pasta criada no Drive. Salve o projeto atual acima ou pesquise CADs abaixo.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
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
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={driveBusy}
                              onClick={() => void handleOpenDriveFile(df)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded hover:bg-sky-500/30 cursor-pointer"
                              title="Abrir / importar arquivo do Google Drive"
                            >
                              Abrir
                            </button>
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
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search & Import existing CAD files anywhere in logged-in Google Drive */}
                  <div className="pt-2 border-t border-white/8 space-y-2">
                    <form onSubmit={handleSearchDriveCadFiles} className="flex gap-1.5">
                      <input
                        type="text"
                        value={driveSearchTerm}
                        onChange={(e) => setDriveSearchTerm(e.target.value)}
                        placeholder="Buscar .step, .stl, .ipt, .dxf no Meu Drive..."
                        className="flex-1 px-2.5 py-1 text-[11px] bg-[#111620] border border-white/12 rounded text-slate-100 outline-none focus:border-sky-400"
                      />
                      <button
                        type="submit"
                        disabled={driveBusy}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded hover:bg-emerald-500/30 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Search className="w-3 h-3" />
                        Buscar Drive
                      </button>
                    </form>
                    {driveCadMatches.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {driveCadMatches.map((cf) => (
                          <div
                            key={`match-${cf.id}`}
                            className="flex items-center justify-between gap-2 px-2 py-1 bg-[#111620]/70 border border-white/6 rounded text-[11px]"
                          >
                            <span className="text-slate-200 truncate">{cf.name}</span>
                            <button
                              type="button"
                              disabled={driveBusy}
                              onClick={() => void handleOpenDriveFile(cf)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500 text-slate-950 rounded hover:bg-emerald-400 cursor-pointer shrink-0"
                            >
                              Importar 3D
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
