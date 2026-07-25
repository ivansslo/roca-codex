#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  OCI ↔ Termux Default Shell Integration — ivansslo/termux-rocd
#  Makes OCI Singapore VM your default shell when opening Termux
#  Version: 1.0.0 — 2026-07-22
#  Usage: bash oci-default-shell.sh [--install | --uninstall | --status]
# ═════════════════════════════════════════════════════════════════════════════

set -e

OCI_TS_IP="${OCI_TS_IP:-100.91.232.91}"
OCI_PUBLIC_IP="${OCI_PUBLIC_IP:-161.118.253.28}"
OCI_USER="${OCI_USER:-ubuntu}"
TAILSCALE_AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"
MODE="${1:---install}"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; CYN='\033[0;36m'; RST='\033[0m'

log() { echo -e "${CYN}[$1]${RST} $2"; }
ok() { echo -e "${GRN}✅ $1${RST}"; }
warn() { echo -e "${YLW}⚠️ $1${RST}"; }

install_tailscale_termux() {
  log "PKG" "Checking Tailscale in Termux..."
  if ! command -v tailscale >/dev/null 2>&1; then
    log "PKG" "Installing tailscale, openssh, mosh..."
    pkg update -y || true
    pkg install -y tailscale openssh mosh termux-api curl jq autossh 2>/dev/null || pkg install -y tailscale openssh curl jq
  fi

  # Start daemon if not running
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    log "TS" "Starting tailscaled (userspace mode for Termux)..."
    mkdir -p $PREFIX/var/lib/tailscale  $PREFIX/var/run/tailscale 2>/dev/null || true
    mkdir -p /data/data/com.termux/files/usr/var/lib/tailscale 2>/dev/null || true
    nohup tailscaled --tun=userspace-networking --state=$HOME/.tailscale.state --socket=$HOME/.tailscale.sock > $HOME/tailscaled.log 2>&1 &
    sleep 3
  fi

  if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    log "TS" "Connecting to tailnet with auth key..."
    tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --accept-routes --accept-dns || true
    ok "Tailscale up done"
  else
    warn "No TAILSCALE_AUTH_KEY set. Open Tailscale app or run: tailscale up"
    echo "Generate key at: https://login.tailscale.com/admin/settings/keys (tskey-auth-...)"
  fi

  tailscale status || true
  tailscale ip -4 || true
}

configure_default_shell() {
  log "SHELL" "Configuring OCI as default Termux shell..."

  # Backup existing .bashrc
  [ -f $HOME/.bashrc ] && cp $HOME/.bashrc $HOME/.bashrc.bak.$(date +%s) && log "SHELL" "Backed up .bashrc"

  # Remove old block
  sed -i '/# >>> OCI DEFAULT SHELL >>>/,/# <<< OCI DEFAULT SHELL <<</d' $HOME/.bashrc 2>/dev/null || true

  cat >> $HOME/.bashrc <<EOF

# >>> OCI DEFAULT SHELL >>> (added by oci-default-shell.sh @ $(date))
# Auto-connect to OCI via Tailscale if reachable, else fallback to local
export OCI_TS_IP="$OCI_TS_IP"
export OCI_PUBLIC_IP="$OCI_PUBLIC_IP"
export OCI_USER="$OCI_USER"

oci_shell() {
  local target="\$OCI_TS_IP"
  # try tailscale ping first
  if command -v tailscale >/dev/null 2>&1; then
    if tailscale ping --c=1 --timeout=3s \$OCI_TS_IP >/dev/null 2>&1; then
      target="\$OCI_TS_IP"
    else
      target="\$OCI_PUBLIC_IP"
    fi
  fi
  echo "🚀 Connecting to OCI \$target as \$OCI_USER ..."
  # try mosh first (resilient), fallback to ssh
  if command -v mosh >/dev/null 2>&1; then
    mosh --ssh="ssh -o ServerAliveInterval=20 -o StrictHostKeyChecking=no" \$OCI_USER@\$target || ssh -o ServerAliveInterval=20 -t \$OCI_USER@\$target "bash -l"
  else
    ssh -o ServerAliveInterval=20 -o StrictHostKeyChecking=no -t \$OCI_USER@\$target "bash -l"
  fi
}

# Auto exec if interactive, not already in OCI, and not in rocd container
if [[ \$- == *i* ]] && [[ -z "\$OCI_ALREADY" ]] && [[ -z "\$ROCD_CONTAINER" ]]; then
  # skip if explicit local mode
  if [[ "\$1" != "--local" ]] && [[ "\$TERMUX_OCI_LOCAL" != "1" ]]; then
    # only auto if TERMUX default shell enabled flag file exists
    if [ -f "\$HOME/.oci-default-shell-enabled" ]; then
      export OCI_ALREADY=1
      # quick check if network available
      if ping -c1 -W2 \$OCI_TS_IP >/dev/null 2>&1 || ping -c1 -W2 \$OCI_PUBLIC_IP >/dev/null 2>&1; then
        oci_shell
      else
        echo "⚠️ OCI unreachable (\$OCI_TS_IP / \$OCI_PUBLIC_IP), staying local. Run 'oci_shell' manually."
      fi
    fi
  fi
fi
# <<< OCI DEFAULT SHELL <<<
EOF

  # enable flag
  touch $HOME/.oci-default-shell-enabled

  # create alias wrappers
  mkdir -p $HOME/bin
  cat > $HOME/bin/oci-shell <<'BIN'
#!/data/data/com.termux/files/usr/bin/bash
source ~/.bashrc
oci_shell
BIN
  chmod +x $HOME/bin/oci-shell

  cat > $HOME/bin/oci-tunnel <<'BIN'
#!/data/data/com.termux/files/usr/bin/bash
# Expose OCI Ollama 11434 to local Termux via autossh
OCI_TS_IP="${OCI_TS_IP:-100.91.232.91}"
OCI_USER="${OCI_USER:-ubuntu}"
echo "🔗 Tunneling 11434 (Ollama) via $OCI_USER@$OCI_TS_IP ..."
autossh -M 0 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 11434:127.0.0.1:11434 $OCI_USER@$OCI_TS_IP -N
BIN
  chmod +x $HOME/bin/oci-tunnel

  ok "OCI default shell block added to ~/.bashrc"
  echo ""
  echo "Commands:"
  echo "  oci-shell     → manual SSH to OCI (Tailscale first)"
  echo "  oci-tunnel    → forward Ollama 11434 to localhost"
  echo "  TERMUX_OCI_LOCAL=1 bash → stay local (skip auto)"
}

uninstall() {
  log "SHELL" "Removing OCI default shell..."
  sed -i '/# >>> OCI DEFAULT SHELL >>>/,/# <<< OCI DEFAULT SHELL <<</d' $HOME/.bashrc 2>/dev/null || true
  rm -f $HOME/.oci-default-shell-enabled $HOME/bin/oci-shell $HOME/bin/oci-tunnel
  ok "Removed. Restart Termux."
}

status() {
  echo "=== OCI ↔ Termux Status ==="
  echo "OCI Tailscale IP: $OCI_TS_IP"
  echo "OCI Public IP: $OCI_PUBLIC_IP"
  echo "OCI User: $OCI_USER"
  echo ""
  command -v tailscale >/dev/null 2>&1 && tailscale status || echo "tailscale not installed"
  echo ""
  echo "Default shell enabled? $( [ -f $HOME/.oci-default-shell-enabled ] && echo YES || echo NO )"
  echo "Can ping OCI TS? $(ping -c1 -W2 $OCI_TS_IP >/dev/null 2>&1 && echo YES || echo NO)"
  echo "Can ping OCI Public? $(ping -c1 -W2 $OCI_PUBLIC_IP >/dev/null 2>&1 && echo YES || echo NO)"
  echo "SSH check: ssh -o ConnectTimeout=3 $OCI_USER@$OCI_TS_IP 'echo OK' || ssh -o ConnectTimeout=3 $OCI_USER@$OCI_PUBLIC_IP 'echo OK'"
}

case "$MODE" in
  --install|-i|"") install_tailscale_termux; configure_default_shell; status ;;
  --uninstall|-u) uninstall ;;
  --status|-s) status ;;
  *) echo "Usage: $0 [--install|--uninstall|--status]"; exit 1 ;;
esac

echo ""
echo -e "${GRN}🎉 DONE — Restart Termux to test default OCI shell${RST}"
echo "Disable auto: rm ~/.oci-default-shell-enabled"
echo "Enable auto: touch ~/.oci-default-shell-enabled"
