import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { tunnelGuard } from '../../src/tunnelGuard';
import { mcpLimiter, metricsHandler } from '../../src/mcpLimits';

const mkReq = (o: any = {}) => ({
  method: 'POST', path: '/api/mcp',
  get: (h: string) => (o.headers || {})[h.toLowerCase()] || '', ...o,
}) as any;
const mkRes = () => {
  const r: any = new EventEmitter();
  r.statusCode = 200; r.headersSent = false;
  r.sendStatus = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.set = vi.fn(); r.setTimeout = vi.fn(); r.end = vi.fn();
  return r;
};

describe('tunnelGuard', () => {
  it('local passa', () => { const n = vi.fn(); tunnelGuard(mkReq(), mkRes(), n); expect(n).toHaveBeenCalled(); });
  it('tunel: rota nao-MCP = 404', () => {
    const r = mkRes(); tunnelGuard(mkReq({ path: '/', headers: { 'cf-connecting-ip': '1.1.1.1' } }), r, vi.fn());
    expect(r.sendStatus).toHaveBeenCalledWith(404);
  });
  it('tunel: GET no mcp = 404', () => {
    const r = mkRes(); tunnelGuard(mkReq({ method: 'GET', headers: { host: 'x.trycloudflare.com' } }), r, vi.fn());
    expect(r.sendStatus).toHaveBeenCalledWith(404);
  });
  it('tunel: sem token / token errado / sem env = 401', () => {
    process.env.MCP_TOKEN = 'abc';
    for (const auth of ['', 'Bearer errado', 'Bearer abcd']) {
      const r = mkRes(); tunnelGuard(mkReq({ headers: { 'cf-connecting-ip': '1.1.1.1', authorization: auth } }), r, vi.fn());
      expect(r.sendStatus).toHaveBeenCalledWith(401);
    }
    delete process.env.MCP_TOKEN;
    const r = mkRes(); tunnelGuard(mkReq({ headers: { 'cf-connecting-ip': '1.1.1.1', authorization: 'Bearer ' } }), r, vi.fn());
    expect(r.sendStatus).toHaveBeenCalledWith(401);
  });
  it('tunel: token certo passa', () => {
    process.env.MCP_TOKEN = 'abc'; const n = vi.fn();
    tunnelGuard(mkReq({ headers: { 'cf-connecting-ip': '1.1.1.1', authorization: 'Bearer abc' } }), mkRes(), n);
    expect(n).toHaveBeenCalled();
  });
});

describe('mcpLimiter', () => {
  const opened: any[] = [];
  const open = () => {
    const r = mkRes(); const n = vi.fn();
    mcpLimiter(mkReq(), r, n); opened.push(r);
    return { r, n };
  };
  afterEach(() => { while (opened.length) opened.pop().emit('close'); });

  it('429 acima do maximo e libera ao fechar', () => {
    for (let i = 0; i < 4; i++) open();
    const full = open();
    expect(full.r.sendStatus).toHaveBeenCalledWith(429);
    expect(full.n).not.toHaveBeenCalled();
    opened.shift().emit('close');
    expect(open().n).toHaveBeenCalled();
  });
  it('timeout responde 503 e respeita headersSent', () => {
    const { r } = open();
    const cb = r.setTimeout.mock.calls[0][1];
    cb(); expect(r.sendStatus).toHaveBeenCalledWith(503);
    r.sendStatus.mockClear(); r.headersSent = true;
    cb(); expect(r.sendStatus).not.toHaveBeenCalled();
  });
  it('metricsHandler devolve texto', async () => {
    const r = mkRes(); await metricsHandler({} as any, r);
    expect(r.end).toHaveBeenCalled();
  });
});
