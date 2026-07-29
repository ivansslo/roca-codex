#!/usr/bin/env bash
# verify-rotation.sh — buktikan kredensial LAMA benar-benar sudah mati.
#
# Rotasi belum selesai saat kunci baru dibuat. Ia selesai saat kunci LAMA
# ditolak. Skrip ini menguji hal itu, satu per satu.
#
# CARA PAKAI
#   Skrip ini TIDAK membaca berkas apa pun dan TIDAK menyimpan apa pun.
#   Kamu tempel kunci lama saat diminta; ia hanya ada di memori proses ini.
#
#     bash tools/verify-rotation.sh              # menu
#     bash tools/verify-rotation.sh openai       # uji satu layanan
#
# Yang DIHARAPKAN: HTTP 401 / 403 — artinya kunci lama sudah mati.
# Yang BERBAHAYA:  HTTP 200      — kunci lama MASIH HIDUP, rotasi belum jalan.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -uo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
mati()  { printf '  %s✓ MATI%s     HTTP %s — kunci lama sudah ditolak\n' "$c_grn" "$c_rst" "$1"; }
hidup() { printf '  %s✗ HIDUP%s    HTTP %s — KUNCI LAMA MASIH BERFUNGSI, rotasi belum selesai\n' "$c_red" "$c_rst" "$1"; }
ragu()  { printf '  %s? TIDAK JELAS%s HTTP %s — periksa manual di dashboard\n' "$c_yel" "$c_rst" "$1"; }
info()  { printf '%s  %s%s\n' "$c_dim" "$*" "$c_rst"; }

command -v curl >/dev/null || { printf 'curl tidak ditemukan. Termux: pkg install curl\n' >&2; exit 1; }

# Baca rahasia tanpa menggemakan ke layar dan tanpa masuk history.
baca() {
  local prompt="$1" v
  printf '%s' "$prompt" >&2
  # Baca dari terminal bila ada, supaya ketikan tidak tergema. Kalau tidak ada
  # tty (dipipe, dijalankan dari skrip lain), jatuh ke stdin biasa — tanpa itu
  # `read </dev/tty` gagal dan fungsi mengembalikan string kosong diam-diam.
  if [ -r /dev/tty ] && [ -t 1 ]; then
    read -r -s v </dev/tty
  else
    read -r v
  fi
  printf '\n' >&2
  printf '%s' "$v"
}

nilai() {
  # Terima HTTP code, cetak putusan.
  case "$1" in
    401|403) mati "$1" ;;
    200)     hidup "$1" ;;
    000)     printf '  %s? GAGAL%s     tidak ada jaringan / timeout\n' "$c_yel" "$c_rst" ;;
    *)       ragu "$1" ;;
  esac
}

uji_openai() {
  printf '\n── 1. OpenAI ──\n'
  info 'Rotasi di: https://platform.openai.com/api-keys'
  local k; k=$(baca 'Tempel kunci OpenAI LAMA (sk-proj-... / sk-svcacct-...): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
       -H "Authorization: Bearer $k" https://api.openai.com/v1/models)
  nilai "$c"
  info 'Kamu punya 3 kunci OpenAI berbeda — uji ketiganya.'
}

uji_aiven() {
  printf '\n── 2. Aiven ──\n'
  info 'Rotasi di: https://console.aiven.io/  →  User information → Authentication tokens'
  local k; k=$(baca 'Tempel AIVEN_TOKEN LAMA: ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
       -H "Authorization: aivenv1 $k" https://api.aiven.io/v1/me)
  nilai "$c"
}

uji_cloudflare() {
  printf '\n── 3. Cloudflare ──\n'
  info 'Rotasi di: https://dash.cloudflare.com/profile/api-tokens'
  local k; k=$(baca 'Tempel token Cloudflare LAMA (cfat_/cfut_): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
       -H "Authorization: Bearer $k" https://api.cloudflare.com/client/v4/user/tokens/verify)
  nilai "$c"
  info 'Ada 5 token Cloudflare di env lamamu — uji semuanya.'
}

uji_github() {
  printf '\n── 4. GitHub ──\n'
  info 'Rotasi di: https://github.com/settings/tokens'
  local k; k=$(baca 'Tempel PAT GitHub LAMA (ghp_/github_pat_): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
       -H "Authorization: token $k" https://api.github.com/user)
  nilai "$c"
  info 'Ada 4 token GitHub berbeda di env lamamu (GITHUB_PAT x3, GHP).'
}

uji_tailscale() {
  printf '\n── 5. Tailscale ──\n'
  info 'Rotasi di: https://login.tailscale.com/admin/settings/keys'
  local k; k=$(baca 'Tempel TAILSCALE_KEY LAMA (tskey-api-...): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
       -u "$k:" https://api.tailscale.com/api/v2/tailnet/-/devices)
  nilai "$c"
  info 'Auth key (tskey-auth-...) tidak punya endpoint uji — cabut lewat dashboard,'
  info 'lalu pastikan hilang dari daftar Keys.'
}

menu() {
  cat <<'EOF'

  verify-rotation.sh — buktikan kunci LAMA sudah mati

    1  openai       2  aiven        3  cloudflare
    4  github       5  tailscale    a  semua

  Kunci hanya dibaca ke memori. Tidak ditulis ke berkas mana pun.

EOF
  printf 'Pilih [1-5/a]: '
  if [ -r /dev/tty ] && [ -t 1 ]; then read -r pil </dev/tty; else read -r pil; fi
  case "$pil" in
    1|openai)     uji_openai ;;
    2|aiven)      uji_aiven ;;
    3|cloudflare) uji_cloudflare ;;
    4|github)     uji_github ;;
    5|tailscale)  uji_tailscale ;;
    a|all|semua)  uji_openai; uji_aiven; uji_cloudflare; uji_github; uji_tailscale ;;
    *) printf 'Pilihan tidak dikenal.\n'; exit 1 ;;
  esac
}

case "${1:-}" in
  openai)     uji_openai ;;
  aiven)      uji_aiven ;;
  cloudflare) uji_cloudflare ;;
  github)     uji_github ;;
  tailscale)  uji_tailscale ;;
  all|semua)  uji_openai; uji_aiven; uji_cloudflare; uji_github; uji_tailscale ;;
  ""|menu)    menu ;;
  -h|--help)  menu ;;
  *) printf 'Tidak dikenal: %s\n' "$1"; exit 1 ;;
esac

printf '\n%s── Ingat ──%s\n' "$c_dim" "$c_rst"
printf '  MATI  = bagus, rotasi berhasil\n'
printf '  HIDUP = kunci lama masih bisa dipakai orang. Cabut sekarang juga.\n\n'
