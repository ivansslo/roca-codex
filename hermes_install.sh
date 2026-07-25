#!/data/data/com.termux/files/usr/bin/bash
#
# Hermes Agent (NousResearch) — Native Termux installer
# Installs the Python hermes-agent directly in Termux (no proot).
#
# Usage: curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/hermes_install.sh | bash
#

set -e

# Colors (fixed: previously referenced but never defined)
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
CYN='\033[0;36m'
RST='\033[0m'

REPO_URL="https://github.com/NousResearch/hermes-agent.git"
HELP_URL="https://github.com/AbuZar-Ansarii/Hermes-Agent-On-Android"

echo -e "${CYN}=====================================================${RST}"
echo -e "${GRN}                   THEVOIDKERNEL${RST}"
echo -e "${CYN}=====================================================${RST}"
echo -e "${GRN}        🚀 Installing Hermes Agent on Termux (native)${RST}"
echo -e "${CYN}=====================================================${RST}"
echo ""

# Update packages
echo -e "${YLW}📦 Updating Termux packages...${RST}"
pkg update -y && pkg upgrade -y

# Install dependencies (clang/rust needed to build some Python wheels)
echo -e "${YLW}🔧 Installing dependencies...${RST}"
pkg install -y git python clang rust make pkg-config libffi openssl nodejs ripgrep ffmpeg

# Clone (or update) repository
if [ -d "hermes-agent/.git" ]; then
  echo -e "${GRN}✅ hermes-agent already cloned — pulling latest...${RST}"
  git -C hermes-agent pull --ff-only || true
else
  echo -e "${YLW}📥 Cloning hermes-agent...${RST}"
  if ! git clone --recurse-submodules "$REPO_URL"; then
    echo -e "${RED}❌ Failed to clone $REPO_URL${RST}"
    echo -e "${YLW}   The upstream repo may have moved. See: $HELP_URL${RST}"
    exit 1
  fi
fi

cd hermes-agent

# Setup Python virtual environment
echo -e "${YLW}🐍 Creating virtual environment...${RST}"
[ -d "venv" ] && rm -rf venv
python -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate

# Set Android API level (needed by some native builds)
export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk)"

# Upgrade pip tooling
python -m pip install --upgrade pip setuptools wheel

# Install Hermes with Termux support (constraints keep wheels buildable on Android)
echo -e "${YLW}⏳ Installing Hermes Agent (this can take 5–10 minutes)...${RST}"
if [ -f "constraints-termux.txt" ]; then
  python -m pip install -e '.[termux]' -c constraints-termux.txt
else
  python -m pip install -e '.[termux]' || python -m pip install -e .
fi

# Create global launcher
mkdir -p "$PREFIX/bin"
cat > "$PREFIX/bin/hermes" <<LAUNCHER
#!/data/data/com.termux/files/usr/bin/bash
cd "$PWD"
source venv/bin/activate
exec hermes "\$@"
LAUNCHER
chmod +x "$PREFIX/bin/hermes"

echo ""
echo -e "${GRN}✅ Hermes Agent installed successfully!${RST}"
echo "🔥 Run 'hermes' or 'hermes setup' to start using it"
echo "📖 Type 'hermes --help' for more options"
echo "🌐 Run 'hermes gateway' to run and deploy it"
echo ""
echo -e "${CYN}💡 Need help? Visit: $HELP_URL${RST}"
