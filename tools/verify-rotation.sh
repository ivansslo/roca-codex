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

# Menilai HANYA dari HTTP code tidak cukup.
#
# OpenAI mengembalikan 401 untuk DUA kondisi yang sangat berbeda:
#   - kunci dicabut/salah      -> code "invalid_api_key"      = MATI
#   - kunci HIDUP, izin kurang -> code "insufficient_permissions" = MASIH HIDUP
#
# Versi awal skrip ini menyamakan keduanya dan melaporkan "MATI" untuk kunci
# yang sebenarnya masih menerima permintaan. Itu kebalikan dari tujuan alat ini.
# Karena itu body respons ikut diperiksa.
nilai() {
  local code="$1" body="${2:-}"

  # Kunci hidup tapi tidak berizin untuk endpoint ini.
  if printf '%s' "$body" | grep -qiE 'insufficient_permission|missing scopes|insufficient_quota'; then
    printf '  %s✗ MASIH HIDUP%s HTTP %s — kunci VALID, hanya kurang izin untuk endpoint ini.\n' "$c_red" "$c_rst" "$code"
    printf '               %sKunci ini belum dicabut. Cabut di dashboard.%s\n' "$c_red" "$c_rst"
    return
  fi

  case "$code" in
    200)     hidup "$code" ;;
    401|403) mati "$code" ;;
    429)     printf '  %s✗ MASIH HIDUP%s HTTP 429 — kena rate limit, artinya kunci DITERIMA.\n' "$c_red" "$c_rst" ;;
    000)     printf '  %s? GAGAL%s     tidak ada jaringan / timeout\n' "$c_yel" "$c_rst" ;;
    *)       ragu "$code" ;;
  esac
}

# Tolak placeholder supaya tidak salah lapor "MATI" karena teks contoh.
sah() {
  local k="$1"
  case "$k" in
    '<'*'>'|'{'*'}'|'KUNCI_BARU'|'KUNCI_LAMA'|*'...')
      printf '  %s✗ Itu teks contoh, bukan kunci sungguhan.%s\n' "$c_yel" "$c_rst"
      printf '    Tempel nilai aslinya (tanpa tanda < >).\n'
      return 1 ;;
  esac
  if [ "${#k}" -lt 20 ]; then
    printf '  %s✗ Terlalu pendek (%s karakter) — sepertinya bukan kunci.%s\n' "$c_yel" "${#k}" "$c_rst"
    return 1
  fi
  return 0
}

uji_openai() {
  printf '\n── 1. OpenAI ──\n'
  info 'Rotasi di: https://platform.openai.com/api-keys'
  local k; k=$(baca 'Tempel kunci OpenAI LAMA (sk-proj-... / sk-svcacct-...): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  sah "$k" || return
  local resp c b
  resp=$(curl -s -w '\n%{http_code}' --max-time 20 -H "Authorization: Bearer $k" https://api.openai.com/v1/models)
  c=$(printf '%s' "$resp" | tail -1)
  b=$(printf '%s' "$resp" | sed '$d')
  nilai "$c" "$b"
  info 'Kamu punya 3 kunci OpenAI berbeda — uji ketiganya.'
}

uji_aiven() {
  printf '\n── 2. Aiven ──\n'
  info 'Rotasi di: https://console.aiven.io/  →  User information → Authentication tokens'
  local k; k=$(baca 'Tempel AIVEN_TOKEN LAMA: ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  sah "$k" || return
  local resp c b
  resp=$(curl -s -w '\n%{http_code}' --max-time 20 -H "Authorization: aivenv1 $k" https://api.aiven.io/v1/me)
  c=$(printf '%s' "$resp" | tail -1)
  b=$(printf '%s' "$resp" | sed '$d')
  nilai "$c" "$b"
}

uji_cloudflare() {
  printf '\n── 3. Cloudflare ──\n'
  info 'Rotasi di: https://dash.cloudflare.com/profile/api-tokens'
  local k; k=$(baca 'Tempel token Cloudflare LAMA (cfat_/cfut_): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  sah "$k" || return
  local resp c b
  resp=$(curl -s -w '\n%{http_code}' --max-time 20 -H "Authorization: Bearer $k" https://api.cloudflare.com/client/v4/user/tokens/verify)
  c=$(printf '%s' "$resp" | tail -1)
  b=$(printf '%s' "$resp" | sed '$d')
  nilai "$c" "$b"
  info 'Ada 5 token Cloudflare di env lamamu — uji semuanya.'
}

uji_r2() {
  printf '\n── 3b. Cloudflare R2 (S3-compatible) ──\n'
  info 'Menguji ACCESS KEY BARU, bukan yang lama — R2 tidak punya endpoint'
  info 'verifikasi token, jadi yang bisa diuji adalah apakah kunci baru BEKERJA.'
  local akid sak acct
  akid=$(baca 'Access Key ID: ')
  [ -n "$akid" ] || { info 'dilewati'; return; }
  sak=$(baca 'Secret Access Key: ')
  acct=$(baca 'Account ID: ')
  [ -n "$sak" ] && [ -n "$acct" ] || { info 'dilewati (perlu ketiganya)'; return; }

  command -v aws >/dev/null || {
    info 'aws-cli tidak terpasang. Uji manual:'
    printf '    pip install awscli\n'
    printf '    AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \\\n'
    printf '      aws s3 ls --endpoint-url https://%s.r2.cloudflarestorage.com\n' "$acct"
    return
  }
  local out
  out=$(AWS_ACCESS_KEY_ID="$akid" AWS_SECRET_ACCESS_KEY="$sak" AWS_DEFAULT_REGION=auto \
        aws s3 ls --endpoint-url "https://$acct.r2.cloudflarestorage.com" 2>&1)
  if printf '%s' "$out" | grep -qiE 'InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied'; then
    printf '  %s✗ DITOLAK%s — kunci salah atau tidak berizin\n' "$c_red" "$c_rst"
    printf '    %s\n' "$(printf '%s' "$out" | head -1)"
  else
    printf '  %s✓ BEKERJA%s — kunci baru diterima R2\n' "$c_grn" "$c_rst"
    printf '%s' "$out" | head -5 | sed 's/^/    /'
  fi
}

uji_github() {
  printf '\n── 4. GitHub ──\n'
  info 'Rotasi di: https://github.com/settings/tokens'
  local k; k=$(baca 'Tempel PAT GitHub LAMA (ghp_/github_pat_): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  sah "$k" || return
  local resp c b
  resp=$(curl -s -w '\n%{http_code}' --max-time 20 -H "Authorization: token $k" https://api.github.com/user)
  c=$(printf '%s' "$resp" | tail -1)
  b=$(printf '%s' "$resp" | sed '$d')
  nilai "$c" "$b"
  info 'Ada 4 token GitHub berbeda di env lamamu (GITHUB_PAT x3, GHP).'
}

uji_tailscale() {
  printf '\n── 5. Tailscale ──\n'
  info 'Rotasi di: https://login.tailscale.com/admin/settings/keys'
  local k; k=$(baca 'Tempel TAILSCALE_KEY LAMA (tskey-api-...): ')
  [ -n "$k" ] || { info 'dilewati'; return; }
  sah "$k" || return
  local resp c b
  resp=$(curl -s -w '\n%{http_code}' --max-time 20 -u "$k:" https://api.tailscale.com/api/v2/tailnet/-/devices)
  c=$(printf '%s' "$resp" | tail -1)
  b=$(printf '%s' "$resp" | sed '$d')
  nilai "$c" "$b"
  info 'Auth key (tskey-auth-...) tidak punya endpoint uji — cabut lewat dashboard,'
  info 'lalu pastikan hilang dari daftar Keys.'
}

menu() {
  cat <<'EOF'

  verify-rotation.sh — buktikan kunci LAMA sudah mati

    1  openai       2  aiven        3  cloudflare   3b r2 (uji kunci BARU)
    4  github       5  tailscale    a  semua

  Kunci hanya dibaca ke memori. Tidak ditulis ke berkas mana pun.

EOF
  printf 'Pilih [1-5/a]: '
  if [ -r /dev/tty ] && [ -t 1 ]; then read -r pil </dev/tty; else read -r pil; fi
  case "$pil" in
    1|openai)     uji_openai ;;
    2|aiven)      uji_aiven ;;
    3|cloudflare) uji_cloudflare ;;
    3b|r2)        uji_r2 ;;
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
  r2)         uji_r2 ;;
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
