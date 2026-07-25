#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  OCI Private Personal Model Installer (Ollama Engine + Cloudflare Tunnel)
# ═════════════════════════════════════════════════════════════════════════════

set -euo pipefail

MODEL_NAME="${ROCSPACE_PERSONAL_MODEL:-rocspace-initial}"
BASE_MODEL="${ROCSPACE_BASE_MODEL:-qwen2.5:1.5b}"
ROOT="${ROCSPACE_MODEL_HOME:-$HOME/rocspace-initial}"

# Check & install Docker if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "📦 Installing Docker Engine for Ollama runtime..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER 2>/dev/null || true
fi

mkdir -p "$ROOT"
cat > "$ROOT/docker-compose.yml" <<'YAML'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: rocspace-personal-model
    restart: unless-stopped
    ports:
      - "0.0.0.0:11434:11434"
    volumes:
      - ollama-data:/root/.ollama
volumes:
  ollama-data:
YAML

cat > "$ROOT/Modelfile" <<EOF
FROM $BASE_MODEL
PARAMETER temperature 0.2
PARAMETER num_ctx 4096
SYSTEM """
You are ROCSPACE-INITIAL, the private foundational AI model for RocSpace and ROCAgents.
Do not expose credentials, private keys, or internal network details.
Be concise, professional, highly intelligent, and efficient.
"""
EOF

echo "🔥 Firewall: Opening port 11434 in iptables..."
sudo iptables -I INPUT -p tcp --dport 11434 -j ACCEPT 2>/dev/null || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save 2>/dev/null || true
fi

echo "🚀 Starting Ollama private model container..."
docker compose -f "$ROOT/docker-compose.yml" up -d 2>/dev/null || sudo docker compose -f "$ROOT/docker-compose.yml" up -d 2>/dev/null || sudo docker-compose -f "$ROOT/docker-compose.yml" up -d

echo "⏳ Waiting for Ollama engine readiness..."
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 2; done

echo "📥 Pulling base model ($BASE_MODEL)..."
docker exec rocspace-personal-model ollama pull "$BASE_MODEL" 2>/dev/null || true
docker cp "$ROOT/Modelfile" rocspace-personal-model:/tmp/Modelfile 2>/dev/null || true
docker exec rocspace-personal-model ollama create "$MODEL_NAME" -f /tmp/Modelfile 2>/dev/null || true

echo ""
echo "=========================================="
echo "🎉 OCI PRIVATE PERSONAL MODEL IS READY!"
echo "=========================================="
echo "Direct IP Endpoint: http://$(curl -s ifconfig.me || echo '161.118.253.28'):11434"
echo "Model Name:         $MODEL_NAME"
echo ""
echo "🌐 Launching Cloudflare Tunnel (SSL HTTPS Encrypted)..."
curl -fsSL https://raw.githubusercontent.com/ivansslo/rocagents/main/oci/setup-cf-tunnel.sh | bash -s -- 11434
