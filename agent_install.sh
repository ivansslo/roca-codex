#!/data/data/com.termux/files/usr/bin/bash
#
# DEPRECATED — kept for backwards compatibility.
#
# This script used to duplicate the Ubuntu/proot install flow and had
# bugs (no venv inside Ubuntu -> PEP 668 failure, shebang in the middle of
# the file, unguarded re-installs). All of that logic now lives in the
# canonical, modernized installer: nous_hermes_agent_install.sh
#
# This wrapper simply forwards to it (local copy preferred, GitHub fallback).
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

echo "ℹ️  agent_install.sh is deprecated — forwarding to nous_hermes_agent_install.sh"
echo ""

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/nous_hermes_agent_install.sh" ]; then
  exec bash "$SCRIPT_DIR/nous_hermes_agent_install.sh" "$@"
fi

exec bash <(curl -fsSL "https://raw.githubusercontent.com/ivansslo/roc-agentsroute/main/nous_hermes_agent_install.sh")
