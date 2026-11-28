import http from 'k6/http';
import ws from 'k6/ws';
import { check, fail, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.PARAMETRIX_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const WS_URL = BASE_URL.replace(/^http/i, 'ws') + '/ws';
const MCP_URL = `${BASE_URL}/api/mcp`;
const MCP_TOKEN = __ENV.MCP_TOKEN || '';
const EXPECT_429 = __ENV.EXPECT_429 === '1';
const jsonHeaders = { headers: { 'Content-Type': 'application/json' } };

const mcpLatency = new Trend('mcp_contract_latency', true);
const mcp429 = new Counter('mcp_contract_429');
const toolCalls = new Counter('mcp_tool_calls');

const thresholds = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
  http_req_duration: ['p(95)<1000'],
  mcp_contract_latency: ['p(95)<1000'],
};
if (EXPECT_429) thresholds.mcp_contract_429 = ['count>0'];

export const options = {
  stages: [
    { duration: __ENV.K6_SMOKE === '1' ? '1s' : '10s', target: __ENV.K6_SMOKE === '1' ? 1 : 5 },
    { duration: __ENV.K6_SMOKE === '1' ? '1s' : '20s', target: __ENV.K6_SMOKE === '1' ? 1 : 10 },
    { duration: __ENV.K6_SMOKE === '1' ? '1s' : '5s', target: 0 },
  ],
  thresholds,
};

function rpc(id, method, params) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
}

function mcp(id, method, params, extraHeaders = {}) {
  const started = Date.now();
  const response = http.post(MCP_URL, rpc(id, method, params), {
    headers: { ...jsonHeaders.headers, ...extraHeaders },
    tags: { endpoint: 'mcp', method },
    responseCallback: http.expectedStatuses(200),
  });
  mcpLatency.add(Date.now() - started);
  if (response.status === 429) mcp429.add(1);
  return response;
}

function json(response) {
  try { return response.json(); } catch (_) { return {}; }
}

function assertRpc(response, label, predicate = () => true) {
  const body = json(response);
  check(response, {
    [`${label}: HTTP 200`]: (r) => r.status === 200,
    [`${label}: JSON-RPC 2.0`]: () => body.jsonrpc === '2.0',
    [`${label}: expected result/error`]: () => body.result !== undefined || body.error !== undefined,
    [`${label}: semantic assertion`]: () => predicate(body),
  });
  return body;
}

function runMcpContract() {
  assertRpc(mcp(1, 'initialize'), 'initialize', (b) =>
    b.result?.protocolVersion === '2024-11-05' && Boolean(b.result?.capabilities?.tools));
  assertRpc(mcp(2, 'ping'), 'ping', (b) => b.result && Object.keys(b.result).length === 0);
  assertRpc(mcp(3, 'notifications/initialized'), 'notifications/initialized', (b) => b.result !== undefined);

  const list = assertRpc(mcp(4, 'tools/list'), 'tools/list', (b) => Array.isArray(b.result?.tools));
  const tools = list.result?.tools || [];
  check(tools, {
    'tools/list is non-empty': (value) => value.length > 0,
    'tools/list has unique names': (value) => new Set(value.map((tool) => tool.name)).size === value.length,
    'tools/list has schemas': (value) => value.every((tool) => tool.inputSchema?.type === 'object'),
  });

  const statelessArgs = {
    cad_get_agent_onboarding: {},
    cad_get_bbox: { designParams: { spanX: 210, spanY: 145, archHeight: 52 } },
    hermes_search: { query: 'engrenagem M2 Z24', includeWeb: false, maxResults: 3 },
    cad_run_structural_fea: { loadNewtons: 2500, segment: 'industrial-cnc' },
    cad_evaluate_nurbs_metrics: {},
    cad_get_scoobiii_vuc_proof: {},
    cad_optimize_surface_curvature: {},
    cad_generate_optimized_geometry: {},
  };

  // Every advertised tool is dispatched. Browser-only tools must return a typed MCP error
  // when no browser relay is connected; stateless tools must not return HTTP 5xx.
  tools.forEach((tool, index) => {
    const response = mcp(100 + index, 'tools/call', {
      name: tool.name,
      arguments: statelessArgs[tool.name] || {},
    });
    const body = assertRpc(response, `tools/call ${tool.name}`, (b) => {
      if (statelessArgs[tool.name]) return b.result !== undefined || b.error !== undefined;
      return b.error?.code === -32001 || b.error?.code === -32602 || b.result !== undefined;
    });
    toolCalls.add(1, { tool: tool.name });
    check(body, {
      [`${tool.name}: no protocol 5xx masquerade`]: (value) => value.error?.code !== 500,
    });
  });

  const invalidParams = assertRpc(
    mcp(200, 'tools/call', { name: 'cad_inspect_ipt_step_briefing', arguments: {} }),
    'invalid tool arguments',
    (b) => b.error?.code === -32602
  );
  check(invalidParams, { 'invalid arguments use -32602': (b) => b.error?.code === -32602 });

  const unknownTool = assertRpc(
    mcp(201, 'tools/call', { name: '__k6_unknown_tool__', arguments: {} }),
    'unknown tool',
    (b) => b.error?.code === -32601
  );
  check(unknownTool, { 'unknown tool uses -32601': (b) => b.error?.code === -32601 });

  const unknownMethod = assertRpc(mcp(202, 'method/does-not-exist'), 'unknown method', (b) => b.error?.code === -32601);
  check(unknownMethod, { 'unknown method uses -32601': (b) => b.error?.code === -32601 });

  const malformed = http.post(MCP_URL, '{"jsonrpc":', {
    ...jsonHeaders,
    responseCallback: http.expectedStatuses(400),
  });
  check(malformed, {
    'malformed JSON is rejected with HTTP 400': (r) => r.status === 400,
  });

  // Tunnel authentication: no token and wrong token must be rejected. A configured token must work.
  const tunnelHeaders = { 'cf-connecting-ip': '203.0.113.10' };
  const noToken = http.post(MCP_URL, rpc(300, 'ping'), {
    headers: { ...jsonHeaders.headers, ...tunnelHeaders },
    responseCallback: http.expectedStatuses(401),
  });
  const wrongToken = http.post(MCP_URL, rpc(301, 'ping'), {
    headers: { ...jsonHeaders.headers, ...tunnelHeaders, Authorization: 'Bearer definitely-wrong' },
    responseCallback: http.expectedStatuses(401),
  });
  check({ noToken, wrongToken }, {
    'tunnel without token is 401': (v) => v.noToken.status === 401,
    'tunnel with invalid token is 401': (v) => v.wrongToken.status === 401,
  });
  if (MCP_TOKEN) {
    const validToken = http.post(MCP_URL, rpc(302, 'ping'), {
      headers: { ...jsonHeaders.headers, ...tunnelHeaders, Authorization: `Bearer ${MCP_TOKEN}` },
    });
    check(validToken, { 'tunnel with valid token is accepted': (r) => r.status === 200 });
  }
}

function runRestContract() {
  const claw = http.get(`${BASE_URL}/api/claw/status`);
  const hermes = http.get(`${BASE_URL}/api/hermes/status`);
  const onboarding = http.get(`${BASE_URL}/api/agent/onboarding`);
  const metrics = http.get(`${BASE_URL}/metrics`);
  check({ claw, hermes, onboarding, metrics }, {
    'claw status 200 and ready': (v) => v.claw.status === 200 && v.claw.json('readyForClaw') === true,
    'hermes status 200': (v) => v.hermes.status === 200,
    'agent onboarding 200': (v) => v.onboarding.status === 200,
    'prometheus metrics 200': (v) => v.metrics.status === 200,
    'metrics expose MCP counters': (v) => /mcp_requests_total/.test(v.metrics.body),
    'metrics expose inflight gauge': (v) => /mcp_inflight/.test(v.metrics.body),
  });
}

function runConcurrencyProbe() {
  const requests = Array.from({ length: 12 }, (_, i) => [
    'POST', MCP_URL, rpc(400 + i, 'tools/call', {
      name: 'hermes_search', arguments: { query: 'MCP concurrency probe', includeWeb: false, maxResults: 1 },
    }), {
      ...jsonHeaders,
      responseCallback: http.expectedStatuses(200, 429, 503),
    },
  ]);
  const responses = http.batch(requests);
  const rejected = responses.filter((response) => response.status === 429).length;
  if (rejected > 0) mcp429.add(rejected);
  check({ responses, rejected }, {
    'concurrency probe has no unexpected 5xx': (v) => v.responses.every((r) => r.status < 500 || r.status === 503),
    ...(EXPECT_429 ? { 'concurrency above MCP_MAX_INFLIGHT returns 429': (v) => v.rejected > 0 } : {}),
  });
}

function runWebSocketContract() {
  let sawSync = false;
  let sawPong = false;
  const wsRes = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'mcp:bridge_ready', payload: { ready: true, protocol: '2024-11-05' } }));
      socket.send(JSON.stringify({ type: 'ping' }));
    });
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'ecosystem:sync') sawSync = true;
      if (message.type === 'pong') {
        sawPong = true;
        socket.close();
      }
      if (message.type === 'mcp:rpc_request' && message.payload?.requestId) {
        socket.send(JSON.stringify({ type: 'mcp:rpc_response', payload: {
          requestId: message.payload.requestId, ok: true,
          log: { status: 'ok', responseJson: '{"ok":true}' },
        } }));
      }
    });
    socket.setTimeout(() => socket.close(), 2500);
    socket.on('close', () => check({ sawSync, sawPong }, {
      'ws received ecosystem:sync': (v) => v.sawSync,
      'ws received pong keepalive': (v) => v.sawPong,
    }));
  });
  check(wsRes, { 'ws upgrade 101': (r) => r && r.status === 101 });
}

export default function () {
  runRestContract();
  runMcpContract();
  runConcurrencyProbe();
  runWebSocketContract();
  sleep(0.25);
}
