/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

const TOKEN_COOKIE = 'rocagents_auth_token';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Public routes that bypass authentication
const PUBLIC_PATHS = new Set(['/api/health', '/api/models', '/api/auth/status', '/api/auth/login']);

interface TokenEntry { token: string; expiresAt: number; }

// --- Login brute-force limiter ----------------------------------------------
// There was previously no throttle at all: an unlimited number of password
// guesses per second. Loopback-by-default mitigates this, but the moment HOST
// is pointed at a tailnet it becomes live. Per source-IP: MAX_LOGIN_FAILURES
// wrong passwords locks the client out for LOGIN_LOCK_MS. In-memory by design
// (single-user personal server); counters reset on restart.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function clientKey(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

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
      const key = clientKey(req);
      const now = Date.now();
      const rec = loginAttempts.get(key);
      if (rec && rec.lockedUntil > now) {
        const waitMin = Math.ceil((rec.lockedUntil - now) / 60000);
        res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMin} minute(s).` });
        return;
      }
      const provided = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!constantTimeCompare(provided, password)) {
        const count = (rec ? rec.count : 0) + 1;
        loginAttempts.set(key, { count, lockedUntil: count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : 0 });
        // Prune stale entries so a hostile source cannot grow the map forever.
        if (loginAttempts.size > 10000) {
          for (const [k, v] of loginAttempts) if (v.lockedUntil <= now) loginAttempts.delete(k);
        }
        res.status(401).json({ error: 'Invalid password', attemptsLeft: Math.max(0, MAX_LOGIN_FAILURES - count) });
        return;
      }
      loginAttempts.delete(key);
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

    // Static frontend assets (HTML/JS/CSS) must load unauthenticated, otherwise the
    // login screen itself can never be rendered and the user only ever sees a 401 JSON
    // body. All privileged data and actions live under /api/, which stays protected.
    if (!req.path.startsWith('/api/')) return next();

    // Enforce: require a valid, non-expired token
    prune();
    const token = parseCookies(req.headers.cookie)[TOKEN_COOKIE];
    const entry = token ? validTokens.get(token) : undefined;
    if (entry && entry.expiresAt > Date.now()) return next();

    res.status(401).json({ error: 'Authentication required', needsLogin: true });
  };
}
