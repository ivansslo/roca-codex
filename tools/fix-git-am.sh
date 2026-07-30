#!/usr/bin/env bash
# fix-git-am.sh — bereskan `git am` yang tersangkut, lalu laporkan kondisi repo.
#
# Gejala:
#   fatal: previous rebase directory .git/rebase-apply still exists but mbox given.
#
# Artinya sebuah `git am` sebelumnya berhenti di tengah — biasanya karena
# konflik atau proses terputus — dan meninggalkan .git/rebase-apply. Git menolak
# memulai `am` baru sampai state itu dibereskan, supaya tidak menimpa pekerjaan
# yang belum selesai. Ini pengaman, bukan kerusakan.
#
# Skrip ini TIDAK menghapus commit apa pun. Yang dibersihkan hanya state
# `am` yang menggantung.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -uo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$c_red" "$c_rst" "$*"; }
warn() { printf '  %s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
step() { printf '\n%s── %s ──%s\n' "$c_dim" "$*" "$c_rst"; }
hint() { printf '    %s\n' "$*"; }

git rev-parse --git-dir >/dev/null 2>&1 || { bad "Bukan repo git."; exit 1; }
GD=$(git rev-parse --git-dir)

step "Kondisi saat ini"
printf '  HEAD        : %s\n' "$(git --no-pager log --oneline -1 2>/dev/null)"
printf '  branch      : %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
printf '  perubahan   : %s berkas\n' "$(git status --porcelain | wc -l)"

STUCK=no
if [ -d "$GD/rebase-apply" ]; then
  STUCK=yes
  warn "git am tersangkut (.git/rebase-apply ada)"
  if [ -f "$GD/rebase-apply/final-commit" ]; then
    printf '    Patch yang sedang diproses:\n'
    head -1 "$GD/rebase-apply/final-commit" 2>/dev/null | sed 's/^/      /'
  fi
elif [ -d "$GD/rebase-merge" ]; then
  STUCK=yes
  warn "rebase tersangkut (.git/rebase-merge ada)"
else
  ok "Tidak ada operasi tersangkut"
fi

if [ "$STUCK" = yes ]; then
  step "Membereskan"
  # --abort mengembalikan HEAD ke posisi sebelum am dimulai. Aman: commit yang
  # sudah selesai sebelumnya tidak tersentuh.
  if git am --abort 2>/dev/null || git rebase --abort 2>/dev/null; then
    ok "State dibersihkan, repo kembali ke kondisi sebelum patch"
  else
    warn "abort gagal — membersihkan direktori state secara manual"
    rm -rf "$GD/rebase-apply" "$GD/rebase-merge"
    ok "Dibersihkan"
  fi
  printf '  HEAD sekarang: %s\n' "$(git --no-pager log --oneline -1)"
fi

step "Perubahan lokal yang belum di-commit"
DIRTY=$(git status --porcelain)
if [ -z "$DIRTY" ]; then
  ok "Bersih — siap menerima patch"
else
  printf '%s\n' "$DIRTY" | sed 's/^/    /'
  echo
  # Bedakan tiga hal. Menyarankan `git checkout -- .` untuk berkas baru akan
  # keliru: perintah itu tidak menyentuhnya, dan menyiratkan kerja orang boleh
  # dibuang padahal belum tersimpan di mana pun.
  UNTRACKED=$(git ls-files --others --exclude-standard)
  CONTENT_CHANGED=no
  git diff --stat 2>/dev/null | tail -1 | grep -qE '[0-9]+ (insertion|deletion)' && CONTENT_CHANGED=yes

  if [ -n "$UNTRACKED" ]; then
    warn "Berkas baru (belum dilacak git) — TIDAK akan mengganggu git am:"
    printf '%s\n' "$UNTRACKED" | sed 's/^/      /'
    hint "Biarkan saja. 'git checkout -- .' tidak menghapusnya."
  fi

  if [ "$CONTENT_CHANGED" = yes ]; then
    warn "Ada perubahan ISI pada berkas terlacak. Pilih salah satu:"
    hint "git stash          simpan dulu, kembalikan setelah patch"
    hint "git checkout -- .  buang perubahan lokal"
  elif [ -n "$(git diff --name-only)" ]; then
    warn "Hanya perubahan mode berkas (umum di Termux) — aman dibuang:"
    hint "git checkout -- ."
  fi
fi

step "Langkah berikutnya"
printf '  1. Bersihkan  : git checkout -- .\n'
printf '  2. Terapkan   : git am <berkas.patch>\n'
printf '  3. Kalau gagal: git am --abort   lalu jalankan skrip ini lagi\n'
echo
printf '  Patch sudah pernah diterapkan? Cek dulu supaya tidak dobel:\n'
printf '    git --no-pager log --oneline -5\n'
  printf '    (--no-pager penting: di Termux pager bisa ter-suspend\n'
  printf '     dan outputnya tidak pernah tampil — terlihat seperti riwayat kosong)\n'
echo
