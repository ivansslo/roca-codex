# Isolasi OS — Batas Keamanan yang Sebenarnya

Model keamanan RocAgent punya tiga lapis: autentikasi wajib, bind loopback,
dan `commandGuard`. Dua yang pertama kuat; yang ketiga **jujur sejak awal diakui
sebagai sabuk pengaman, bukan sandbox** — filter berbasis pola tidak bisa
kedap udara (demonya ada di header `server/commandGuard.ts`).

Batas yang tahan lama bukan pola regex, melainkan **isolasi sistem operasi**:
kalau agent (atau penyerang yang membajak sesi) lolos dari guard, kerusakan
maksimumnya harus terkurung di satu akun tak berhak apa pun — bukan home
directory Anda, bukan kredensial cloud Anda, bukan host.

Dokumen ini resepnya. Untuk VM Linux ada skrip: `tools/setup-isolated-user.sh`.

---

## 1. VM Linux (OCI/dll.) — user khusus + systemd

Prinsip:

- Server berjalan sebagai user biasa **`rocagent`** — bukan `ubuntu`, bukan `root`.
- Home-nya `/srv/rocagent` berisi HANYA repo + `app.env`. Kunci OCI/Cloudflare/
  GitHub Anda tinggal di akun pribadi — proses server tidak bisa membacanya
  walau guard ditembus.
- Akses dari ponsel tetap lewat Tailscale (`HOST=<ip-tailscale>`), auth tetap wajib.

Pasang (dari user `ubuntu`/root):

```bash
cd ~/RocAgent
sudo bash tools/setup-isolated-user.sh
```

Skrip akan: membuat user `rocagent`, menyalin repo ke `/srv/rocagent`,
menyalin `~/.config/rocagent/app.env` (mode 600), memasang unit systemd
`rocagent.service` (`User=rocagent`, `NoNewPrivileges`, `ProtectSystem=strict`,
`ReadWritePaths=/srv/rocagent`, `PrivateTmp`), lalu menyalakannya.

Kelola:

```bash
systemctl status rocagent
journalctl -u rocagent -f        # log, termasuk audit [shell-guard]
sudo systemctl restart rocagent  # setelah git pull / ubah .env
```

Bila VM-nya pakai **Podman**, alternatif rootless container ada di
komentar skrip — efek setara tanpa user baru.

## 2. Termux (Android) — batasan jujur

Termux **tidak punya multi-user Unix**: semua paket berjalan sebagai satu UID
aplikasi, jadi trik user khusus tidak berlaku. Yang benar-benar mengurangi
dampak:

1. **Jangan beri Termux izin storage penuh** (`termux-setup-storage` mengikat
   `/sdcard` — agent yang salah jalan bisa menghapus foto/dokumen). Cabut:
   Settings → Apps → Termux → Permissions → Files → Deny.
2. Jalankan server di **proot-distro container** terpisah (`proot-distro login
   ubuntu`) kalau instalasi di home utama dipakai hal lain juga.
3. Tetap: `HOST=127.0.0.1` atau IP Tailscale, jangan `0.0.0.0`.
4. Kunci sensitif di **Termux:API/vault terpisah**; server cukup membaca
   `app.env` (satu kunci model), seperti desain tiga-env di `tools/install.sh`.
5. Cadangan: `rocvault lock` semua env; HP hilang ≠ kredensial ikut.

Risiko residu setelah langkah ini: agent masih bisa merusak **isi home
Termux**-nya sendiri — itu lingkup yang Anda rela tanggung; kunci kerajaan
(cloud, VPS, repo) tidak ikut.

## 3. Matriks: apa yang dilindungi apa

| Lapisan | Musim gugur LLM / salah tempel | Penyerang dengan sesi web | Penyerang lepas guard |
|---|---|---|---|
| `WEB_PASSWORD` + rate limit | tak relevan | ✅ ditolak di pintu | tak relevan |
| Bind `127.0.0.1`/Tailscale | tak relevan | ✅ tak terlihat dari LAN/publik | tak relevan |
| `commandGuard` | ✅ mayoritas | sebagian | ❌ diakui bisa |
| `SELF_DEV_EXECUTE=false` | ✅ | ✅ | ✅ (eval tertutup) |
| SSRF filter `http_request` | ✅ | ✅ | ✅ (metadata cloud aman) |
| **User khusus + systemd hardening** | tak relevan | — | ✅ kerusakan terkurung di `/srv/rocagent` |

## 4. Checklist go-live

- [ ] server berjalan sebagai `rocagent` via systemd (atau proot di Termux)
- [ ] `app.env` hanya berisi kunci model; kunci cloud di akun lain
- [ ] `journalctl -u rocagent` memperlihatkan baris `[shell-guard]` saat ada blokir
- [ ] uji sekali: `run_bash_command` dengan `cat ~/.oci/config` dari chat →
      harus `Blocked by shell guard [SENSITIVE_PATH]` (dan di user khusus,
      file itu memang tidak ada).
