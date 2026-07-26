#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  ROCAgents — Clean build artifacts and caches
#  Usage: bash scripts/clean.sh [--deep]
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}🧹 Cleaning ROCAgents build artifacts...${NC}"

# Remove dist
rm -rf dist
echo -e "  ${GREEN}✅ dist/ removed${NC}"

# Remove Vite cache
rm -rf node_modules/.vite
echo -e "  ${GREEN}✅ Vite cache removed${NC}"

# Deep clean: also remove node_modules
if [ "${1:-}" = "--deep" ] || [ "${1:-}" = "-d" ]; then
  echo -e "  ${YELLOW}🗑️  Deep clean: removing node_modules...${NC}"
  rm -rf node_modules
  rm -f package-lock.json
  echo -e "  ${GREEN}✅ node_modules/ and package-lock.json removed${NC}"
  echo -e "  ${YELLOW}Run 'bash scripts/install.sh' to reinstall${NC}"
else
  echo -e "  ${YELLOW}Tip: use --deep to also remove node_modules${NC}"
fi

echo ""
echo -e "${GREEN}✅ Clean complete${NC}"
