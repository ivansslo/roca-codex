# rocvault — kunci berkas `.env` dengan openssl

## Pasang

### 1. Dependensi

**Termux:**
```bash
pkg install -y openssl-tool coreutils git openssh
```

`openssl-tool`, bukan `openssl` — di Termux paket binernya bernama begitu.
Butuh OpenSSL 3.0+ karena memakai subperintah `openssl kdf`. Cek dengan
`openssl version`.

**Debian/Ubuntu (VM Oracle):**
```bash
sudo apt install -y openssl coreutils git openssh-client
```

### 2. Pasang

```bash
cd ~/RocAgent
bash tools/install.sh
source ~/.bashrc
```

Installer memeriksa dependensi, menguji `openssl kdf` dan HMAC benar-benar
berfungsi, membuat `~/.local/bin`, memasang symlink, lalu **menambahkan
direktori itu ke PATH di `.bashrc`**. Aman dijalankan berulang kali.

> Panduan versi sebelumnya menulis `cp rocvault ~/bin/` tanpa membuat `~/bin`
> lebih dulu dan tanpa menyentuh PATH. Akibatnya `ln -sf` gagal diam-diam dan
> perintahnya `command not found`. Itu kesalahan saya; `tools/install.sh`
> menggantikannya.

### 3. Verifikasi

```bash
rocvault --help
rocagent-vm --help
```

### Dependensi runtime

`openssl`, `od`, `tr`, `sed` — semuanya dari `coreutils` dan `openssl-tool`.

**Tidak butuh python3.** Versi awal memakainya untuk perbandingan MAC
waktu-tetap, tapi Termux minimal sering tanpa python. Sekarang memakai
*double-HMAC comparison*: kedua nilai MAC di-HMAC ulang dengan kunci acak
sekali pakai sebelum dibandingkan, sehingga penyerang tidak bisa memakai
selisih waktu untuk menebak byte per byte. Sengaja juga tidak memakai `xxd`,
yang tidak selalu terpasang.

---

## Pemakaian

```bash
rocvault lock   ~/.config/rocagent/app.env      # -> app.env.vault
rocvault unlock app.env.vault                   # tampilkan ke layar
rocvault unlock app.env.vault out.env           # tulis ke berkas
rocvault check  app.env.vault                   # uji integritas, isi tidak tampil
rocvault edit   app.env.vault                   # edit lalu enkripsi ulang otomatis
rocvault rotate app.env.vault                   # ganti passphrase
rocvault run    app.env.vault -- npm start      # jalankan tanpa menulis plaintext
rocvault run    *.vault -- npm start           # gabung beberapa vault sekaligus
                                                # (dari dalam direktori proyek)
```

`run` adalah cara terbaik. Rahasia masuk ke memori proses anak dan **tidak
pernah menyentuh disk**.

---

## Menguji agent

```bash
cd ~/RocAgent
rocvault run ~/.config/rocagent/app.env.vault -- bash tools/test-agent.sh
```

Memeriksa berlapis dan berhenti di lapisan pertama yang gagal: env termuat,
kunci diterima penyedia, kunci boleh memanggil endpoint chat, server hidup,
lalu satu pesan sungguhan ke `/api/chat`.

## Alur kerja harian

```bash
# Sekali saja, setelah rotasi kredensial selesai
mkdir -p ~/.config/rocagent && chmod 700 ~/.config/rocagent
cp app.env.template ~/.config/rocagent/app.env
nano ~/.config/rocagent/app.env          # isi nilai hasil rotasi
rocvault lock ~/.config/rocagent/app.env
# lock memverifikasi vault dulu, lalu menanyakan apakah plaintext dihapus

# Setiap kali menjalankan — WAJIB dari dalam direktori proyek,
# karena npm mencari package.json di direktori saat ini
cd ~/RocAgent
rocvault run ~/.config/rocagent/app.env.vault -- npm start

# Kalau perlu mengubah nilai
rocvault edit ~/.config/rocagent/app.env.vault
```

---

## Desain kripto

| Bagian | Pilihan | Alasan |
|---|---|---|
| Turunan kunci | PBKDF2-HMAC-SHA512, 600.000 iterasi | Rekomendasi OWASP 2023+. Memperlambat tebakan brute force. |
| Enkripsi | AES-256-CBC, salt + IV acak 16 byte | Berkas sama menghasilkan ciphertext berbeda tiap kali. |
| Integritas | HMAC-SHA256, encrypt-then-MAC | `openssl enc` **tidak punya AES-GCM**. Tanpa MAC, CBC bisa dimanipulasi bit-flipping tanpa ketahuan. |
| Kunci | Dua kunci terpisah dari satu passphrase | Memakai kunci yang sama untuk enkripsi dan MAC adalah kesalahan kripto klasik. |
| Perbandingan MAC | Waktu-tetap (`hmac.compare_digest`) | Mencegah timing attack. |
| Urutan | Verifikasi MAC **sebelum** dekripsi | Jangan pernah memproses data yang belum terbukti asli. |

MAC menutupi **header + IV + ciphertext**, jadi penyerang tidak bisa menukar IV
atau salt tanpa terdeteksi.

---

## Hasil pengujian

Dijalankan sungguhan, bukan diasumsikan — **10 lulus, 0 gagal**, lalu **6/6
diulang** setelah python3 dihapus dari jalur kripto:

```
✓ .env.vault dibuat, mode berkas 600
✓ round-trip: sha256 plaintext identik
✓ passphrase salah ditolak
✓ TAMPERING ciphertext (1 bit dibalik) terdeteksi, dekripsi ditolak
✓ TAMPERING IV di header terdeteksi
✓ run: variabel sampai ke proses anak
✓ nilai berisi spasi tetap utuh
✓ check tidak membocorkan isi
✓ ciphertext berbeda tiap enkripsi (salt+IV acak)
✓ template app.env berfungsi, komentar diabaikan benar
```

Dua uji tampering itu yang paling penting: mereka membuktikan MAC benar-benar
menegakkan integritas, bukan sekadar ada.

---

## Batasan — baca sebelum percaya

**Yang dilindungi:** berkas saat diam. Di disk, di backup, di `/sdcard`, di
arsip `tar` yang tidak sengaja terkirim.

**Yang TIDAK dilindungi:**

- Keylogger atau malware di HP — passphrase terbaca saat kamu mengetik
- Proses lain yang bisa membaca memori proses
- Shell history (jangan pernah taruh passphrase di command line)
- Kredensial yang **sudah terlanjur bocor**

Poin terakhir yang terpenting: **enkripsi bukan rotasi.** Mengunci kunci yang
sudah bocor hanya memberi rasa aman palsu. Rotasi dulu, enkripsi kemudian.

---

## Soal `ROCVAULT_PASS`

Variabel ini ada supaya skrip otomatis bisa jalan. Tapi:

```bash
# BURUK — terlihat di `ps` dan tersimpan di history
ROCVAULT_PASS='rahasia' rocvault run app.env.vault -- npm start

# LEBIH BAIK — biarkan bertanya
rocvault run app.env.vault -- npm start

# Untuk systemd, pakai berkas passphrase mode 600, bukan variabel di unit file
```

Kalau harus dipakai di skrip, awali baris dengan **spasi** supaya bash tidak
menyimpannya ke history (dengan `HISTCONTROL=ignorespace`).

---

## Kalau passphrase hilang

Tidak ada pemulihan. 600.000 iterasi PBKDF2 membuat brute force tidak praktis —
itu memang tujuannya, dan berlaku juga untukmu.

Simpan passphrase di password manager. Jangan di berkas di mesin yang sama
dengan vault-nya.
