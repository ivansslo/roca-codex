#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  ROCAgents — Developer Setup (hot-reload dev server)
#  Usage: bash scripts/dev-setup.sh
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}⚡ ROCAgents Dev Setup${NC}"

# Ensure dependencies
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm install --legacy-peer-deps 2>&1 | tail -3
fi

# Ensure .env
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
  echo -e "${YELLOW}📝 Created .env — add your API keys${NC}"
fi

echo -e "${GREEN}✅ Ready. Starting dev server on http://localhost:${PORT:-3000}${NC}"
echo ""

NODE_OPTIONS='--dns-result-order=ipv4first' npx tsx server.ts
