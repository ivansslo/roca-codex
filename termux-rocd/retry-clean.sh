#!/usr/bin/env bash
# Retry Clean Tailscale — Ubuntu Container & Termux Host
# Fix: Access denied prefs write access denied + offline + ip rule parse error
# Usage:
# 1. Generate reusable auth key at https://login.tailscale.com/admin/settings/keys
#    Reusable ON, Ephemeral OFF, expiry 90d → copy tskey-auth-...
# 2. In ubuntu container (root@localhost): 
#    TAILSCALE_AUTH_KEY=tskey-auth-XXX bash retry-clean.sh container
# 3. In Termux host (rocfx android):
#    TAILSCALE_AUTH_KEY=tskey-auth-XXX bash retry-clean.sh termux

set -e
MODE=${1:-container}
AUTH=${TAILSCALE_AUTH_KEY:-}

if [ -z "$AUTH" ]; then
  echo "❌ Set TAILSCALE_AUTH_KEY dulu:"
  echo "   export TAILSCALE_AUTH_KEY=tskey-auth-XXXX"
  exit 1
fi

echo "=== RETRY MODE: $MODE ==="
echo "Auth: ${AUTH:0:15}..."

if [ "$MODE" = "container" ]; then
  echo "[1/4] Cleanup old daemon..."
  pkill tailscaled || true
  rm -rf /run/tailscale/tailscaled.sock /var/lib/tailscale/tailscaled.state /tmp/tailscaled.sock /tmp/tailscaled.state
  mkdir -p /var/lib/tailscale /run/tailscale /tmp

  echo "[2/4] Start tailscaled userspace (no netlink needed)..."
  # Use /tmp to avoid permission issues
  nohup tailscaled --tun=userspace-networking --state=/tmp/tailscaled.state --socket=/tmp/tailscaled.sock --socks5-server=localhost:1055 --outbound-http-proxy-listen=localhost:1055 > /tmp/tailscaled.log 2>&1 &
  sleep 4
  echo "--- log tail ---"
  cat /tmp/tailscaled.log | tail -n 30 || true
  echo "---------------"

  echo "[3/4] tailscale up..."
  tailscale --socket=/tmp/tailscaled.sock up --reset --auth-key=$AUTH --hostname=ubuntu-oci-1 --advertise-exit-node --ssh --accept-routes || {
    echo "⚠️ First up failed, retry without --advertise-exit-node"
    tailscale --socket=/tmp/tailscaled.sock up --reset --auth-key=$AUTH --hostname=ubuntu-oci-1 --ssh --accept-routes
  }

  echo "[4/4] Status..."
  tailscale --socket=/tmp/tailscaled.sock status
  tailscale --socket=/tmp/tailscaled.sock ip -4
  tailscale --socket=/tmp/tailscaled.sock ip -6

  echo ""
  echo "✅ Container READY! IP:"
  tailscale --socket=/tmp/tailscaled.sock ip -4
  echo "Ping test:"
  tailscale --socket=/tmp/tailscaled.sock ping 100.100.237.104 || true
  tailscale --socket=/tmp/tailscaled.sock ping 100.106.22.112 || true

elif [ "$MODE" = "termux" ]; then
  echo "[1/4] Termux cleanup..."
  pkill tailscaled || true
  rm -rf $HOME/.tailscale.sock $HOME/.tailscale.state
  mkdir -p $PREFIX/var/lib/tailscale 2>/dev/null || true

  echo "[2/4] Start tailscaled userspace for Termux..."
  nohup tailscaled --tun=userspace-networking --state=$HOME/.tailscale.state --socket=$HOME/.tailscale.sock > $HOME/tailscaled.log 2>&1 &
  sleep 4
  cat $HOME/tailscaled.log | tail -n 30 || true

  echo "[3/4] tailscale up..."
  tailscale --socket=$HOME/.tailscale.sock up --auth-key=$AUTH --hostname=rocfx --accept-routes || \
  tailscale up --auth-key=$AUTH --hostname=rocfx --accept-routes

  echo "[4/4] Status..."
  tailscale status || tailscale --socket=$HOME/.tailscale.sock status
  tailscale ip -4 || tailscale --socket=$HOME/.tailscale.sock ip -4

  echo ""
  echo "Test SSH to ubuntu container:"
  echo "  tailscale ping 100.91.232.91"
  echo "  ssh root@100.91.232.91"
  echo "  tailscale ssh root@ubuntu-oci-1"
fi

echo ""
echo "DONE — copy output `tailscale status` ke saya kalau mau diverifikasi."
