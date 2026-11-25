import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WebSocketBrowserMcpRelay,
  buildClawFamilyBundle,
  buildHermesAgentBundle,
  executeHermesCompactSearch,
  inspectPublicCadUrl,
  isDisallowedExternalHost,
} from '../src/server/hermesBridge';
import { resolveLocalQwenPaths } from '../src/server/localQwenRunner';
import { verifyFormalVucCertificate } from '../src/server/vucFormalProof';

describe('Hermes Bridge + WebSocket MCP Relay + Search Engine + Public CAD URL + VUC (100% Coverage)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches browser MCP calls over WebSocket and handles ready/response lifecycle', async () => {
    const relay = new WebSocketBrowserMcpRelay();
    expect(relay.getTotalConnectedCount()).toBe(0);
    expect(relay.getReadyBridgeCount()).toBe(0);

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

    relay.markBridgeReady('tab-missing', true);
    relay.markBridgeReady('tab-1', true);
    expect(relay.getReadyBridgeCount()).toBe(1);

    expect(relay.handleRpcResponse({ requestId: 'unknown-req', ok: false })).toBe(false);

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

    relay.registerClient('tab-timeout', { send: () => {} }, true);
    relay.unregisterClient('tab-err');
    const timeoutPromise = relay.dispatchBrowserTool('cad_magic_pen_feature', {}, 500);
    const timeoutExpect = expect(timeoutPromise).rejects.toThrow('Timeout (500ms)');
    await vi.advanceTimersByTimeAsync(501);
    await timeoutExpect;

    relay.registerClient('tab-timeout', { send: () => {} }, true);
    relay.registerClient('tab-2', { send: () => {} }, true);
    const pendingTwo = relay.dispatchBrowserTool('cad_reset_part_baseline', {}, 5000);
    expect(relay.getPendingCount()).toBe(1);

    relay.unregisterClient('tab-timeout');
    expect(relay.getReadyBridgeCount()).toBe(1);
    expect(relay.getPendingCount()).toBe(1);

    relay.registerClient('tab-3', { send: () => {} }, true);
    const pendingExpect = expect(pendingTwo).rejects.toThrow('Aba do navegador desconectada');
    relay.unregisterClient('tab-2');
    expect(relay.getReadyBridgeCount()).toBe(1);
    expect(relay.getPendingCount()).toBe(0);
    await pendingExpect;

    relay.unregisterClient('tab-3');
    expect(relay.getReadyBridgeCount()).toBe(0);
    relay.unregisterClient('non-existent');
  });

  it('blocks SSRF internal hosts and inspects public CAD URLs accurately', async () => {
    expect(isDisallowedExternalHost('localhost')).toBe(true);
    expect(isDisallowedExternalHost('0.0.0.0')).toBe(true);
    expect(isDisallowedExternalHost('::1')).toBe(true);
    expect(isDisallowedExternalHost('printer.local')).toBe(true);
    expect(isDisallowedExternalHost('meta.internal')).toBe(true);
    expect(isDisallowedExternalHost('10.0.0.5')).toBe(true);
    expect(isDisallowedExternalHost('127.0.0.1')).toBe(true);
    expect(isDisallowedExternalHost('169.254.169.254')).toBe(true);
    expect(isDisallowedExternalHost('172.16.0.1')).toBe(true);
    expect(isDisallowedExternalHost('192.168.1.50')).toBe(true);
    expect(isDisallowedExternalHost('172.32.0.1')).toBe(false);
    expect(isDisallowedExternalHost('cadrepo.example.org')).toBe(false);

    const invalid = await inspectPublicCadUrl({ url: 'not a url' });
    expect(invalid.status).toBe('invalid-url');
    expect(verifyFormalVucCertificate(invalid.vucCertificate).valid).toBe(true);

    const ftpBlocked = await inspectPublicCadUrl({ url: 'ftp://example.org/gear.stl' });
    expect(ftpBlocked.status).toBe('invalid-url');

    const localBlocked = await inspectPublicCadUrl({ url: 'http://127.0.0.1:3000/secret.stl' });
    expect(localBlocked.status).toBe('invalid-url');

    // HTTP 403 on public repository (.step suffix in slug) -> blocked-or-auth-required
    const http403 = await inspectPublicCadUrl({
      url: 'https://cadrepo.example.org/library/spur-gear.step',
      fetcher: async () => ({
        ok: false,
        status: 403,
        json: async () => ({}),
        text: async () => 'Forbidden',
      }),
    });
    expect(http403.status).toBe('blocked-or-auth-required');
    expect(http403.detectedFormats).toEqual(['STEP']);

    // HTTP 401 & generic 500 without resp.status or resp.text
    const http401 = await inspectPublicCadUrl({
      url: 'https://example.org/model-one',
      fetcher: async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    });
    expect(http401.status).toBe('blocked-or-auth-required');
    expect(http401.httpStatus).toBe(401);

    const http500 = await inspectPublicCadUrl({
      url: 'https://example.org/broken',
      fetcher: async () => ({
        ok: false,
        json: async () => ({}),
      }),
    });
    expect(http500.status).toBe('blocked-or-auth-required');
    expect(http500.httpStatus).toBe(500);

    // Cloudflare / auth interstitial
    const cfBlock = await inspectPublicCadUrl({
      url: 'https://cadrepo.example.org/library/robot-arm-1',
      fetcher: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        json: async () => ({}),
        text: async () => '<html><body>Just a moment... Sign in required</body></html>',
      }),
    });
    expect(cfBlock.status).toBe('blocked-or-auth-required');

    // Direct CAD file (.stl)
    const directCad = await inspectPublicCadUrl({
      url: 'https://cdn.example.org/models/flange.stl',
      fetcher: async () => ({
        ok: true,
        headers: { get: () => 'application/sla' },
        json: async () => ({}),
        text: async () => 'solid flange\nendsolid flange',
      }),
    });
    expect(directCad.status).toBe('direct-cad');
    expect(directCad.httpStatus).toBe(200);
    expect(directCad.detectedFormats).toEqual(['STL']);

    // Public repository HTML with OpenGraph metadata + format tags + no direct download link
    const repoHtml = await inspectPublicCadUrl({
      url: 'https://cadrepo.example.org/library/planetary-gearbox-1',
      fetcher: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html; charset=utf-8' },
        json: async () => ({}),
        text: async () =>
          '<html><head>' +
          '<meta property="og:title" content="Planetary Gearbox &amp; Carrier"/>' +
          '<meta property="og:description" content="STEP &amp; STL assembly."/>' +
          '<meta property="og:image" content="https://cdn.example.org/gear.png"/>' +
          '</head><body>Download STEP or STL</body></html>',
      }),
    });
    expect(repoHtml.status).toBe('ok');
    expect(repoHtml.isPublicRepository).toBe(true);
    expect(repoHtml.title).toBe('Planetary Gearbox & Carrier');
    expect(repoHtml.detectedFormats).toEqual(['STEP', 'STL']);
    expect(repoHtml.previewImageUrl).toBe('https://cdn.example.org/gear.png');

    // Public HTML with <title>, meta description fallback, and direct href link
    const publicHtmlWithHref = await inspectPublicCadUrl({
      url: 'https://cadrepo.example.org/part-99/',
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () =>
          '<html><head><title>Bracket &#39;A&#39;</title><meta name="description" content="Alloy bracket"/></head>' +
          '<body><a href="https://cadrepo.example.org/files/bracket.stl">STL</a></body></html>',
      }),
    });
    expect(publicHtmlWithHref.status).toBe('ok');
    expect(publicHtmlWithHref.directCadUrl).toBe('https://cadrepo.example.org/files/bracket.stl');

    // Minimal public URL without og tags or meta description, using fallback global fetch
    const globalSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body>Simple page</body></html>',
      json: async () => ({}),
    } as Response);
    const minimalHtml = await inspectPublicCadUrl({
      url: 'https://cadrepo.example.org/',
    });
    expect(globalSpy).toHaveBeenCalledTimes(1);
    expect(minimalHtml.status).toBe('ok');
    expect(minimalHtml.description).toContain('Página CAD');

    // Network errors (Error instance & primitive string, with & without directExtMatch)
    const netErr = await inspectPublicCadUrl({
      url: 'https://example.org/part.step',
      fetcher: async () => {
        throw new Error('ECONNRESET');
      },
    });
    expect(netErr.status).toBe('network-error');
    expect(netErr.detectedFormats).toEqual(['STEP']);

    const netStrErr = await inspectPublicCadUrl({
      url: 'https://example.org/page',
      fetcher: async () => {
        throw 'timeout-raw';
      },
    });
    expect(netStrErr.status).toBe('network-error');
    expect(netStrErr.detectedFormats).toEqual([]);

    // Timeout aborts cleanly
    vi.useFakeTimers();
    let aborted = false;
    const timeoutInspect = inspectPublicCadUrl({
      url: 'https://example.org/slow',
      fetcher: (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            rej(new Error('timeout-abort'));
          });
        }),
    });
    await vi.advanceTimersByTimeAsync(5001);
    const timeoutRes = await timeoutInspect;
    expect(aborted).toBe(true);
    expect(timeoutRes.status).toBe('network-error');
    vi.useRealTimers();
  });

  it('executes compact RAG + public CAD URL / DuckDuckGo search with VUC Ed25519 verification', async () => {
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

    const emptyWeb = await executeHermesCompactSearch({
      query: '',
      includeWeb: true,
    });
    expect(emptyWeb.webStatus).toBe('disabled');

    // URL inspection inside executeHermesCompactSearch (public URL ok & network-error -> unavailable)
    const cadUrlHit = await executeHermesCompactSearch({
      query: 'importe https://cadrepo.example.org/library/cycloidal-drive-1',
      includeWeb: true,
      fetcher: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        json: async () => ({}),
        text: async () => '<html><title>Cycloidal Drive</title></html>',
      }),
    });
    expect(cadUrlHit.webStatus).toBe('ok');
    expect(cadUrlHit.cadUrlInspection?.isPublicRepository).toBe(true);
    expect(cadUrlHit.hits[0].source).toBe('public-cad-url');

    const cadUrlFail = await executeHermesCompactSearch({
      query: 'abra https://cadrepo.example.org/housing.stl',
      includeWeb: true,
      fetcher: async () => {
        throw new Error('dns failed');
      },
    });
    expect(cadUrlFail.webStatus).toBe('unavailable');
    expect(cadUrlFail.cadUrlInspection?.status).toBe('network-error');

    // DuckDuckGo keyword search
    let capturedUrl = '';
    const ddgKeywordRes = await executeHermesCompactSearch({
      query: 'planetary gearbox step stl',
      maxResults: 1,
      includeWeb: true,
      fetcher: async (u) => {
        capturedUrl = u;
        return {
          ok: true,
          json: async () => ({
            Heading: 'Planetary Gearbox',
            AbstractText: 'Compact planetary gearset.',
            AbstractURL: 'https://cadrepo.example.org/library/planetary',
            RelatedTopics: [
              { Text: 'Topic 1 - Pitch circle', FirstURL: 'https://example.org/t1' },
              { Text: '   ' },
              { Text: 'Topic 2 - Tooth depth' },
              { Text: 'Topic 3 - Ignored after 3 hits', FirstURL: 'https://example.org/t3' },
            ],
          }),
        };
      },
    });
    expect(capturedUrl).toContain('planetary%20gearbox%20step%20stl');
    expect(ddgKeywordRes.webStatus).toBe('ok');
    expect(verifyFormalVucCertificate(ddgKeywordRes.vucCertificate).valid).toBe(true);

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

    const webHttpErr = await executeHermesCompactSearch({
      query: 'hermes',
      includeWeb: true,
      fetcher: async () => ({
        ok: false,
        json: async () => ({}),
      }),
    });
    expect(webHttpErr.webStatus).toBe('unavailable');

    const webThrow = await executeHermesCompactSearch({
      query: 'hermes',
      includeWeb: true,
      fetcher: async () => {
        throw new Error('offline');
      },
    });
    expect(webThrow.webStatus).toBe('unavailable');

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

  it('detects coder and instruct GGUF variants in resolveLocalQwenPaths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parametrix-qwen-dual-'));
    try {
      const coderRel = 'models/qwen/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf';
      const instructRel = 'models/qwen/qwen2.5-0.5b-instruct-q4_k_m.gguf';
      const coderFull = path.join(tmpDir, coderRel);
      const instructFull = path.join(tmpDir, instructRel);
      fs.mkdirSync(path.dirname(coderFull), { recursive: true });
      fs.writeFileSync(coderFull, 'GGUF');
      fs.truncateSync(coderFull, 100_000_001);

      expect(resolveLocalQwenPaths(tmpDir, 'qwen2.5-coder-0.5b-instruct-q4').modelPath).toBe(
        coderFull
      );
      // Falls back to coder when instruct is preferred but only coder exists
      expect(resolveLocalQwenPaths(tmpDir, 'qwen2.5-0.5b-instruct-q4').modelPath).toBe(coderFull);

      fs.writeFileSync(instructFull, 'GGUF');
      fs.truncateSync(instructFull, 100_000_001);
      expect(resolveLocalQwenPaths(tmpDir, 'qwen2.5-0.5b-instruct-q4').modelPath).toBe(
        instructFull
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
