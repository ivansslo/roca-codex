#!/usr/bin/env bash
# Restore .env yang hilang di Termux host / Ubuntu container
# .env di-ignore git, jadi git pull gak balikin .env

set -e
ROCAGENTS_DIR="${ROCAGENTS_DIR:-$HOME/rocagents}"
cd "$ROCAGENTS_DIR" 2>/dev/null || cd ~/rocagents 2>/dev/null || true

echo "=== Restore .env Checker ==="
ls -la .env 2>&1 | head -n 5 || echo ".env NOT FOUND"
ls -la .env.example 2>&1 | head -n 5

if [ -f ".env" ]; then
  BACKUP=".env.bak.$(date +%s)"
  cp .env "$BACKUP"
  echo "Backed up to $BACKUP"
else
  echo ".env hilang! Creating from .env.example..."
  cp .env.example .env 2>/dev/null || touch .env
  cat >> .env <<'TEMPLATE'

# === TEMPLATE - fill from secure notes, see docs/ENV_KEYS_LIST.md ===
TAILSCALE_KEY=YOUR_TAILSCALE_API_KEY_HERE
TAILSCALE_AUTH_KEY=YOUR_TAILSCALE_AUTH_KEY_HERE
TAILSCALE_IP=100.91.232.91
GITHUB_PAT=YOUR_GITHUB_PAT_HERE
OWNER_GITHUB=ivansslo
OCI_USER=YOUR_OCI_USER_HERE
OCI_TENANCY=YOUR_OCI_TENANCY_HERE
OCI_FINGERPRINT=YOUR_FINGERPRINT_HERE
OCI_REGION=ap-singapore-1
# ... rest see docs/ENV_KEYS_LIST.md
TEMPLATE
fi

ls -lh .env
echo "Keys count: $(grep -c "^[A-Z0-9_]*=" .env 2>/dev/null || echo 0)"
echo "Edit with: nano .env"
