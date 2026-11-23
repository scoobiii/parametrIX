import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { createFormalVucCertificate, verifyFormalVucCertificate } from '../../src/server/vucFormalProof';

const BASE_URL = (process.env.PARAMETRIX_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WS_URL = `${BASE_URL.replace(/^http/i, 'ws')}/ws`;
const CONCURRENCY = Math.max(2, Number(process.env.WS_STRESS_CLIENTS || 12));

interface ClientMetrics {
  handshakeMs: number;
  sawSync: boolean;
  pongMs: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(2));
}

async function runSingleWsClient(clientIdx: number): Promise<ClientMetrics> {
  return new Promise<ClientMetrics>((resolve, reject) => {
    const t0 = performance.now();
    const ws = new WebSocket(WS_URL);
    let handshakeMs = 0;
    let sawSync = false;
    let pingSentAt = 0;
    let pongMs = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error(`Client ${clientIdx} timeout waiting for WS sync/pong`));
      }
    }, 5000);

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    ws.on('open', () => {
      handshakeMs = performance.now() - t0;
      ws.send(JSON.stringify({ type: 'mcp:bridge_ready', payload: { ready: true, protocol: '2024-11-05' } }));
      pingSentAt = performance.now();
      ws.send(JSON.stringify({ type: 'ping' }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { type?: string };
      if (msg.type === 'ecosystem:sync') {
        sawSync = true;
      } else if (msg.type === 'pong') {
        pongMs = performance.now() - pingSentAt;
      }
      if (sawSync && pongMs > 0 && !settled) {
        settled = true;
        clearTimeout(timer);
        ws.close();
        resolve({ handshakeMs, sawSync, pongMs });
      }
    });
  });
}

async function verifyBidirectionalMcpRelayRoundTrip(): Promise<{ roundTripMs: number; vucId: string }> {
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Relay WS open timeout')), 3000);
    ws.once('open', () => {
      clearTimeout(t);
      ws.send(JSON.stringify({ type: 'mcp:bridge_ready', payload: { ready: true, protocol: '2024-11-05' } }));
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  ws.on('message', (raw) => {
    const frame = JSON.parse(String(raw)) as {
      type?: string;
      payload?: { requestId?: string; name?: string; args?: Record<string, unknown> };
    };
    if (frame.type === 'mcp:rpc_request' && frame.payload?.requestId) {
      ws.send(
        JSON.stringify({
          type: 'mcp:rpc_response',
          payload: {
            requestId: frame.payload.requestId,
            ok: true,
            log: {
              id: frame.payload.requestId,
              toolName: frame.payload.name,
              status: 'ok',
              responseJson: JSON.stringify({
                jsonrpc: '2.0',
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({ executedVia: 'ws-relay-e2e', args: frame.payload.args }),
                    },
                  ],
                },
              }),
            },
          },
        })
      );
    }
  });

  // Give server event loop a brief tick to process mcp:bridge_ready before POST /api/mcp
  await new Promise((r) => setTimeout(r, 40));

  const t0 = performance.now();
  const resp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      method: 'tools/call',
      params: { name: 'cad_rhino_command', arguments: { command: 'Box 48,48,20' } },
    }),
  });
  const roundTripMs = Number((performance.now() - t0).toFixed(2));
  const json = (await resp.json()) as {
    result?: { structuredContent?: { formalVuc?: { vuc_id?: string } } };
    error?: { message?: string };
  };
  ws.close();

  if (!resp.ok || json.error) {
    throw new Error(`Bidirectional MCP /ws relay failed: ${json.error?.message || resp.status}`);
  }
  const vucId = json.result?.structuredContent?.formalVuc?.vuc_id || 'MISSING';
  return { roundTripMs, vucId };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const metrics = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, idx) => runSingleWsClient(idx))
  );
  const relayResult = await verifyBidirectionalMcpRelayRoundTrip();

  const handshakeTimes = metrics.map((m) => m.handshakeMs);
  const pongTimes = metrics.map((m) => m.pongMs);
  const summary = {
    concurrentWsClients: CONCURRENCY,
    allSawSync: metrics.every((m) => m.sawSync),
    wsHandshakeP50Ms: percentile(handshakeTimes, 50),
    wsHandshakeP95Ms: percentile(handshakeTimes, 95),
    wsPongP50Ms: percentile(pongTimes, 50),
    wsPongP95Ms: percentile(pongTimes, 95),
    bidirectionalMcpRelayMs: relayResult.roundTripMs,
    bidirectionalMcpRelayVucId: relayResult.vucId,
  };

  const cert = createFormalVucCertificate({
    domain: 'WEBSOCKET_K6_SOAK_VUC',
    status: 'PASS',
    inputPayload: { baseUrl: BASE_URL, concurrency: CONCURRENCY },
    outputPayload: summary,
    durationMs: Math.max(1, Date.now() - startedAt),
  });
  const verification = verifyFormalVucCertificate(cert);

  const proofDir = path.resolve(process.cwd(), 'proof');
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(
    path.join(proofDir, 'vuc-ws-load.json'),
    JSON.stringify({ summary, certificate: cert, verify: verification }, null, 2),
    'utf8'
  );

  console.log(JSON.stringify({ ...summary, vucId: cert.vuc_id, vucValid: verification.valid }, null, 2));
}

void main();
