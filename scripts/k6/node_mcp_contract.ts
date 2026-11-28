import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const BASE_URL = (process.env.PARAMETRIX_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const MCP_URL = `${BASE_URL}/api/mcp`;
const MCP_TOKEN = process.env.MCP_TOKEN || '';
const EXPECT_429 = process.env.EXPECT_429 === '1';
const headers = { 'content-type': 'application/json' };
let calls = 0;
let errors = 0;

function rpc(id: number, method: string, params?: unknown) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
}

async function post(path: string, body: string, extra: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, ...extra },
    body,
  });
  const text = await response.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* malformed responses are checked by status */ }
  return { response, text, json };
}

function check(condition: unknown, message: string) {
  if (!condition) {
    errors++;
    throw new Error(message);
  }
}

async function mcp(id: number, method: string, params?: unknown, extra = {}) {
  const result = await post('/api/mcp', rpc(id, method, params), extra);
  calls++;
  return result;
}

const statelessArgs: Record<string, unknown> = {
  cad_get_agent_onboarding: {},
  cad_get_bbox: { designParams: { spanX: 210, spanY: 145, archHeight: 52 } },
  hermes_search: { query: 'engrenagem M2 Z24', includeWeb: false, maxResults: 3 },
  cad_run_structural_fea: { loadNewtons: 2500, segment: 'industrial-cnc' },
  cad_evaluate_nurbs_metrics: {},
  cad_get_scoobiii_vuc_proof: {},
  cad_optimize_surface_curvature: {},
  cad_generate_optimized_geometry: {},
};

async function runRest() {
  const [claw, hermes, onboarding, metrics] = await Promise.all([
    fetch(`${BASE_URL}/api/claw/status`),
    fetch(`${BASE_URL}/api/hermes/status`),
    fetch(`${BASE_URL}/api/agent/onboarding`),
    fetch(`${BASE_URL}/metrics`),
  ]);
  const metricsText = await metrics.text();
  check(claw.status === 200 && (await claw.json()).readyForClaw === true, 'claw status contract failed');
  check(hermes.status === 200, 'hermes status contract failed');
  check(onboarding.status === 200, 'agent onboarding contract failed');
  check(metrics.status === 200 && /mcp_requests_total/.test(metricsText), 'metrics contract failed');
}

async function runMcp() {
  const initialized = await mcp(1, 'initialize');
  check(initialized.response.status === 200 && initialized.json.result?.protocolVersion === '2024-11-05', 'initialize failed');
  for (const [id, method] of [[2, 'ping'], [3, 'notifications/initialized']] as const) {
    const result = await mcp(id, method);
    check(result.response.status === 200 && result.json.result !== undefined, `${method} failed`);
  }
  const listed = await mcp(4, 'tools/list');
  const tools = listed.json.result?.tools;
  check(listed.response.status === 200 && Array.isArray(tools) && tools.length > 0, 'tools/list failed');
  check(new Set(tools.map((tool: any) => tool.name)).size === tools.length, 'tool names are not unique');

  for (const [index, tool] of tools.entries()) {
    const result = await mcp(100 + index, 'tools/call', { name: tool.name, arguments: statelessArgs[tool.name] || {} });
    const okay = result.response.status === 200 &&
      (statelessArgs[tool.name] ? result.json.result !== undefined || result.json.error !== undefined :
        result.json.error?.code === -32001 || result.json.error?.code === -32602 || result.json.result !== undefined);
    check(okay, `tool dispatch failed: ${tool.name}`);
  }

  const invalid = await mcp(200, 'tools/call', { name: 'cad_inspect_ipt_step_briefing', arguments: {} });
  check(invalid.json.error?.code === -32602, 'invalid arguments did not return -32602');
  const unknownTool = await mcp(201, 'tools/call', { name: '__node_unknown_tool__', arguments: {} });
  check(unknownTool.json.error?.code === -32601, 'unknown tool did not return -32601');
  const unknownMethod = await mcp(202, 'method/does-not-exist');
  check(unknownMethod.json.error?.code === -32601, 'unknown method did not return -32601');

  const malformed = await post('/api/mcp', '{"jsonrpc":');
  check(malformed.response.status >= 400 && malformed.response.status < 500, 'malformed JSON was not rejected');

  const tunnel = { 'cf-connecting-ip': '203.0.113.10' };
  const noToken = await mcp(300, 'ping', undefined, tunnel);
  const wrongToken = await mcp(301, 'ping', undefined, { ...tunnel, authorization: 'Bearer definitely-wrong' });
  check(noToken.response.status === 401 && wrongToken.response.status === 401, 'tunnel auth rejection failed');
  if (MCP_TOKEN) {
    const valid = await mcp(302, 'ping', undefined, { ...tunnel, authorization: `Bearer ${MCP_TOKEN}` });
    check(valid.response.status === 200, 'valid tunnel token failed');
  }
}

async function runConcurrency() {
  const results = await Promise.all(Array.from({ length: 12 }, (_, id) => mcp(400 + id, 'tools/call', {
    name: 'hermes_search', arguments: { query: 'MCP concurrency probe', includeWeb: false, maxResults: 1 },
  })));
  const rejected = results.filter((result) => result.response.status === 429).length;
  check(results.every((result) => result.response.status < 500 || result.response.status === 503), 'unexpected concurrency 5xx');
  if (EXPECT_429) check(rejected > 0, 'expected at least one 429 from concurrency probe');
  console.log(`[PASS] concurrency probe: ${rejected} responses with HTTP 429`);
}

async function runWebSocket() {
  const wsUrl = BASE_URL.replace(/^http/i, 'ws') + '/ws';
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let sync = false;
    let pong = false;
    const timer = setTimeout(() => socket.close(), 3000);
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'mcp:bridge_ready', payload: { ready: true, protocol: '2024-11-05' } }));
      socket.send(JSON.stringify({ type: 'ping' }));
    });
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'ecosystem:sync') sync = true;
      if (message.type === 'pong') { pong = true; socket.close(); }
    });
    socket.on('close', () => {
      clearTimeout(timer);
      try { check(sync && pong, 'WebSocket sync/pong contract failed'); resolve(); } catch (error) { reject(error); }
    });
    socket.on('error', reject);
  });
}

try {
  await runRest();
  await runMcp();
  await runConcurrency();
  await runWebSocket();
  console.log(`[PASS] Node MCP contract: ${calls} HTTP calls, ${errors} assertion errors`);
} catch (error) {
  console.error('[FAIL] Node MCP contract:', error);
  process.exitCode = 1;
}
