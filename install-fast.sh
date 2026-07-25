#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  rocagents — High-Speed Resilient Clean Installer with OCI Cloud Turbo
# ═════════════════════════════════════════════════════════════════════════════

set -e

# Optimize DNS settings
echo "📦 Optimizing DNS & parallel socket thresholds..."
echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1\nnameserver 1.0.0.1" > /etc/resolv.conf 2>/dev/null || true

# Check for OCI Singapore Tailscale node proxy / Exit Node
OCI_TAILSCALE_IP="100.93.139.73"
OCI_PUBLIC_IP="161.118.253.28"

if ping -c 1 -w 2 "$OCI_TAILSCALE_IP" >/dev/null 2>&1; then
  echo "⚡ OCI Singapore Tailscale High-Speed Node Connected! ($OCI_TAILSCALE_IP)"
elif ping -c 1 -w 2 "$OCI_PUBLIC_IP" >/dev/null 2>&1; then
  echo "🌐 OCI Cloud Server Reachable ($OCI_PUBLIC_IP)"
fi

# Skip re-downloading packages if node_modules already exists and --quick flag is passed
if [ "${1:-}" = "--quick" ] || [ "${1:-}" = "-q" ] || [ "${FAST_SKIP_NPM:-}" = "1" ]; then
  echo "🚀 Quick Mode: Preserving existing node_modules. Building dist/ immediately..."
else
  # Fast incremental install without wiping entire node_modules if not needed
  if [ "${1:-}" = "--clean" ] || [ "${1:-}" = "-c" ]; then
    echo "🧹 Clean Mode requested: Purging node_modules & lockfile..."
    rm -rf node_modules package-lock.json 2>/dev/null || true
    npm cache clean --force 2>/dev/null || true
  fi

  echo "⚡ Installing/updating packages using multi-socket parallel downloader..."
  NPM_FLAGS="--include=dev --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --no-audit --no-fund --maxsockets=15"

  install_success=0

  # 1. Try Bun if installed for instant dependency installation
  if command -v bun >/dev/null 2>&1; then
    echo "🚀 Found Bun! Running ultra-fast bun install..."
    if bun install; then install_success=1; fi
  fi

  # 2. Try npm with standard npmjs registry
  if [ $install_success -eq 0 ]; then
    echo "📡 Downloading via npmjs primary registry..."
    if NODE_ENV=development npm install $NPM_FLAGS --registry=https://registry.npmjs.org; then
      install_success=1;
    fi
  fi

  # 3. Fallback: Try npmmirror high-speed mirror
  if [ $install_success -eq 0 ]; then
    echo "🔄 Primary registry timed out. Failing over to npmmirror..."
    if NODE_ENV=development npm install $NPM_FLAGS --registry=https://registry.npmmirror.com; then
      install_success=1;
    fi
  fi

  if [ $install_success -eq 0 ]; then
    echo "❌ Package installation failed on all registries. Please check internet connection."
    exit 1
  fi
fi

echo "🏛️ Checking OCI CLI (Oracle Cloud Infrastructure)..."
if command -v oci >/dev/null 2>&1 || python3 -m oci_cli --version >/dev/null 2>&1; then
  echo "✅ OCI CLI ready."
else
  echo "🚀 Installing OCI CLI in background..."
  bash ./oci/install_oci_cli.sh 2>/dev/null || echo "⚠️ OCI CLI setup warning (can be re-triggered later)."
fi

echo "🏗️ Building application assets into dist/..."
PATH="./node_modules/.bin:$PATH" npm run build

echo ""
echo "=========================================="
echo "🎉 ROCAgents Fast Update Completed!"
echo "=========================================="
echo "Run: npm run dev  or  ./hermes webui start"
