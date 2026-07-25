#!/usr/bin/env bash
# Clean & Fix Broken Packages in Ubuntu proot container
# Run inside root@localhost:~/rocagents#  or  proot-distro login ubuntu
# Usage: bash ~/rocagents/termux-rocd/clean-ubuntu-packages.sh

set -e
echo "=== Ubuntu Package Health Check & Cleaner ==="

echo "[1/6] Checking /root & dpkg status..."
ls -ld /root 2>&1 || echo "/root broken"
ls -ld /var/lib/dpkg 2>&1 | head -n 5
ls -ld /var/cache/apt/archives 2>&1 | head -n 5

echo "[2/6] Checking for broken packages..."
dpkg --audit 2>&1 | head -n 50 || true
echo "--- dpkg --configure -a check ---"
dpkg -l | grep -E "^..R|^..U|broken" 2>&1 | head -n 30 || echo "No obvious broken marked"

echo "[3/6] Fixing dpkg state..."
dpkg --configure -a 2>&1 || true

echo "[4/6] Cleaning apt cache..."
apt clean 2>&1 || true
apt autoclean 2>&1 || true
rm -rf /var/cache/apt/archives/lock 2>&1 || true
rm -rf /var/lib/apt/lists/lock 2>&1 || true

echo "[5/6] Updating & fixing broken deps..."
apt update -y 2>&1 | tail -n 30
echo "--- apt --fix-broken install ---"
apt --fix-broken install -y 2>&1 | tail -n 50 || true

echo "[6/6] Checking npm package (node_modules)..."
cd ~/rocagents 2>/dev/null || cd /root/rocagents 2>/dev/null || cd "$(dirname "$0")/.." || true
pwd
if [ -d "node_modules" ]; then
  echo "node_modules exists: $(du -sh node_modules 2>&1 | head -n1)"
  echo "Checking for broken symlinks..."
  find node_modules -type l ! -exec test -e {} \; -print 2>/dev/null | head -n 20 || echo "No broken symlinks"
else
  echo "node_modules NOT found — need npm install / bun install"
fi

if [ -f "package-lock.json" ] || [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
  echo "package-lock / bun.lock found"
else
  echo "No lock file found"
fi

echo ""
echo "=== Summary ==="
echo "APT: $(apt list --upgradable 2>&1 | wc -l) upgradable packages"
echo "DPKG broken: $(dpkg -l | grep -c '^..R\|^..U' || echo 0)"
if [ -d "node_modules" ]; then
  echo "NPM: node_modules exists"
else
  echo "NPM: node_modules MISSING → run: npm install  or  bun install"
fi

echo ""
echo "✅ Cleaner done!"
echo "Next:"
echo "  If APT still broken: apt update -y && apt upgrade -y"
echo "  If NPM missing: bash termux-rocd/install-node-in-ubuntu.sh"
echo "  Then: npm start"
