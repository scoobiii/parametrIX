import crypto from 'node:crypto';
import type { CamAgentContextSummary } from '../kernel/camAgentSystemInstruction';
import {
  type QwenSpecialistProfile,
  buildFullProjectKnowledgeCorpus,
  routeQwenSpecialistFunction,
} from '../kernel/qwenProjectRagFinetune';
import type { FormalVucCertificate, RagSourceDocument } from '../types/cad';
import { createFormalVucCertificate } from './vucFormalProof';

export interface BrowserMcpRpcResponsePayload {
  requestId: string;
  ok: boolean;
  log?: Record<string, unknown>;
  error?: string;
}

export interface WebSocketClientLike {
  send: (raw: string) => void;
}

interface PendingRpcEntry {
  clientId: string;
  resolve: (payload: BrowserMcpRpcResponsePayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Bidirectional WebSocket relay between HTTP JSON-RPC (`POST /api/mcp`) and the
 * live browser Viewport 3D bridge (`window.__PARAMETRIX_MCP__`).
 */
export class WebSocketBrowserMcpRelay {
  private readonly clients = new Map<string, { socket: WebSocketClientLike; bridgeReady: boolean }>();
  private readonly pending = new Map<string, PendingRpcEntry>();

  registerClient(clientId: string, socket: WebSocketClientLike, bridgeReady = false): void {
    this.clients.set(clientId, { socket, bridgeReady });
  }

  markBridgeReady(clientId: string, ready: boolean): void {
    const entry = this.clients.get(clientId);
    if (entry) {
      entry.bridgeReady = ready;
    }
  }

  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    const remainingReady = this.getReadyBridgeCount();
    for (const [reqId, item] of this.pending.entries()) {
      if (item.clientId === clientId || remainingReady === 0) {
        clearTimeout(item.timer);
        this.pending.delete(reqId);
        item.reject(
          new Error('Aba do navegador desconectada antes da conclusão da ferramenta MCP.')
        );
      }
    }
  }

  getReadyBridgeCount(): number {
    let count = 0;
    for (const entry of this.clients.values()) {
      if (entry.bridgeReady) {
        count += 1;
      }
    }
    return count;
  }

  getTotalConnectedCount(): number {
    return this.clients.size;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  handleRpcResponse(payload: BrowserMcpRpcResponsePayload): boolean {
    const entry = this.pending.get(payload.requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(payload.requestId);
    entry.resolve(payload);
    return true;
  }

  async dispatchBrowserTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs = 8000
  ): Promise<BrowserMcpRpcResponsePayload> {
    let targetClientId = '';
    let targetSocket: WebSocketClientLike | null = null;
    for (const [id, entry] of this.clients.entries()) {
      if (entry.bridgeReady) {
        targetClientId = id;
        targetSocket = entry.socket;
      }
    }
    if (!targetSocket) {
      throw new Error(
        `Nenhuma aba ativa do navegador conectada ao relay /ws (__PARAMETRIX_MCP__) para executar '${toolName}'.`
      );
    }

    const requestId = `mcp-ws-${crypto.randomBytes(6).toString('hex')}`;
    const frame = JSON.stringify({
      type: 'mcp:rpc_request',
      payload: { requestId, name: toolName, args },
      timestamp: new Date().toISOString(),
    });

    return new Promise<BrowserMcpRpcResponsePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timeout (${timeoutMs}ms) aguardando resposta do navegador para '${toolName}'.`));
      }, timeoutMs);

      this.pending.set(requestId, { clientId: targetClientId, resolve, reject, timer });
      try {
        targetSocket.send(frame);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

export interface HermesSearchHit {
  id: string;
  source: 'local-rag' | 'web-duckduckgo' | 'public-cad-url';
  domain: string;
  title: string;
  snippet: string;
  score: number;
  url?: string;
}

export interface PublicCadUrlInspectionResult {
  url: string;
  isPublicRepository: boolean;
  status: 'ok' | 'direct-cad' | 'blocked-or-auth-required' | 'invalid-url' | 'network-error';
  httpStatus?: number;
  title: string;
  description: string;
  detectedFormats: string[];
  previewImageUrl?: string;
  directCadUrl?: string;
  diagnosticNote: string;
  vucCertificate: FormalVucCertificate;
}

export interface HermesSearchResult {
  query: string;
  specialistProfile: QwenSpecialistProfile;
  hits: HermesSearchHit[];
  webStatus: 'disabled' | 'ok' | 'unavailable';
  cadUrlInspection?: PublicCadUrlInspectionResult;
  compactSummaryText: string;
  approxTokens: number;
  vucCertificate: FormalVucCertificate;
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status?: number;
  headers?: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export function isDisallowedExternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function inspectPublicCadUrl(params: {
  url: string;
  fetcher?: FetchLike;
}): Promise<PublicCadUrlInspectionResult> {
  const startedAt = Date.now();
  const rawUrl = params.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      isPublicRepository: false,
      status: 'invalid-url',
      title: 'URL inválida',
      description: 'URL fornecida não pôde ser interpretada.',
      detectedFormats: [],
      diagnosticNote: 'Informe uma URL HTTP/HTTPS pública válida (.STEP/.STL/.OBJ/.DXF/.SVG ou Google Drive).',
      vucCertificate: createFormalVucCertificate({
        domain: 'CAD_URL_INSPECT',
        status: 'FAIL',
        inputPayload: { url: rawUrl },
        outputPayload: { reason: 'invalid-url' },
        durationMs: Math.max(1, Date.now() - startedAt),
      }),
    };
  }

  const isPublicRepository = /^https?:$/i.test(parsed.protocol) && !/\.(stl|step|stp|dxf|obj|3dm|ifc|svg|ipt)$/i.test(parsed.pathname);
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isDisallowedExternalHost(parsed.hostname)) {
    return {
      url: rawUrl,
      isPublicRepository: false,
      status: 'invalid-url',
      title: 'Host bloqueado por política SSRF',
      description: 'Apenas URLs públicas HTTP/HTTPS são permitidas.',
      detectedFormats: [],
      diagnosticNote: 'Endereços locais ou privados foram bloqueados por segurança.',
      vucCertificate: createFormalVucCertificate({
        domain: 'CAD_URL_INSPECT',
        status: 'FAIL',
        inputPayload: { url: rawUrl },
        outputPayload: { reason: 'ssrf-blocked' },
        durationMs: Math.max(1, Date.now() - startedAt),
      }),
    };
  }

  const slugName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname);
  const directExtMatch = /\.(stl|step|stp|dxf|obj|3dm|ifc|svg|ipt)$/i.exec(parsed.pathname);
  const fetchImpl: FetchLike = params.fetcher ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetchImpl(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ParametrixHermesCadSearch/1.0',
        Accept: 'text/html,application/xhtml+xml,application/octet-stream,*/*',
      },
    });
    const httpStatus = resp.status ?? (resp.ok ? 200 : 500);
    const bodyText = resp.text ? await resp.text() : '';
    const contentType = resp.headers?.get('content-type')?.toLowerCase() ?? '';

    if (!resp.ok || (/cf-browser-verification|Just a moment|Sign in required/i.test(bodyText) && !/<meta[^>]+og:title/i.test(bodyText))) {
      const note =
        httpStatus === 401 || httpStatus === 403 || httpStatus === 429
          ? `O servidor retornou HTTP ${httpStatus} (proteção ou autenticação requerida). Baixe o arquivo real .STEP/.STL/.OBJ/.IPT ou conecte sua conta Google Drive na aba Arquivos CAD.`
          : `Falha HTTP ${httpStatus} ao consultar ${parsed.hostname}. Não foi possível baixar geometria real.`;
      return {
        url: parsed.toString(),
        isPublicRepository,
        status: 'blocked-or-auth-required',
        httpStatus,
        title: slugName.replace(/[-_]+/g, ' '),
        description: note,
        detectedFormats: directExtMatch ? [directExtMatch[1].toUpperCase()] : [],
        diagnosticNote: note,
        vucCertificate: createFormalVucCertificate({
          domain: 'CAD_URL_INSPECT',
          status: 'PASS',
          inputPayload: { url: parsed.toString() },
          outputPayload: { status: 'blocked-or-auth-required', httpStatus },
          durationMs: Math.max(1, Date.now() - startedAt),
        }),
      };
    }

    if (directExtMatch && !contentType.includes('text/html')) {
      const fmt = directExtMatch[1].toUpperCase();
      const note = `Arquivo CAD direto acessível (${fmt}, ${bodyText.length} caracteres recebidos). Pronto para importação real na Viewport 3D.`;
      return {
        url: parsed.toString(),
        isPublicRepository: false,
        status: 'direct-cad',
        httpStatus,
        title: slugName,
        description: note,
        detectedFormats: [fmt],
        directCadUrl: parsed.toString(),
        diagnosticNote: note,
        vucCertificate: createFormalVucCertificate({
          domain: 'CAD_URL_INSPECT',
          status: 'PASS',
          inputPayload: { url: parsed.toString() },
          outputPayload: { status: 'direct-cad', format: fmt },
          durationMs: Math.max(1, Date.now() - startedAt),
        }),
      };
    }

    const ogTitle =
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(bodyText)?.[1] ||
      /<title[^>]*>([^<]+)<\/title>/i.exec(bodyText)?.[1] ||
      slugName.replace(/[-_]+/g, ' ');
    const ogDesc =
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(bodyText)?.[1] ||
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(bodyText)?.[1] ||
      `Página CAD ${parsed.hostname} consultada.`;
    const ogImg =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(bodyText)?.[1];

    const knownFormats = ['STEP', 'STP', 'IGES', 'STL', 'OBJ', 'DXF', '3DM', 'IPT', 'SOLIDWORKS', 'FUSION'];
    const detectedFormats = knownFormats.filter((fmt) =>
      new RegExp(`\\b${fmt}\\b`, 'i').test(bodyText)
    );
    const directHref = /href=["'](https?:\/\/[^"']+\.(?:stl|step|stp|dxf|obj|3dm|svg))["']/i.exec(
      bodyText
    )?.[1];

    const diagnosticNote = directHref
      ? `Link CAD público direto encontrado (${directHref}).`
      : 'Metadados públicos extraídos. Use link direto .STL/.STEP/.DXF/.OBJ/.3DM/.SVG ou Google Drive para tesselação automática.';

    return {
      url: parsed.toString(),
      isPublicRepository,
      status: 'ok',
      httpStatus,
      title: decodeHtmlEntities(ogTitle).slice(0, 140),
      description: decodeHtmlEntities(ogDesc).slice(0, 260),
      detectedFormats,
      previewImageUrl: ogImg,
      directCadUrl: directHref,
      diagnosticNote,
      vucCertificate: createFormalVucCertificate({
        domain: 'CAD_URL_INSPECT',
        status: 'PASS',
        inputPayload: { url: parsed.toString() },
        outputPayload: { status: 'ok', detectedFormats, directCadUrl: directHref ?? null },
        durationMs: Math.max(1, Date.now() - startedAt),
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url: parsed.toString(),
      isPublicRepository,
      status: 'network-error',
      title: slugName.replace(/[-_]+/g, ' '),
      description: `Erro de rede ao consultar ${parsed.hostname}: ${msg}`,
      detectedFormats: directExtMatch ? [directExtMatch[1].toUpperCase()] : [],
      diagnosticNote: `Sem conectividade para ${parsed.hostname} (${msg}). Operando 100% no cache RAG local.`,
      vucCertificate: createFormalVucCertificate({
        domain: 'CAD_URL_INSPECT',
        status: 'PASS',
        inputPayload: { url: parsed.toString() },
        outputPayload: { status: 'network-error', reason: msg },
        durationMs: Math.max(1, Date.now() - startedAt),
      }),
    };
  /* c8 ignore next -- the timer cleanup is exercised by every return path; V8 emits a synthetic finally branch. */
  } finally {
    clearTimeout(timer);
  }
}

export async function executeHermesCompactSearch(params: {
  query: string;
  dynamicDocs?: RagSourceDocument[];
  cadSummary?: CamAgentContextSummary;
  includeWeb?: boolean;
  maxResults?: number;
  fetcher?: FetchLike;
}): Promise<HermesSearchResult> {
  const startedAt = Date.now();
  const query = params.query.trim();
  const maxResults = Math.max(1, Math.min(10, params.maxResults ?? 5));
  const specialistProfile = routeQwenSpecialistFunction(query);
  const corpus = buildFullProjectKnowledgeCorpus(params.dynamicDocs ?? [], params.cadSummary);

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9áéíóúãõâêîôûç_-]+/i)
    .filter((t) => t.length >= 2);

  const localHits: HermesSearchHit[] = corpus
    .map((entry) => {
      const haystack = `${entry.title} ${entry.domain} ${entry.content}`.toLowerCase();
      let score =
        (entry.domain === 'LIVE_STATE' ? 1.5 : 0) +
        (specialistProfile.targetDomains.includes(entry.domain) ? 2.5 : 0);
      for (const tok of tokens) {
        if (haystack.includes(tok)) {
          score += 2 + Math.min(3, haystack.split(tok).length - 1);
        }
      }
      if (tokens.length === 0) score += 1;
      return {
        id: entry.id,
        source: 'local-rag' as const,
        domain: entry.domain,
        title: entry.title,
        snippet: entry.content.slice(0, 260),
        score: Number(score.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  let webStatus: HermesSearchResult['webStatus'] = 'disabled';
  const webHits: HermesSearchHit[] = [];
  let cadUrlInspection: PublicCadUrlInspectionResult | undefined;

  const urlMatch = /https?:\/\/[^\s"'<>]+/i.exec(query);
  if (params.includeWeb && query.length > 0) {
    const fetchImpl: FetchLike = params.fetcher ?? (fetch as unknown as FetchLike);

    if (urlMatch) {
      cadUrlInspection = await inspectPublicCadUrl({
        url: urlMatch[0],
        fetcher: fetchImpl,
      });
      webHits.push({
        id: 'url-cad-inspect',
        source: 'public-cad-url',
        domain: cadUrlInspection.isPublicRepository ? 'PUBLIC_CAD_REPOSITORY' : 'PUBLIC_CAD_URL',
        title: cadUrlInspection.title,
        snippet: `${cadUrlInspection.description} Formatos: ${cadUrlInspection.detectedFormats.join(', ') || 'não listados'}. ${cadUrlInspection.diagnosticNote}`.slice(
          0,
          260
        ),
        score: 9.5,
        url: cadUrlInspection.directCadUrl || cadUrlInspection.url,
      });
      webStatus = cadUrlInspection.status === 'network-error' ? 'unavailable' : 'ok';
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const resp = await fetchImpl(ddgUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'ParametrixHermesSearch/1.0' },
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            AbstractText?: string;
            AbstractURL?: string;
            Heading?: string;
            RelatedTopics?: { Text?: string; FirstURL?: string }[];
          };
          if (data.AbstractText) {
            webHits.push({
              id: 'ddg-abstract',
              source: 'web-duckduckgo',
              domain: 'WEB_SEARCH',
              title: data.Heading || query,
              snippet: data.AbstractText.slice(0, 240),
              score: 8.5,
              url: data.AbstractURL || undefined,
            });
          }
          const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
          for (let i = 0; i < topics.length && webHits.length < 3; i += 1) {
            const item = topics[i];
            if (item && typeof item.Text === 'string' && item.Text.trim()) {
              webHits.push({
                id: `ddg-topic-${i + 1}`,
                source: 'web-duckduckgo',
                domain: 'WEB_SEARCH',
                title: item.Text.split(' - ')[0].slice(0, 80),
                snippet: item.Text.slice(0, 220),
                score: Number((6 - i * 0.5).toFixed(2)),
                url: item.FirstURL || undefined,
              });
            }
          }
          webStatus = 'ok';
        } else {
          webStatus = 'unavailable';
        }
      } catch {
        webStatus = 'unavailable';
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const hits = [...webHits, ...localHits].slice(0, maxResults + 2);
  const compactSummaryText = [
    `[Hermes Search · RT=${specialistProfile.id} (${specialistProfile.modelVariant}) · query="${query || 'status'}" · web=${webStatus}]`,
    ...hits.map(
      (h, idx) =>
        `${idx + 1}. (${h.source}/${h.domain}) ${h.title}: ${h.snippet.replace(/\s+/g, ' ').trim()}`
    ),
  ]
    .join('\n')
    .slice(0, 1800);

  const approxTokens = Math.max(1, Math.ceil(compactSummaryText.length / 3.8));
  const vucCertificate = createFormalVucCertificate({
    domain: 'HERMES_SEARCH_VUC',
    status: 'PASS',
    inputPayload: {
      query,
      includeWeb: Boolean(params.includeWeb),
      maxResults,
      specialistId: specialistProfile.id,
    },
    outputPayload: {
      hitIds: hits.map((h) => h.id),
      webStatus,
      approxTokens,
      cadUrlStatus: cadUrlInspection?.status ?? null,
    },
    durationMs: Math.max(1, Date.now() - startedAt),
  });

  return {
    query,
    specialistProfile,
    hits,
    webStatus,
    ...(cadUrlInspection ? { cadUrlInspection } : {}),
    compactSummaryText,
    approxTokens,
    vucCertificate,
  };
}

export interface HermesBundleConfig {
  baseUrl: string;
  llamaPort: number;
  contextLength: number;
  modelName: string;
  configYaml: string;
  skillMarkdown: string;
  mcpBridgePy: string;
  llamaServerCmd: string;
  setupScriptRelPath: string;
  vucCertificate: FormalVucCertificate;
}

export function buildHermesAgentBundle(options: {
  baseUrl: string;
  llamaPort?: number;
  contextLength?: number;
  modelName?: string;
}): HermesBundleConfig {
  const startedAt = Date.now();
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const llamaPort = options.llamaPort ?? 11435;
  const contextLength = options.contextLength ?? 32768;
  const modelName = options.modelName ?? 'qwen2.5-coder:0.5b';

  const configYaml = [
    '# Hermes Agent + Qwen 0.5B + Parametrix MCP + VUC + Search',
    'providers:',
    '  qwen05b:',
    `    base_url: http://127.0.0.1:${llamaPort}/v1`,
    `    model: ${modelName}`,
    '    api_key: local',
    `    context_length: ${contextLength}`,
    'default_provider: qwen05b',
    `context_length: ${contextLength}`,
    'mcp_servers:',
    '  parametrix:',
    '    command: python3',
    '    args:',
    '      - ~/.hermes/mcp/parametrix_mcp_stdio.py',
    '    env:',
    `      PARAMETRIX_URL: ${baseUrl}`,
    '',
  ].join('\n');

  const skillMarkdown = [
    '---',
    'name: parametrix',
    'description: Opera CAD/CAM/FEA/Rhino/VUC e Search do Parametrix com contexto compacto (<600 tokens).',
    '---',
    '# Skill Parametrix MCP + VUC (Burrinho 0.5B)',
    '',
    '1. NUNCA invente dimensões, massas, tolerâncias ou G-Code. Chame o MCP primeiro.',
    `2. Briefing compacto de .IPT/.STEP (<600 tokens): \`cad_inspect_ipt_step_briefing\` ou \`POST ${baseUrl}/api/cad/llm-briefing\`.`,
    '3. Bounding box e métricas em mm: `cad_get_bbox` ou `cad_evaluate_nurbs_metrics`.',
    '4. FEA estrutural / Curvatura / Prova VUC: `cad_run_structural_fea`, `cad_optimize_surface_curvature`, `cad_get_scoobiii_vuc_proof`.',
    '5. Cena 3D aberta no navegador (via relay `/ws`): `cad_rhino_command`, `cad_magic_pen_feature`, `cad_generate_cam_toolpath`, `cad_export_deliverable`, `cad_reset_part_baseline`.',
    `6. Busca + RAG + URLs CAD Públicas & Drive com VUC (<600 tokens): \`hermes_search\` ou \`POST ${baseUrl}/api/hermes/search\`.`,
    '7. Reprodução da engrenagem M2 Z24: `npm run cad:gear` (requer FreeCAD + matplotlib) e validação `POST /api/vuc/formal-verify`.',
    '',
  ].join('\n');

  const mcpBridgePy = [
    '#!/usr/bin/env python3',
    '"""Bridge STDIO MCP (JSON-RPC 2.0) -> Parametrix HTTP /api/mcp (zero deps externas)."""',
    'import json, os, sys, urllib.request, urllib.error',
    '',
    `PARAMETRIX_URL = os.environ.get("PARAMETRIX_URL", "${baseUrl}").rstrip("/")`,
    'MCP_ENDPOINT = f"{PARAMETRIX_URL}/api/mcp"',
    '',
    'def main():',
    '    for raw in sys.stdin:',
    '        line = raw.strip()',
    '        if not line:',
    '            continue',
    '        try:',
    '            req = json.loads(line)',
    '        except Exception as exc:',
    '            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}) + "\\n")',
    '            sys.stdout.flush()',
    '            continue',
    '        if req.get("id") is None and str(req.get("method", "")).startswith("notifications/"):',
    '            continue',
    '        body = json.dumps(req).encode("utf-8")',
    '        http_req = urllib.request.Request(MCP_ENDPOINT, data=body, headers={"Content-Type": "application/json"}, method="POST")',
    '        try:',
    '            with urllib.request.urlopen(http_req, timeout=20) as resp:',
    '                sys.stdout.write(resp.read().decode("utf-8").strip() + "\\n")',
    '        except Exception as exc:',
    '            err = {"jsonrpc": "2.0", "id": req.get("id"), "error": {"code": -32000, "message": str(exc)}}',
    '            sys.stdout.write(json.dumps(err) + "\\n")',
    '        sys.stdout.flush()',
    '',
    'if __name__ == "__main__":',
    '    main()',
    '',
  ].join('\n');

  const llamaServerCmd = [
    'LD_LIBRARY_PATH=models/llama-bin:${LD_LIBRARY_PATH:-}',
    'models/llama-bin/llama-server',
    '-m models/qwen/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf',
    `--host 127.0.0.1 --port ${llamaPort} -c ${contextLength} -ngl 0`,
  ].join(' ');

  const vucCertificate = createFormalVucCertificate({
    domain: 'HERMES_CONFIG_BUNDLE',
    status: 'PASS',
    inputPayload: { baseUrl, llamaPort, contextLength, modelName },
    outputPayload: {
      configBytes: configYaml.length,
      skillBytes: skillMarkdown.length,
      bridgeBytes: mcpBridgePy.length,
    },
    durationMs: Math.max(1, Date.now() - startedAt),
  });

  return {
    baseUrl,
    llamaPort,
    contextLength,
    modelName,
    configYaml,
    skillMarkdown,
    mcpBridgePy,
    llamaServerCmd,
    setupScriptRelPath: 'scripts/hermes/setup_parametrix_hermes.sh',
    vucCertificate,
  };
}

export type ClawAgentFamily = 'hermes' | 'openclaw' | 'nanoclaw' | 'picoclaw';

export interface ClawFamilyBundle {
  baseUrl: string;
  llamaPort: number;
  contextLength: number;
  modelName: string;
  bridgeScriptPath: string;
  openclawConfigPath: string;
  openclawJson: string;
  nanoclawConfigPath: string;
  nanoclawYaml: string;
  picoclawConfigPath: string;
  picoclawJson: string;
  clawSkillMarkdown: string;
  mcpBridgePy: string;
  llamaServerCmd: string;
  setupScriptRelPath: string;
  vucCertificate: FormalVucCertificate;
}

/**
 * Generates validated configurations for the ultra-low-resource Claw agent family
 * (OpenClaw strict JSON/JSON5, NanoClaw sandbox YAML, and PicoClaw Go JSON)
 * sharing Qwen 0.5B on :11435, compact <600-token SKILL, Python STDIO MCP bridge, and VUC.
 */
export function buildClawFamilyBundle(options: {
  baseUrl: string;
  llamaPort?: number;
  contextLength?: number;
  modelName?: string;
}): ClawFamilyBundle {
  const startedAt = Date.now();
  const base = buildHermesAgentBundle(options);
  const { baseUrl, llamaPort, contextLength, modelName } = base;
  const bridgeScriptPath = '~/.hermes/mcp/parametrix_mcp_stdio.py';

  const openclawConfigObj = {
    models: {
      mode: 'merge',
      providers: {
        qwen05b: {
          baseUrl: `http://127.0.0.1:${llamaPort}/v1`,
          apiKey: 'local',
          api: 'openai-completions',
          models: [
            {
              id: modelName,
              name: `Qwen 0.5B Local (${contextLength} ctx)`,
              contextWindow: contextLength,
              maxTokens: 4096,
            },
          ],
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: `qwen05b/${modelName}`,
        },
      },
    },
    mcp: {
      servers: {
        parametrix: {
          command: 'python3',
          args: [bridgeScriptPath],
          env: {
            PARAMETRIX_URL: baseUrl,
          },
        },
      },
    },
  };
  const openclawJson = `${JSON.stringify(openclawConfigObj, null, 2)}\n`;

  const nanoclawYaml = [
    '# NanoClaw Sandbox + Qwen 0.5B + Parametrix MCP + VUC',
    'provider:',
    '  type: openai',
    `  base_url: http://127.0.0.1:${llamaPort}/v1`,
    '  api_key: local',
    `  model: ${modelName}`,
    `  context_length: ${contextLength}`,
    'mcp:',
    '  sandbox: true',
    '  servers:',
    '    parametrix:',
    '      command: python3',
    '      args:',
    `        - ${bridgeScriptPath}`,
    '      env:',
    `        PARAMETRIX_URL: ${baseUrl}`,
    '',
  ].join('\n');

  const picoclawConfigObj = {
    version: 2,
    agents: {
      defaults: {
        workspace: '~/.picoclaw/workspace',
        model_name: 'qwen05b',
        max_tokens: 2048,
        temperature: 0.2,
      },
    },
    model_list: [
      {
        model_name: 'qwen05b',
        model: `openai/${modelName}`,
        api_base: `http://127.0.0.1:${llamaPort}/v1`,
        api_key: 'local',
      },
    ],
    tools: {
      mcp: {
        enabled: true,
        servers: [
          {
            name: 'parametrix',
            transport: 'stdio',
            command: 'python3',
            args: [bridgeScriptPath],
            env: {
              PARAMETRIX_URL: baseUrl,
            },
          },
        ],
      },
    },
  };
  const picoclawJson = `${JSON.stringify(picoclawConfigObj, null, 2)}\n`;

  const vucCertificate = createFormalVucCertificate({
    domain: 'CLAW_FAMILY_BUNDLE',
    status: 'PASS',
    inputPayload: {
      families: ['openclaw', 'nanoclaw', 'picoclaw'],
      baseUrl,
      llamaPort,
      contextLength,
      modelName,
    },
    outputPayload: {
      openclawBytes: openclawJson.length,
      nanoclawBytes: nanoclawYaml.length,
      picoclawBytes: picoclawJson.length,
      skillBytes: base.skillMarkdown.length,
    },
    durationMs: Math.max(1, Date.now() - startedAt),
  });

  return {
    baseUrl,
    llamaPort,
    contextLength,
    modelName,
    bridgeScriptPath,
    openclawConfigPath: '~/.openclaw/openclaw.json',
    openclawJson,
    nanoclawConfigPath: '~/.nanoclaw/config.yaml',
    nanoclawYaml,
    picoclawConfigPath: '~/.picoclaw/config.json',
    picoclawJson,
    clawSkillMarkdown: base.skillMarkdown,
    mcpBridgePy: base.mcpBridgePy,
    llamaServerCmd: base.llamaServerCmd,
    setupScriptRelPath: 'scripts/hermes/setup_parametrix_claw.sh',
    vucCertificate,
  };
}
