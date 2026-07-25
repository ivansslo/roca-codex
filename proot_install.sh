#!/data/data/com.termux/files/usr/bin/bash
#
# DEPRECATED — kept for backwards compatibility.
#
# This script used to install Ubuntu under proot-distro and pip-install
# hermes-agent SYSTEM-WIDE (no venv), which breaks on Ubuntu 24.04+
# (PEP 668 externally-managed-environment). The fixed, modernized flow
# lives in nous_hermes_agent_install.sh — this wrapper forwards to it.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

echo "ℹ️  proot_install.sh is deprecated — forwarding to nous_hermes_agent_install.sh"
echo ""

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/nous_hermes_agent_install.sh" ]; then
  exec bash "$SCRIPT_DIR/nous_hermes_agent_install.sh" "$@"
fi

exec bash <(curl -fsSL "https://raw.githubusercontent.com/ivansslo/roc-agentsroute/main/nous_hermes_agent_install.sh")
