# 🔗 OCI ↔ Local Termux Integration via Tailscale & Aperture (roadfx)

> Owner: Ivan Ssl (ivansslo) — 2026-07-22 Asia/Jakarta
> Infra: OCI Singapore `161.118.253.28` → Tailscale `100.93.139.73` → Aperture Beta `roadfx`

## 1. Apa yang terjadi di screenshot?

Kamu membuka **https://aperture.tailscale.com/signup** → Setting up **roadfx**

- **Aperture by Tailscale (Beta)** = isolated browser containers yang hidup DI DALAM tailnet kamu. Bukan browser publik, tapi Chrome/Firefox yang running di cloud Tailscale yang punya akses langsung ke private services.
- **Configure → Provision (2 langkah)**
  - Configure ✅ (sudah)
  - Provision ⏳ (butuh authorization)

Screen menunjukan:

```
Authorize Aperture to join your tailnet:
[QR] Scan with your phone
[Authorize in Tailscale →] https://login.tailscale.com/a/7d195ef017090
Or use an auth key: tskey-auth-... [Use Key]
...
Initializing ✅
Waiting for authorization ⏳
Creating instance
Ready
```

Harus authorize supaya node `roadfx` join tailnet.

## 2. Cara authorize (WAJIB)

Pilih salah satu:

**Opsi A - QR / Browser (paling gampang):**
1. Di HP yang sudah login Tailscale (akun yang sama), scan QR
2. Atau klik tombol biru "Authorize in Tailscale"
3. Approve di `https://login.tailscale.com/admin/machines` → approve node `roadfx` / `aperture-roadfx`

**Opsi B - Auth Key:**
1. Buka https://login.tailscale.com/admin/settings/keys
2. Generate **Auth Key** → Reusable + Ephemeral? OFF supaya persisten
3. Copy `tskey-auth-xxxxx...`
4. Paste di kolom `tskey-auth-...` → Use Key

Setelah itu status akan: Creating instance → Ready
Kamu dapat URL: `https://roadfx.<tailnet>.ts.net` atau via `https://aperture.tailscale.com/...`

## 3. Kenapa Aperture penting untuk rocagents/rocspace?

- OCI private model `http://161.118.253.28:11434` (rocspace-initial) bisa diakses dari browser Aperture tanpa buka firewall publik.
- Grafana `http://100.93.139.73:3000`, Hermes Cloudflare gateway, `hub.roadfx.biz.id` local dev bisa diakses secure via Aperture.
- Threat Intel work (Google Mandiant job): bisa investigasi infra scam yang hanya reachable via tailnet, tanpa expose ke publik.

## 4. Koneksi OCI Server ke Local (bidirectional)

### Architecture
```
[Telma - Termux - HP Ivan]
   tailscale0: 100.93.x.x
   ←→ Tailscale Control Plane (DERP Singapore)
   ←→ [OCI VM - ap-singapore-1 - 161.118.253.28]
        tailscale0: 100.93.139.73
        ollama: 11434 (rocspace-initial)
        rocd, docker, etc
   ←→ [Aperture node roadfx]
        browser isolated di tailnet
```

### Di OCI VM (one-time)
```bash
# SSH ke OCI: ssh ubuntu@161.118.253.28
# Atau kalau sudah pake Tailscale: ssh ubuntu@100.93.139.73

# install tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled

# auth dengan key kamu - BUAT baru di admin console
sudo tailscale up --auth-key=tskey-auth-XXXXX --advertise-exit-node --advertise-routes=10.0.0.0/16 --ssh --accept-routes

# cek
tailscale status
tailscale ip -4
```

Script sudah ada di repo:
`bash rocagents/oci/setup-tailscale.sh` — tapi butuh `TAILSCALE_AUTH_KEY=tskey-auth-...` bukan `tskey-api-...`
Note: `.env` kamu saat ini `tskey-api-...` itu **API key** untuk control API, bukan untuk join node. Beda!

### Di Termux (Android)
```bash
pkg update -y && pkg install -y tailscale openssh mosh termux-api git curl

# kalau di Android 12+, tailscaled butuh userspace
sudo? tidak perlu, jalankan:
tailscaled --tun=userspace-networking &
tailscale up --auth-key=tskey-auth-YYYYY --accept-routes --exit-node=100.93.139.73

# optional: jadikan OCI sebagai exit node untuk semua trafik

# test konektivitas
ping 100.93.139.73
tailscale ssh ubuntu@oci-vm-hostname  # hostname muncul di tailscale status
ssh ubuntu@100.93.139.73
```

## 5. Jadikan Default Local Shell di Termux

Goal: buka Termux langsung masuk OCI shell.

### Opsi A - Simple .bashrc exec (recommended)

File: `termux-rocd/oci-default-shell.sh` (sudah dibuat di repo ini)

Tambahkan di **akhir** `~/.bashrc` di Termux:
```bash
# OCI Default Shell - Auto SSH to OCI if interactive
if [[ $- == *i* ]] && [[ -z "$OCI_ALREADY" ]]; then
  if tailscale status --json | grep -q "100.93.139.73"; then
    export OCI_ALREADY=1
    echo "🚀 Connecting to OCI 100.93.139.73 (rocspace-initial)..."
    # ganti user sesuai OCI: ubuntu / opc / root
    exec ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -t ubuntu@100.93.139.73 "bash -l"
  fi
fi
```

Kalau mau bisa keluar balik ke Termux lokal dengan `exit`, jangan pakai `exec`:
```bash
ssh -t ubuntu@100.93.139.73
```

### Opsi B - Mosh (lebih tahan sinyal HP naik turun)
```bash
pkg install mosh
# di OCI: sudo apt install mosh -y && buka UDP 60000-61000
mosh --ssh="ssh -o StrictHostKeyChecking=no" ubuntu@100.93.139.73
```

### Opsi C - Custom launcher `rocd oci`

Kita buat binary `rocd` wrapper:
`rocd`           → masuk container lokal `roc-container` (udocker)
`rocd oci`       → ssh ke OCI Tailscale
`rocd local`     → shell lokal biasa

Sudah ada di `termux-rocd/oci-launcher.sh`

### Opsi D - Termux:Boot + autossh tunnel persist

Biar selalu nyambung meski HP sleep:
```bash
pkg install autossh termux-boot
autossh -M 0 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 11434:127.0.0.1:11434 ubuntu@100.93.139.73 -N -f
# sekarang di Termux: curl http://127.0.0.1:11434/api/tags → akses model rocspace-initial lokal
```

## 6. Integrasi ke rocagents UI

Endpoints baru yang ditambahkan:

- `GET /api/aperture/status` - cek status Aperture roadfx node
- `GET /api/tailscale/status` - cek tailnet mesh nodes (OCI, Termux, Aperture)
- `POST /api/tailscale/exec` - exec tailscale command (existing)
- `GET /api/oci/status` - OCI CLI status (existing)

Tools baru:

- `aperture_tailscale_connector` - manage Aperture authorization + mesh
- `oci_tailscale_shell_integration` - install default shell di Termux

Muncul di `SyncDashboard.tsx` sebagai card "Aperture Beta (roadfx)" + "OCI ↔ Termux Default Shell"

## 7. Checklist Cepat Bang Ivan

- [ ] Buka https://login.tailscale.com/admin/settings/keys → Generate **Auth Key** → copy `tskey-auth-...`
- [ ] Di screenshot Aperture → paste key → Use Key, atau klik Authorize in Tailscale
- [ ] Tunggu Ready → simpan URL Aperture roadfx
- [ ] SSH ke OCI → `bash oci/setup-tailscale.sh` dengan `TAILSCALE_AUTH_KEY=tskey-auth-...`
- [ ] Di Termux → `tailscale up --auth-key=tskey-auth-...`
- [ ] Test: `tailscale ping 100.93.139.73` + `ssh ubuntu@100.93.139.73`
- [ ] Install default shell script: `curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/oci-default-shell.sh | bash`
- [ ] Restart Termux → otomatis masuk OCI

## 8. Keamanan

- `tskey-api-...` JANGAN dipakai di client, itu untuk API management. Simpan di `.env` server saja.
- `tskey-auth-...` - sekali pakai / reusable, simpan di Termux secure storage (`termux-api` keystore).
- Aktifkan Tailscale ACL: hanya user `ivansslo@gmail.com` bisa ssh ke OCI node + Aperture node.
- Enable Tailscale SSH checkMode: https://tailscale.com/kb/1193/tailscale-ssh

## 9. Bonus untuk Google Job (Threat Intel)

Pattern ini SAMA PERSIS dengan kerjaan **Senior Analyst, Google Threat Intelligence, Mandiant (Bahasa)**:

- Mapping scam infra → pakai Tailscale mesh untuk isolasi investigasi
- Consumption CTI → Ollama private model di OCI bisa jadi AI-driven hunting engine
- Takedown high-volume → Cloudflare Workers `rocspace` + Tailscale exit-node
- Presentasi ke client → Aperture buat demo secure tanpa expose infra asli

---

Created by rocagents / AuroRa-x / termux-rocd — sync-ready.
