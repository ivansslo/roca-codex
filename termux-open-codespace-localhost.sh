#!/data/data/com.termux/files/usr/bin/bash
# Forward localhost dari GitHub Codespace ke Android/Termux lalu buka browser Android.
# Default port Vite/codex-web: 5173
#
# Cara pakai di Termux:
#   curl -L -o termux-open-codespace-localhost.sh https://raw.githubusercontent.com/ivansslo/codex-web/main/termux-open-codespace-localhost.sh
#   chmod +x termux-open-codespace-localhost.sh
#   ./termux-open-codespace-localhost.sh
#
# Custom port:
#   REMOTE_PORT=3000 LOCAL_PORT=3000 ./termux-open-codespace-localhost.sh

set -euo pipefail

CODESPACE_NAME="${CODESPACE_NAME:-codex-web-termux-jjwrqxjpr577cw94}"
REPO="${REPO:-ivansslo/codex-web}"
REMOTE_PORT="${REMOTE_PORT:-5173}"
LOCAL_PORT="${LOCAL_PORT:-$REMOTE_PORT}"
LOCAL_URL="http://127.0.0.1:${LOCAL_PORT}"

info() { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

if command -v pkg >/dev/null 2>&1; then
  info "Memastikan dependency Termux tersedia..."
  pkg update -y
  pkg install -y gh openssh termux-api || pkg install -y gh openssh
fi

if ! command -v gh >/dev/null 2>&1; then
  err "GitHub CLI belum terinstall. Jalankan: pkg install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  err "Belum login GitHub CLI. Jalankan: gh auth login atau export GH_TOKEN lalu gh auth login --with-token"
  exit 1
fi

if ! gh codespace list --repo "$REPO" --json name --jq '.[].name' | grep -Fxq "$CODESPACE_NAME"; then
  err "Codespace tidak ditemukan: ${CODESPACE_NAME}"
  gh codespace list --repo "$REPO"
  exit 1
fi

info "Pastikan server di Codespace sudah jalan, contoh di terminal Codespace:"
info "  cd /workspaces/codex-web && npm run dev -- --host 0.0.0.0"
info "Forward remote port ${REMOTE_PORT} -> Android localhost ${LOCAL_PORT}"

# Matikan forward lama untuk port yang sama jika ada.
pkill -f "gh codespace ports forward ${REMOTE_PORT}:${LOCAL_PORT}.*${CODESPACE_NAME}" >/dev/null 2>&1 || true

LOG_FILE="${TMPDIR:-/tmp}/codespace-port-${REMOTE_PORT}-${LOCAL_PORT}.log"
nohup gh codespace ports forward "${REMOTE_PORT}:${LOCAL_PORT}" -c "$CODESPACE_NAME" >"$LOG_FILE" 2>&1 &
FORWARD_PID="$!"

sleep 3
if ! kill -0 "$FORWARD_PID" >/dev/null 2>&1; then
  err "Gagal start port forward. Log:"
  cat "$LOG_FILE" >&2 || true
  exit 1
fi

info "Port forward aktif. PID: ${FORWARD_PID}"
info "Buka di browser Android: ${LOCAL_URL}"

if command -v termux-open-url >/dev/null 2>&1; then
  termux-open-url "$LOCAL_URL" || true
else
  warn "termux-open-url tidak tersedia. Copy link ini ke browser Android: ${LOCAL_URL}"
fi

info "Biarkan Termux/session ini tetap hidup selama browser dipakai."
info "Untuk stop forward: kill ${FORWARD_PID}"
