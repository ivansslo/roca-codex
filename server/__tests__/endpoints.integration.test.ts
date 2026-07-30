// Endpoint integration tests — boots the REAL server on a loopback port in a
// TEMP working directory, then exercises the hardened surfaces over HTTP:
//   • auth wall (401 without token, cookie flow)
//   • path containment incl. the sibling-prefix fix (path.relative)
//   • /api/workspace/zip-dir cannot inject via a quote in the path (execFile)
//   • /api/ssh/exec passes through the shell guard
//   • /api/env/config masking + masked values never overwriting real secrets
//
// Everything (db.json, .env, sessions) is written into the temp dir — nothing
// touches the repository or the operator's real files. The test uses the built
// bundle when available (run `npm run build` first for speed) and falls back
// to `tsx server.ts` (Vite middleware) otherwise.
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string, extra?: any) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
};

const PORT = 24700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'endpoint-test-password-789';
const REPO_ROOT = process.cwd();

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(child: ChildProcess, bootLog: string[]): Promise<boolean> {
  for (let i = 0; i < 240; i++) { // up to 60s
    if (child.exitCode !== null) return false; // died early
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rocagent-e2e-'));
  const distEntry = path.join(REPO_ROOT, 'dist', 'server.cjs');
  const useDist = fs.existsSync(distEntry);
  const cmd = useDist ? 'node' : 'npx';
  const args = useDist ? [distEntry] : ['tsx', path.join(REPO_ROOT, 'server.ts')];

  console.log(`\nBoot: ${cmd} ${args.join(' ')} (cwd=${tmp})`);
  const bootLog: string[] = [];
  const child: ChildProcess = spawn(cmd, args, {
    cwd: tmp,
    env: { ...process.env, WEB_PASSWORD: PASSWORD, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', d => bootLog.push(String(d)));
  child.stderr?.on('data', d => bootLog.push(String(d)));

  const cleanup = (code: number) => {
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} process.exit(code); }, 1500).unref();
  };

  const up = await waitForServer(child, bootLog);
  ok(up, 'server boot & /api/health merespons');
  if (!up) {
    console.log('--- boot log ---\n' + bootLog.join('').slice(-2000));
    cleanup(1);
  }

  let cookie = '';
  try {
    console.log('\n-- auth wall --');
    {
      const r = await fetch(`${BASE}/api/files/content?path=package.json`);
      ok(r.status === 401, 'endpoint file tanpa login → 401', r.status);
    }
    {
      const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
      const sc = r.headers.get('set-cookie') || '';
      ok(r.status === 200 && sc.includes('rocagents_auth_token='), 'login → cookie diterbitkan', r.status);
      cookie = sc.split(';')[0];
    }
    const authed = (p: string, init: any = {}) => fetch(`${BASE}${p}`, { ...init, headers: { ...(init.headers || {}), Cookie: cookie } });

    console.log('\n-- containment (path.relative, bukan startsWith) --');
    {
      const r = await authed(`/api/files/content?path=${encodeURIComponent('../../../etc/passwd')}`);
      ok(r.status === 400, '../ traversal → 400', r.status);
    }
    {
      // sibling-prefix: nama direktori yang BERAWALAN sama dengan cwd server
      // tidak boleh lolos (bug startsWith lama). cwd server = tmp.
      const evilSibling = path.basename(tmp) + '-evil/x.txt';
      const r = await authed(`/api/files/content?path=${encodeURIComponent('../' + evilSibling)}`);
      ok(r.status === 400, 'sibling-prefix ../<cwd>-evil/ → 400 (bug startsWith lama tertutup)', r.status);
    }
    {
      const r = await authed('/api/files/content?path=../package.json');
      ok(r.status === 400, '../package.json di luar workspace → 400', r.status);
    }
    {
      // file benar-benar ada DI DALAM cwd server (tmp) harus terbaca
      fs.writeFileSync(path.join(tmp, 'known-good.txt'), 'isi-uji-rocagent');
      const r = await authed('/api/files/content?path=known-good.txt');
      const t = await r.text();
      ok(r.status === 200 && t.includes('isi-uji-rocagent'), 'file sah di dalam workspace → 200', r.status);
    }

    console.log('\n-- zip-dir: injeksi via tanda kutip pada nama path --');
    {
      const marker = path.join(tmp, 'PWNED-BY-INJECTION');
      const evil = `x"; touch ${marker}; "`;
      const r = await authed(`/api/workspace/zip-dir?path=${encodeURIComponent(evil)}`);
      // 404 (path tidak ada) wajar; yang penting perintah suntikan TIDAK pernah jalan
      ok(!fs.existsSync(marker), `nama path jahat tidak mengeksekusi perintah (HTTP ${r.status})`);
    }

    console.log('\n-- /api/ssh/exec lewat shell guard --');
    {
      const r = await authed('/api/ssh/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'rm -rf /' }) });
      const d = await r.json();
      ok(r.status === 403 && d.blocked === true && d.code === 'RM_RECURSIVE_FORCE', 'rm -rf / diblokir guard di endpoint HTTP', { status: r.status, d });
    }
    {
      const r = await authed('/api/ssh/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'echo aman' }) });
      const d = await r.json();
      ok(d.blocked !== true, 'perintah aman lolos guard (gagal di koneksi SSH itu wajar)', d);
    }

    console.log('\n-- env masking + mask tidak bisa menimpa rahasia --');
    {
      const secretValue = 'SECRET-TOKEN-XYZ-9999';
      let r = await authed('/api/env/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envs: [{ key: 'GEMINI_API_KEY', value: secretValue }, { key: 'APP_URL', value: 'http://x.local' }] }) });
      const upd = await r.json();
      ok(upd.success === true, 'set nilai awal', upd);
      r = await authed('/api/env/config');
      const cfg = await r.json();
      const gem = (cfg.envVars || []).find((v: any) => v.key === 'GEMINI_API_KEY');
      ok(gem && gem.masked === true && !JSON.stringify(cfg).includes(secretValue), 'respons config ter-mask, nilai asli tidak bocor', gem);
      // kirim balik nilai mask → nilai asli di disk dipertahankan
      await authed('/api/env/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envs: [{ key: 'GEMINI_API_KEY', value: gem.value }, { key: 'APP_URL', value: 'http://diubah.local' }] }) });
      const onDisk = fs.readFileSync(path.join(tmp, '.env'), 'utf-8');
      ok(onDisk.includes(secretValue) && onDisk.includes('APP_URL=http://diubah.local'), 'mask tidak menimpa rahasia; nilai non-mask diterapkan');
    }

    console.log('\n-- 404 untuk route tak dikenal --');
    {
      const r = await authed('/api/tidak-ada');
      ok(r.status === 404, '/api/tidak-ada → 404', r.status);
    }
  } catch (e: any) {
    fail++;
    console.log('  ✗ exception selama test: ' + e.message);
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  cleanup(fail ? 1 : 0);
})();
