import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

const TOKEN_COOKIE = 'rocagents_auth_token';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Public routes that bypass authentication
const PUBLIC_PATHS = new Set(['/api/health', '/api/models', '/api/auth/status', '/api/auth/login']);

interface TokenEntry { token: string; expiresAt: number; }

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
    cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return cookies;
}

// Create a proper password-protection middleware. Unauthenticated requests are REJECTED with 401
// (previously the middleware always called next(), so the "password protection" did nothing).
export function createAuthMiddleware(password: string): RequestHandler {
  const validTokens = new Map<string, TokenEntry>();

  const prune = () => {
    const now = Date.now();
    for (const [t, entry] of validTokens) if (entry.expiresAt <= now) validTokens.delete(t);
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Login endpoint handles its own auth and issues a token
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      const provided = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!constantTimeCompare(provided, password)) {
        res.status(401).json({ error: 'Invalid password' });
        return;
      }
      prune();
      const token = randomBytes(32).toString('hex');
      validTokens.set(token, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
      res.json({ ok: true });
      return;
    }

    if (req.method === 'POST' && req.path === '/api/auth/logout') {
      const token = parseCookies(req.headers.cookie)[TOKEN_COOKIE];
      if (token) validTokens.delete(token);
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      res.json({ ok: true });
      return;
    }

    // Public routes pass through
    if (PUBLIC_PATHS.has(req.path)) return next();

    // Enforce: require a valid, non-expired token
    prune();
    const token = parseCookies(req.headers.cookie)[TOKEN_COOKIE];
    const entry = token ? validTokens.get(token) : undefined;
    if (entry && entry.expiresAt > Date.now()) return next();

    res.status(401).json({ error: 'Authentication required', needsLogin: true });
  };
}
