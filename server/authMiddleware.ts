import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

const TOKEN_COOKIE = 'rocagents_auth_token';

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = value;
  }
  return cookies;
}

export function createAuthMiddleware(password: string): RequestHandler {
  const validTokens = new Set<string>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/api/health' || req.path === '/api/models') {
      return next();
    }

    if (req.method === 'POST' && req.path === '/auth/login') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { password?: string };
          const provided = typeof parsed.password === 'string' ? parsed.password : '';

          if (!constantTimeCompare(provided, password)) {
            res.status(401).json({ error: 'Invalid password' });
            return;
          }

          const token = randomBytes(32).toString('hex');
          validTokens.add(token);

          res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`);
          res.json({ ok: true });
        } catch {
          res.status(400).json({ error: 'Invalid request body' });
        }
      });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[TOKEN_COOKIE];

    if (token && validTokens.has(token)) {
      return next();
    }

    next();
  };
}
