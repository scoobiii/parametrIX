import React, { useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Box,
  Check,
  Copy,
  FileUp,
  Globe,
  HardDrive,
  Link2,
  Loader2,
  Play,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { SEGMENT_CATALOG } from '../kernel/componentClassifier';
import {
  MCP_TOOLS_CATALOG,
  type McpRuntimeContext,
  executeMcpToolCall,
} from '../kernel/mcpServer';
import { convertImageToCadModel, isRasterImageFilename } from '../kernel/imageToCad';
import {
  base64ToArrayBuffer,
  retrieveTopRagChunks,
  tryBuildCadAndRagDoc,
} from '../kernel/ragEngine';
import type {
  AgentChatMessage,
  AgentToolCallLog,
  ApplicationSegment,
  ImportedCadModel,
  McpExecutionLog,
  McpToolDefinition,
  RagSourceDocument,
} from '../types/cad';

interface McpToolsPanelProps {
  runtimeContext: McpRuntimeContext;
  ragDocs: RagSourceDocument[];
  onAddRagDoc: (doc: RagSourceDocument, importedCad: ImportedCadModel | null) => void;
  onRemoveRagDoc: (id: string) => void;
  chatMessages: AgentChatMessage[];
  onAddChatMessage: (msg: AgentChatMessage) => void;
  onOpenViewport: () => void;
}

const MCP_CLIENT_CONFIG = JSON.stringify(
  {
    mcpServers: {
      'parametrix-cad-studio': {
        command: 'npx',
        args: ['-y', '@parametrix/cad-mcp-bridge', '--endpoint', 'window.__PARAMETRIX_MCP__'],
        capabilities: ['tools/list', 'tools/call'],
      },
    },
  },
  null,
  2
);

const QUICK_PROMPTS = [
  'Identificar peça, fabricante, normas e executar FEA Antes/Depois',
  'Explodir conjunto em 60% e ativar Máscara de Objetos por família',
  'Calcular estresse FEA e ativar mapa de calor',
  'Isolar peça crítica e exportar STL',
];

function extractToolPayloadFromLog(log: McpExecutionLog): Record<string, unknown> {
  try {
    const parsed = JSON.parse(log.responseJson);
    if (parsed.error) {
      return { error: parsed.error.message || 'Erro ao executar ferramenta MCP.' };
    }
    const textContent = parsed.result?.content?.[0]?.text;
    if (typeof textContent === 'string') {
      return JSON.parse(textContent) as Record<string, unknown>;
    }
  } catch {
    // Fallback below
  }
  return { raw: log.responseJson };
}

export const McpToolsPanel: React.FC<McpToolsPanelProps> = ({
  runtimeContext,
  ragDocs,
  onAddRagDoc,
  onRemoveRagDoc,
  chatMessages,
  onAddChatMessage,
  onOpenViewport,
}) => {
  const [subView, setSubView] = useState<'agent' | 'rpc'>('agent');
  // Mobile pane switcher prevents side-by-side column crushing on phones
  const [mobilePane, setMobilePane] = useState<'left' | 'right'>('right');

  // RAG ingestion state
  const [urlInput, setUrlInput] = useState('');
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestInfo, setIngestInfo] = useState<string | null>(null);

  // Agent chat state
  const [promptInput, setPromptInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual JSON-RPC console state
  const [categoryFilter, setCategoryFilter] = useState<
    'Todas' | 'Segmento Ativo' | McpToolDefinition['category']
  >('Todas');
  const [selectedToolName, setSelectedToolName] = useState<string>(MCP_TOOLS_CATALOG[0].name);
  const [argsText, setArgsText] = useState<string>(
    JSON.stringify(MCP_TOOLS_CATALOG[0].exampleArgs, null, 2)
  );
  const [logs, setLogs] = useState<McpExecutionLog[]>([]);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const selectedTool =
    MCP_TOOLS_CATALOG.find((t) => t.name === selectedToolName) ?? MCP_TOOLS_CATALOG[0];

  const filteredTools = MCP_TOOLS_CATALOG.filter((t) => {
    if (categoryFilter === 'Todas') return true;
    if (categoryFilter === 'Segmento Ativo') {
      return !t.segments || t.segments.includes(runtimeContext.activeSegment);
    }
    return t.category === categoryFilter;
  });

  const handleLocalUpload = async (file: File) => {
    setIngestError(null);
    setIngestInfo(null);
    setIngestBusy(true);
    try {
      const lower = file.name.toLowerCase();
      if (isRasterImageFilename(file.name, file.type)) {
        setIngestInfo('Convertendo imagem em projeto CAD 3D fidedigno...');
        const { model, ragTextSummary } = await convertImageToCadModel({
          filename: file.name,
          mimeType: file.type,
          blobOrBuffer: file,
        });
        const { ragDoc, importedCad } = tryBuildCadAndRagDoc({
          title: file.name,
          kind: 'upload',
          mimeType: file.type || 'image/png',
          byteSize: file.size,
          extractedText: ragTextSummary,
          preBuiltCad: model,
        });
        onAddRagDoc(ragDoc, importedCad);
        setIngestInfo(
          `Imagem "${ragDoc.title}" convertida em projeto CAD 3D fidedigno (${
            importedCad?.components?.length ?? 1
          } sub-componentes) + Visualizador 3D aberto.`
        );
        return;
      }

      const isBinary =
        lower.endsWith('.stl') || lower.endsWith('.3dm') || lower.endsWith('.ipt');
      const buffer = isBinary ? await file.arrayBuffer() : undefined;
      const extractedText = isBinary ? undefined : await file.text();

      const { ragDoc, importedCad } = tryBuildCadAndRagDoc({
        title: file.name,
        kind: 'upload',
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        extractedText,
        buffer,
      });
      onAddRagDoc(ragDoc, importedCad);
      setIngestInfo(
        `Fonte "${ragDoc.title}" indexada (${ragDoc.chunkCount} trechos RAG)${
          importedCad ? ' + Visualizador 3D aberto.' : '.'
        }`
      );
    } catch (err) {
      setIngestInfo(null);
      setIngestError(err instanceof Error ? err.message : 'Erro ao processar upload local.');
    } finally {
      setIngestBusy(false);
    }
  };

  const handleIngestUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = urlInput.trim();
    if (!target) return;
    setIngestError(null);
    setIngestInfo(null);
    setIngestBusy(true);
    try {
      const resp = await fetch('/api/ingest-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `Falha HTTP ${resp.status}`);
      }

      const buffer =
        typeof data.base64Content === 'string' && data.base64Content
          ? base64ToArrayBuffer(data.base64Content)
          : undefined;

      const sourceTitle = String(data.title || 'documento_externo');
      const sourceMime = String(data.mimeType || 'application/octet-stream');
      let preBuiltCad: ImportedCadModel | null = null;
      let extractedText =
        typeof data.extractedText === 'string' ? data.extractedText : undefined;

      if (buffer && isRasterImageFilename(sourceTitle, sourceMime)) {
        setIngestInfo('Convertendo imagem remota em projeto CAD 3D fidedigno...');
        const converted = await convertImageToCadModel({
          filename: sourceTitle,
          mimeType: sourceMime,
          blobOrBuffer: buffer,
        });
        preBuiltCad = converted.model;
        extractedText = converted.ragTextSummary;
      }

      const { ragDoc, importedCad } = tryBuildCadAndRagDoc({
        title: sourceTitle,
        kind: data.isGoogleDrive ? 'gdrive' : 'url',
        originUrl: String(data.originUrl || target),
        mimeType: sourceMime,
        byteSize: Number(data.byteSize || 0),
        extractedText,
        buffer,
        preBuiltCad,
      });

      onAddRagDoc(ragDoc, importedCad);
      setUrlInput('');
      setIngestInfo(
        `${data.isGoogleDrive ? 'Google Drive' : 'URL'} "${ragDoc.title}" indexado (${
          ragDoc.chunkCount
        } trechos)${importedCad ? ' + Visualizador 3D aberto.' : '.'}`
      );
    } catch (err) {
      setIngestInfo(null);
      setIngestError(err instanceof Error ? err.message : 'Erro ao importar URL / Google Drive.');
    } finally {
      setIngestBusy(false);
    }
  };

  const buildCadContextSnapshot = () => ({
    activeSegment: runtimeContext.activeSegment,
    partProfile: runtimeContext.partProfile,
    components: runtimeContext.components.map((c) => ({
      id: c.id,
      name: c.name,
      family: c.family,
      subFamily: c.subFamily,
      maskColorHex: c.maskColorHex,
      material: runtimeContext.display.componentMaterials[c.id] ?? c.inferredMaterial,
      triangleCount: c.triangleCount,
    })),
    surface: {
      id: runtimeContext.surface.id,
      name: runtimeContext.surface.name,
      thicknessMm: runtimeContext.surface.thicknessMm,
    },
    designParams: runtimeContext.designParams,
    display: {
      mode: runtimeContext.display.mode,
      materialFinish: runtimeContext.display.materialFinish,
      isolationTarget: runtimeContext.display.isolationTarget,
      explodeFactor: runtimeContext.display.explodeFactor,
      stressComparisonView: runtimeContext.display.stressComparisonView,
    },
    feaResult: {
      materialName: runtimeContext.feaResult.materialName,
      yieldStrengthMpa: runtimeContext.feaResult.yieldStrengthMpa,
      loadNewtons: runtimeContext.feaResult.loadNewtons,
      supportMode: runtimeContext.feaResult.supportMode,
      loadPattern: runtimeContext.feaResult.loadPattern,
      maxStressMpa: runtimeContext.feaResult.maxStressMpa,
      meanStressMpa: runtimeContext.feaResult.meanStressMpa,
      maxDeflectionMm: runtimeContext.feaResult.maxDeflectionMm,
      safetyFactor: runtimeContext.feaResult.safetyFactor,
      totalMassKg: runtimeContext.feaResult.totalMassKg,
      status: runtimeContext.feaResult.status,
      complianceNote: runtimeContext.feaResult.complianceNote,
    },
    feaComparison: runtimeContext.feaComparison
      ? {
          strategySummary: runtimeContext.feaComparison.strategySummary,
          stressDeltaPct: runtimeContext.feaComparison.stressDeltaPct,
          deflectionDeltaPct: runtimeContext.feaComparison.deflectionDeltaPct,
          safetyFactorDeltaPct: runtimeContext.feaComparison.safetyFactorDeltaPct,
          massDeltaPct: runtimeContext.feaComparison.massDeltaPct,
          certificationPassedBefore: runtimeContext.feaComparison.certificationPassedBefore,
          certificationPassedAfter: runtimeContext.feaComparison.certificationPassedAfter,
        }
      : null,
    camSettings: runtimeContext.camSettings,
  });

  const handleSendAgentPrompt = async (customText?: string) => {
    const query = (customText ?? promptInput).trim();
    if (!query || agentBusy) return;

    setMobilePane('right');
    setAgentError(null);
    if (!customText) setPromptInput('');

    const userMsg: AgentChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };
    onAddChatMessage(userMsg);
    setAgentBusy(true);

    try {
      const topChunks = retrieveTopRagChunks(ragDocs, query, 6);
      const citations = topChunks.map((c) => ({
        docTitle: c.docTitle,
        chunkIndex: c.index,
        snippet: c.text.slice(0, 140),
      }));

      let payloadBody: Record<string, unknown> = {
        userMessage: query,
        ragChunks: topChunks.map((c) => ({
          docTitle: c.docTitle,
          index: c.index,
          text: c.text,
        })),
        cadContext: buildCadContextSnapshot(),
      };

      const executedToolCalls: AgentToolCallLog[] = [];
      let finalText = '';

      for (let round = 0; round < 3; round++) {
        const resp = await fetch('/api/rag-mcp-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBody),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || `Erro HTTP ${resp.status}`);
        }

        const fcs: { id?: string; name: string; args: Record<string, unknown> }[] = Array.isArray(
          data.functionCalls
        )
          ? data.functionCalls
          : [];

        if (fcs.length === 0) {
          finalText = String(data.text || '').trim();
          break;
        }

        const functionResponses: {
          id?: string;
          name: string;
          response: Record<string, unknown>;
        }[] = [];

        for (const fc of fcs) {
          const execLog = executeMcpToolCall(fc.name, fc.args || {}, runtimeContext);
          setLogs((prev) => [execLog, ...prev]);
          const parsedResult = extractToolPayloadFromLog(execLog);

          executedToolCalls.push({
            name: fc.name,
            args: fc.args || {},
            status: execLog.status,
            summary:
              execLog.status === 'ok'
                ? JSON.stringify(parsedResult).slice(0, 110)
                : String(parsedResult.error || 'Erro'),
          });

          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: parsedResult,
          });
        }

        payloadBody = {
          userMessage: query,
          ragChunks: topChunks.map((c) => ({
            docTitle: c.docTitle,
            index: c.index,
            text: c.text,
          })),
          cadContext: buildCadContextSnapshot(),
          previousModelContent: data.modelContent,
          functionResponses,
        };
        if (typeof data.text === 'string' && data.text.trim()) {
          finalText = data.text.trim();
        }
      }

      onAddChatMessage({
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        text:
          finalText ||
          (executedToolCalls.length > 0
            ? 'Ferramentas MCP executadas com sucesso sobre o modelo CAD ativo.'
            : 'Nenhuma resposta retornada.'),
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
        citations: citations.length > 0 ? citations : undefined,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });
    } catch (err) {
      setAgentError(
        err instanceof Error ? err.message : 'Falha na comunicação com o Agente RAG + MCP.'
      );
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSelectTool = (tool: McpToolDefinition) => {
    setSelectedToolName(tool.name);
    setArgsText(JSON.stringify(tool.exampleArgs, null, 2));
    setMobilePane('right');
  };

  const handleRunTool = (overrideToolName?: string) => {
    const targetName = overrideToolName ?? selectedToolName;
    let parsedArgs: Record<string, unknown> = {};
    if (!overrideToolName) {
      try {
        parsedArgs = argsText.trim() ? JSON.parse(argsText) : {};
      } catch (err) {
        const errLog: McpExecutionLog = {
          id: `mcp-${Date.now()}`,
          toolName: targetName,
          requestJson: argsText,
          responseJson: JSON.stringify(
            {
              jsonrpc: '2.0',
              error: {
                code: -32700,
                message: `JSON inválido nos argumentos: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              },
            },
            null,
            2
          ),
          durationMs: 0,
          status: 'error',
          timestamp: new Date().toLocaleTimeString('pt-BR'),
        };
        setLogs((prev) => [errLog, ...prev]);
        return;
      }
    }

    const log = executeMcpToolCall(targetName, parsedArgs, runtimeContext);
    setLogs((prev) => [log, ...prev]);
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_CLIENT_CONFIG);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 1800);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  const { feaResult, feaComparison, partProfile, activeSegment } = runtimeContext;

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0e14] overflow-hidden">
      {/* Top Sub-navigation Bar + Segment Selector */}
      <div className="px-3 sm:px-5 py-2.5 border-b border-white/10 bg-[#111620] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('agent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              subView === 'agent'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-[#0c1017] border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Agente RAG + MCP
          </button>
          <button
            type="button"
            onClick={() => setSubView('rpc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              subView === 'rpc'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-[#0c1017] border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            JSON-RPC ({MCP_TOOLS_CATALOG.length})
          </button>

          {/* Segment Selector for Segment-Specific MCP Tools & Standards */}
          <select
            aria-label="Segmento de aplicação para MCP Tools"
            value={activeSegment}
            onChange={(e) => runtimeContext.onSetSegment(e.target.value as ApplicationSegment)}
            className="px-2.5 py-1.5 text-xs bg-[#0c1017] border border-emerald-500/35 text-emerald-200 rounded-lg focus:outline-none focus:border-emerald-400"
          >
            {SEGMENT_CATALOG.map((seg) => (
              <option key={seg.id} value={seg.id}>
                Seg: {seg.shortLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenViewport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-lg cursor-pointer"
          >
            <Box className="w-3.5 h-3.5" />
            Editor 3D
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-slate-300">
          <span className="hidden sm:inline truncate max-w-[200px] text-sky-300">
            {partProfile.manufacturer}
          </span>
          <span>
            Peça: <strong className="text-amber-300">{runtimeContext.display.isolationTarget}</strong>
          </span>
          <span>
            σ: <strong className="text-rose-300">{feaResult.maxStressMpa} MPa</strong>
          </span>
          <span>
            SF:{' '}
            <strong
              className={
                feaResult.status === 'seguro'
                  ? 'text-emerald-400'
                  : feaResult.status === 'alerta'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }
            >
              {feaResult.safetyFactor}
            </strong>
          </span>
          <span>
            RAG: <strong className="text-sky-300">{ragDocs.length}</strong>
          </span>
        </div>
      </div>

      {/* Mobile Sub-Pane Switcher (< md only) */}
      <div className="flex md:hidden border-b border-white/10 bg-[#0e131c] px-3 py-1.5 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('right')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
            mobilePane === 'right'
              ? 'bg-sky-500/20 border border-sky-400/50 text-sky-200'
              : 'text-slate-400'
          }`}
        >
          {subView === 'agent' ? 'Chat Agente + FEA' : 'Execução JSON-RPC'}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('left')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
            mobilePane === 'left'
              ? 'bg-sky-500/20 border border-sky-400/50 text-sky-200'
              : 'text-slate-400'
          }`}
        >
          {subView === 'agent' ? `Upload / RAG (${ragDocs.length})` : 'Catálogo MCP'}
        </button>
      </div>

      {subView === 'agent' ? (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: RAG Sources Ingestion (Upload, URL & Google Drive Link) */}
          <aside
            className={`${
              mobilePane === 'left' ? 'flex' : 'hidden md:flex'
            } w-full md:w-[350px] lg:w-[370px] h-full border-r border-white/10 bg-[#111620] flex-col shrink-0 overflow-hidden`}
          >
            <div className="px-4 py-3 border-b border-white/10 space-y-1">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Base RAG (Upload, URL & Google Drive)
              </h2>
              <p className="text-[11px] text-slate-400">
                Envie arquivos CAD (.STEP/.STP, .IPT, .SVG, .STL, .OBJ, .DXF, .3DM, .IFC) ou imagens (.PNG, .JPG, .WEBP) para abrir no Editor 3D e indexar no agente.
              </p>
            </div>

            <div className="p-4 border-b border-white/8 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.obj,.dxf,.3dm,.step,.stp,.ifc,.ipt,.svg,.png,.jpg,.jpeg,.webp,.txt,.md,.json,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLocalUpload(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                disabled={ingestBusy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium bg-[#0c1017] border border-dashed border-sky-400/45 hover:border-sky-400 text-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileUp className="w-4 h-4 text-sky-400" />
                Upload Local (.STP, .IPT, .SVG, .PNG, .JPG, .WEBP, .STL...)
              </button>

              <form onSubmit={(e) => void handleIngestUrl(e)} className="space-y-2">
                <label className="block text-[11px] text-slate-400">
                  Link Google Drive Público ou URL HTTP/HTTPS
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... ou URL"
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    disabled={ingestBusy || !urlInput.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {ingestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Ingerir'}
                  </button>
                </div>
              </form>

              {ingestError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[11px] text-rose-300">
                  {ingestError}
                </div>
              )}
              {ingestInfo && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-300 space-y-1.5">
                  <div>{ingestInfo}</div>
                  <button
                    type="button"
                    onClick={onOpenViewport}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 text-slate-950 rounded-md cursor-pointer"
                  >
                    Ir para Editor 3D
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-[11px] font-medium text-slate-400 px-1">
                Documentos Indexados ({ragDocs.length})
              </div>

              {ragDocs.length === 0 ? (
                <div className="p-4 bg-[#0c1017] border border-white/8 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                  Nenhuma fonte externa carregada. O agente já lê o modelo, fabricante, certificações e componentes ativos.
                </div>
              ) : (
                ragDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 bg-[#0c1017] border border-white/10 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {doc.kind === 'gdrive' ? (
                          <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : doc.kind === 'url' ? (
                          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {doc.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveRagDoc(doc.id)}
                        title="Remover fonte RAG"
                        className="text-slate-500 hover:text-rose-400 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                      <span className="text-sky-300">{doc.kind.toUpperCase()}</span>
                      <span>·</span>
                      <span>{doc.formatTag}</span>
                      <span>·</span>
                      <span>{doc.chunkCount} chunks</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{doc.summary}</p>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Right: Gemini RAG + MCP Chat & Engineering Context */}
          <div
            className={`${
              mobilePane === 'right' ? 'flex' : 'hidden md:flex'
            } flex-1 min-w-0 h-full flex-col overflow-hidden`}
          >
            {/* Active Part Context + Certification Bar */}
            <div className="px-4 py-2 border-b border-white/8 bg-[#0e131c] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-semibold text-slate-100 truncate">{partProfile.partName}</span>
                <span className="text-slate-500 hidden sm:inline">·</span>
                <span className="text-emerald-300 hidden sm:inline truncate">
                  {partProfile.certifications[0]}
                </span>
              </div>
              <span className="text-[10px] font-mono-tabular text-slate-400">
                {runtimeContext.components.length} componentes classificados
              </span>
            </div>

            {/* Before vs After Comparison Strip */}
            {feaComparison && (
              <div className="px-4 py-3 border-b border-sky-500/25 bg-[#0f1622] shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                    <Activity className="w-3.5 h-3.5" />
                    Comparação Estrutural: Antes vs Depois
                  </span>
                  <span className="text-[11px] text-slate-300">{feaComparison.strategySummary}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono-tabular">
                  <div className="p-2 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-slate-400">Von Mises Máx</div>
                    <div className="text-slate-100 mt-0.5">
                      {feaComparison.before.maxStressMpa} → {feaComparison.after.maxStressMpa} MPa
                    </div>
                  </div>
                  <div className="p-2 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-slate-400">Deflexão Máx</div>
                    <div className="text-slate-100 mt-0.5">
                      {feaComparison.before.maxDeflectionMm} → {feaComparison.after.maxDeflectionMm} mm
                    </div>
                  </div>
                  <div className="p-2 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-slate-400">Fator de Segurança</div>
                    <div className="text-emerald-300 mt-0.5">
                      {feaComparison.before.safetyFactor} → {feaComparison.after.safetyFactor}
                    </div>
                  </div>
                  <div className="p-2 bg-[#0c1017] border border-white/8 rounded-lg">
                    <div className="text-slate-400">Certificação</div>
                    <div
                      className={`mt-0.5 ${
                        feaComparison.certificationPassedAfter ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {feaComparison.certificationPassedAfter ? 'Aprovado' : 'Em análise'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="max-w-2xl mx-auto my-4 p-5 bg-[#111620] border border-white/10 rounded-xl space-y-4">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-sky-400" />
                    <h3 className="font-display text-base font-semibold text-slate-100">
                      Agente Autônomo CAD/CAE + RAG + MCP
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    O agente conhece o fabricante, modelo, normas de certificação e subcomponentes da peça ativa.
                    Peça para explodir o conjunto, ativar Object Mask, alterar materiais por componente, isolar peças,
                    exportar STL/DXF/3DM ou gerar nova geometria com mapa de calor Antes vs Depois.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleSendAgentPrompt(q)}
                        className="text-left p-2.5 text-xs bg-[#0c1017] border border-white/10 hover:border-sky-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-3xl rounded-xl px-4 py-3 text-xs space-y-2.5 ${
                        msg.role === 'user'
                          ? 'bg-sky-500/18 border border-sky-400/40 text-slate-100'
                          : 'bg-[#111620] border border-white/10 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400">
                        <span className="font-semibold uppercase">
                          {msg.role === 'user' ? 'Engenheiro' : 'Agente RAG + MCP'}
                        </span>
                        <span className="font-mono-tabular">{msg.timestamp}</span>
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="pt-2 border-t border-white/8 space-y-1.5">
                          <div className="text-[10px] font-medium text-amber-300 flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            Ferramentas MCP Executadas
                          </div>
                          {msg.toolCalls.map((tc, i) => (
                            <div
                              key={`${tc.name}-${i}`}
                              className="p-2 bg-[#080a0f] border border-white/8 rounded-lg font-mono-tabular text-[11px]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sky-300 font-semibold">{tc.name}</span>
                                <span
                                  className={
                                    tc.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                                  }
                                >
                                  {tc.status.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-slate-400 truncate mt-0.5">{tc.summary}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-2 border-t border-white/8 space-y-1">
                          <div className="text-[10px] font-medium text-emerald-300">
                            Fontes RAG Consultadas
                          </div>
                          {msg.citations.map((cit, i) => (
                            <div
                              key={`${cit.docTitle}-${i}`}
                              className="text-[11px] text-slate-400 truncate"
                            >
                              <strong className="text-slate-200">{cit.docTitle}</strong> (#
                              {cit.chunkIndex}): {cit.snippet}…
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {agentError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
                  {agentError}
                </div>
              )}
            </div>

            {/* Prompt Input Bar */}
            <div className="p-3 sm:p-4 border-t border-white/10 bg-[#111620] space-y-2 shrink-0">
              {chatMessages.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={agentBusy}
                      onClick={() => void handleSendAgentPrompt(q)}
                      className="px-2.5 py-1 text-[11px] bg-[#0c1017] border border-white/10 hover:border-sky-400/50 text-slate-300 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendAgentPrompt();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  disabled={agentBusy}
                  placeholder="Comande o agente (explodir, rotacionar, isolar peça, FEA Antes/Depois)..."
                  className="flex-1 min-w-0 px-3 py-2.5 text-xs bg-[#0c1017] border border-white/12 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={agentBusy || !promptInput.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-xl hover:bg-sky-400 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {agentBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{agentBusy ? 'Processando' : 'Enviar'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        /* JSON-RPC 2.0 Console View (Segment-Filterable MCP Tools) */
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <aside
            className={`${
              mobilePane === 'left' ? 'flex' : 'hidden md:flex'
            } w-full md:w-[360px] h-full border-r border-white/10 bg-[#111620] flex-col shrink-0 overflow-hidden`}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  MCP Tools ({filteredTools.length})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => handleRunTool('tools/list')}
                className="px-2.5 py-1 text-[11px] font-mono-tabular bg-[#0c1017] border border-white/12 hover:border-sky-400/50 text-sky-300 rounded-md cursor-pointer"
              >
                tools/list
              </button>
            </div>

            <div className="px-3 py-2 border-b border-white/8 flex items-center gap-1 overflow-x-auto">
              {(
                [
                  'Todas',
                  'Segmento Ativo',
                  'Geometria',
                  'FEA / Otimização',
                  'CAM',
                  'Plugins',
                  'Sessão',
                ] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredTools.map((tool) => {
                const active = tool.name === selectedToolName;
                const appliesToSeg =
                  !tool.segments || tool.segments.includes(activeSegment);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => handleSelectTool(tool)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'border-amber-400/70 bg-amber-500/10'
                        : 'border-white/8 bg-[#0c1017] hover:border-white/16'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-semibold text-slate-100 truncate">
                        {tool.name}
                      </span>
                      <span
                        className={`text-[10px] shrink-0 ${
                          appliesToSeg ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {appliesToSeg ? 'Aplicável' : tool.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {tool.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div
            className={`${
              mobilePane === 'right' ? 'flex' : 'hidden md:flex'
            } flex-1 h-full flex-col overflow-hidden`}
          >
            <div className="px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#111620] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-mono-tabular text-sm font-semibold text-amber-300">
                  {selectedTool.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedTool.description}</p>
              </div>

              <button
                type="button"
                onClick={() => handleRunTool()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Executar Tool (JSON-RPC)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Argumentos JSON (`params.arguments`)
                  </label>
                  <textarea
                    aria-label="Argumentos JSON da ferramenta MCP"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    spellCheck={false}
                    rows={9}
                    className="w-full p-3.5 bg-[#080a0f] border border-white/10 rounded-xl font-mono-tabular text-xs text-slate-200 outline-none focus:border-sky-400 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-300">
                    Schema de Entrada (`inputSchema`)
                  </div>
                  <pre className="p-3.5 bg-[#080a0f] border border-white/10 rounded-xl font-mono-tabular text-[11px] text-sky-300 h-[196px] overflow-auto">
                    {JSON.stringify(selectedTool.inputSchema, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-semibold text-slate-100">
                    Respostas JSON-RPC 2.0
                  </h4>
                  {logs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLogs([])}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Limpar Histórico
                    </button>
                  )}
                </div>

                {logs.length === 0 ? (
                  <div className="p-5 bg-[#111620] border border-white/8 rounded-xl text-xs text-slate-400">
                    Clique em <strong className="text-slate-200">Executar Tool (JSON-RPC)</strong> para
                    invocar a ferramenta diretamente sobre o modelo, componentes ou FEA ativos.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-4 bg-[#111620] border border-white/10 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono-tabular font-semibold text-slate-100">
                            {entry.toolName}
                          </span>
                          <span
                            className={`font-mono-tabular text-[11px] ${
                              entry.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {entry.status.toUpperCase()} · {entry.durationMs} ms · {entry.timestamp}
                          </span>
                        </div>
                        <pre className="p-3 bg-[#080a0f] border border-white/8 rounded-lg font-mono-tabular text-[11px] text-slate-300 max-h-64 overflow-auto">
                          {entry.responseJson}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-slate-100">
                      Manifesto de Integração para Agentes Externos (`mcpServers`)
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Compatível com clientes MCP padrão usando o bridge exposto em{' '}
                      <code className="text-sky-300">window.__PARAMETRIX_MCP__</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyConfig}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0c1017] border border-white/12 hover:border-sky-400/50 text-slate-200 rounded-lg cursor-pointer"
                  >
                    {copiedConfig ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 bg-[#080a0f] border border-white/8 rounded-lg font-mono-tabular text-[11px] text-slate-300 overflow-x-auto">
                  {MCP_CLIENT_CONFIG}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
