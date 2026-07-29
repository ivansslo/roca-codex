#!/usr/bin/env bash
# recover-env.sh — cari sisa berkas .env setelah shred.
#
# Jalankan ini SEBELUM melakukan apa pun yang menulis ke disk.
#
# KENYATAAN YANG HARUS DITERIMA
#   `shred -u` menimpa isi berkas lalu menghapusnya. Berkas itu sendiri TIDAK
#   bisa dikembalikan — tidak ada undelete, tidak ada tool pemulihan. Itu memang
#   tujuannya dibuat.
#
#   Yang dicari skrip ini bukan berkas yang di-shred, melainkan SALINANNYA yang
#   mungkin tertinggal di tempat lain: vault hasil enkripsi, berkas sementara,
#   cadangan editor, atau salinan di direktori lain.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -uo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
ok()    { printf '  %s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
warn()  { printf '  %s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
bad()   { printf '  %s✗%s %s\n' "$c_red" "$c_rst" "$*"; }
head2() { printf '\n%s── %s ──%s\n' "$c_dim" "$*" "$c_rst"; }

CFG="$HOME/.config/rocagent"
FOUND_ANY=0

printf '\n══ Mencari sisa berkas .env ══\n'

# ── 1. Vault: yang paling mungkin menyelamatkan ──────────────────
head2 "1. Berkas vault (hasil rocvault lock)"
shopt -s nullglob
vaults=("$CFG"/*.vault)
shopt -u nullglob
if [ ${#vaults[@]} -gt 0 ]; then
  for v in "${vaults[@]}"; do
    ok "$(basename "$v")  ($(wc -c <"$v") byte, $(date -r "$v" '+%Y-%m-%d %H:%M'))"
    FOUND_ANY=1
  done
  printf '\n'
  printf '  Kalau vault-nya ada, isinya UTUH. Buka dengan:\n'
  printf '    rocvault unlock %s/cloud.env.vault %s/cloud.env\n' "$CFG" "$CFG"
else
  bad "Tidak ada berkas .vault di $CFG"
  printf '    Artinya rocvault lock tidak pernah berhasil untuk berkas itu.\n'
fi

# ── 2. Cadangan .vault.bak dari rocvault rotate ──────────────────
head2 "2. Cadangan vault (.vault.bak)"
shopt -s nullglob
baks=("$CFG"/*.vault.bak)
shopt -u nullglob
if [ ${#baks[@]} -gt 0 ]; then
  for b in "${baks[@]}"; do ok "$(basename "$b")"; FOUND_ANY=1; done
else
  printf '  tidak ada\n'
fi

# ── 3. Berkas sementara rocvault ─────────────────────────────────
head2 "3. Berkas sementara rocvault"
tmps=$(find /dev/shm /tmp "$CFG" -maxdepth 1 \
        \( -name 'rocvault.*' -o -name '.app.env.*' -o -name '.cloud.env.*' -o -name '.personal.env.*' \) \
        2>/dev/null)
if [ -n "$tmps" ]; then
  printf '%s\n' "$tmps" | while read -r t; do
    ok "$t  ($(wc -c <"$t" 2>/dev/null) byte)"
  done
  FOUND_ANY=1
  warn "Berkas ini PLAINTEXT. Salin isinya, lalu shred setelah selesai."
else
  printf '  tidak ada\n'
fi

# ── 4. Cadangan editor ───────────────────────────────────────────
head2 "4. Cadangan editor (nano/vim)"
eds=$(find "$CFG" "$HOME" -maxdepth 2 \
       \( -name '*.env~' -o -name '*.env.swp' -o -name '.*.env.swp' -o -name '*.env.save' -o -name '*.env.bak' \) \
       2>/dev/null | head -20)
if [ -n "$eds" ]; then
  printf '%s\n' "$eds" | while read -r e; do ok "$e"; done
  FOUND_ANY=1
  printf '  nano menyimpan .save saat crash; vim menyimpan .swp.\n'
else
  printf '  tidak ada\n'
fi

# ── 5. Salinan .env di tempat lain ───────────────────────────────
head2 "5. Berkas .env lain di sistem"
others=$(find "$HOME" -maxdepth 4 -name '*.env' -not -path '*/node_modules/*' \
          -not -path '*/.git/*' 2>/dev/null | head -20)
if [ -n "$others" ]; then
  printf '%s\n' "$others" | while read -r o; do
    printf '  %s  (%s byte, %s)\n' "$o" "$(wc -c <"$o" 2>/dev/null)" "$(date -r "$o" '+%m-%d %H:%M' 2>/dev/null)"
  done
  FOUND_ANY=1
else
  printf '  tidak ada\n'
fi

# ── 6. /sdcard ───────────────────────────────────────────────────
if [ -d /sdcard ]; then
  head2 "6. /sdcard"
  sd=$(find /sdcard -maxdepth 2 -name '*.env' 2>/dev/null | head -10)
  if [ -n "$sd" ]; then
    printf '%s\n' "$sd" | while read -r f; do warn "$f"; done
    FOUND_ANY=1
    warn "/sdcard bisa dibaca aplikasi lain — pindahkan, jangan biarkan di sana."
  else
    printf '  tidak ada\n'
  fi
fi

# ── 7. Riwayat shell ─────────────────────────────────────────────
head2 "7. Nilai yang mungkin tertinggal di riwayat shell"
hits=0
for h in "$HOME/.bash_history" "$HOME/.zsh_history"; do
  [ -f "$h" ] || continue
  n=$(grep -cE 'AVNS_|napi_|cfat_|cfut_|mongodb\+srv|postgresql://' "$h" 2>/dev/null || true)
  if [ "${n:-0}" -gt 0 ]; then
    ok "$(basename "$h"): $n baris memuat pola kredensial"
    printf '    Lihat:  grep -nE "AVNS_|napi_|cfat_|mongodb\\+srv" %s\n' "$h"
    hits=1; FOUND_ANY=1
  fi
done
[ "$hits" -eq 0 ] && printf '  tidak ada\n'

# ── Kesimpulan ───────────────────────────────────────────────────
printf '\n══ Kesimpulan ══\n\n'
if [ "$FOUND_ANY" -eq 1 ]; then
  printf '  Ada sisa yang bisa diperiksa di atas. Mulai dari vault (bagian 1).\n\n'
else
  bad "Tidak ada sisa ditemukan."
  printf '\n'
  printf '  shred memang tidak bisa dibatalkan. Berkasnya hilang.\n\n'
  printf '  Kabar baiknya: cloud.env berisi RUJUKAN ke kredensial, bukan\n'
  printf '  satu-satunya salinannya. Semua nilai itu masih ada di dashboard\n'
  printf '  masing-masing penyedia, dan bisa dibuat ulang:\n\n'
  printf '    OCI         ~/.oci/config (cek dulu, mungkin masih utuh)\n'
  printf '    Cloudflare  dash.cloudflare.com/profile/api-tokens -> Roll\n'
  printf '    Aiven       console.aiven.io -> Authentication -> Generate\n'
  printf '    Neon        console.neon.tech -> Settings -> API keys\n'
  printf '    MongoDB     cloud.mongodb.com -> Database Access -> Edit\n'
  printf '    Tailscale   alamat IP saja, bukan rahasia\n\n'
  printf '  Susun ulang dari template:\n'
  printf '    cp docs/cloud.env.template %s/cloud.env\n' "$CFG"
  printf '    chmod 600 %s/cloud.env\n\n' "$CFG"
fi

printf '%s  Jangan tulis apa pun ke disk sampai selesai memeriksa —%s\n' "$c_dim" "$c_rst"
printf '%s  menulis berkas baru bisa menimpa blok yang belum tertimpa.%s\n\n' "$c_dim" "$c_rst"
