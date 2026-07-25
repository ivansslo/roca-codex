# Fix: IP Beda 100.100.237.104 + Error `tailscale up` Requires --reset + tskey-api-

> Screenshots baru: roadfx = 100.100.237.104 (roadfx.tail759f3e.ts.net) hijau Ready, bisa ping. Tapi terminal `root@localhost` error pakai `tskey-api-...`

## Analisis Screenshot

**Screenshot 1 & 2:**
- `roadfx` ✅ Connected (green dot)
- Tailscale IPv4: `100.100.237.104` (baru, sebelumnya 100.93.139.73)
- Full domain: `roadfx.tail759f3e.ts.net`
- Relays: Frankfurt 1.03 ms paling cepat → Aperture node kamu running di EU Frankfurt region (18.192.206.183:20523)
- Artinya authorize sukses, instance Ready.

**Screenshot 3 (terminal root@localhost):**
Log penting:
```
Error: changing settings via 'tailscale up' requires mentioning all non-default flags.
To proceed, either re-run your command with --reset or use command below:
tailscale up --accept-routes --auth-key=tskey-api-kySNreSbw421CNTRL-VPMdhJHZ... --hostname=ubuntu --advertise-exit-node

control: RegisterReq ... machineAuthorized=false; authURL=true
AuthURL is https://login.tailscale.com/a/26fb9303878bc
```

2 masalah:
1. Pakai `tskey-api-...` bukan `tskey-auth-...` → API key tidak bisa untuk join node. Admin console akan minta authorize via browser → `machineAuthorized=false` + kasih authURL.
2. Tailscale butuh `--reset` kalau ganti flags setelah pernah `up` sebelumnya.

## Fix Langsung (di OCI / Ubuntu yang di screenshot)

### Langkah 1: Generate Auth Key yang benar

Buka https://login.tailscale.com/admin/settings/keys → **Generate auth key**
- Description: `oci-ubuntu-ivanssl`
- Reusable: ON (biar bisa pakai lagi buat Termux)
- Ephemeral: OFF
- Tags: `tag:oci` (opsional)
- Expiration: 90 days

Copy `tskey-auth-kAAA...` (bentuk `tskey-auth-...` bukan `tskey-api-...`)

> `tskey-api-...` di .env kamu itu cuma untuk Tailscale API control (list machines via curl). Jangan dipakai di `tailscale up`.

### Langkah 2: Authorize node yang pending authURL

Buka di browser (HP atau Aperture): https://login.tailscale.com/a/26fb9303878bc → Approve → harusnya node `ubuntu` muncul di Machines.

Atau langsung re-run dengan key baru + --reset (akan re-auth):

```bash
# di root@localhost (OCI)
tailscale logout  # optional, bersihkan state lama
rm -rf /var/lib/tailscale/tailscaled.state

# start daemon kalau belum
systemctl enable --now tailscaled 2>/dev/null || tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock > /var/log/tailscaled.log 2>&1 &

# JOIN dengan key yang benar + --reset
TAILSCALE_AUTH_KEY=tskey-auth-XXXXX
tailscale up --reset --auth-key=$TAILSCALE_AUTH_KEY --hostname=ubuntu-oci --advertise-exit-node --advertise-routes=10.0.0.0/16 --accept-routes --ssh

# cek
tailscale status
tailscale ip -4
tailscale ping 100.100.237.104
```

Setelah itu di admin console, enable:
- Machine settings `ubuntu-oci` → **Edit route settings** → Approve `10.0.0.0/16` + **Use as exit node** → Save
- Machine settings `roadfx` → Disable key expiry

### Langkah 3: Update IP di semua script

IP lama `100.93.139.73` → baru `100.100.237.104` (roadfx Aperture). Kalau OCI VM kamu punya IP tailnet beda lagi (misal 100.108.25.43 dari log `peerapi: serving on http://100.108.25.43:47886`), catat IP itu sebagai OCI.

Di rocagents sudah saya update:
- `.env` TAILSCALE_IP=100.100.237.104
- `termux-rocd/oci-default-shell.sh` default ke 100.100.237.104

Di Termux, override kalau perlu:
```bash
export OCI_TS_IP=100.100.237.104
# atau kalau OCI asli beda:
export OCI_TS_IP=100.108.25.43
```

### Langkah 4: Termux jadi default shell (final)

```bash
# di Termux HP
pkg install tailscale mosh autossh -y
# join tailnet pakai auth key yang SAMA reusable
tailscale up --auth-key=tskey-auth-XXXXX --hostname=termux-ivan --accept-routes

# test
tailscale status
ping 100.100.237.104
tailscale ping 100.100.237.104
ssh ubuntu@100.100.237.104  # atau ubuntu-oci.tail759f3e.ts.net

# pasang default shell
curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/oci-default-shell.sh | bash
touch ~/.oci-default-shell-enabled
# restart Termux
```

### Langkah 5: Tunnel Ollama

```bash
# Termux tab 1
oci-tunnel
# atau manual:
autossh -M 0 -L 11434:127.0.0.1:11434 ubuntu@100.100.237.104 -N

# Termux tab 2
curl http://127.0.0.1:11434/api/tags
```

### Langkah 6: Verifikasi via rocagents

Kalau rocagents running di Termux atau laptop:
```
curl http://localhost:3000/api/tailscale/status
curl http://localhost:3000/api/aperture/status
```

Harusnya `roadfx` status Connected, `ubuntu-oci` juga Connected, relays Frankfurt 1.03ms.

## Kenapa IP Berubah?

Tailscale IP dynamic per node join. Setiap kali node baru join (re-auth / logout) bisa dapat IP baru di range `100.64.0.0/10`. 
- Lama: 100.93.139.73 (mungkin OCI lama)
- Baru: 100.100.237.104 (roadfx Aperture Frankfurt)
- Di log terminal kamu juga ada 100.108.25.43 (peerapi) — itu mungkin IP tailnet OCI ubuntu node baru kamu.

Solusi: pakai MagicDNS domain `roadfx.tail759f3e.ts.net` dan `ubuntu-oci.tail759f3e.ts.net` biar tidak tergantung IP.

## Next?

Setelah ini:
1. Enable HTTPS: Admin → DNS → Enable MagicDNS + Enable HTTPS → akses https://roadfx.tail759f3e.ts.net
2. Setup Tailscale SSH: `tailscale ssh ubuntu@ubuntu-oci` tanpa password
3. Pakai Aperture browser untuk akses private `http://100.100.237.104:11434` atau `http://ubuntu-oci:11434`
4. Lanjut integrasi Termux default shell → saya sudah commit update IP.

