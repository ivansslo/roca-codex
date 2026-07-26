#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  ROCAgents — Universal Installer (Linux / macOS / Termux)
#  Usage: bash scripts/install.sh [--dev]
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}⚡ ROCAgents Installer${NC}"
echo ""

# ---- Detect environment ----
IS_TERMUX=false
if [ -d "/data/data/com.termux" ] || [ "$(uname -o 2>/dev/null)" = "Android" ]; then
  IS_TERMUX=true
fi

# ---- Check Node.js ----
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}📦 Node.js not found. Installing...${NC}"
  if $IS_TERMUX; then
    pkg update -y 2>/dev/null
    pkg install -y nodejs 2>/dev/null
  elif command -v apt &>/dev/null; then
    sudo apt update -y && sudo apt install -y nodejs npm
  elif command -v brew &>/dev/null; then
    brew install node
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm
  else
    echo -e "${RED}❌ Cannot auto-install Node.js. Please install manually:${NC}"
    echo "   https://nodejs.org/"
    exit 1
  fi
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}❌ Node.js v18+ required (found $(node -v))${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# ---- Check npm ----
if ! command -v npm &>/dev/null; then
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v)${NC}"

# ---- Navigate to project root ----
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# ---- Copy .env if missing ----
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
  echo -e "${YELLOW}📝 Created .env from .env.example — edit with your API keys${NC}"
fi

# ---- Install dependencies ----
echo ""
echo -e "${CYAN}📦 Installing packages...${NC}"

# Try bun first for speed
if command -v bun &>/dev/null; then
  echo "  Using bun (fastest)..."
  bun install --no-save 2>/dev/null && echo -e "${GREEN}  ✅ bun install done${NC}" || true
fi

# npm fallback / primary
if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ]; then
  echo "  Using npm..."
  npm install --legacy-peer-deps 2>&1 | tail -3
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"

# ---- Build ----
echo ""
echo -e "${CYAN}🏗️  Building dist/ ...${NC}"
PATH="./node_modules/.bin:$PATH" npm run build 2>&1 | tail -5
echo -e "${GREEN}✅ Build complete${NC}"

# ---- Done ----
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 ROCAgents installed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "  Start production:  npm start"
echo "  Start dev mode:    npm run dev"
echo "  Open browser:      http://localhost:${PORT:-3000}"
echo ""
echo "  Edit .env to add your API key (GEMINI_API_KEY, GROQ_KEY, etc.)"
