#!/data/data/com.termux/files/usr/bin/bash
# Login SSH dari Termux ke GitHub Codespace codex-web.
# Codespace target dibuat dengan mesin 4-core (standardLinux32gb: 4 cores, 16 GB RAM, 32 GB storage).
#
# Cara pakai di Termux:
#   pkg update -y
#   pkg install -y curl
#   curl -L -o termux-login-codespace.sh https://raw.githubusercontent.com/ivansslo/codex-web/main/termux-login-codespace.sh
#   chmod +x termux-login-codespace.sh
#   ./termux-login-codespace.sh
#
# Opsional tanpa prompt token:
#   export GH_TOKEN='ghp_xxx'
#   ./termux-login-codespace.sh

set -euo pipefail

CODESPACE_NAME="${CODESPACE_NAME:-codex-web-termux-jjwrqxjpr577cw94}"
REPO="${REPO:-ivansslo/codex-web}"
CODESPACE_WEB_URL="${CODESPACE_WEB_URL:-https://codex-web-termux-jjwrqxjpr577cw94.github.dev}"

info() { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

if ! command -v pkg >/dev/null 2>&1; then
  warn "Script ini dibuat untuk Termux. Lanjut tanpa pkg installer."
else
  info "Memastikan dependency Termux tersedia..."
  pkg update -y
  pkg install -y git openssh gh
fi

if ! command -v gh >/dev/null 2>&1; then
  err "GitHub CLI (gh) belum terinstall. Install manual dulu, lalu jalankan ulang."
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  err "openssh belum terinstall. Jalankan: pkg install openssh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  if [ -n "${GH_TOKEN:-}" ]; then
    info "Login GitHub CLI memakai GH_TOKEN dari environment..."
    printf '%s' "$GH_TOKEN" | gh auth login --with-token
  else
    warn "Belum login GitHub CLI."
    warn "Buat token GitHub dengan scope: codespace, repo, read:org (jika diminta)."
    printf 'Paste GitHub token (input disembunyikan): '
    stty -echo
    read -r TOKEN
    stty echo
    printf '\n'
    if [ -z "${TOKEN}" ]; then
      err "Token kosong. Batal."
      exit 1
    fi
    printf '%s' "$TOKEN" | gh auth login --with-token
    unset TOKEN
  fi
fi

info "GitHub auth OK."
info "Target repo: ${REPO}"
info "Target codespace: ${CODESPACE_NAME}"
info "Web link: ${CODESPACE_WEB_URL}"

if ! gh codespace list --repo "$REPO" --json name --jq '.[].name' | grep -Fxq "$CODESPACE_NAME"; then
  warn "Codespace ${CODESPACE_NAME} tidak ditemukan untuk repo ${REPO}."
  warn "Codespace yang tersedia:"
  gh codespace list --repo "$REPO"
  err "Set nama yang benar: CODESPACE_NAME=nama-codespace ./termux-login-codespace.sh"
  exit 1
fi

STATE="$(gh codespace list --repo "$REPO" --json name,state --jq ".[] | select(.name == \"${CODESPACE_NAME}\") | .state" | head -n1)"
info "State codespace: ${STATE:-unknown}"

if [ "${STATE}" != "Available" ]; then
  info "Menyalakan codespace..."
  gh codespace ssh -c "$CODESPACE_NAME" -- true >/dev/null 2>&1 || true
fi

info "Masuk terminal Codespace via SSH..."
info "Kalau ingin buka via browser Android: ${CODESPACE_WEB_URL}"
info "Kalau Termux punya termux-open-url: termux-open-url ${CODESPACE_WEB_URL}"
info "Kalau muncul prompt fingerprint SSH, ketik: yes"
exec gh codespace ssh -c "$CODESPACE_NAME"
