#!/usr/bin/env bash
# Pasang tools RocAgent ke PATH — Termux atau VM Linux.
#
# Menangani hal yang panduan sebelumnya lewatkan: membuat ~/.local/bin bila
# belum ada, dan MENAMBAHKANNYA ke PATH di berkas rc shell. Tanpa langkah itu,
# `ln -sf ... ~/bin/` gagal diam-diam dan perintahnya "command not found".
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -euo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_rst=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
warn() { printf '%s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_rst" >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Deteksi lingkungan ────────────────────────────────────────────
IS_TERMUX=no
[ -d /data/data/com.termux/files/usr ] && IS_TERMUX=yes

# ~/.local/bin adalah standar XDG dan sudah dikenali banyak shell.
# ~/bin hanya otomatis di-PATH pada sebagian distro, jadi tidak diandalkan.
BIN_DIR="$HOME/.local/bin"

printf '\n── Memasang tools RocAgent ──\n'
printf '  sumber : %s\n' "$SRC_DIR"
printf '  tujuan : %s\n' "$BIN_DIR"
printf '  termux : %s\n\n' "$IS_TERMUX"

# ── 1. Dependensi ─────────────────────────────────────────────────
printf 'Memeriksa dependensi...\n'
MISSING=""
for dep in openssl od tr sed git ssh; do
  if command -v "$dep" >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$dep"
  else
    printf '  %s✗ %s%s\n' "$c_red" "$dep" "$c_rst"
    MISSING="$MISSING $dep"
  fi
done

if [ -n "$MISSING" ]; then
  printf '\n'
  warn "Dependensi kurang:$MISSING"
  if [ "$IS_TERMUX" = yes ]; then
    printf '  Pasang dengan:\n    pkg install -y openssl-tool coreutils git openssh\n\n'
  else
    printf '  Pasang dengan:\n    sudo apt install -y openssl coreutils git openssh-client\n\n'
  fi
  die "Lengkapi dependensi dulu, lalu jalankan ulang."
fi

# openssl di Termux adalah paket 'openssl-tool'; binernya kadang ada tapi
# tanpa subperintah kdf. Uji fungsi yang benar-benar dipakai rocvault.
printf '\nMenguji openssl mendukung yang dibutuhkan...\n'
if openssl kdf -keylen 32 -kdfopt digest:SHA512 -kdfopt hexsalt:aa \
     -kdfopt pass:x -kdfopt iter:1000 -binary PBKDF2 >/dev/null 2>&1; then
  ok "openssl kdf PBKDF2 ($(openssl version | cut -d' ' -f1-2))"
else
  die "openssl ada tapi tanpa subperintah 'kdf'.
  Versi terlalu lama (butuh OpenSSL 3.0+).
  Termux:  pkg install openssl-tool
  Cek:     openssl version"
fi

if openssl dgst -sha256 -mac HMAC -macopt hexkey:aabb -r </dev/null >/dev/null 2>&1; then
  ok "openssl HMAC-SHA256"
else
  die "openssl tanpa dukungan HMAC. Pasang paket openssl yang lengkap."
fi

# ── 2. Direktori tujuan ───────────────────────────────────────────
printf '\n'
if [ -d "$BIN_DIR" ]; then
  ok "$BIN_DIR sudah ada"
else
  mkdir -p "$BIN_DIR" && ok "Membuat $BIN_DIR"
fi

# ── 3. Symlink ────────────────────────────────────────────────────
printf '\nMemasang perintah...\n'
for t in rocvault rocagent-vm; do
  [ -f "$SRC_DIR/$t" ] || die "Tidak ada: $SRC_DIR/$t"
  chmod +x "$SRC_DIR/$t"
  ln -sf "$SRC_DIR/$t" "$BIN_DIR/$t"
  ok "$t -> $BIN_DIR/$t"
done

# ── 4. PATH ───────────────────────────────────────────────────────
printf '\nMemeriksa PATH...\n'
case ":$PATH:" in
  *":$BIN_DIR:"*) ok "$BIN_DIR sudah ada di PATH sesi ini" ;;
  *) warn "$BIN_DIR BELUM ada di PATH" ;;
esac

# Tulis ke berkas rc yang sesuai, dan hindari duplikat bila dijalankan ulang.
LINE="export PATH=\"\$HOME/.local/bin:\$PATH\""
MARK="# RocAgent tools"
ADDED=""
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  # Buat .bashrc bila belum ada; di Termux bersih kadang memang tidak ada.
  [ -f "$rc" ] || { [ "$rc" = "$HOME/.bashrc" ] && touch "$rc"; }
  [ -f "$rc" ] || continue
  if grep -qF "$MARK" "$rc" 2>/dev/null; then
    ok "$(basename "$rc") sudah dikonfigurasi"
  else
    printf '\n%s\n%s\n' "$MARK" "$LINE" >> "$rc"
    ok "Menambahkan PATH ke $(basename "$rc")"
    ADDED="yes"
  fi
done

# ── 5. Verifikasi ─────────────────────────────────────────────────
printf '\nVerifikasi...\n'
export PATH="$BIN_DIR:$PATH"
FAIL=0
for t in rocvault rocagent-vm; do
  if command -v "$t" >/dev/null 2>&1 && "$t" --help >/dev/null 2>&1; then
    ok "$t berjalan"
  else
    printf '  %s✗ %s gagal%s\n' "$c_red" "$t" "$c_rst"; FAIL=1
  fi
done
[ "$FAIL" -eq 0 ] || die "Verifikasi gagal."

# ── Selesai ───────────────────────────────────────────────────────
printf '\n%s── Terpasang ──%s\n\n' "$c_grn" "$c_rst"
if [ -n "$ADDED" ]; then
  printf 'PATH baru ditambahkan. Untuk sesi ini jalankan:\n\n'
  printf '  source ~/.bashrc\n\n'
  printf 'atau tutup dan buka ulang Termux.\n\n'
fi
printf 'Perintah yang tersedia:\n'
printf '  rocvault --help\n'
printf '  rocagent-vm --help\n\n'
printf 'Langkah berikutnya:\n'
printf '  1. Rotasi kredensial   -> docs/ROTASI-KREDENSIAL-URGENT.md\n'
printf '  2. Buat env bersih     -> cp docs/app.env.template ~/.config/rocagent/app.env\n'
printf '  3. Kunci               -> rocvault lock ~/.config/rocagent/app.env\n\n'
