# ROCAgents — Perubahan & Cara Menjalankan

> Snapshot hasil refactor. Berisi proyek lengkap (sudah termasuk semua perubahan).
> Tidak menyertakan: `node_modules/`, `dist/`, `.git/`, `db.json`, `sessions/`, `.env`.

## 2026-08-01 — Provider baru: CloudFerro Sherlock

Diprakarsai investigasi log kegagalan orchestrator owner: dalam satu malam
Cloudflare AI (kuota harian habis), Gemini (kuota 429), Groq (`gpt-oss-120b`
mengalami bug intermiten yang sudah dikenal komunitas — kadang balasan
kosong setelah tool call), OpenRouter (`User not found`, indikasi kunci
bermasalah), dan OpenAI (kredit habis) gagal berurutan pada request yang
sama, sehingga percakapan jatuh ke fallback jujur "tidak ada provider yang
merespons". Investigasi mendalam (bukan asumsi) menunjukkan seluruh
kegagalan itu nyata di sisi masing-masing akun/provider, bukan bug logika
orchestrator — tapi menambah provider independen baru tetap mengurangi
peluang seluruh rantai gagal bersamaan.

**`server/orchestrator.ts`**: `callCloudFerro()` — provider baru memakai
endpoint OpenAI-compatible CloudFerro Sherlock
(`https://api-sherlock.cloudferro.com/openai/v1`, GPU cloud yang dihosting
di Polandia). Didaftarkan sebagai `cfsherlock` di `DEFAULT_MODEL`
(default `MiniMaxAI/MiniMax-M2.5`), `PROVIDER_ALIAS` (`sherlock`,
`cloudferro`), rantai `providersToTry`, dan guard kredensial
(`CF_SHERLOCK_KEY`/`CLOUDFERRO_SHERLOCK_API_KEY`/`CLOUDFERRO_KEY`).
`callTurboFallback()` (pesan diagnostik akhir) ikut menyebutkan CloudFerro
Sherlock kalau kuncinya terisi.

**`server.ts`**: `/api/models` menambahkan `cfsherlock` ke availability
check dan dua entri katalog (`MiniMaxAI/MiniMax-M2.5`,
`meta-llama/Llama-3.3-70B-Instruct`) supaya muncul di dropdown model UI.

**`docs/app.env.template`, `docs/ENV_KEYS_LIST.md`, `README.md`**:
didokumentasikan `CF_SHERLOCK_KEY` dan alias provider baru.

Diverifikasi live secara menyeluruh sebelum menulis kode integrasi (bukan
menebak format API dari dokumentasi saja):
- `GET /openai/v1/models` dengan kunci asli owner → HTTP 200, daftar 5+
  model chat (`meta-llama/Llama-3.3-70B-Instruct`, `MiniMaxAI/MiniMax-M2.5`,
  `openai/gpt-oss-120b`, `speakleash/Bielik-11B-v3.0-Instruct`, dst).
- `POST /openai/v1/chat/completions` tanpa tool → HTTP 200, balasan normal.
- `POST /openai/v1/chat/completions` DENGAN tool (skema
  `list_project_files` asli) → `finish_reason: "tool_calls"`, format
  identik OpenAI/Groq, untuk `Llama-3.3-70B-Instruct` maupun
  `gpt-oss-120b` (yang terakhir juga mengembalikan field `reasoning`
  terpisah dari `content`, sama seperti versi Groq-nya — tapi `content`
  tetap terisi normal, bukan kosong).
- **End-to-end lewat `runOrchestrator()` asli** (bukan mock): dengan
  `PROVIDER=cfsherlock`, orchestrator memilih provider ini, memanggil tool
  `list_project_files` **sungguhan** (bukan stub) dua kali dalam satu
  giliran tool-loop, membaca daftar file asli repo, dan menghasilkan
  jawaban akhir koheren berdasarkan hasil tool tersebut.

Verifikasi kode:
- `npx tsc --noEmit` → 0 error.
- `npx vite build` → sukses.
- `npm test` → 6 suite, 134 kasus, 0 gagal, tanpa regresi.

## 2026-08-01 — Fix nama bentrok `oci` vs CLI Oracle; hapus referensi endpoint Ollama/Tailscale yang sudah dihapus

**1. `tools/bashrc-helpers.sh` / `tools/install-bashrc-helpers.sh`: `oci()` → `oci_vm()`.**
Owner memakai RocAgent dan `github.com/ivansslo/termuxrd-cloud` di Termux
yang sama. `termuxrd-cloud` menginstal CLI resmi Oracle Cloud sebagai
binary bernama `oci` di PATH. `tools/bashrc-helpers.sh` RocAgent
mendefinisikan fungsi shell `oci()` sendiri (SSH ke VM, uji port dulu,
bukan CLI Oracle) — karena fungsi shell diselesaikan sebelum binary di
PATH, mengetik `oci compute instance list` di shell manapun yang sudah
`source ~/.bashrc` diam-diam memanggil SSH RocAgent, bukan CLI Oracle
asli. Dilaporkan owner: "opsi 2 (Install OCI CLI) setelah jalankan fungsi
oci-cli jadi masuk ke VM".

Fungsi diganti nama jadi `oci_vm()` (implementasi `oci_shell()` di
baliknya tidak berubah). `install-bashrc-helpers.sh` diperbarui: ringkasan
perintah di akhir instalasi menyebut `oci_vm`, dan — karena `.bashrc`
hanya men-`source` file helper (bukan menyalin definisinya), meng-install
ulang otomatis memuat versi baru untuk shell BARU — ditambahkan peringatan
eksplisit saat instalasi terdeteksi sebagai upgrade (marker
`RocAgent helpers` sudah ada sebelumnya): shell interaktif yang SEDANG
berjalan mungkin masih punya `oci()` lama di memori sampai dibuka ulang.

**Diverifikasi live**: dijalankan `install-bashrc-helpers.sh` di `$HOME`
sandbox terisolasi (fresh install lalu upgrade) — dikonfirmasi
`type oci_vm` mengembalikan fungsi yang benar, `type oci` sudah tidak ada
sama sekali, dan pesan peringatan migrasi muncul tepat saat upgrade.

**2. `docs/cloud.env.template`, `tools/bashrc-helpers.sh`: hapus referensi node Tailscale yang sudah dihapus.**
Owner mengonfirmasi node Tailscale `awsx` (sebelumnya bernama `roadfx`,
hostname `awsx.tail759f3e.ts.net`, IP `100.100.237.104`) — yang sesi
sebelumnya (2026-07-31) baru saja dijadikan rujukan `VM_TAILSCALE_HOSTNAME`
dan `OCI_MODEL_ENDPOINT` untuk provider Ollama/OCI di
`server/orchestrator.ts` — **sudah dihapus total** dari
console.tailscale.com, belum ada pengganti. `cloud.env.template`
dikembalikan ke kosong/placeholder untuk `VM_TAILSCALE_HOSTNAME` dan
`OCI_MODEL_ENDPOINT`, dengan catatan eksplisit kenapa (bukan sekadar
dihapus diam-diam — nilai lama itu jangan dipakai lagi kalau owner
menemukannya di riwayat/backup). `AWS_TS_IP`/`AWS_PUBLIC_IP` di
`bashrc-helpers.sh` (dipakai fungsi `awsx()`, node yang sama) diberi
catatan serupa; nilainya sengaja TIDAK dikosongkan supaya `_roc_connect`
tetap menguji port dan gagal dengan pesan jelas ("tidak terjangkau"),
bukan error variabel-kosong yang membingungkan.

Verifikasi:
- `bash -n` pada kedua file shell yang diubah → tidak ada error sintaks.
- `npx tsc --noEmit` → 0 error.
- `npx vite build` → sukses.
- `npm test` → 6 suite, 134 kasus, 0 gagal, tanpa regresi (perubahan ini
  murni file shell, tidak menyentuh kode TypeScript, divalidasi penuh
  tetap sesuai standar proyek).

## 2026-07-31 — Hapus fitur "Synced Apps" fiktif; perbaiki system prompt yang menyebut repo yang sudah dihapus/di-rename

Owner melaporkan agent "masih menyimpan ingatan lama" saat ditanya
kemampuannya — jawabannya masih menyebut interaksi dengan
`ivansslo/roca-codex` dan `ivansslo/rocagents`, padahal repo pertama sudah
di-rename menjadi `ivansslo/RocAgent` (repo ini sendiri) dan repo kedua
sudah dihapus total (dikonfirmasi `404` via GitHub API). Ini **bukan**
memori/state yang tersimpan — ini teks system prompt hardcode di
`getServerEnvironmentContext()` (`server/orchestrator.ts`) yang disuntikkan
ke SETIAP request LLM, jadi selalu terbaca ulang dan tidak pernah basi
dengan sendirinya.

Owner juga menanyakan apakah `roc-webui.zip`/`roc-otoweb.zip` masih
diperlukan, mengingat source asli (`github.com/ivansslo/roc-webui`,
`github.com/ivansslo/roc-otoweb`) sudah ada dan sudah diimplementasikan
(roc-webui jadi basis desain pipeline "engineering" Agent Multi). Diperiksa:
kedua .zip itu **bukan** clone repo asli — hanya `export_app_archive`
membungkus SATU file `.md` placeholder buatan sendiri (`# Overview\n
Documentation manifest for ...`) menjadi `.zip`, lalu `sync_external_app`
melakukan "sync probe" yang isinya cuma `fetch(url, {method:'HEAD'})` +
`unzip -l` pada zip buatan sendiri itu — tidak pernah benar-benar
mengambil/menganalisis isi repo aslinya. Diputuskan: dihapus, diganti
tautan langsung ke repo aslinya (yang sudah tercantum di berbagai tempat
lain di codebase/dokumentasi).

**Dihapus (`server/db.ts`, `server/tools.ts`, `server.ts`,
`src/components/SyncDashboard.tsx`):**
- Tool `get_synced_apps_status`, `sync_external_app`, `inspect_synced_app`,
  `export_app_archive` — skema di `db.ts` dan implementasi di `tools.ts`.
- Interface `SyncedApp`, field `syncedApps` di `DatabaseSchema`, method
  `Database.getSyncedApps()` / `Database.updateAppStatus()`. Constructor
  `Database` sekarang secara aktif `delete`-kan key `syncedApps` dari
  `db.json` lama pada boot berikutnya, sehingga instalasi yang sudah
  berjalan otomatis bersih tanpa migrasi manual.
- Endpoint `GET /api/synced-apps` dan `POST /api/synced-apps/:id/sync`.
- `SyncDashboard.tsx`: bagian "Workspace Synced Apps" (kartu per-app +
  tombol "Sync" + catatan "diverifikasi langsung pada sistem" yang
  sebenarnya tidak pernah benar-benar terjadi) dihapus total. Kartu AI
  Provider / GitHub / Akun yang murni menampilkan data nyata dari endpoint
  lain (`/api/models`, `/api/github/updates`) dipertahankan apa adanya.

**Diperbaiki (`server/orchestrator.ts`):**
- `OWNER_SYSTEM_PROMPT_BASE`: directive "roc-webui.zip, roc-otoweb.zip"
  diganti "uploaded attachment" (generik, tidak menyebut app spesifik yang
  sudah tidak relevan).
- `getServerEnvironmentContext()`: baris "Primary Source Repositories:
  ivansslo/roca-codex and ivansslo/rocagents" dan "Ecosystem Synced
  Workspace Apps: roc-webui.zip / roc-otoweb.zip" diganti satu baris
  faktual — **ivansslo/RocAgent** sebagai satu-satunya source repo, dengan
  catatan eksplisit bahwa nama lama sudah pensiun/di-rename (supaya kalau
  owner atau model menyebut nama lama itu lagi di masa depan, konteks ini
  sendiri yang meluruskan, bukan mengulang klaim basi). Baris "Environment
  Awareness" diperbarui menyebut `oci_vm`/`rootd_fs` (tool baru sesi
  sebelumnya) alih-alih `export_app_archive` (yang baru saja dihapus).

**Docs:** `docs/OCI_TAILSCALE_APERTURE_GUIDE.md` dan
`docs/TROUBLESHOOT_IP_CHANGED_100_100_237_104.md` menandai URL
`raw.githubusercontent.com/ivansslo/rocagents/...` sebagai basi/404
(dikonfirmasi langsung dengan curl) alih-alih menghapusnya diam-diam,
supaya siapa pun yang mengikuti panduan lama tahu persis kenapa perintah
itu akan gagal.

**Diverifikasi:**
- Dicek langsung ke GitHub API: `ivansslo/rocagents` → 404 (dihapus
  sungguhan); `ivansslo/roca-codex` → 301 redirect ke `ivansslo/RocAgent`
  (di-rename, bukan repo terpisah).
- `getServerEnvironmentContext()` dipanggil secara langsung (live, bukan
  dibaca sebagai teks) setelah perubahan — output dicek tidak lagi memuat
  `roc-webui.zip`, `roc-otoweb.zip`, `export_app_archive`, atau
  `ivansslo/rocagents`.
- `npx tsc --noEmit` → 0 error.
- `npx vite build` → sukses.
- `npm test` → 6 suite, 134 kasus, 0 gagal, tanpa regresi (jumlah kasus
  tidak berubah dari sesi sebelumnya karena tidak ada test yang pernah
  menguji fitur synced-apps yang dihapus ini).

## 2026-07-31 — Keamanan (cookie/session-store), README/NOTICE, tool `oci_vm` + `rootd_fs`, memori lintas-sesi Cortex Agent

Empat perubahan independen dalam satu sesi:

**1. Fix: `commandGuard.ts` sebelumnya mengizinkan membaca cookie browser.**
Owner bertanya apakah RocAgent bisa membaca cookie browser lokal. Diuji
langsung ke `checkCommand()`: 5 perintah baca/salin file Cookies Chrome,
`cookies.sqlite` Firefox, dsb, semuanya `allowed: true` — `SENSITIVE_PATH_RE`
sebelumnya hanya menutupi kunci SSH/OCI/AWS/gh/.netrc/.git-credentials,
tidak pernah menutupi file cookie/session-store. Ditambal: pola baru untuk
profil Chromium (Chrome/Chromium/Edge/Brave/Opera desktop & Android
app-private) dan Firefox (`cookies.sqlite`, `logins.json`, `key4.db`),
`sqlite3` ditambahkan ke `READERS`. 6 test case baru ditambahkan di
`commandGuard.test.ts` (63 → 69 kasus).

**2. README: tabel "Related projects by the same author" dihapus, dipindah ke `NOTICE.md`.**
Fungsinya tidak berubah sama sekali (rootd-fs/termuxrd/termuxrd-cloud tetap
menjadi runtime environment RocAgent apa adanya, tidak diimpor sebagai
library) — hanya representasinya di README yang dihapus atas permintaan
owner. Atribusi lisensi (terutama Apache-2.0 dari roc-webui untuk desain
pipeline "engineering") dipindah utuh ke `NOTICE.md` baru, bukan dihapus
tanpa jejak, supaya kewajiban atribusi §4 Apache-2.0 tetap terpenuhi.

**3. Tool baru: `oci_vm` dan `rootd_fs` (`server/tools.ts` + `server/db.ts`).**
- `oci_vm` — lifecycle penuh VM Oracle Cloud (list/get/launch/power/resize/
  terminate) lewat `oci-cli` yang sudah terpasang & terkonfigurasi di
  device (`~/.oci/config`, tidak pernah dibaca RocAgent sendiri). Setiap
  panggilan dibangun sebagai argv array via `execFile` (bukan shell
  string), sehingga nilai parameter dari model tidak bisa lolos lewat
  metakarakter shell. `terminate` butuh `confirm:true` eksplisit.
- `rootd_fs` — menjalankan CLI `rootd` (github.com/ivansslo/rootd-fs) apa
  adanya sebagai tool eksekusi kontainer rootless; rootd-fs sendiri **tidak
  diubah sama sekali**. Subcommand dibatasi ke allowlist sesuai dokumentasi
  rootd-fs sendiri; `enter` (interaktif, butuh TTY) ditolak dengan arahan
  memakai `sh`; `rm`/`purge` (destruktif) butuh `confirm:true`.
- Keduanya tetap lewat `guardShell()` untuk audit log bersama dan gerbang
  `SHELL_GUARD=enforce|warn|off` yang sama dengan tool shell lain.
- Test baru `server/__tests__/ociVmRootdFs.test.ts` (14 kasus): validasi
  parameter wajib, penolakan aksi destruktif tanpa confirm, allowlist
  action/subcommand, dan pembuktian bahwa panggilan valid benar-benar
  mencapai `execFile` nyata (gagal ENOENT di sandbox ini karena `oci-cli`/
  `rootd` memang tidak terpasang di sana — bukti eksekusi asli, bukan stub).

**4. Memori lintas-sesi untuk Cortex Agent RocAgentInsight (`snowflake/06_agent_memory.sql`).**
Owner bertanya ke RocAgentInsight langsung di `ai.snowflake.com` soal
preferensi permanen; agent menjawab jujur bahwa ia tidak punya mekanisme
mengingat lintas sesi. Ditambahkan nyata: tabel `GOVERNANCE.AGENT_MEMORY`
(key/value) + 3 stored procedure (`SAVE_AGENT_MEMORY`, `GET_AGENT_MEMORY`,
`FORGET_AGENT_MEMORY`) di-wire sebagai custom tool (`type: generic`) pada
agent yang sama — `save_preference` / `get_preferences` / `forget_preference`.
Karena melekat di objek agent, bukan fitur sisi RocAgent, memori yang sama
terlihat baik dari `query_snowflake_insight` maupun dari Snowsight langsung.

**Diverifikasi live, sungguhan (bukan asumsi):** dijalankan langsung ke
akun Snowflake — tabel & 3 procedure berhasil dibuat, ownership agent
dipindah ke `ROCAGENTINSIGHT_ADMIN` (agent sebelumnya dimiliki role lain),
`CREATE OR REPLACE AGENT` dengan 4 tool (Cortex Analyst + 3 tool memori
baru) berhasil. Dites 3 panggilan HTTP terpisah (setara sesi chat baru
tiap kali): (1) "ingat preferensi X" → agent memanggil `save_preference`;
(2) di panggilan terpisah, "preferensi apa yang kamu ingat?" → agent
memanggil `get_preferences`, mengembalikan kedua nilai yang tersimpan;
(3) "lupakan preferensi bahasa" → agent memanggil `forget_preference`,
menghapus satu key sambil mempertahankan yang lain. Data uji dibersihkan;
`AGENT_MEMORY` production kosong, siap dipakai owner.

Verifikasi menyeluruh untuk #1–#3 (perubahan kode RocAgent):
- `npx tsc --noEmit` → 0 error
- `npx vite build` → sukses
- `npm test` → 6 suite, 134 kasus total (69 commandGuard + 9
  shellGuard.integration + 17 auth + 14 endpoints.integration + 14
  ociVmRootdFs + 11 rocvault), 0 gagal, tanpa regresi pada 114 kasus lama

## 2026-07-31 — UI: perkuat branding kartu Snowflake Cortex Agent (hackathon demo)

Owner sedang ikut Snowflake CoCo CLI Hackathon 2026 (Hack2Skill) dan ingin
RocAgentInsight "muncul sebagai dirinya" secara visual — bukan cuma detail
teknis kecil di antara tool lain — supaya jelas terlihat sebagai showcase
Cortex Agent nyata saat demo/dinilai juri.

- **`src/components/ChatMessage.tsx`** — `SnowflakeInsightCard` dirombak:
  - Ikon `CloudSnow` (bukan `Database` generik) dalam badge biru Snowflake,
    dengan gradient header sky-blue yang jelas berbeda dari kartu tool lain
    (yang netral abu-abu).
  - Nama agent (`RocAgentInsight`/`ROCAGENTINSIGHT`) ditampilkan besar +
    label kecil "Snowflake Cortex Agent" di bawahnya — bukan lagi teks kecil
    generik "Snowflake".
  - Baris badge baru: "Powered by Snowflake Cortex Agents — real API call,
    live semantic view" — penegasan eksplisit bahwa ini panggilan nyata,
    bukan simulasi, tanpa perlu expand JSON mentah untuk membuktikannya.
  - Kategori grup tool ("Snowflake Insight" di `ExecutionLogsGroup`) ikut
    memakai ikon & warna `CloudSnow`/sky yang sama untuk konsistensi.

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (114 kasus) → semua lulus, nol regresi
- `npm run build` → sukses

## 2026-07-31 — UI: query_snowflake_insight tidak punya kartu tampilan sendiri

Owner bertanya kenapa "RocAgentInsight" tidak muncul di dropdown pilihan
model, dan merasa integrasi Snowflake "cuma jalan di log". Jawaban soal
dropdown: itu memang benar dan disengaja — RocAgentInsight adalah *tool*
yang dipanggil model chat yang sedang aktif, bukan model chat itu sendiri,
jadi tidak akan pernah ada di daftar model (Gemini/Groq/OpenAI/dst).

Tapi bagian "cuma jalan di log" itu menunjukkan bug UI nyata: tool
`query_snowflake_insight` (ditambahkan sesi sebelumnya) tidak pernah
didaftarkan ke pengelompokan visual `ExecutionLogsGroup` di
`ChatMessage.tsx`, sehingga jatuh ke kategori generik "Other Tools" dan
menampilkan JSON mentah — termasuk `raw_response` yang bisa sampai 12KB
dump SSE mentah dari Cortex Agent.

- **`src/components/ChatMessage.tsx`**:
  - `query_snowflake_insight` sekarang dikelompokkan sendiri ("Snowflake
    Insight", ikon Database biru) di `ExecutionLogsGroup`, bukan lagi jatuh
    ke "Other Tools".
  - `SnowflakeInsightCard` (baru) — kartu khusus yang menampilkan
    pertanyaan asli, jawaban bersih (`result.answer`), dan tool internal
    Cortex Agent yang dipakai (`result.tools_used`, mis.
    `rocagent_ops_analyst, system_execute_sql`) — TIDAK PERNAH menampilkan
    `raw_response` mentah ke pengguna.

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (114 kasus) → semua lulus, nol regresi
- `npm run build` → sukses

## 2026-07-31 — Fix: query_snowflake_insight mengembalikan jawaban terduplikasi

Owner melaporkan Cortex Agent "tidak berjalan" — investigasi lapangan (bukan
tebakan) menemukan DUA masalah terpisah:

1. **PAT Snowflake lama sudah di-revoke** (langkah keamanan yang benar dari
   owner) tapi belum diganti PAT baru di `cloud.env` — ini bukan bug kode,
   dikonfirmasi dengan menguji koneksi langsung: error Snowflake berubah dari
   `Network policy is required` (kemarin) menjadi
   `Programmatic access token is invalid` (sekarang), sesuai perilaku token
   yang benar-benar dicabut. Setelah PAT baru dipasang, koneksi berhasil.
2. **Bug nyata di `query_snowflake_insight`** (server/tools.ts): parser SSE
   mengumpulkan field `text` dari SETIAP event yang memilikinya, termasuk
   `response.thinking(.delta)` (penalaran internal model, bukan jawaban) dan
   `response.text` (yang me-replay ulang teks penuh yang SAMA di akhir tiap
   content block, bukan konten baru). Hasilnya: jawaban akhir mengandung teks
   pemikiran + jawaban terduplikasi dua kali berturut-turut.

Fix: parser sekarang melacak `event:` SSE saat ini dan HANYA mengumpulkan teks
dari event `response.text.delta` — satu-satunya event yang membawa potongan
teks jawaban yang benar-benar baru (streaming delta), konsisten dengan cara
`src/lib/chatStream.ts` dan `src/lib/agentOrchestraStream.ts` menangani event
serupa di frontend.

`snowflake/00_network_policy.sql` dan `snowflake/README.md` diperbarui:
opsi Network Rules (direkomendasikan Snowflake untuk policy baru, lihat
docs.snowflake.com/en/user-guide/network-policies) ditambahkan sebagai
alternatif `ALLOWED_IP_LIST` legacy, plus bagian Troubleshooting yang
mendokumentasikan kedua kegagalan di atas untuk insiden serupa di masa depan.

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (114 kasus) → semua lulus, nol regresi
- `npm run build` → sukses
- **Reproduksi & konfirmasi nyata**: dipanggil langsung dengan PAT lama (gagal,
  `token is invalid`, mengonfirmasi dugaan) dan PAT baru (sebelum fix:
  jawaban terduplikasi persis seperti dilaporkan owner; sesudah fix: jawaban
  bersih, tanpa duplikasi, `tools_used` tetap mengonfirmasi
  `rocagent_ops_analyst` + `system_execute_sql` dipanggil Cortex Agent)

## 2026-07-31 — Tool baru: query_snowflake_insight (integrasi Cortex Agent Snowflake)

Menambah satu tool baru ke RocAgent yang memanggil Cortex Agent Snowflake
"RocAgentInsight" (dibangun terpisah di akun Snowflake operator, lihat
`snowflake/README.md`), supaya Scout/Builder/role Agent Multi mana pun bisa
bertanya data operasional dalam bahasa natural.

- **`server/tools.ts`** — tool baru `query_snowflake_insight`: mem-POST ke
  endpoint REST Cortex Agents (`api/v2/databases/.../agents/...:run`),
  mem-parse response SSE-nya menjadi jawaban bersih (`answer`, `tools_used`),
  dan mengembalikan error jelas kalau `SNOWFLAKE_ACCOUNT`/`SNOWFLAKE_USER`/
  `SNOWFLAKE_PAT` belum diisi. Timeout 45s (lebih lama dari tool lain karena
  Cortex Agent butuh beberapa putaran tool-call internal sebelum menjawab).
- **`server/db.ts`** — deklarasi tool didaftarkan (17 tool inti sekarang,
  naik dari 16).
- **`docs/cloud.env.template`** dan **`docs/ENV_KEYS_LIST.md`** — variabel
  baru didokumentasikan: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`,
  `SNOWFLAKE_PAT` (atau alias `SNOWFLAKE_KEY`), plus 3 variabel opsional
  (`SNOWFLAKE_INSIGHT_DB/SCHEMA/AGENT`) untuk override target agent.
- **`snowflake/`** (baru) — 5 skrip SQL + README yang membangun fondasi
  Cortex Agent "RocAgentInsight" dari nol: role/warehouse/database/schema,
  tabel `RAW`/`ANALYTICS` yang mencerminkan struktur `db.json` ExecutionLog,
  Semantic View native Snowflake, definisi Cortex Agent, dan panduan
  Business Continuity/DR (Database Replication manual untuk Enterprise
  Edition, dengan contoh Failover Group untuk Business Critical+ di masa
  depan).

Verifikasi di sandbox:
- `tsc --noEmit` → EXIT 0
- `npm test` (guard + auth + endpoints + rocvault, 114 kasus) → semua lulus,
  nol regresi
- `npm run build` → sukses
- **Panggilan nyata**: tool `query_snowflake_insight` dijalankan langsung
  (bukan mock) dengan kredensial Snowflake asli — berhasil memanggil Cortex
  Agent RocAgentInsight, menerima jawaban jujur bahwa tabel fakta operasional
  masih kosong (belum ada log RocAgent yang di-ingest), dan `tools_used`
  mengonfirmasi Cortex Agent benar-benar memakai `rocagent_ops_analyst` +
  `system_execute_sql` secara internal.

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
