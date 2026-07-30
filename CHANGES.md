# ROCAgents — Perubahan & Cara Menjalankan

> Snapshot hasil refactor. Berisi proyek lengkap (sudah termasuk semua perubahan).
> Tidak menyertakan: `node_modules/`, `dist/`, `.git/`, `db.json`, `sessions/`, `.env`.

## Cara menjalankan (lokal)
```bash
unzip roca-codex.zip
cd roca-codex
cp .env.example .env          # lalu isi minimal satu API key
npm install --legacy-peer-deps
npm run build                 # build frontend (dist/) + backend (dist/server.cjs)
npm start                     # jalankan server produksi -> http://localhost:3000
# atau mode dev: npm run dev
```

Isi minimal salah satu di `.env`:
```
GEMINI_API_KEY=...     # atau
GROQ_KEY=...           # atau
OPENROUTER_API_KEY=... # atau
OPENAI_API_KEY=...
```
Opsional proteksi password (akan memunculkan layar login):
```
WEB_PASSWORD=...
PORT=3000
```

## Ringkasan perubahan

### Backend
- **`server/orchestrator.ts`**
  - 4 persona nyata (balanced/creative/precision/casual) → `temperature`/`topP`/`topK` diteruskan ke semua provider.
  - **Token-streaming Gemini** (`generateContentStream`) + fallback non-streaming aman.
  - `MAX_TOOL_TURNS` 5 → 12 (agent menuntaskan tugas multi-langkah).
  - System prompt **goal-executing** (act → verify → report; jangan mengarang).
  - `robustFetch` ramping (hapus jebakan cURL +20s; timeout 8s).
  - Failover chain ramping (buang 5 alias aurora-* + jules).
  - Fallback **jujur** (bukan teks kaleng).
- **`server/db.ts`** — 43 → **16 tool inti** (+ reconcile db.json lama saat startup).
- **`server/tools.ts`** — 16 tool inti; `write`/`edit` auto-build **non-blocking**; guard ukuran file 256KB.
- **`server.ts`** — ~74 → ~30 endpoint nyata (purge mock + RCE/SSRF); containment check path; teruskan `persona`; endpoint status/login.
- **`server/authMiddleware.ts`** — **FIX bug autentikasi** (dulu selalu lolos); kini benar-benar 401 + login + token ber-KTB + logout.

### Frontend
- **`src/App.tsx`** — ~3.200 → ~340 baris (shell komposisi).
- Komponen baru: `Sidebar`, `Header`, `ChatView`, `SelfDevelopmentHub` (lazy/code-split), `NotificationDropdown` (lean, data nyata), `PersonaSelector`, `LoginGate`.
- `lib/chatStream.ts` (SSE streaming), `lib/persona.ts`.
- `ChatInput.tsx` — persona selector + tombol **Stop**.
- **Code-split**: bundle awal turun ~54% (SelfDevelopmentHub lazy).
- Buang blok mock UI (TURBO PROXY palsu, IP mesh, SSH fingerprint, Info alert).
- `vite.config.ts` — `manualChunks` vendor (react / recharts).

## Verifikasi (di sandbox)
- `tsc --noEmit` → EXIT 0
- `npm run build` → sukses (~2.844 modul)
- Boot server OK; `/api/health`, `/api/models`, streaming SSE, dan alur login (6/6) teruji runtime.

## Catatan
- Token-streaming Gemini butuh `GEMINI_API_KEY` asli untuk muncul per-token; tanpa key, alur fallback jujur yang muncul (sudah diuji).
- `rocd/` (Python), `n8n/`, `oci/`, `termux-rocd/` tidak diubah.

---

## 2026-07-30 — Hardening babak 2 (temuan review keamanan F1–F6 + perbaikan kualitas)

### Keamanan
- **F1 — celah bypass guard ditutup.** `self_develop_capability` → `execute` kini **nonaktif default**
  (`SELF_DEV_EXECUTE=true` untuk mengaktifkan secara sadar) + screening heuristik snippet
  (menolak `child_process`, `require(`, `eval`, `new Function`, akses `process.`, dsb.).
  Gate ini otomatis berlaku juga untuk cron scheduler.
- **F2 — `/api/ssh/exec` kini melewati `commandGuard`** (sebelumnya tanpa guard sama sekali);
  `guardShell` diekspor dari `tools.ts` sebagai satu choke point.
- **F3 — anti-SSRF pada tool `http_request`:** resolusi DNS dulu, tolak IP privat/loopback/
  link-local (metadata cloud `169.254.169.254`, tailnet `100.x`, LAN), tolak kredensial di URL,
  redirect diikuti manual dengan validasi ulang tiap hop (maks 5).
- **F4 — `/api/workspace/zip-dir` memakai `execFile` tanpa shell** (argumen array) — injeksi
  perintah lewat nama path berisi `"` tidak lagi mungkin.
- **F5 — permukaan kredensial & brute force:** login rate-limit (5 gagal → kunci 15 menit, per IP);
  `GET /api/env/config` membalut nilai rahasia (hanya 4 karakter terakhir); nilai yang masih
  bermask tidak bisa menimpa rahasia asli; mode `rawEnv` di `POST /api/env/update` kini berfungsi
  (sebelumnya selalu 400) dengan perlindungan mask yang sama.
- **F6 — containment path** memakai `path.relative` (menutup sibling-prefix bug); scrub **semua**
  varian token GitHub di output git/push; fallback repo default → `ivansslo/RocAgent`.

### Kualitas / koreksi
- Auto-build background kini **mengantre satu rebuild** bila ada edit selama build berjalan
  (sebelumnya edit terbuang → `dist/` basi).
- Log `db.json` dibatasi 2000 entri terbaru.
- Test baru `server/__tests__/auth.test.ts` (13 kasus: 401 tanpa token, alur cookie, path publik,
  lockout 429); `npm test` kini menjalankan guard + auth + rocvault.
- README: klaim "SQLite" dikoreksi (persistensi JSON `db.json`); `metadata.json` diselaraskan
  dengan nama produk.
