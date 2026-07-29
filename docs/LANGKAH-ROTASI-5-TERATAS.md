# Langkah Rotasi — 5 Kredensial Teratas

Panduan klik-per-klik. Sisihkan sekitar 45 menit.

**Aturan yang menentukan berhasil-tidaknya:** rotasi **belum** selesai saat kunci
baru dibuat. Ia selesai saat kunci **lama ditolak**. Banyak orang berhenti di
tengah — membuat kunci baru, lupa mencabut yang lama, dan kunci bocor itu tetap
hidup. Setiap bagian di bawah diakhiri langkah verifikasi.

Urutannya sengaja: **buat baru → pakai → baru cabut yang lama.** Kalau dibalik,
layananmu mati di tengah jalan.

Verifikasi otomatis:

```bash
cd ~/RocAgent
bash tools/verify-rotation.sh
```

Skrip itu tidak membaca berkas apa pun dan tidak menyimpan apa pun — kunci lama
hanya ada di memori proses saat kamu tempel.

---

## 1. OpenAI — paling mendesak

**Kenapa duluan:** penyalahgunaan langsung menagih kartu kreditmu. Kunci OpenAI
yang bocor adalah target favorit bot pemindai GitHub.

Ada **3 kunci OpenAI** berbeda di env lamamu: `OPENAI_API_KEY`, `OPENAI_KEY`,
`OA_KEY`. Ketiganya harus diurus.

### Langkah

1. Buka https://platform.openai.com/api-keys
2. **Sebelum apa pun**, cek pemakaian di https://platform.openai.com/usage —
   kalau ada lonjakan yang tidak kamu kenali, kunci sudah dipakai orang.
3. Klik **+ Create new secret key**
   - Name: `rocagent-2026-07`
   - Permissions: **Restricted** → hanya `/v1/chat/completions` bila cukup
4. Salin kunci baru. Ia **hanya tampil sekali**.
5. Simpan:
   ```bash
   nano ~/.config/rocagent/app.env
   # isi: OPENAI_API_KEY=sk-proj-...
   ```
6. Uji kunci baru bekerja:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer <KUNCI_BARU>" https://api.openai.com/v1/models
   # 200 = baik
   ```
7. **Baru sekarang** kembali ke halaman API keys → **Revoke** ketiga kunci lama.

### Verifikasi

```bash
bash tools/verify-rotation.sh openai
```
Harus **MATI (401)**. Ulangi untuk ketiga kunci lama.

### Batasi kerugian ke depan

https://platform.openai.com/settings/organization/limits → set **Hard limit**
misalnya $10/bulan. Kalau kunci bocor lagi, kerugiannya berhenti di angka itu.

---

## 2. Aiven

**Kenapa mendesak:** `AIVEN_TOKEN` adalah token akun penuh — bisa membuat dan
**menghapus** database, bukan sekadar membaca.

### Langkah

1. Buka https://console.aiven.io/
2. Klik nama/avatar kanan atas → **Authentication**
3. Bagian **Authentication tokens** → **Generate token**
   - Description: `rocagent-2026-07`
   - Max age: **30 hari** (jangan tanpa batas)
4. Salin, simpan ke `~/.config/rocagent/cloud.env`
5. Uji kunci baru:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: aivenv1 <TOKEN_BARU>" https://api.aiven.io/v1/me
   # 200 = baik
   ```
6. **Revoke** token lama di daftar yang sama.

### Sekalian: password database

`AIVEN_PG_PASS` dan `AIVEN_PG2_PASS` juga bocor.

Console → pilih service → **Users** → `avnadmin` → **Reset password**

Perbarui juga `AIVEN_PG_URI` dan `AIVEN_PG2_URI`, karena password ada di dalam
URI itu.

> ⚠️ Di env lamamu, host tertulis `aavencloud.com` (dua 'a') di beberapa baris.
> Yang benar `aivencloud.com`. Perbaiki saat mengetik ulang.

### Verifikasi

```bash
bash tools/verify-rotation.sh aiven
```

---

## 3. Cloudflare

**Kenapa mendesak:** kendali DNS berarti pembajakan domain — penyerang bisa
mengarahkan domainmu ke server mereka, termasuk menerbitkan sertifikat TLS yang
sah atas namamu.

Ada **5 token** terpapar: `CF_API_TOKEN`, `CF_TOKEN`, `CF_AI_TOKEN`, `CFAT`,
`CFUT`.

### Langkah

1. Buka https://dash.cloudflare.com/profile/api-tokens
2. **Roll** setiap token yang kamu kenali (menu `...` → **Roll**).
   *Roll* membuat nilai baru sambil mempertahankan izin — lebih praktis daripada
   membuat ulang dari nol.
3. Untuk yang tidak kamu kenali lagi: **Delete**. Token menganggur adalah risiko
   tanpa manfaat.
4. Simpan nilai baru ke `~/.config/rocagent/cloud.env`
5. Uji:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer <TOKEN_BARU>" \
     https://api.cloudflare.com/client/v4/user/tokens/verify
   # 200 = baik
   ```

### Sekalian: kunci R2

`CF_R2_ACCESS` dan `CF_R2_SECRET` juga bocor — itu kredensial penyimpanan objek.

R2 → **Manage R2 API Tokens** → hapus yang lama, buat baru.

### Periksa jejak penyalahgunaan

Audit Log: https://dash.cloudflare.com/?to=/:account/audit-log
Cari perubahan DNS yang bukan kamu lakukan.

### Verifikasi

```bash
bash tools/verify-rotation.sh cloudflare
```

---

## 4. GitHub

**Kenapa mendesak:** PAT memberi akses tulis ke **semua** repomu — termasuk
RocAgent yang sudah privat. Penyerang bisa menyisipkan kode diam-diam.

Ada **4 token**: `GITHUB_PAT` (3 nilai berbeda) dan `GHP`.

### Langkah

1. Buka https://github.com/settings/tokens
2. Cek dua tab: **Tokens (classic)** dan **Fine-grained tokens**
3. **Delete** semuanya yang tidak kamu kenali persis.

### Yang lebih baik: jangan pakai PAT sama sekali

Kamu sudah pakai SSH untuk clone. Untuk kebanyakan pekerjaan, PAT tidak perlu:

```bash
# Sudah bekerja tanpa token apa pun:
git clone git@github.com:ivansslo/RocAgent.git
git pull --ff-only origin main
git push origin main
```

Cek kunci SSH-mu terdaftar:
```bash
ssh -T git@github.com
# "Hi ivansslo! You've successfully authenticated..."
```

Kalau sebuah alat memang menuntut token, pakai **fine-grained**:
- Repository access: **Only select repositories** → pilih satu
- Expiration: **30 hari**
- Permissions: seminimal mungkin

Untuk VM: **deploy key** hanya-baca, bukan PAT. `rocagent-vm setup-key`
menyiapkannya.

### Periksa jejak penyalahgunaan

https://github.com/settings/security-log — cari login atau perubahan yang bukan
kamu.

### Verifikasi

```bash
bash tools/verify-rotation.sh github
```

---

## 5. Tailscale

**Kenapa mendesak:** auth key memungkinkan orang asing **mendaftarkan perangkat
ke tailnet privatmu**. Begitu masuk, mereka satu jaringan dengan VM Oracle-mu —
melewati semua port publik yang sudah kamu tutup.

Terpapar: `TAILSCALE_KEY` (2 nilai) dan `TAILSCALE_AUTH_KEY`.

### Langkah

1. Buka https://login.tailscale.com/admin/machines
   **Periksa dulu daftar perangkat.** Ada yang tidak kamu kenali? Hapus segera.
2. Buka https://login.tailscale.com/admin/settings/keys
3. **Revoke** semua auth key dan API key yang ada.
4. Kalau butuh yang baru, buat dengan pengaman:
   - **Ephemeral**: ya — perangkat otomatis hilang saat offline
   - **Reusable**: tidak
   - **Expiration**: 1 hari
   - **Pre-approved**: tidak

> Auth key idealnya **tidak disimpan sama sekali**. Buat saat mendaftarkan
> perangkat, pakai, lalu ia kedaluwarsa sendiri.

### Verifikasi

```bash
bash tools/verify-rotation.sh tailscale
```

Lalu pastikan tailnet masih sehat:
```bash
tailscale status
ssh ubuntu@100.125.151.105 'echo tailnet ok'
```

---

## Setelah kelimanya selesai

### 1. Buktikan semuanya mati

```bash
bash tools/verify-rotation.sh all
```

Semua harus **MATI**. Satu saja **HIDUP** berarti rotasi belum tuntas.

### 2. Amankan berkas baru

```bash
chmod 700 ~/.config/rocagent
chmod 600 ~/.config/rocagent/*.env

rocvault lock ~/.config/rocagent/app.env
rocvault lock ~/.config/rocagent/cloud.env
rocvault lock ~/.config/rocagent/personal.env

shred -u ~/.config/rocagent/app.env
shred -u ~/.config/rocagent/cloud.env
shred -u ~/.config/rocagent/personal.env
```

Menjalankan:
```bash
rocvault run ~/.config/rocagent/app.env.vault -- npm start
```

### 3. Bersihkan jejak

```bash
# Rahasia di /sdcard — bisa dibaca aplikasi lain
ls -la /sdcard/*.env /sdcard/SshDaemon/ 2>/dev/null

# Berkas .env longgar di mana pun
find ~ -name '*.env' -not -path '*/node_modules/*' -exec ls -la {} \; 2>/dev/null

# History shell yang memuat kunci
grep -nE 'sk-proj-|ghp_|tskey-|AVNS_' ~/.bash_history 2>/dev/null
```

Kalau ada di history:
```bash
history -c && rm -f ~/.bash_history && kill -9 $$
```

### 4. Sisanya

Prioritas 2–5 (Neon, Mongo, Groq, Clerk, Solace, dan seterusnya) ada di
`docs/ROTASI-KREDENSIAL-URGENT.md`. Tidak semendesak lima ini, tapi tetap harus.

---

## Kalau menemukan penyalahgunaan

Tanda-tanda: tagihan OpenAI melonjak, record DNS berubah, perangkat asing di
tailnet, commit yang bukan kamu buat.

1. Cabut **semua** kredensial layanan itu, bukan hanya yang dicurigai
2. Ganti password akunnya, aktifkan 2FA
3. Periksa audit log untuk melihat apa yang diakses
4. OpenAI: hubungi support untuk sengketa tagihan — pemakaian oleh kunci curian
   umumnya bisa disanggah

---

## Kenapa ini penting

Kredensial-kredensial itu tertempel ke transkrip chat pada 29 Juli 2026.
Semuanya harus dianggap bocor.

Semua yang kita bangun — auth wajib, bind loopback, shell guard, enkripsi
`rocvault`, repo privat — **tidak melindungi apa pun** selama kunci lama masih
menerima permintaan. Kunci yang bocor tidak peduli seberapa rapi berkas
penyimpanannya.

Kerjakan lima ini, lalu sisanya menyusul.
