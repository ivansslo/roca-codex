#!/usr/bin/env bash
# Fix MODULE_NOT_FOUND get-intrinsic / side-channel-map after bun install partial [2] packages
# Run inside root@localhost:~/rocagents#  (Ubuntu container)
# This fully cleans shared node_modules (host + container share via --bind) and reinstalls 100%

set -e
cd ~/rocagents 2>/dev/null || cd /root/rocagents 2>/dev/null || cd "$(dirname "$0")/.." || true
pwd

echo "=== Cleaning broken node_modules (get-intrinsic missing) ==="
echo "Current node: $(node -v), npm: $(npm -v), bun: $(bun --version 2>&1 || ~/.bun/bin/bun --version)"

echo "[1/5] Removing node_modules and locks cache..."
rm -rf node_modules
rm -rf .parcel-cache .turbo .vite
rm -rf ~/.npm/_cacache ~/.npm/_logs 2>&1 | head -n 5 || true

# Clean bun caches
if command -v bun >/dev/null 2>&1; then
  bun pm cache rm 2>&1 | tail -n 10 || true
elif [ -f "$HOME/.bun/bin/bun" ]; then
  $HOME/.bun/bin/bun pm cache rm 2>&1 | tail -n 10 || true
fi

npm cache clean --force 2>&1 | tail -n 10 || true
echo "Cleaned"

echo "[2/5] Verify package managers..."
export PATH="$HOME/.bun/bin:$PATH"
which node && node -v
which npm && npm -v
which bun && bun --version || $HOME/.bun/bin/bun --version

echo "[3/5] Fresh install with npm (more stable than bun for express side-channel)..."
# Use npm for full install to avoid bun partial [2] bug
npm install --legacy-peer-deps --force 2>&1 | tail -n 100

echo "[4/5] Checking critical module get-intrinsic..."
ls -la node_modules/get-intrinsic 2>&1 | head -n 20 || echo "get-intrinsic missing!"
ls -la node_modules/side-channel-map 2>&1 | head -n 20 || true
# If still missing, force install
if [ ! -d "node_modules/get-intrinsic" ]; then
  echo "Force installing get-intrinsic..."
  npm install get-intrinsic side-channel-map side-channel qs express --save 2>&1 | tail -n 20
fi

echo "[5/5] Rebuilding dist..."
npx vite build 2>&1 | tail -n 20 || npm run build 2>&1 | tail -n 20
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs 2>&1 | tail -n 10 || true
ls -lh dist/server.cjs dist/index.html 2>&1 | head -n 10

echo ""
echo "=== Test npm start ==="
timeout 10 npm start 2>&1 | head -n 100 || echo "Start test done (timeout or error, check above)"

echo ""
echo "✅ Fix done! If still MODULE_NOT_FOUND, run:"
echo "  rm -rf node_modules && npm cache clean --force && npm install --legacy-peer-deps"
