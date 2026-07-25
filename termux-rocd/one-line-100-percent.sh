#!/usr/bin/env bash
# RocAgents One-Line 100% Restore — Full Auto Pull + Fix Proot + Tailscale Mesh + Default Shell
# Owner: Ivan Ssl (ivansslo) — 2026-07-23
# Usage (di Termux HP):
#   curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/one-line-100-percent.sh | bash -s all
# Options:
#   all            = pull + fix-proot + tailscale-check + default-shell + build
#   pull           = git pull origin main
#   fix-proot      = fix /etc/hosts + job control ioctl warning
#   tailscale      = retry-clean mesh check
#   default-shell  = install oci-default-shell 100.91.232.91
#   build          = rebuild dist 100%
# Env:
#   TAILSCALE_AUTH_KEY=tskey-auth-...  (optional, for tailscale mode)
#   OCI_TS_IP=100.91.232.91            (default ubuntu-oci-1 latest)

set -e
MODE=${1:-all}
ROCAGENTS_DIR="${ROCAGENTS_DIR:-$HOME/rocagents}"
OCI_TS_IP="${OCI_TS_IP:-100.91.232.91}"
ROADFX_IP="${ROADFX_IP:-100.100.237.104}"
ROCFX_IP="${ROCFX_IP:-100.106.22.112}"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; CYN='\033[0;36m'; RST='\033[0m'
ok(){ echo -e "${GRN}✅ $1${RST}"; }
info(){ echo -e "${CYN}[$1]${RST} $2"; }

# Detect environment
if [ -d "/data/data/com.termux" ] || command -v pkg >/dev/null 2>&1; then
  IS_TERMUX=1
  IS_CONTAINER=0
else
  IS_TERMUX=0
  IS_CONTAINER=1
fi

do_pull(){
  info "PULL" "Pulling latest rocagents main..."
  if [ ! -d "$ROCAGENTS_DIR/.git" ]; then
    echo "Cloning rocagents to $ROCAGENTS_DIR..."
    git clone https://github.com/ivansslo/rocagents.git "$ROCAGENTS_DIR"
  fi
  cd "$ROCAGENTS_DIR"
  git remote -v | grep -q origin || git remote add origin https://github.com/ivansslo/rocagents.git
  git pull origin main --ff-only || git pull origin main
  ok "Git pull done: $(git log --oneline -1)"
}

do_fix_proot(){
  info "FIX-PROOT" "Fixing proot ubuntu localhost + job control..."
  if [ -f "$ROCAGENTS_DIR/termux-rocd/fix-proot-ubuntu-localhost.sh" ]; then
    bash "$ROCAGENTS_DIR/termux-rocd/fix-proot-ubuntu-localhost.sh"
  else
    echo "fix-proot script not found, downloading..."
    curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/fix-proot-ubuntu-localhost.sh -o /tmp/fix.sh
    bash /tmp/fix.sh
  fi
  ok "Proot localhost fixed"
}

do_tailscale(){
  info "TAILSCALE" "Checking mesh..."
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale not installed, installing..."
    if [ "$IS_TERMUX" = "1" ]; then
      pkg install -y tailscale 2>&1 | tail -n 5 || true
      # start daemon
      pkill tailscaled || true
      nohup tailscaled --tun=userspace-networking --state=$HOME/.tailscale.state --socket=$HOME/.tailscale.sock > $HOME/tailscaled.log 2>&1 &
      sleep 3
    else
      curl -fsSL https://tailscale.com/install.sh | sh
    fi
  fi

  # Show status
  echo "--- tailscale status ---"
  tailscale status 2>&1 | head -n 30 || tailscale --socket=$HOME/.tailscale.sock status 2>&1 | head -n 30 || true
  echo "--- tailscale ip ---"
  tailscale ip -4 2>&1 || true

  if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    echo "TAILSCALE_AUTH_KEY detected (${TAILSCALE_AUTH_KEY:0:15}...), attempting re-join if offline..."
    if tailscale status 2>&1 | grep -q offline; then
      echo "Found offline node, retrying..."
      if [ "$IS_TERMUX" = "1" ]; then
        bash "$ROCAGENTS_DIR/termux-rocd/retry-clean.sh" termux || true
      else
        bash "$ROCAGENTS_DIR/termux-rocd/retry-clean.sh" container || true
      fi
    fi
  else
    echo -e "${YLW}⚠️ TAILSCALE_AUTH_KEY not set — skip auto re-join. Set: export TAILSCALE_AUTH_KEY=tskey-auth-...${RST}"
  fi

  echo "Ping tests:"
  tailscale ping $ROADFX_IP 2>&1 | head -n 2 || true
  tailscale ping $OCI_TS_IP 2>&1 | head -n 2 || true
  tailscale ping $ROCFX_IP 2>&1 | head -n 2 || true
  ok "Tailscale check done"
}

do_default_shell(){
  info "DEFAULT-SHELL" "Installing OCI $OCI_TS_IP as default Termux shell..."
  if [ -f "$ROCAGENTS_DIR/termux-rocd/oci-default-shell.sh" ]; then
    OCI_TS_IP=$OCI_TS_IP bash "$ROCAGENTS_DIR/termux-rocd/oci-default-shell.sh" --install
  else
    curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/oci-default-shell.sh | OCI_TS_IP=$OCI_TS_IP bash
  fi
  echo "Enable auto? Run: touch ~/.oci-default-shell-enabled"
  if [ -f "$HOME/.oci-default-shell-enabled" ]; then
    ok "Auto default shell ENABLED (~/.oci-default-shell-enabled exists)"
  else
    echo -e "${YLW}Auto disabled. Enable dengan: touch ~/.oci-default-shell-enabled${RST}"
  fi
  echo "Commands: oci-shell, rocd oci, oci-tunnel, ssh -tt root@$OCI_TS_IP"
}

do_build(){
  info "BUILD" "Rebuilding dist 100%..."
  cd "$ROCAGENTS_DIR"
  if [ ! -d "node_modules" ]; then
    npm install --silent
  fi
  npx vite build 2>&1 | tail -n 20
  npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs 2>&1 | tail -n 5
  ls -lh dist/index.html dist/server.cjs 2>&1 | head -n 10
  ok "Build done"
}

case "$MODE" in
  all)
    do_pull
    do_fix_proot
    do_tailscale
    do_default_shell
    do_build
    ;;
  pull) do_pull ;;
  fix-proot) do_fix_proot ;;
  tailscale) do_tailscale ;;
  default-shell) do_default_shell ;;
  build) do_build ;;
  *)
    echo "Usage: $0 [all|pull|fix-proot|tailscale|default-shell|build]"
    echo "Example: curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/termux-rocd/one-line-100-percent.sh | bash -s all"
    exit 1
    ;;
esac

echo ""
echo -e "${GRN}🎉 ONE-LINE 100% DONE!${RST}"
echo "Next:"
echo "  1. tailscale status  (should see rocfx + roadfx + ubuntu-oci-1 online -)"
echo "  2. ssh -tt root@$OCI_TS_IP"
echo "  3. touch ~/.oci-default-shell-enabled && restart Termux → auto masuk ubuntu"
echo "  4. npm start in rocagents → check SyncDashboard Aperture & OCI cards"
