import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const PORT = 3111, URL = `http://127.0.0.1:${PORT}`, TOKEN = 'token-de-teste';
let proc: ChildProcess;
const T = { 'cf-connecting-ip': '9.9.9.9' }; // simula chegada pelo tunel
const rpc = (body: any, headers: any = {}) => fetch(`${URL}/api/mcp`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

beforeAll(async () => {
  proc = spawn(process.execPath, [resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), MCP_TOKEN: TOKEN, MCP_MAX_INFLIGHT: '2' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw new Error('servidor nao subiu');
}, 40000);
afterAll(() => { proc?.kill('SIGTERM'); });

describe('integracao MCP', () => {
  it('tools/list local', async () => {
    const j: any = await (await rpc(list)).json();
    expect(j.result.tools.length).toBeGreaterThan(0);
  });
  it('nurbs_metrics com params padrao', async () => {
    const j: any = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'cad_evaluate_nurbs_metrics', arguments: {} } })).json();
    expect(j.result).toBeDefined();
  });
  it('briefing sem base64Data = erro -32602', async () => {
    const j: any = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'cad_inspect_ipt_step_briefing', arguments: {} } })).json();
    expect(j.error?.code).toBe(-32602);
  });
  it('JSON malformado nao derruba (4xx)', async () => {
    const r = await fetch(`${URL}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{x' });
    expect(r.status).toBeLessThan(500);
    expect((await rpc(list)).status).toBe(200);
  });
  it('/metrics local expone mcp_requests_total', async () => {
    expect(await (await fetch(`${URL}/metrics`)).text()).toContain('mcp_requests_total');
  });
});

describe('seguranca (via tunel simulado)', () => {
  it.each([['/'], ['/metrics'], ['/api/mcp/ramdisk-start'], ['/api/mcp/colab-gcloud-bridge'], ['/api/rag-mcp-agent']])(
    '%s = 404 pelo tunel', async (p) => {
      for (const m of ['GET', 'POST']) expect((await fetch(URL + p, { method: m, headers: T })).status).toBe(404);
    });
  it('sem token 401; token errado 401; token certo 200', async () => {
    expect((await rpc(list, T)).status).toBe(401);
    expect((await rpc(list, { ...T, Authorization: 'Bearer x' })).status).toBe(401);
    expect((await rpc(list, { ...T, Authorization: `Bearer ${TOKEN}` })).status).toBe(200);
  });
  it('payload gigante nao derruba o servidor', async () => {
    const big = 'A'.repeat(60 * 1024 * 1024);
    await fetch(`${URL}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call',
        params: { name: 'cad_inspect_ipt_step_briefing', arguments: { base64Data: big } } }) }).catch(() => {});
    expect((await rpc(list)).status).toBe(200);
  }, 30000);
});

describe('stress / performance', () => {
  it('limite de concorrencia gera 429 sem erro 5xx inesperado', async () => {
    const heavy = { jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'cad_evaluate_nurbs_metrics', arguments: {} } };
    const rs = await Promise.all(Array.from({ length: 80 }, () => rpc(heavy)));
    const codes = rs.map(r => r.status);
    expect(codes.every(c => [200, 429, 503].includes(c))).toBe(true);
    expect(codes).toContain(200);
  }, 30000);
  it('tools/list: p95 < 50 ms em 200 chamadas sequenciais', async () => {
    const t: number[] = [];
    for (let i = 0; i < 200; i++) { const s = performance.now(); await rpc(list); t.push(performance.now() - s); }
    t.sort((a, b) => a - b); expect(t[Math.floor(t.length * 0.95)]).toBeLessThan(50);
  }, 30000);
});
