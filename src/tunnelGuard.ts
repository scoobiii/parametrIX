import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function tunnelGuard(req: Request, res: Response, next: NextFunction) {
  const viaTunnel =
    !!req.get('cf-connecting-ip') ||
    (req.get('host') || '').endsWith('trycloudflare.com');
  if (!viaTunnel) return next();

  if (req.method !== 'POST' || req.path !== '/api/mcp') return res.sendStatus(404);

  const got = Buffer.from((req.get('authorization') || '').replace(/^Bearer /, ''));
  const want = Buffer.from(process.env.MCP_TOKEN || '');
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want))
    return res.sendStatus(401);
  next();
}
