#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Universal Container & OCI Tailscale Auto-Installer & Exit-Node Advertiser
# ═════════════════════════════════════════════════════════════════════════════

set -e

SUDO=""
if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

echo "📦 [1/3] Checking & Installing Tailscale network agent..."
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "🔄 [2/3] Verifying tailscaled daemon process status..."
if ! pgrep -x tailscaled >/dev/null 2>&1; then
  echo "🚀 Starting tailscaled daemon..."
  if command -v systemctl >/dev/null 2>&1 && systemctl is-systemrunning >/dev/null 2>&1; then
    $SUDO systemctl enable --now tailscaled 2>/dev/null || true
  fi
  
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    echo "⚙️ Systemd unavailable inside container. Launching userspace tailscaled daemon..."
    $SUDO mkdir -p /var/lib/tailscale /run/tailscale
    nohup $SUDO tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock > /var/log/tailscaled.log 2>&1 &
    sleep 3
  fi
fi

echo "🔑 [3/3] Authenticating & connecting to Tailscale Owner Mesh Network..."
TS_KEY="${TAILSCALE_AUTH_KEY:-}"

$SUDO tailscale up \
  --auth-key="$TS_KEY" \
  --advertise-exit-node \
  --accept-routes \
  --reset 2>&1 || {
    echo "⚠️ Retrying connection in userspace mode..."
    $SUDO tailscale up --auth-key="$TS_KEY" --accept-routes
  }

echo ""
echo "=================================================="
echo "🎉 TAILSCALE MESH NETWORK CONNECTED SUCCESSFULLY!"
echo "=================================================="
$SUDO tailscale status || true
