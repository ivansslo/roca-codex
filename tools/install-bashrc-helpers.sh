#!/usr/bin/env bash
# Pasang helper shell RocAgent, dan lepas blok "OCI DEFAULT SHELL" lama
# yang menyebabkan Termux menggantung saat dibuka.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -euo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_rst=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
warn() { printf '%s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_rst" >&2; exit 1; }

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bashrc-helpers.sh"
[ -f "$SRC" ] || die "Tidak ada: $SRC"

DRY=no
[ "${1:-}" = "--dry-run" ] && DRY=yes

RC="$HOME/.bashrc"
MARK_BEGIN="# >>> RocAgent helpers >>>"
MARK_END="# <<< RocAgent helpers <<<"

printf '\n── Memasang helper shell RocAgent ──\n\n'
[ "$DRY" = yes ] && warn "Mode --dry-run: tidak ada yang diubah"

[ -f "$RC" ] || { [ "$DRY" = yes ] || touch "$RC"; }

# ── Apa yang akan dilepas ────────────────────────────────────────
HAS_OCI=no
if grep -q "OCI DEFAULT SHELL" "$RC" 2>/dev/null; then
  HAS_OCI=yes
  warn "Blok 'OCI DEFAULT SHELL' lama ditemukan — akan dilepas"
  printf '    Alasan: auto-connect saat shell dibuka; kalau host tidak\n'
  printf '    terjangkau, Termux menggantung sampai timeout TCP.\n\n'
fi

HAS_DUP=no
if grep -qE '^\s*(dock|dc)\s*\(\)' "$RC" 2>/dev/null; then
  HAS_DUP=yes
  warn "Definisi dock()/dc() lama ditemukan — akan dilepas (sudah ada di helper)"
fi

if grep -q "$MARK_BEGIN" "$RC" 2>/dev/null; then
  ok "Helper sudah terpasang — akan diperbarui"
fi

if [ "$DRY" = yes ]; then
  printf '\nJalankan tanpa --dry-run untuk menerapkan.\n\n'
  exit 0
fi

# ── Cadangkan ────────────────────────────────────────────────────
BACKUP="$RC.sebelum-rocagent-$(date +%Y%m%d-%H%M%S)"
cp "$RC" "$BACKUP"
ok "Cadangan: $BACKUP"

TMP=$(mktemp)
# shellcheck disable=SC2064
trap "rm -f '$TMP'" EXIT

# Buang blok lama dengan awk, bukan `sed -i /pola/d`. sed menghapus setiap
# baris yang cocok di mana pun, dan pernah merusak .bashrc pengguna.
awk -v mb="$MARK_BEGIN" -v me="$MARK_END" '
  index($0, "# >>> OCI DEFAULT SHELL >>>") { skip_oci=1; next }
  index($0, "# <<< OCI DEFAULT SHELL <<<") { skip_oci=0; next }
  skip_oci { next }

  index($0, mb) { skip_roc=1; next }
  index($0, me) { skip_roc=0; next }
  skip_roc { next }

  # dock()/dc() lama — sekarang disediakan helper
  /^[[:space:]]*(dock|dc)[[:space:]]*\(\)[[:space:]]*\{.*\}[[:space:]]*$/ { next }
  /^# termuxrd-cloud helpers[[:space:]]*$/ { next }

  # PATH duplikat dari installer sebelumnya
  /^# RocAgent tools[[:space:]]*$/ { next }
  /^export PATH="\$HOME\/\.local\/bin:\$PATH"[[:space:]]*$/ { next }

  { print }
' "$RC" > "$TMP"

# Rapikan baris kosong beruntun di ujung
printf '%s\n%s\n%s\n' \
  "$(cat "$TMP")" \
  "$MARK_BEGIN" \
  "$(printf 'source "%s"\n%s' "$SRC" "$MARK_END")" > "$TMP.new"
mv "$TMP.new" "$TMP"

# ── Validasi sebelum menimpa ─────────────────────────────────────
if ! bash -n "$TMP" 2>/dev/null; then
  die "Hasil suntingan bukan skrip shell yang sah. $RC TIDAK diubah.
  Cadangan: $BACKUP"
fi

# Uji sourcing benar-benar berhasil di subshell bersih
if ! bash --norc -c "set -e; source '$TMP' >/dev/null 2>&1; type oci_shell >/dev/null" 2>/dev/null; then
  die "Sourcing hasil gagal. $RC TIDAK diubah.
  Cadangan: $BACKUP"
fi

cp "$TMP" "$RC"
[ "$HAS_OCI" = yes ] && ok "Blok OCI lama dilepas"
[ "$HAS_DUP" = yes ] && ok "dock()/dc() duplikat dilepas"
ok "Helper terpasang (source dari $SRC)"

# ── Ringkasan ────────────────────────────────────────────────────
printf '\n%s── Terpasang ──%s\n\n' "$c_grn" "$c_rst"
printf 'Muat sekarang:\n  source ~/.bashrc\n\n'
printf 'Perintah:\n'
printf '  %-12s %s\n' "oci"      "SSH ke VM Oracle (uji port dulu, tidak menggantung)"
printf '  %-12s %s\n' "awsx"     "SSH ke node AWS roadfx"
printf '  %-12s %s\n' "ts"       "status tailnet + cek port 22 tiap host"
printf '  %-12s %s\n' "dock"     "docker di container rootd (lokal)"
printf '  %-12s %s\n' "dc"       "docker compose lokal"
printf '  %-12s %s\n' "odock"    "docker DI VM Oracle lewat SSH"
printf '  %-12s %s\n' "odc"      "docker compose di VM Oracle"
printf '  %-12s %s\n' "roc"      "jalankan RocAgent dengan env dari vault"
printf '  %-12s %s\n' "roctest"  "uji agent berlapis"
printf '\n'
warn "Auto-connect saat shell dibuka SENGAJA dihilangkan."
printf '    Panggil %s atau %s ketika memang perlu.\n\n' "'oci'" "'awsx'"
