#!/usr/bin/env bash
# Install Node.js 20 LTS + npm + bun + git inside Ubuntu container (proot-distro/rocd)
# Run inside root@localhost:~/rocagents#  or  proot-distro login ubuntu
# Usage: bash ~/rocagents/termux-rocd/install-node-in-ubuntu.sh  (inside container)

set -e
echo "=== Installing Node.js 20 LTS + npm + bun inside Ubuntu container ==="

# Update apt
apt update -y

# Install basics
apt install -y curl wget git ca-certificates gnupg lsb-release sudo build-essential python3

# Install Node.js 20 from NodeSource (if not already)
if ! command -v node >/dev/null 2>&1; then
  echo "[1/3] Installing Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  echo "[1/3] Node already exists: $(node -v)"
fi

echo "Node: $(node -v 2>&1 || true)"
echo "npm: $(npm -v 2>&1 || true)"

# Install bun (fast package manager, project has bun.lock)
if ! command -v bun >/dev/null 2>&1; then
  echo "[2/3] Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo "Bun: $($HOME/.bun/bin/bun --version 2>&1 || true)"
else
  echo "[2/3] Bun exists: $(bun --version 2>&1 || true)"
fi

# Export bun to bashrc
if ! grep -q "BUN_INSTALL" ~/.bashrc 2>/dev/null; then
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Install deps
echo "[3/3] Installing rocagents deps (npm install)..."
cd "$(dirname "$0")/.."
pwd
ls package.json 2>&1 | head -n 2

if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
  echo "Found bun.lock, using bun install..."
  bun install 2>&1 | tail -n 30
else
  echo "Using npm install..."
  npm install --legacy-peer-deps 2>&1 | tail -n 50
fi

echo ""
echo "✅ Node.js installed!"
node -v
npm -v
bun --version 2>&1 || true
echo ""
echo "Now try:"
echo "  npm start"
echo "  or"
echo "  npm run dev"
echo "  or"
echo "  bun run dev"
