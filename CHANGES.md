# ROCAgents — Perubahan & Cara Menjalankan

> Snapshot hasil refactor. Berisi proyek lengkap (sudah termasuk semua perubahan).
> Tidak menyertakan: `node_modules/`, `dist/`, `.git/`, `db.json`, `sessions/`, `.env`.

## 2026-07-31 — Agent Multi: 8 role, 2 pipeline + CLI

Menambah pipeline kedua ke Agent Multi dan perintah CLI untuk memicunya.
Murni aditif — tidak ada perubahan di `orchestrator.ts`, `commandGuard.ts`,
`tools.ts`, atau `authMiddleware.ts`.

- **`server/agentOrchestra.ts`** — direfaktor untuk mendukung banyak pipeline
  (`AGENT_MULTI_PIPELINES`), bukan satu rantai 4-role hardcoded:
  - `fast` (sudah ada): Scout → Builder/Modder → Breaker → Closer.
  - **`engineering`** (baru) — diadaptasi dari 4-Step Engineering Orchestra
    milik [roc-webui](https://github.com/ivansslo/roc-webui) (Apache-2.0):
    Chief Architect → Lead Developer → Security Pentester → QA Supervisor.
    Berbeda dari roc-webui yang berjalan di atas simulator offline, di sini
    setiap role memakai tool RocAgent yang nyata — Architect membaca
    workspace sungguhan sebelum bikin blueprint, Developer menulis file asli
    (bukan cuma blok markdown), dan Pentester/QA menautkan skor/coverage-nya
    ke tool call yang benar-benar dijalankan.
  - Hand-off antar role kini generik (berdasar urutan pipeline), bukan
    hardcode nama role tertentu — jadi pipeline baru bisa ditambah tanpa
    mengubah logic hand-off.
  - `extractStepMeta()` mem-parsing tag `[ SCORE: A ]` / `[ COVERAGE: 94% ]`
    / `[ RELEASE: v1.0.0-rc1 ]` dari output role (konvensi yang sama dengan
    roc-webui) jadi `step.meta` terstruktur.
- **`server.ts`** — `POST /api/agents/orchestra/stream` menerima field baru
  `pipeline: "fast" | "engineering"` (default `fast`, jadi permintaan lama
  tanpa field ini tetap jalan seperti sebelumnya).
- **`src/types.ts`** — `AgentRole` diperluas ke 8 nilai; `AgentMultiPipelineId`
  dan `AgentStepMeta` baru.
- **`src/components/OrchestraVisualizer.tsx`** — ditulis ulang generik untuk
  N pipeline (`AGENT_LIBRARY` + `PIPELINE_ROLES`) alih-alih 4 posisi node
  hardcoded; menampilkan tag SCORE/COVERAGE/RELEASE di panel detail role.
- **`src/components/AgentOrchestraTab.tsx`** — pemilih pipeline (fast /
  engineering) sebelum launcher.
- **`rocagent-cli.ts`** — perintah baru:
  - `/agents [fast|engineering] <tugas>` — jalankan pipeline, streaming SSE
    langsung ke terminal (parser SSE sama persis dengan
    `lib/agentOrchestraStream.ts` di web UI).
  - `/pipelines` — daftar kedua pipeline dan role-nya.
  - `tools/rocagent-cli` (wrapper bash) — teks `--help` diperbarui.
- **README.md** — bagian "Agent Multi" ditulis ulang untuk 8 role/2 pipeline;
  atribusi roc-webui ditambahkan ke "Related projects".

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (guard + auth + endpoints + rocvault, 105 kasus) → semua lulus,
  nol regresi
- `npm run build` → sukses; chunk `AgentOrchestraTab` tetap kecil (~21KB),
  bundle Chat default tidak berubah (~470KB)
- Smoke test SSE langsung (server sungguhan, dengan & tanpa cookie auth):
  pipeline `engineering` mengalir step-by-step untuk keempat role
  (architect/developer/pentester/qa); pipeline `fast` dan permintaan tanpa
  field `pipeline` tetap berjalan seperti sebelumnya (regresi nol)
- Parser SSE baru di `rocagent-cli.ts` diuji terisolasi dengan frame SSE
  tiruan yang identik dengan yang ditulis `server.ts` — seluruh assertion
  lulus (event count, `pipeline` di `run_start`, `role` di setiap step,
  `meta.securityScore` ter-parse dari `step_done`)

## 2026-07-31 — Agent Multi: pipeline Scout → Builder/Modder → Breaker → Closer

Fitur baru, murni aditif — tidak ada satu baris pun di `orchestrator.ts`,
`commandGuard.ts`, `tools.ts`, atau `authMiddleware.ts` yang diubah.

- **`server/agentOrchestra.ts`** (baru) — menjalankan 4 role berurutan di atas
  `runOrchestrator` yang sudah ada, sehingga setiap tool call role tetap lewat
  shell guard, SSRF guard, auth, dan logging `db.json` yang sama persis dengan
  chat biasa:
  - **Scout** — recon cepat read-only (list/read/search file, `git status/log`),
    tidak menulis apa pun.
  - **Builder/Modder** — implementasi nyata: tulis/edit file, jalankan
    build/install/shell. Mengambil inisiatif, tidak bertanya balik ke user.
  - **Breaker** — coba jebol hasil Builder: cari celah OWASP-style, divalidasi
    lewat tool nyata.
  - **Closer** — baca 3 laporan sebelumnya, vonis cepat: PASS / PASS WITH
    NOTES / FAIL.
  - Kegagalan jujur: pipeline berhenti bila satu role gagal, bukan
    membiarkan role berikutnya mengarang kesimpulan dari data yang hilang.
- **`server.ts`** — endpoint baru `POST /api/agents/orchestra/stream` (SSE),
  pola identik `/api/chat/stream`.
- **`src/types.ts`** — `AgentRole` diganti dari set lama yang tidak
  terpakai (`architect|developer|pentester|qa` — tidak pernah di-import di
  manapun, tanpa backend) menjadi `scout|builder|breaker|closer`.
- **`src/components/OrchestraVisualizer.tsx`** — dihidupkan kembali (tadinya
  dead code, tidak pernah dirender) dan di-retheme ke 4 role baru; sekaligus
  memperbaiki bug lama `agent.name.split('_')[1]` yang akan pecah untuk nama
  tanpa underscore (diganti field `badge` eksplisit).
- **`src/lib/agentOrchestraStream.ts`** (baru) — SSE client, mengikuti
  framing `lib/chatStream.ts`.
- **`src/components/AgentOrchestraTab.tsx`** (baru) — launcher + visualizer
  live + panel verdict Closer. Lazy-loaded (`React.lazy`) seperti
  `SelfDevelopmentHub`, jadi bundle tab Chat default tidak membengkak.
- **`src/components/Sidebar.tsx`** / **`src/App.tsx`** — tab baru "Agent
  Multi" di navigasi.

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (guard + auth + endpoints + rocvault, 105 kasus) → semua lulus,
  nol regresi
- `npm run build` → sukses; ukuran bundle awal Chat tidak berubah (~470KB)
  karena tab baru di-code-split ke chunk ~17KB terpisah
- Smoke test langsung ke server (SSE, dengan & tanpa cookie auth): auth wall
  tetap 401 tanpa login; pipeline 4-role mengalir step-by-step lewat SSE;
  fallback jujur muncul saat tidak ada API key provider terkonfigurasi.

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

---

## 2026-07-30 — Babak 3: kebersihan provider, rotasi sesi, test endpoint, isolasi OS (v5.22.0)

### Keamanan & kebenaran
- **Rotasi password runtime kini menginvalidasi semua sesi.** Mengganti `WEB_PASSWORD` lewat
  `/api/env/update` (tanpa restart) sebelumnya membiarkan token lama hidup sampai TTL 24 jam;
  middleware kini memeriksa nilai live tiap request dan membunuh semua token + lockout seketika.
  Password baru langsung berlaku tanpa restart.
- **`EnvEditor` diperbaiki (bug bawaan, bukan dari babak 2):** mapping field↔env tertukar
  (Tailscale←OR_KEY, IP←CF_AI_TOKEN, PAT←CF_ACCOUNT_ID) dikembalikan; payload form yang selalu
  ditolak server (object, bukan array) kini dikirim sebagai array `{key,value}` — tombol simpan
  akhirnya benar-benar berfungsi, dan nilai ter-mask aman (diskip server).

### Kebersihan
- **Dead code provider dihapus** (~140 baris): `callAuroRaX/Fun/Roc/Forty/UltiX` (lima alias
  Gemini identik) dan `callJulesAgent` (bot PR async, bukan chat) beserta cabang dispatcher &
  guard kuncinya. Chain tersisa: gemini, groq, openai, openrouter, cfai, roadqwen, oci/ollama.

### Testing
- `server/__tests__/endpoints.integration.test.ts` (16 kasus): boot server nyata di direktori
  temp, lalu uji auth wall, traversal & sibling-prefix, injeksi nama path di zip-dir, guard
  pada `/api/ssh/exec`, masking env end-to-end, 404 handler. `npm test` kini 5 suite.
- `auth.test.ts` bertambah: skenario rotasi password runtime (token lama mati, password baru
  langsung aktif).

### Operasional
- **Isolasi OS akhirnya punya resep:** `docs/ISOLASI-OS.md` (prinsip + matriks lapisan +
  checklist) dan `tools/setup-isolated-user.sh` (user `rocagent` khusus + systemd unit dengan
  `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`; menolak jalan di
  Termux & non-systemd). Komentar "NOT YET DONE" di commandGuard kini menunjuk ke resep ini.
