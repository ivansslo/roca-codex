# shellcheck shell=bash
# ── RocAgent shell helpers ────────────────────────────────────────
# Pasang:  bash ~/RocAgent/tools/install-bashrc-helpers.sh
#
# Menggantikan blok "OCI DEFAULT SHELL" lama, yang menggantung karena:
#
#   1. `tailscale ping --c=1` — flag tidak valid (yang benar `-c 1`).
#      Perintah selalu gagal, sehingga tailnet dianggap mati dan skrip
#      jatuh ke IP publik.
#   2. IP publik VM sudah tidak menerima SSH — semua port publik ditutup
#      dari Security List. Koneksi menggantung sampai timeout TCP.
#   3. Penjaganya memakai `ping`. ICMP sengaja dibiarkan terbuka untuk
#      Path MTU Discovery, jadi ping berhasil meski port 22 tertutup.
#      Yang harus diuji adalah port-nya, bukan host-nya.
#   4. `StrictHostKeyChecking=no` mematikan pemeriksaan host key. Itu
#      membuka pintu MITM pada jaringan yang tidak kamu kuasai, dan tidak
#      diperlukan sama sekali di Tailscale.

# ── Alamat ────────────────────────────────────────────────────────
# Oracle Cloud (roc-vm-x86, Singapura)
export OCI_TS_IP="100.125.151.105"
export OCI_PUBLIC_IP="161.118.213.55"      # port publik DITUTUP — rujukan saja
export OCI_USER="ubuntu"

# AWS (roadfx/awsx, EC2) -- CATATAN 2026-08-01: node ini SUDAH DIHAPUS dari
# console.tailscale.com oleh owner. IP di bawah tidak lagi menjangkau
# device manapun yang relevan (dan bisa saja didaur ulang Tailscale untuk
# device lain di masa depan -- jangan asumsikan "tidak terjangkau" berarti
# "sedang offline sementara"). Dibiarkan terisi (bukan dikosongkan) supaya
# _roc_connect di bawah tetap menguji port dan gagal dengan pesan jelas,
# bukan error variabel-kosong yang membingungkan. Isi ulang kalau ada
# node AWS pengganti.
export AWS_TS_IP="100.100.237.104"
export AWS_PUBLIC_IP="100.89.119.93"
export AWS_USER="${AWS_USER:-ubuntu}"

# ── Util ──────────────────────────────────────────────────────────
# Uji PORT, bukan host. `ping` hanya membuktikan ICMP lewat; SSH bisa
# tetap tertutup. Timeout pendek supaya tidak pernah menggantung.
_roc_port_open() {
  local host="$1" port="${2:-22}" t="${3:-4}"
  # `timeout N bash -c "</dev/tcp/..."` saja tidak cukup: pada alamat yang
  # di-blackhole, timeout mengembalikan 124 tetapi sebagian shell menelannya.
  # Periksa exit code secara eksplisit — 124 berarti waktu habis, bukan sukses.
  timeout "$t" bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
  local rc=$?
  [ "$rc" -eq 0 ]
}

_roc_connect() {
  local label="$1" ts="$2" pub="$3" user="$4"; shift 4

  if _roc_port_open "$ts" 22 4; then
    printf '\033[32m→\033[0m %s via Tailscale (%s)\n' "$label" "$ts"
    ssh -o ServerAliveInterval=20 -o ConnectTimeout=10 "$user@$ts" "$@"
    return
  fi

  printf '\033[33m⚠\033[0m  %s: port 22 tertutup di tailnet (%s)\n' "$label" "$ts"

  if [ -n "$pub" ] && _roc_port_open "$pub" 22 4; then
    printf '\033[33m→\033[0m %s via IP publik (%s)\n' "$label" "$pub"
    ssh -o ServerAliveInterval=20 -o ConnectTimeout=10 "$user@$pub" "$@"
    return
  fi

  printf '\033[31m✗\033[0m %s tidak terjangkau.\n' "$label"
  printf '    Periksa:  tailscale status\n'
  printf '    Sambungkan:  tailscale up\n'
  [ -n "$pub" ] && printf '    (IP publik %s memang ditutup — akses lewat tailnet)\n' "$pub"
  return 1
}

# ── Perintah ──────────────────────────────────────────────────────
# oci_vm [perintah...]   tanpa argumen = shell interaktif ke VM Oracle
#
# Bukan bernama `oci` dengan sengaja: `oci` adalah nama binary CLI resmi
# Oracle Cloud (lihat github.com/ivansslo/termuxrd-cloud, terpasang lewat
# scripts/termux-oci-cli.sh). Kalau helper ini juga memakai nama `oci`,
# fungsi shell ini akan menutupi (shadow) binary aslinya di PATH — siapa
# pun yang mengetik `oci compute instance list` akan tanpa sadar memanggil
# SSH ke VM ini alih-alih CLI Oracle yang sesungguhnya. Ditemukan 2026-08-01
# saat kedua repo dipakai bersamaan di Termux yang sama.
oci_shell() { _roc_connect "OCI" "$OCI_TS_IP" "$OCI_PUBLIC_IP" "$OCI_USER" "$@"; }
oci_vm()    { oci_shell "$@"; }

# aws_shell [perintah...]
aws_shell() { _roc_connect "AWS" "$AWS_TS_IP" "$AWS_PUBLIC_IP" "$AWS_USER" "$@"; }
awsx()      { aws_shell "$@"; }

# Status tailnet ringkas
ts() {
  # Di Android, Tailscale berjalan sebagai APLIKASI — binernya tidak ada di
  # PATH Termux. Ketiadaan perintah `tailscale` BUKAN berarti tailnet mati;
  # versi sebelumnya menyimpulkan begitu dan menyesatkan.
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "  CLI tailscale tidak ada di Termux (wajar bila memakai aplikasi Android)"
    echo "  Menguji konektivitas langsung ke port 22:"
    local h
    for h in "OCI:$OCI_TS_IP" "AWS:$AWS_TS_IP"; do
      if _roc_port_open "${h#*:}" 22 4; then
        printf '  \033[32m✓\033[0m %-4s %-16s ssh terbuka\n' "${h%%:*}" "${h#*:}"
      else
        printf '  \033[31m✗\033[0m %-4s %-16s tidak terjangkau\n' "${h%%:*}" "${h#*:}"
      fi
    done
    echo "  Status lengkap: buka aplikasi Tailscale di Android."
    return 0
  fi
  case "${1:-status}" in
    status|"")
      tailscale status 2>/dev/null | head -20
      printf '\n'
      local h
      for h in "OCI:$OCI_TS_IP" "AWS:$AWS_TS_IP"; do
        if _roc_port_open "${h#*:}" 22 3; then
          printf '  \033[32m✓\033[0m %-4s %-16s ssh terbuka\n' "${h%%:*}" "${h#*:}"
        else
          printf '  \033[31m✗\033[0m %-4s %-16s ssh tertutup\n' "${h%%:*}" "${h#*:}"
        fi
      done ;;
    up)   tailscale up ;;
    ip)   tailscale ip -4 ;;
    *)    tailscale "$@" ;;
  esac
}

# ── termuxrd-cloud ────────────────────────────────────────────────
dock() { rootd sh docker -- docker "$@"; }
dc()   { rootd sh docker -- docker compose "$@"; }

# Docker di VM Oracle lewat SSH — jalan di VM, diketik dari Termux.
odock() { docker --host "ssh://$OCI_USER@$OCI_TS_IP" "$@"; }
odc()   { docker --host "ssh://$OCI_USER@$OCI_TS_IP" compose "$@"; }

# ── RocAgent ──────────────────────────────────────────────────────
export PATH="$HOME/.local/bin:$PATH"

# roc              jalankan server dengan env dari vault
# roc <perintah>   jalankan perintah lain dengan env yang sama
roc() {
  local vault="$HOME/.config/rocagent/app.env.vault"
  [ -f "$vault" ] || { echo "Tidak ada $vault"; return 1; }
  ( cd "$HOME/RocAgent" || return 1
    if [ $# -eq 0 ]; then
      rocvault run "$vault" -- npm start
    else
      rocvault run "$vault" -- "$@"
    fi )
}

# Uji agent berlapis
roctest() { roc bash tools/test-agent.sh; }

# CATATAN: tidak ada auto-connect saat shell dibuka.
# Blok lama menjalankan SSH otomatis setiap kali Termux dibuka, dan ketika
# host tidak terjangkau shell-mu tersandera sampai timeout. Panggil `oci_vm`
# atau `awsx` saat memang diperlukan.
