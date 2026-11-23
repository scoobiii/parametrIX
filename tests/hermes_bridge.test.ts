import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WebSocketBrowserMcpRelay,
  buildClawFamilyBundle,
  buildHermesAgentBundle,
  executeHermesCompactSearch,
} from '../src/server/hermesBridge';
import { resolveLocalQwenPaths } from '../src/server/localQwenRunner';
import { verifyFormalVucCertificate } from '../src/server/vucFormalProof';

describe('Hermes Bridge + WebSocket MCP Relay + Search Engine + VUC (100% Coverage)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches browser MCP calls over WebSocket and handles ready/response lifecycle', async () => {
    const relay = new WebSocketBrowserMcpRelay();
    expect(relay.getTotalConnectedCount()).toBe(0);
    expect(relay.getReadyBridgeCount()).toBe(0);

    // No ready bridge yet -> rejects with actionable message
    await expect(relay.dispatchBrowserTool('cad_rhino_command', { command: 'Box 10,10,10' })).rejects.toThrow(
      'Nenhuma aba ativa'
    );

    const sentFrames: string[] = [];
    const notReadySocket = { send: vi.fn() };
    const readySocket = {
      send: (raw: string) => {
        sentFrames.push(raw);
      },
    };

    relay.registerClient('tab-idle', notReadySocket);
    relay.registerClient('tab-1', readySocket, false);
    expect(relay.getTotalConnectedCount()).toBe(2);
    expect(relay.getReadyBridgeCount()).toBe(0);

    // Missing client id is safe no-op
    relay.markBridgeReady('tab-missing', true);
    relay.markBridgeReady('tab-1', true);
    expect(relay.getReadyBridgeCount()).toBe(1);

    // Unknown requestId returns false
    expect(relay.handleRpcResponse({ requestId: 'unknown-req', ok: false })).toBe(false);

    // Successful round-trip
    const promise = relay.dispatchBrowserTool('cad_rhino_command', { command: 'Gear 24' }, 2000);
    expect(sentFrames).toHaveLength(1);
    const frame = JSON.parse(sentFrames[0]) as {
      type: string;
      payload: { requestId: string; name: string; args: Record<string, unknown> };
    };
    expect(frame.type).toBe('mcp:rpc_request');
    expect(frame.payload.name).toBe('cad_rhino_command');

    const handled = relay.handleRpcResponse({
      requestId: frame.payload.requestId,
      ok: true,
      log: { status: 'ok', responseJson: '{"ok":true}' },
    });
    expect(handled).toBe(true);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.log?.status).toBe('ok');
  });

  it('handles timeout, synchronous socket send throws (Error & string), and disconnect rejections', async () => {
    vi.useFakeTimers();
    const relay = new WebSocketBrowserMcpRelay();

    // Sync throw Error object
    relay.registerClient(
      'tab-err',
      {
        send: () => {
          throw new Error('socket write failed');
        },
      },
      true
    );
    await expect(relay.dispatchBrowserTool('cad_export_deliverable', {}, 1000)).rejects.toThrow(
      'socket write failed'
    );

    // Sync throw non-Error primitive
    relay.registerClient(
      'tab-err',
      {
        send: () => {
          throw 'raw-string-error';
        },
      },
      true
    );
    await expect(relay.dispatchBrowserTool('cad_export_deliverable', {}, 1000)).rejects.toThrow(
      'raw-string-error'
    );

    // Timeout expiration
    relay.registerClient('tab-timeout', { send: () => {} }, true);
    // Replace tab-err so only tab-timeout is ready
    relay.unregisterClient('tab-err');
    const timeoutPromise = relay.dispatchBrowserTool('cad_magic_pen_feature', {}, 500);
    const timeoutExpect = expect(timeoutPromise).rejects.toThrow('Timeout (500ms)');
    await vi.advanceTimersByTimeAsync(501);
    await timeoutExpect;

    // Two ready tabs -> disconnecting target tab rejects its pending call immediately even while another tab remains ready
    relay.registerClient('tab-timeout', { send: () => {} }, true);
    relay.registerClient('tab-2', { send: () => {} }, true);
    const pendingTwo = relay.dispatchBrowserTool('cad_reset_part_baseline', {}, 5000);
    expect(relay.getPendingCount()).toBe(1);

    // Register a new RPC on tab-2, wait: dispatch picks last ready client ('tab-2')
    // Disconnecting tab-timeout leaves tab-2's pending call intact because tab-timeout wasn't the target
    relay.unregisterClient('tab-timeout');
    expect(relay.getReadyBridgeCount()).toBe(1);
    expect(relay.getPendingCount()).toBe(1);

    // Disconnecting tab-2 (the actual target of pendingTwo) rejects immediately even if another tab is connected!
    relay.registerClient('tab-3', { send: () => {} }, true);
    const pendingExpect = expect(pendingTwo).rejects.toThrow('Aba do navegador desconectada');
    relay.unregisterClient('tab-2');
    expect(relay.getReadyBridgeCount()).toBe(1);
    expect(relay.getPendingCount()).toBe(0);
    await pendingExpect;

    // Disconnecting last tab rejects any remaining pending calls
    relay.unregisterClient('tab-3');
    expect(relay.getReadyBridgeCount()).toBe(0);
    // Disconnecting when no pending calls remain is safe
    relay.unregisterClient('non-existent');
  });

  it('executes compact RAG + optional DuckDuckGo web search with VUC Ed25519 verification', async () => {
    // 1. Empty query + disabled web + live state summary & dynamic docs
    const emptyRes = await executeHermesCompactSearch({
      query: '   ',
      dynamicDocs: [
        {
          id: 'doc-gear',
          title: 'Engrenagem M2 Z24',
          kind: 'upload',
          mimeType: 'text/plain',
          byteSize: 128,
          formatTag: 'TXT',
          chunkCount: 1,
          summary: 'Engrenagem M2 Z24 48mm em aço SAE 4340',
          chunks: [
            {
              id: 'chunk-1',
              docId: 'doc-gear',
              docTitle: 'Engrenagem M2 Z24',
              index: 0,
              text: 'Engrenagem M2 Z24 48mm em aço SAE 4340',
            },
          ],
          addedAt: '2026-11-22T00:00:00Z',
        },
      ],
      cadSummary: {
        partName: 'Engrenagem M2 Z24',
        machineType: 'cnc-5axis',
        safetyFactor: 2.4,
      },
    });
    expect(emptyRes.webStatus).toBe('disabled');
    expect(emptyRes.compactSummaryText).toContain('query="status"');
    expect(emptyRes.approxTokens).toBeLessThan(600);
    expect(verifyFormalVucCertificate(emptyRes.vucCertificate).valid).toBe(true);

    // 2. Empty query + includeWeb: true -> still skipped (web disabled)
    const emptyWeb = await executeHermesCompactSearch({
      query: '',
      includeWeb: true,
    });
    expect(emptyWeb.webStatus).toBe('disabled');

    // 3. Web search enabled with DuckDuckGo AbstractText & RelatedTopics (including blanks & URLs)
    const webOk = await executeHermesCompactSearch({
      query: 'engrenagem M2 SAE 4340 CNC',
      maxResults: 1,
      includeWeb: true,
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          Heading: 'Spur Gear DIN 867',
          AbstractText: 'Involute spur gear module 2.0mm pitch diameter 48mm.',
          AbstractURL: 'https://example.org/gear',
          RelatedTopics: [
            { Text: 'Topic 1 - Pitch circle', FirstURL: 'https://example.org/t1' },
            { Text: '   ' },
            { Text: 'Topic 2 - Tooth depth' },
            { Text: 'Topic 3 - Ignored after 3 hits', FirstURL: 'https://example.org/t3' },
          ],
        }),
      }),
    });
    expect(webOk.webStatus).toBe('ok');
    expect(webOk.hits.some((h) => h.id === 'ddg-abstract' && h.title === 'Spur Gear DIN 867')).toBe(true);
    expect(webOk.hits.some((h) => h.id === 'ddg-topic-1' && h.url === 'https://example.org/t1')).toBe(true);
    expect(verifyFormalVucCertificate(webOk.vucCertificate).valid).toBe(true);

    // 3b. Topics without AbstractText and without FirstURL
    const webTopicsOnly = await executeHermesCompactSearch({
      query: 'engrenagem DIN 867',
      maxResults: 2,
      includeWeb: true,
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          RelatedTopics: [
            { Text: 'Topic A - Involute profile' },
            { Text: 'Topic B - Material SAE 4340', FirstURL: 'https://example.org/tb' },
          ],
        }),
      }),
    });
    expect(webTopicsOnly.hits.some((h) => h.id === 'ddg-topic-1' && h.url === undefined)).toBe(true);
    expect(webTopicsOnly.hits.some((h) => h.id === 'ddg-topic-2' && h.url === 'https://example.org/tb')).toBe(true);

    // 4. Web search fallback when Heading/AbstractText/AbstractURL/RelatedTopics omitted & using global fetch
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        AbstractText: 'Fallback abstract text without heading',
      }),
    } as Response);
    const webDefaultFetcher = await executeHermesCompactSearch({
      query: 'vuc ed25519',
      includeWeb: true,
    });
    expect(globalFetchSpy).toHaveBeenCalledTimes(1);
    expect(webDefaultFetcher.webStatus).toBe('ok');
    expect(webDefaultFetcher.hits.some((h) => h.title === 'vuc ed25519' && h.url === undefined)).toBe(true);

    // 5. Web search HTTP error (!resp.ok) -> unavailable gracefully
    const webHttpErr = await executeHermesCompactSearch({
      query: 'hermes',
      includeWeb: true,
      fetcher: async () => ({
        ok: false,
        json: async () => ({}),
      }),
    });
    expect(webHttpErr.webStatus).toBe('unavailable');

    // 6. Web search network exception -> unavailable gracefully
    const webThrow = await executeHermesCompactSearch({
      query: 'hermes',
      includeWeb: true,
      fetcher: async () => {
        throw new Error('offline');
      },
    });
    expect(webThrow.webStatus).toBe('unavailable');

    // 7. Web search timeout aborts AbortController cleanly
    vi.useFakeTimers();
    let signalAborted = false;
    const abortPromise = executeHermesCompactSearch({
      query: 'abort-timeout',
      includeWeb: true,
      fetcher: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            signalAborted = true;
            reject(new Error('aborted'));
          });
        }),
    });
    await vi.advanceTimersByTimeAsync(3501);
    const abortRes = await abortPromise;
    expect(signalAborted).toBe(true);
    expect(abortRes.webStatus).toBe('unavailable');
    vi.useRealTimers();
  });

  it('builds verifiable Hermes configuration bundle (defaults & custom options)', () => {
    const defaultBundle = buildHermesAgentBundle({ baseUrl: 'http://127.0.0.1:3000///' });
    expect(defaultBundle.baseUrl).toBe('http://127.0.0.1:3000');
    expect(defaultBundle.llamaPort).toBe(11435);
    expect(defaultBundle.contextLength).toBe(32768);
    expect(defaultBundle.modelName).toBe('qwen2.5-coder:0.5b');
    expect(defaultBundle.configYaml).toContain('context_length: 32768');
    expect(defaultBundle.configYaml).toContain('PARAMETRIX_URL: http://127.0.0.1:3000');
    expect(defaultBundle.skillMarkdown).toContain('cad_get_bbox');
    expect(defaultBundle.mcpBridgePy).toContain('PARAMETRIX_URL');
    expect(verifyFormalVucCertificate(defaultBundle.vucCertificate).valid).toBe(true);

    const customBundle = buildHermesAgentBundle({
      baseUrl: 'https://parametrix.local',
      llamaPort: 11436,
      contextLength: 32000,
      modelName: 'qwen2.5:0.5b',
    });
    expect(customBundle.llamaPort).toBe(11436);
    expect(customBundle.contextLength).toBe(32000);
    expect(customBundle.modelName).toBe('qwen2.5:0.5b');
  });

  it('builds verifiable OpenClaw, NanoClaw, and PicoClaw bundles with valid JSON/YAML & VUC', () => {
    const clawDefault = buildClawFamilyBundle({ baseUrl: 'http://127.0.0.1:3000/' });
    expect(clawDefault.baseUrl).toBe('http://127.0.0.1:3000');
    expect(clawDefault.openclawConfigPath).toBe('~/.openclaw/openclaw.json');
    expect(clawDefault.nanoclawConfigPath).toBe('~/.nanoclaw/config.yaml');
    expect(clawDefault.picoclawConfigPath).toBe('~/.picoclaw/config.json');

    const openclawParsed = JSON.parse(clawDefault.openclawJson) as {
      models: { providers: { qwen05b: { baseUrl: string; models: { contextWindow: number }[] } } };
      agents: { defaults: { model: { primary: string } } };
      mcp: { servers: { parametrix: { command: string; env: { PARAMETRIX_URL: string } } } };
    };
    expect(openclawParsed.models.providers.qwen05b.baseUrl).toBe('http://127.0.0.1:11435/v1');
    expect(openclawParsed.models.providers.qwen05b.models[0].contextWindow).toBe(32768);
    expect(openclawParsed.agents.defaults.model.primary).toBe('qwen05b/qwen2.5-coder:0.5b');
    expect(openclawParsed.mcp.servers.parametrix.env.PARAMETRIX_URL).toBe('http://127.0.0.1:3000');

    const picoclawParsed = JSON.parse(clawDefault.picoclawJson) as {
      version: number;
      tools: { mcp: { enabled: boolean; servers: { name: string; transport: string }[] } };
    };
    expect(picoclawParsed.version).toBe(2);
    expect(picoclawParsed.tools.mcp.enabled).toBe(true);
    expect(picoclawParsed.tools.mcp.servers[0].name).toBe('parametrix');
    expect(picoclawParsed.tools.mcp.servers[0].transport).toBe('stdio');

    expect(clawDefault.nanoclawYaml).toContain('sandbox: true');
    expect(clawDefault.nanoclawYaml).toContain('context_length: 32768');
    expect(verifyFormalVucCertificate(clawDefault.vucCertificate).valid).toBe(true);

    const clawCustom = buildClawFamilyBundle({
      baseUrl: 'https://claw.local',
      llamaPort: 11436,
      contextLength: 32000,
      modelName: 'qwen2.5:0.5b',
    });
    expect(clawCustom.llamaPort).toBe(11436);
    expect(clawCustom.contextLength).toBe(32000);
    expect(clawCustom.modelName).toBe('qwen2.5:0.5b');
    expect(verifyFormalVucCertificate(clawCustom.vucCertificate).valid).toBe(true);
  });

  it('detects coder GGUF variant in resolveLocalQwenPaths when present on disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parametrix-qwen-coder-'));
    try {
      const coderRel = 'models/qwen/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf';
      const coderFull = path.join(tmpDir, coderRel);
      fs.mkdirSync(path.dirname(coderFull), { recursive: true });
      fs.writeFileSync(coderFull, 'GGUF');
      fs.truncateSync(coderFull, 100_000_001);
      const resolved = resolveLocalQwenPaths(tmpDir);
      expect(resolved.modelPath).toBe(coderFull);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
