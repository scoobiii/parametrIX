import client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

client.collectDefaultMetrics();
const reqs = new client.Counter({ name: 'mcp_requests_total', help: 'MCP requests', labelNames: ['status'] });
const dur = new client.Histogram({ name: 'mcp_request_seconds', help: 'MCP latency', buckets: [0.05, 0.25, 1, 2, 5, 15, 30] });
const gauge = new client.Gauge({ name: 'mcp_inflight', help: 'MCP in flight' });
const MAX = Number(process.env.MCP_MAX_INFLIGHT || 4);
const TIMEOUT = Number(process.env.MCP_TIMEOUT_MS || 30000);
let inflight = 0;

export function mcpLimiter(req: Request, res: Response, next: NextFunction) {
  if (inflight >= MAX) {
    reqs.inc({ status: '429' });
    res.set('Retry-After', '2');
    return res.sendStatus(429);
  }
  inflight++; gauge.set(inflight);
  const end = dur.startTimer();
  res.setTimeout(TIMEOUT, () => { if (!res.headersSent) res.sendStatus(503); });
  res.on('close', () => {
    inflight--; gauge.set(inflight); end();
    reqs.inc({ status: String(res.statusCode) });
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}
