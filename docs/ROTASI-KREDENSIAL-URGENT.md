# 🚨 Rotasi Kredensial — Daftar Kerja

**Konteks:** sekitar 60 kredensial aktif tertempel ke transkrip chat pada
29 Juli 2026. Transkrip chat bukan kanal aman. Semua yang ada di sana harus
dianggap **bocor** dan **wajib dirotasi**.

**Prinsip yang perlu diterima:** mengenkripsi kunci yang sudah bocor tidak
memperbaiki apa pun. Ia hanya mengunci rapat sesuatu yang salinannya mungkin
sudah dimiliki orang lain. Urutannya harus: **rotasi dulu, enkripsi kemudian.**

Saya sengaja tidak menyimpan satu pun nilai kredensial ke berkas mana pun di
workspace ini.

---

## Urutan pengerjaan

Kerjakan dari atas. Yang paling atas bisa dipakai untuk menguras uang atau
membajak infrastruktur dalam hitungan menit.

### 🔴 PRIORITAS 1 — bisa langsung merugikan uang (hari ini, sekarang)

> **Panduan klik-per-klik untuk kelima ini: [LANGKAH-ROTASI-5-TERATAS.md](LANGKAH-ROTASI-5-TERATAS.md)**
> Verifikasi otomatis: `bash tools/verify-rotation.sh`

| # | Kredensial | Tempat rotasi | Kenapa mendesak |
|---|---|---|---|
| 1 | `OPENAI_API_KEY` / `OPENAI_KEY` / `OA_KEY` | platform.openai.com/api-keys | Penyalahgunaan langsung menagih kartu kamu. Ada **3 kunci OpenAI** berbeda di berkasmu. |
| 2 | `AIVEN_TOKEN` | console.aiven.io → Tokens | Token akun penuh — bisa buat/hapus database. |
| 3 | `CF_API_TOKEN`, `CF_TOKEN`, `CF_AI_TOKEN`, `CFAT`, `CFUT` | dash.cloudflare.com/profile/api-tokens | Kontrol DNS = pembajakan domain. **5 token** terpapar. |
| 4 | `GITHUB_PAT` (3 nilai berbeda), `GHP`, `GITHUB_FINE_GRAINED` | github.com/settings/tokens | Akses tulis ke semua repo kamu, termasuk RocAgent. |
| 5 | `TAILSCALE_KEY` (2), `TAILSCALE_AUTH_KEY` | login.tailscale.com/admin/settings/keys | Auth key = orang asing bisa **masuk ke tailnet privatmu**. |

### 🟠 PRIORITAS 2 — akses data (hari ini juga)

| # | Kredensial | Tempat rotasi |
|---|---|---|
| 6 | `AIVEN_PG_PASS`, `AIVEN_PG2_PASS` (+ semua `*_URI` yang memuatnya) | console.aiven.io → Service → Users |
| 7 | `NEON_URI`, `NEON_API_KEY` | console.neon.tech → Settings → API keys + reset password role |
| 8 | `MONGO_URI` | cloud.mongodb.com → Database Access → Edit user |
| 9 | `CF_R2_ACCESS`, `CF_R2_SECRET` | dash.cloudflare.com → R2 → Manage API tokens |
| 10 | `GITLAB_TOKEN` (2 varian) | gitlab.com/-/user_settings/personal_access_tokens |

### 🟡 PRIORITAS 3 — layanan aplikasi (minggu ini)

| # | Kredensial | Tempat rotasi |
|---|---|---|
| 11 | `GROQ_KEY` | console.groq.com/keys |
| 12 | `OR_KEY`, `DEEPSEK_API_KEY` | openrouter.ai/keys |
| 13 | `GEMINI_API_KEY` (2 nilai), `X_GOOG_API_KEY` | aistudio.google.com/apikey |
| 14 | `CLERK_SK`, `CLERK_SECRET_KEY` | dashboard.clerk.com → API Keys |
| 15 | `SOLACE_PASS`, `SOLACE_ADMIN_PASS`, `SOLACE_API_TOKEN` | console.solace.cloud |
| 16 | `VOYAGE_API_KEY`, `VOYAGE_MODEL_KEY` | dash.voyageai.com |
| 17 | `NPM_API_KEY` | npmjs.com/settings/~/tokens |
| 18 | `GITHUB_CLIENT_SECRET` | github.com/settings/developers |
| 19 | `CREWAI_TOKEN`, `BACKBOARD_KEY`, `HONCHO_KEY`, `CLAW_KEY`, `CLAWHUB_KEY`, `CLAWLINK_KEY`, `DP_TOKEN` | masing-masing dashboard |
| 20 | `FB_API_KEY` | **Firebase sudah dihapus dari RocAgent** (30 Juli 2026). Kalau proyek `planning-with-ai-36675` atau `yttriferous-magpie-16ppv` tidak dipakai lagi, hapus saja proyeknya di Firebase Console — itu menutup risikonya sepenuhnya. |

### 🔵 PRIORITAS 4 — password lemah yang dipakai ulang

Ini bukan bocor saja, tapi memang **lemah sejak awal**:

```
WEB_PASSWORD   <- pola kata-kamus + substitusi angka; ada di daftar tebakan umum
WVC_PASS       \
PG_PASS        |  NILAI IDENTIK untuk 3 layanan berbeda — satu bocor, tiga jebol
REDIS_PASS     /
SSHDAEMON_PASS <- hanya 6 karakter
TOKEN          <- memuat nama proyek + tahun, mudah ditebak
```

(Nilai sengaja tidak ditulis di sini. Berkas ini masuk git; password tidak boleh
ikut, sekalipun sudah dijadwalkan diganti.)

Ganti semuanya dengan yang dibuat mesin:

```bash
openssl rand -base64 24
```

Satu password unik per layanan. Jangan dipakai ulang.

### ⚫ PRIORITAS 5 — sudah dicatat sebelumnya, masih menganggur

- `OCI_FINGERPRINT` di berkasmu masih yang **lama**
  (`44:d3:...`). Kamu sudah rotasi ke `a1:3a:...`. Perbarui atau hapus.
- `VM_IP=161.118.253.28` — VM lamamu sekarang `161.118.213.55`. Nilai basi.
- Catatan `# 2. Rotate exposed OpenAI key (sk-proj-hEuu...)` sudah ada di
  berkasmu sendiri. **Belum dikerjakan** — kunci itu masih yang sama.

---

## Kesalahan struktural di berkas itu (di luar kebocoran)

Ini yang membuat berkas tersebut berbahaya bahkan seandainya tidak bocor:

1. **Nilai ganda yang bertabrakan.** `GITHUB_PAT` muncul **3 kali** dengan nilai
   berbeda; `MONGO_URI` 3 kali; `HTTP_PROXY` 2 kali. Di `.env`, **yang terakhir
   menang** — jadi kamu tidak pernah benar-benar tahu kredensial mana yang
   dipakai aplikasi. Ini sumber bug yang sangat sulit dilacak.

2. **Typo pada hostname.** Beberapa baris menulis `aavencloud.com` (dua 'a'),
   yang lain `aivencloud.com`. Salah satunya pasti gagal koneksi.

3. **Baris rusak:** `GITHUB_CLIENT_SECRET325545c...` — tanda `=` hilang, jadi
   baris itu diabaikan diam-diam.

4. **Baris tanpa nama variabel:** `sat.RcDk8zsUTrWzb-fUwOQEmg` berdiri sendiri.

5. **Isi `env` runtime tercampur masuk.** Ada `npm_config_*`, `PWD`, `SHLVL`,
   `LANG`, `K_SERVICE`, `CNB_STACK_ID`. Itu keluaran perintah `env`, bukan
   konfigurasi. Menaruhnya di `.env` tidak ada gunanya dan menyamarkan mana yang
   benar-benar dibutuhkan.

6. **Rahasia menunjuk ke `/sdcard`:** `SSHDAEMON_KEY=/sdcard/SshDaemon/ssh_host_rsa_key`.
   `/sdcard` **bisa dibaca aplikasi lain di Android**. Private key SSH tidak
   boleh di sana.

7. **Komentar berisi klaim yang tidak dijalankan:** "FILE INI TIDAK PERNAH
   DI-COMMIT KE GIT" adalah harapan, bukan mekanisme. Yang menegakkannya adalah
   `.gitignore` + izin berkas.

---

## Setelah rotasi: cara menyimpan yang benar

### Lapis 1 — jangan taruh semua di satu tempat

Pisahkan per lingkup. Aplikasi hanya boleh melihat yang ia butuhkan:

```
~/.config/rocagent/app.env      <- RocAgent saja: WEB_PASSWORD, 1 kunci model, PORT, HOST
~/.config/rocagent/cloud.env    <- OCI, Cloudflare, Aiven, Neon
~/.config/rocagent/personal.env <- GitHub, GitLab, npm
```

Alasannya: kalau RocAgent disusupi, yang bocor cuma kunci model — bukan seluruh
infrastrukturmu.

### Lapis 2 — izin berkas

```bash
mkdir -p ~/.config/rocagent
chmod 700 ~/.config/rocagent
chmod 600 ~/.config/rocagent/*.env
```

**Jangan pernah** menaruh berkas ini di `/sdcard` — aplikasi lain bisa membacanya.

### Lapis 3 — enkripsi saat diam

Pakai `rocvault` (lihat `PANDUAN-rocvault.md`):

```bash
rocvault lock ~/.config/rocagent/cloud.env
shred -u ~/.config/rocagent/cloud.env
rocvault run ~/.config/rocagent/cloud.env.vault -- npm start
```

### Lapis 4 — jangan gunakan `.env` untuk yang sudah punya rumah lebih baik

| Yang ini | Simpan di sini, bukan `.env` |
|---|---|
| Kredensial OCI | `~/.oci/config` (sudah kamu pakai) |
| Kunci SSH | `~/.ssh/` mode 600 — **bukan `/sdcard`** |
| Token GitHub | `gh auth login`, atau SSH key |
| Rahasia CI/CD | GitHub Actions Secrets |
| Rahasia produksi | Secret manager penyedia cloud |

---

## Verifikasi setelah selesai

```bash
# 1. Tidak ada .env yang ter-commit di mana pun
cd ~/RocAgent && git log --all --diff-filter=A --name-only --pretty=format: \
  | sort -u | grep -E '^\.env' | grep -v example

# 2. Tidak ada rahasia di /sdcard
ls -la /sdcard/*.env /sdcard/SshDaemon/ 2>/dev/null

# 3. Izin berkas benar
ls -la ~/.config/rocagent/

# 4. Kunci lama benar-benar mati — harus 401, bukan 200
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <KUNCI_LAMA>" https://api.openai.com/v1/models
```

---

## Yang tidak boleh dilakukan lagi

- ❌ Menempel kredensial ke chat — dengan AI mana pun, termasuk saya
- ❌ Menaruh rahasia di `/sdcard`
- ❌ Memakai satu password untuk banyak layanan
- ❌ Menyimpan semua rahasia dalam satu berkas
- ❌ Menganggap enkripsi bisa menggantikan rotasi

Kalau nanti perlu saya bekerja dengan kredensial: taruh di berkas di HP-mu,
beritahu saya **nama berkasnya saja**, dan biarkan skrip yang membacanya.
Nilainya tidak perlu pernah melewati chat.
