# Tailscale di Ubuntu Container — Next Steps (Kamu Sudah di Tahap Running)

> Log screenshot: `Switching ipn state Starting → Running`, `magicsock: derp-3 connected`, `derp-3 (sin)` Singapore, endpoints changed... `root@localhost:~#`

## Status Saat Ini ✅

- `tailscaled` sudah jalan (userspace / proot mode)
- DERP Singapore `derp-3 (sin)` connected dengan `cr0s,wr0s` (read+write)
- Netmap saved to disk cache
- Warning `ip rule deleted; failed to parse netlink message attribute 20` → **NORMAL** di container tanpa `NET_ADMIN` / kernel lama Helio P60 OPPO CPH1823. Abaikan saja, traffic tetap jalan via DERP relay (bukan direct P2P, latency sedikit naik tapi tetap bisa ping/ssh).

## Step 1 — Cek IP & Status (Wajib di container itu)

```bash
# di root@localhost ubuntu container
tailscale status
tailscale ip -4
tailscale ip -6
tailscale ping 100.100.237.104
tailscale ping roadfx.tail759f3e.ts.net
```

Harusnya keluar IP baru untuk container ini, contoh `100.108.25.43` dari log `peerapi serving on http://100.108.25.43:47886` itu tadi adalah IP tailnet container kamu yang terbaru.

Catat:
- `100.xxx` itu = container ubuntu
- `100.100.237.104` = roadfx Aperture Frankfurt
- `100.xxx` lain = termux host nanti

## Step 2 — Fix Stabil Biar Tidak Error Netlink Lagi

Kalau mau hilangin warning `invalid route message`, pakai userspace mode murni:

```bash
# kill daemon lama
pkill tailscaled
rm -rf /run/tailscale/tailscaled.sock

mkdir -p /var/lib/tailscale /run/tailscale
nohup tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --socks5-server=localhost:1055 --outbound-http-proxy-listen=localhost:1055 > /var/log/tailscaled.log 2>&1 &

sleep 3
tailscale up --reset --auth-key=tskey-auth-XXXX --hostname=ubuntu-oci-roc --advertise-exit-node --ssh --accept-routes

tailscale status
```

Mode ini tidak butuh `ip rule` / `iptables`, cocok untuk rocd/proot.

## Step 3 — Approve di Admin Console

Buka https://login.tailscale.com/admin/machines
- Cari `ubuntu-oci-roc` / `ubuntu` / IP `100.108.25.43` yang baru
- Klik `...` → **Disable key expiry**
- **Edit route settings** → Approve exit node + approve subnet routes `10.0.0.0/16` (kalau ada)
- Enable **Exit node**

## Step 4 — Koneksikan Termux Host ke Container

Sekarang container sudah di tailnet, Termux host (di luar container) juga join tailnet yang sama:

```bash
# Keluar dari container: exit
# Sekarang di Termux host (bukan di root@localhost)
pkg install tailscale mosh autossh -y

# jalankan
nohup tailscaled --tun=userspace-networking --state=$HOME/.tailscale.state --socket=$HOME/.tailscale.sock > $HOME/tailscaled.log 2>&1 &
sleep 2

# pakai auth key yang SAMA reusable
tailscale up --auth-key=tskey-auth-XXXX --hostname=termux-ivan --accept-routes

tailscale status
# harusnya keliatan 3 nodes: roadfx (100.100.237.104), ubuntu-oci (100.108.x.x), termux-ivan (100.x.x.x)

# test ping dari TERMUX HOST ke CONTAINER
tailscale ping 100.108.25.43
ping 100.108.25.43

# test SSH dari TERMUX HOST ke CONTAINER via Tailscale
ssh root@100.108.25.43
# atau kalau user ubuntu:
ssh ubuntu@100.108.25.43

# test Tailscale SSH (tanpa password)
tailscale ssh root@ubuntu-oci-roc
```

## Step 5 — Jadikan Ubuntu Container Sebagai Default Shell Termux

Ini yang kamu mau dari awal: buka Termux langsung masuk ubuntu container via Tailscale.

Opsi A — Simple SSH auto (recommended sekarang):

```bash
# di Termux host
cat >> ~/.bashrc <<'EOF'

# >>> OCI UBUNTU CONTAINER DEFAULT SHELL >>>
export OCI_TS_IP="100.108.25.43"
# fallback ke roadfx kalau container offline
export ROADFX_IP="100.100.237.104"

oci_container_shell() {
  local ip=$OCI_TS_IP
  if ! tailscale ping --c=1 --timeout=3s $ip >/dev/null 2>&1; then
    echo "⚠️ Container $ip unreachable, trying roadfx $ROADFX_IP..."
    ip=$ROADFX_IP
  fi
  echo "🚀 Connecting to ubuntu container $ip..."
  ssh -o ServerAliveInterval=20 -t root@$ip "bash -l" || ssh -t ubuntu@$ip "bash -l"
}

# Auto jika flag ada
if [[ $- == *i* ]] && [[ -z "$OCI_ALREADY" ]] && [[ -f "$HOME/.oci-default-shell-enabled" ]]; then
  export OCI_ALREADY=1
  oci_container_shell
fi
# <<< OCI UBUNTU CONTAINER DEFAULT SHELL <<<
EOF

touch ~/.oci-default-shell-enabled
```

Restart Termux → harusnya langsung masuk container.

Opsi B — Pakai `rocd` wrapper yang sudah saya buat:

```bash
# di Termux host
bash termux-rocd/oci-default-shell.sh --install
# edit manual IP di ~/bin/oci-shell kalau perlu
nano ~/bin/oci-shell
# ganti IP ke 100.108.25.43

rocd oci   # ssh ke container
```

## Step 6 — Tunnel Ollama / RocSpace Model

Biar dari Termux host bisa akses model di container:

```bash
# di ubuntu container, pastikan ollama jalan di 0.0.0.0:11434
docker ps | grep ollama || systemctl status ollama || curl http://127.0.0.1:11434/api/tags

# di Termux host, tunnel
autossh -M 0 -L 11434:127.0.0.1:11434 root@100.108.25.43 -N -f
curl http://127.0.0.1:11434/api/tags
# harusnya keluar rocspace-initial
```

Sekarang `rocagents` di Termux bisa pakai `http://127.0.0.1:11434` sebagai provider OCI.

## Step 7 — Aperture Integration Test

Dari browser Aperture `roadfx.tail759f3e.ts.net` (yang sudah Ready), coba buka:

- `http://100.108.25.43:11434` → Ollama di ubuntu container
- `http://100.108.25.43:22` → via web SSH? Atau pakai Tailscale SSH
- `http://100.100.237.104` → roadfx self

Kalau bisa → kamu punya isolated browser untuk investigasi tanpa expose publik.

## Troubleshooting Log yang di Screenshot

```
logtail: upload failed ... read: software caused connection abort
control: lite map update error ... read tcp ... software caused connection abort
monitor: ip rule deleted; failed to parse netlink message: invalid route message attributes: attribute 20 is not a uint8
```

Itu semua karena container tanpa `NET_ADMIN` capability + kernel Android yang strip `rtnetlink`. Fix:

- Pakai `--tun=userspace-networking` (sudah dijelaskan step 2)
- Atau jalankan container dengan `--privileged` / `--cap-add=NET_ADMIN` kalau pakai docker di OCI host (bukan di Termux)
- Di Termux proot, memang tidak bisa fix kernel, jadi userspace mode adalah solusi resmi dari Tailscale: https://tailscale.com/kb/1112/userspace-networking

Jadi abaikan, selama `derp-3 connected` dan `ipn state Running`, itu sudah OK.

## Checklist Akhir

- [ ] `tailscale status` di container shows Running + IP (catat 100.108.25.43)
- [ ] `tailscale ping 100.100.237.104` dari container OK
- [ ] Admin console Approve exit node untuk ubuntu container
- [ ] Termux host juga `tailscale status` OK + bisa ping container
- [ ] `ssh root@100.108.25.43` dari Termux host OK
- [ ] `touch ~/.oci-default-shell-enabled` + restart Termux → auto masuk container
- [ ] `autossh -L 11434...` + `curl 127.0.0.1:11434/api/tags` OK
- [ ] Aperture browser bisa buka `http://100.108.25.43:11434`

Kalau checklist ini centang, kamu sudah punya:
Termux (host) → default shell = ubuntu container (via Tailscale 100.108.25.43) → tunnel ke Ollama + Aperture Frankfurt 1.03ms → siap untuk demo & hunting ala Google Mandiant.

Kirim `tailscale status` dari TERMUX HOST + `tailscale ip -4` dari container kalau mau saya verifikasi.

