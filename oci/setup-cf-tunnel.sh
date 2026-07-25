#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Cloudflare Tunnel Auto-Installer for OCI VM & Local Services
# ═════════════════════════════════════════════════════════════════════════════

set -e

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "📦 Installing Cloudflare Tunnel (cloudflared)..."
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
  case "$ARCH" in
    aarch64|arm64) CF_ARCH="arm64" ;;
    x86_64|amd64)  CF_ARCH="amd64" ;;
    *)             CF_ARCH="arm64" ;;
  esac
  
  curl -L -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb" 2>/dev/null || true
  if [ -f /tmp/cloudflared.deb ]; then
    $SUDO dpkg -i /tmp/cloudflared.deb 2>/dev/null || $SUDO apt-get install -f -y 2>/dev/null || true
    rm -f /tmp/cloudflared.deb
  fi
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "⚠️ Installing direct binary for cloudflared..."
  curl -L -o /tmp/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" 2>/dev/null || true
  chmod +x /tmp/cloudflared 2>/dev/null || true
  $SUDO mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || true
fi

SERVICE_PORT="${1:-11434}"
echo "🚀 Exposing local service on port $SERVICE_PORT via Cloudflare Tunnel..."
echo "=========================================="
echo "🎉 CLOUDFLARE TUNNEL IS STARTING FOR PORT $SERVICE_PORT"
echo "=========================================="
cloudflared tunnel --url "http://localhost:${SERVICE_PORT}"
