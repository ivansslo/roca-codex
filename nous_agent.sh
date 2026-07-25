#!/data/data/com.termux/files/usr/bin/bash
#
# DEPRECATED — kept for backwards compatibility.
#
# This script had a broken "is Ubuntu already installed?" check:
#     proot-distro list | grep -q "Installed: yes" | grep "ubuntu"
# grep -q suppresses all output, so the second grep always failed and
# Ubuntu was re-installed (or errored out) on every run.
#
# The fixed & modernized version of this script is:
#     nous_hermes_agent_install.sh
# This wrapper forwards to it.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

echo "ℹ️  nous_agent.sh is deprecated — forwarding to nous_hermes_agent_install.sh"
echo ""

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/nous_hermes_agent_install.sh" ]; then
  exec bash "$SCRIPT_DIR/nous_hermes_agent_install.sh" "$@"
fi

exec bash <(curl -fsSL "https://raw.githubusercontent.com/ivansslo/roc-agentsroute/main/nous_hermes_agent_install.sh")
