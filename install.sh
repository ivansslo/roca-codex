#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════
#  Hermes v5.14.0 "Oracle" — Installer for Termux
# ═══════════════════════════════════════════════

echo "⚡ Installing Hermes v5.14.0 \"Oracle\"..."

# Dependencies
pkg update -y 2>/dev/null
pkg install -y python nodejs git curl jq wget unzip 2>/dev/null
pip install requests cryptography 2>/dev/null

# python3_venv for responsive code commands (/run, /preview, /agent)
mkdir -p "$HOME/.hermes"
if command -v python3 >/dev/null 2>&1; then
  python3 -m venv "$HOME/.hermes/python3_venv" 2>/dev/null || true
  if [ -x "$HOME/.hermes/python3_venv/bin/python" ]; then
    "$HOME/.hermes/python3_venv/bin/python" -m pip install -U pip setuptools wheel >/dev/null 2>&1 || true
    "$HOME/.hermes/python3_venv/bin/python" -m pip install -U rich pygments prompt_toolkit requests >/dev/null 2>&1 || true
  fi
fi

# Download CLI
# Prefer PREFIX (Termux); fall back to ~/.local/bin on other Linux hosts.
BIN_DIR="${PREFIX:-$HOME/.local}/bin"
mkdir -p "$BIN_DIR"
curl -s -o "$BIN_DIR/hermes" \
  "https://raw.githubusercontent.com/ivansslo/rocagents/main/hermes"
chmod +x "$BIN_DIR/hermes"

# Setup dirs
mkdir -p "$HOME/.hermes/workspace" "$HOME/.hermes/plugins"
cat > "$HOME/.hermes/plugins/multi-agent.commands" <<'EOF'
/agents
/agent
/crew
/research
/plan
/best
/ai
/plugins
/orchestrator
/import
/reviewer
/coder
/tester
#agent-mode
#autonomous-agent
#best-ai
#multi-agent
#researcher
#planner
#coder
#reviewer
#tester
EOF

# Optional: Firebase CLI (dipakai oleh: hermes firebase deploy)
# Skip dengan: HERMES_NO_FIREBASE_CLI=1
if [ -z "${HERMES_NO_FIREBASE_CLI:-}" ] && command -v npm >/dev/null 2>&1; then
  echo "🔥 Installing Firebase CLI (firebase-tools)..."
  npm install -g firebase-tools 2>&1 | tail -1 || \
    echo "ℹ️  Firebase CLI skip — install manual: npm install -g firebase-tools"
  echo "   Login (headless/Termux): firebase login --no-localhost"
fi

echo ""
echo "✅ Hermes v5.14.0 Oracle installed!"
echo ""
echo "  Run: hermes setup         (configure API keys)"
echo "  Run: hermes help          (see all commands)"
echo "  Run: hermes status        (check connections)"
echo "  Run: hermes chat          (interactive AI chat)"
echo "  Run: hermes orchestrator  (autonomous agent)"
echo "  Run: hermes oci status   (OCI private model status)"
echo "  Run: OCI_SSH_KEY=~/.ssh/oci_key hermes oci enable"
