#!/usr/bin/env bash
# Lepas auto-launch container Ubuntu dari startup Termux.
#
# LATAR
#   Pemasang `termux-rocd` lama menambahkan blok ini ke ~/.bashrc:
#
#       # Safe auto-launch ubuntu container on Termux startup via native rocd engine
#       if [ -t 0 ] && [ -x "$PREFIX/bin/ubuntu" ] && [ -z "$UBUNTU_ACTIVE" ]; then
#         export UBUNTU_ACTIVE=1
#         ubuntu || echo "⚠️ Container exited. Retaining Termux host session."
#       fi
#
#   Akibatnya setiap `source ~/.bashrc` atau buka Termux langsung masuk ke
#   container. Container itu dijalankan oleh `rocd` — rebranding proot-distro
#   yang repo-nya sudah dihapus — dan rootfs-nya rusak, sehingga muncul:
#
#       ls: cannot access '.': Not a directory
#
#   RocAgent tidak membutuhkan container ini. Server berjalan native di Termux.
#
# Skrip ini TIDAK menghapus rootfs. Ia hanya melepas hook startup, dan
# mencadangkan .bashrc lebih dulu.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -euo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
warn() { printf '%s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
info() { printf '%s  %s%s\n' "$c_dim" "$*" "$c_rst"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_rst" >&2; exit 1; }

DRY_RUN=no
[ "${1:-}" = "--dry-run" ] && DRY_RUN=yes

printf '\n── Melepas auto-launch Ubuntu dari startup Termux ──\n\n'
[ "$DRY_RUN" = yes ] && warn "Mode --dry-run: tidak ada yang diubah"

FOUND=0

for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.bash_profile"; do
  [ -f "$rc" ] || continue

  # Cari penanda hook. Beberapa pola, karena versi installer berbeda-beda.
  if ! grep -qE 'auto-launch ubuntu|UBUNTU_ACTIVE|Entering Ubuntu Container' "$rc" 2>/dev/null; then
    continue
  fi

  FOUND=1
  printf '%sDitemukan di %s:%s\n' "$c_yel" "$rc" "$c_rst"
  grep -nE 'auto-launch ubuntu|UBUNTU_ACTIVE|^\s*ubuntu\s*\|\||Entering Ubuntu' "$rc" | sed 's/^/    /'
  echo

  [ "$DRY_RUN" = yes ] && continue

  BACKUP="$rc.sebelum-unhook-$(date +%Y%m%d-%H%M%S)"
  cp "$rc" "$BACKUP"
  ok "Cadangan: $BACKUP"

  # Hapus blok utuh, dari baris komentar sampai `fi` penutupnya.
  # awk lebih aman daripada `sed -i '/ubuntu/d'` yang dipakai installer lama —
  # perintah itu menghapus SETIAP baris yang memuat kata "ubuntu", dan pernah
  # merusak .bashrc pengguna (5 dari 9 baris hilang).
  awk '
    /# Safe auto-launch ubuntu container/ { skip=1; next }
    skip && /^fi[[:space:]]*$/            { skip=0; next }
    skip                                   { next }
    { print }
  ' "$rc" > "$rc.tmp"

  # Sapu sisa baris tunggal bila blok ditulis dengan format berbeda.
  grep -vE '^[[:space:]]*export UBUNTU_ACTIVE=1[[:space:]]*$' "$rc.tmp" > "$rc.tmp2"
  mv "$rc.tmp2" "$rc.tmp"

  # Verifikasi hasilnya masih shell yang sah sebelum menimpa berkas asli.
  if bash -n "$rc.tmp" 2>/dev/null; then
    mv "$rc.tmp" "$rc"
    ok "Hook dilepas dari $(basename "$rc")"
  else
    rm -f "$rc.tmp"
    die "Hasil suntingan tidak valid sebagai skrip shell. $rc TIDAK diubah.
  Cadangan tetap ada di $BACKUP. Silakan sunting manual."
  fi

  if grep -qE 'auto-launch ubuntu|UBUNTU_ACTIVE' "$rc" 2>/dev/null; then
    warn "Masih ada sisa di $rc — periksa manual:"
    grep -nE 'auto-launch ubuntu|UBUNTU_ACTIVE' "$rc" | sed 's/^/    /'
  fi
  echo
done

if [ "$FOUND" -eq 0 ]; then
  ok "Tidak ada hook auto-launch. Startup Termux sudah bersih."
  echo
  exit 0
fi

[ "$DRY_RUN" = yes ] && { printf '\nJalankan tanpa --dry-run untuk benar-benar melepas.\n\n'; exit 0; }

printf '%s── Selesai ──%s\n\n' "$c_grn" "$c_rst"
printf 'Buka ulang Termux, atau jalankan:\n\n'
printf '  exec bash -l\n\n'
printf 'Kamu akan tetap berada di shell Termux, tidak masuk container.\n\n'

info "Perintah 'ubuntu' dan 'rocd' TIDAK dihapus — kamu masih bisa"
info "memanggilnya manual bila suatu saat perlu."
echo
info "Rootfs container juga tidak disentuh. Untuk melihat pemakaian ruang:"
info "  du -sh \$PREFIX/var/lib/proot-distro/installed-rootfs/* 2>/dev/null"
echo
