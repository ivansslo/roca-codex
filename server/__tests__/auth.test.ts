// Auth middleware tests — login, token flow, public paths, brute-force lockout.
// Uses mock req/res objects; no listening server needed.
import { createAuthMiddleware } from '../authMiddleware';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

function mkRes() {
  const r: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    status(c: number) { r.statusCode = c; return r; },
    json(b: any) { r.body = b; return r; },
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = v; return r; },
  };
  return r;
}
function mkReq(method: string, path: string, body?: any, cookie?: string, ip?: string) {
  const req: any = { method, path, body, headers: cookie ? { cookie } : {} };
  if (ip) req.ip = ip;
  return req;
}

const mw = createAuthMiddleware('test-password-123');

console.log('\n-- autentikasi dasar --');

{
  const res = mkRes(); let called = false;
  mw(mkReq('GET', '/api/chat-sessions'), res, () => { called = true; });
  ok(res.statusCode === 401 && !called, 'GET /api/* tanpa token → 401 (regresi bug lama: middleware selalu lolos)');
}
{
  const res = mkRes();
  mw(mkReq('POST', '/api/auth/login', { password: 'salah-banget-123' }), res, () => {});
  ok(res.statusCode === 401, 'login password salah → 401');
  ok(typeof res.body?.attemptsLeft === 'number', 'respon 401 menyertakan attemptsLeft');
}

let goodCookie = '';
{
  const res = mkRes();
  mw(mkReq('POST', '/api/auth/login', { password: 'test-password-123' }), res, () => {});
  const sc = res.headers['set-cookie'] || '';
  ok(res.statusCode === 200 && sc.includes('rocagents_auth_token='), 'login benar → 200 + Set-Cookie token');
  ok(/SameSite=Strict/.test(sc) && /HttpOnly/.test(sc), 'cookie HttpOnly + SameSite=Strict');
  goodCookie = sc.split(';')[0];
}
{
  const res = mkRes(); let called = false;
  mw(mkReq('GET', '/api/chat-sessions', undefined, goodCookie), res, () => { called = true; });
  ok(called, 'GET /api/* dengan cookie valid → diteruskan');
}

console.log('\n-- path publik / statis --');
for (const p of ['/api/health', '/api/models', '/api/auth/status']) {
  const res = mkRes(); let called = false;
  mw(mkReq('GET', p), res, () => { called = true; });
  ok(called, `${p} publik`);
}
{
  const res = mkRes(); let called = false;
  mw(mkReq('GET', '/assets/index.js'), res, () => { called = true; });
  ok(called, 'aset non-/api/ lolos (halaman login harus bisa tampil)');
}

console.log('\n-- brute-force lockout (per IP) --');
{
  let last = 0;
  for (let i = 0; i < 6; i++) {
    const res = mkRes();
    mw(mkReq('POST', '/api/auth/login', { password: 'nope-nope-nope' }, undefined, '9.9.9.9'), res, () => {});
    last = res.statusCode;
  }
  ok(last === 429, 'percobaan ke-6 setelah 5 gagal → 429 (terkunci)');
}
{
  const res = mkRes();
  mw(mkReq('POST', '/api/auth/login', { password: 'test-password-123' }, undefined, '9.9.9.9'), res, () => {});
  ok(res.statusCode === 429, 'IP terkunci tetap ditolak walau password benar');
}
{
  // IP lain tidak ikut terkunci
  const res = mkRes();
  mw(mkReq('POST', '/api/auth/login', { password: 'test-password-123' }, undefined, '8.8.8.8'), res, () => {});
  ok(res.statusCode === 200, 'IP lain tidak terdampak lockout');
}

console.log('\n-- rotasi password saat runtime (tanpa restart) --');
{
  // login dengan password awal → dapat cookie
  const res = mkRes();
  mw(mkReq('POST', '/api/auth/login', { password: 'test-password-123' }, undefined, '7.7.7.7'), res, () => {});
  const cookie = (res.headers['set-cookie'] || '').split(';')[0];
  ok(cookie.includes('rocagents_auth_token='), 'login awal OK sebelum rotasi');

  // operator mengganti WEB_PASSWORD lewat /api/env/update (tanpa restart)
  process.env.WEB_PASSWORD = 'password-baru-pasca-rotasi';
  try {
    // token lama harus langsung mati
    const res2 = mkRes(); let called = false;
    mw(mkReq('GET', '/api/chat-sessions', undefined, cookie, '7.7.7.7'), res2, () => { called = true; });
    ok(res2.statusCode === 401 && !called, 'token lama langsung invalid setelah WEB_PASSWORD diganti');

    // password lama ditolak, password baru diterima
    const res3 = mkRes();
    mw(mkReq('POST', '/api/auth/login', { password: 'test-password-123' }, undefined, '7.7.7.8'), res3, () => {});
    ok(res3.statusCode === 401, 'password lama ditolak setelah rotasi');
    const res4 = mkRes();
    mw(mkReq('POST', '/api/auth/login', { password: 'password-baru-pasca-rotasi' }, undefined, '7.7.7.8'), res4, () => {});
    ok(res4.statusCode === 200, 'password baru langsung berlaku tanpa restart');
  } finally {
    delete process.env.WEB_PASSWORD; // pulihkan ke password closure
  }
}

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
