#!/usr/bin/env bash
# test-agent.sh — periksa apakah agent benar-benar bisa menjawab.
#
# Menguji berlapis dari yang paling murah ke paling mahal, dan berhenti di
# lapisan pertama yang gagal — supaya jelas DI MANA masalahnya, bukan sekadar
# "tidak merespons".
#
#   1. Kunci API ada di environment?
#   2. Kunci diterima penyedia?
#   3. Kunci boleh memanggil endpoint chat?
#   4. Server RocAgent hidup dan auth bekerja?
#   5. /api/chat mengembalikan jawaban sungguhan?
#
# Pakai:
#   cd ~/RocAgent
#   rocvault run ~/.config/rocagent/app.env.vault -- bash tools/test-agent.sh
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -uo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$c_red" "$c_rst" "$*"; }
warn() { printf '  %s⚠%s  %s\n' "$c_yel" "$c_rst" "$*"; }
step() { printf '\n%s── %s ──%s\n' "$c_dim" "$*" "$c_rst"; }
hint() { printf '    %s\n' "$*"; }

PORT="${PORT:-3000}"
BASE="http://127.0.0.1:$PORT"

# ── 1. Environment ───────────────────────────────────────────────
step "1. Environment"

if [ -z "${WEB_PASSWORD:-}" ]; then
  bad "WEB_PASSWORD tidak ada"
  hint "Skrip ini harus dijalankan lewat rocvault supaya env termuat:"
  hint "  rocvault run ~/.config/rocagent/app.env.vault -- bash tools/test-agent.sh"
  exit 1
fi
ok "WEB_PASSWORD ada (${#WEB_PASSWORD} karakter)"

PROVIDER_ENV="${PROVIDER:-<tidak diset>}"
ok "PROVIDER = $PROVIDER_ENV"

FOUND_KEY=""
for v in OPENAI_API_KEY OPENAI_KEY GEMINI_API_KEY GROQ_KEY OR_KEY OPENROUTER_API_KEY; do
  val="${!v:-}"
  [ -n "$val" ] || continue
  ok "$v ada (${#val} karakter)"
  [ -z "$FOUND_KEY" ] && FOUND_KEY="$v"
done
if [ -z "$FOUND_KEY" ]; then
  bad "Tidak ada kunci penyedia model sama sekali"
  hint "rocvault edit ~/.config/rocagent/app.env.vault"
  exit 1
fi

# ── 2 & 3. Kunci diterima penyedia? ──────────────────────────────
step "2. Kunci diterima penyedia?"

if [ -n "${OPENAI_API_KEY:-${OPENAI_KEY:-}}" ]; then
  KEY="${OPENAI_API_KEY:-$OPENAI_KEY}"

  body=$(curl -s --max-time 25 -H "Authorization: Bearer $KEY" https://api.openai.com/v1/models)
  if printf '%s' "$body" | grep -q '"object": *"list"'; then
    ok "Kunci sah, dan berizin membaca daftar model"
  elif printf '%s' "$body" | grep -qi 'insufficient_permission\|missing scopes'; then
    warn "Kunci SAH, tapi tidak berizin untuk /v1/models"
    hint "Itu wajar untuk kunci restricted. Yang penting endpoint chat di bawah."
  elif printf '%s' "$body" | grep -qi 'invalid_api_key\|Incorrect API key'; then
    bad "Kunci DITOLAK — salah atau sudah dicabut"
    hint "Buat baru di platform.openai.com/api-keys, lalu:"
    hint "  rocvault edit ~/.config/rocagent/app.env.vault"
    exit 1
  else
    warn "Respons tak terduga:"
    printf '%s' "$body" | head -3 | sed 's/^/      /'
  fi

  step "3. Kunci boleh memanggil endpoint chat?"
  # Inilah yang benar-benar dipakai agent. Kunci bisa lolos langkah 2 tapi gagal
  # di sini kalau scope "Model capabilities" masih Request, bukan Write.
  chat=$(curl -s --max-time 30 -H "Authorization: Bearer $KEY" \
         -H 'Content-Type: application/json' \
         -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
         https://api.openai.com/v1/chat/completions)
  if printf '%s' "$chat" | grep -q '"choices"'; then
    ok "Endpoint chat BEKERJA — agent seharusnya bisa menjawab"
  elif printf '%s' "$chat" | grep -qi 'insufficient_permission\|missing scopes'; then
    bad "Kunci sah tapi TIDAK BOLEH memanggil chat"
    hint "platform.openai.com/api-keys -> edit kunci ->"
    hint "  Model capabilities: ubah dari 'Request' menjadi 'Write'"
    exit 1
  elif printf '%s' "$chat" | grep -qi 'insufficient_quota\|exceeded your current quota'; then
    bad "Kuota/saldo habis"
    hint "platform.openai.com/settings/organization/billing"
    exit 1
  elif printf '%s' "$chat" | grep -qi 'model_not_found\|does not exist'; then
    bad "Model gpt-4o-mini tidak tersedia untuk akun ini"
    exit 1
  else
    bad "Panggilan chat gagal:"
    printf '%s' "$chat" | head -5 | sed 's/^/      /'
    exit 1
  fi
else
  warn "Bukan OpenAI — lewati uji langsung ke penyedia"
  hint "Uji lewat server saja (langkah berikutnya)"
fi

# ── 4. Server ────────────────────────────────────────────────────
step "4. Server RocAgent"

[ -f package.json ] || { bad "Bukan direktori proyek. Jalankan dari ~/RocAgent"; exit 1; }
[ -f dist/server.cjs ] || { bad "Belum di-build. Jalankan: npm run build"; exit 1; }
ok "dist/server.cjs ada"

STARTED=no
if curl -s --max-time 5 -o /dev/null "$BASE/api/health" 2>/dev/null; then
  ok "Server sudah berjalan di $BASE"
else
  printf '  Menjalankan server sementara di port %s...\n' "$PORT"
  node dist/server.cjs >/tmp/test-agent-server.log 2>&1 &
  SRV=$!
  STARTED=yes
  for _ in $(seq 1 20); do
    curl -s --max-time 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break
    sleep 1
  done
  if ! curl -s --max-time 3 -o /dev/null "$BASE/api/health" 2>/dev/null; then
    bad "Server gagal start. Log:"
    tail -15 /tmp/test-agent-server.log | sed 's/^/      /'
    [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
    exit 1
  fi
  ok "Server hidup"
fi

cleanup() { [ "$STARTED" = yes ] && [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -f /tmp/ta-cookie; }
trap cleanup EXIT

# Model apa yang dianggap tersedia oleh server
models=$(curl -s --max-time 10 "$BASE/api/models")
active=$(printf '%s' "$models" | sed -n 's/.*"active_provider":"\([^"]*\)".*/\1/p')
usable=$(printf '%s' "$models" | grep -o '"active":true' | wc -l)
ok "active_provider = ${active:-?}, model tersedia = $usable"
if [ "${usable:-0}" -eq 0 ]; then
  bad "Server tidak melihat satu pun model tersedia"
  hint "Berarti env tidak sampai ke server. Jalankan lewat rocvault run."
  exit 1
fi

# ── 5. Chat sungguhan ────────────────────────────────────────────
step "5. Kirim pesan ke agent"

curl -s -c /tmp/ta-cookie -X POST -H 'Content-Type: application/json' \
     -d "{\"password\":$(printf '%s' "$WEB_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')}" \
     -o /dev/null "$BASE/api/auth/login"

code=$(curl -s -b /tmp/ta-cookie -o /tmp/ta-chat.json -w '%{http_code}' \
       --max-time 90 -X POST -H 'Content-Type: application/json' \
       -d '{"messages":[{"role":"user","text":"Balas satu kata saja: OK"}]}' \
       "$BASE/api/chat")

if [ "$code" != "200" ]; then
  bad "HTTP $code dari /api/chat"
  head -c 400 /tmp/ta-chat.json | sed 's/^/      /'
  exit 1
fi

reply=$(python3 -c "
import json,sys
try:
    d=json.load(open('/tmp/ta-chat.json'))
    print((d.get('text') or d.get('error') or json.dumps(d))[:400])
except Exception as e:
    print('gagal membaca respons:', e)
" 2>/dev/null || head -c 300 /tmp/ta-chat.json)

if printf '%s' "$reply" | grep -q "Tidak ada provider AI"; then
  bad "Semua penyedia gagal. Pesan dari server:"
  printf '%s\n' "$reply" | sed 's/^/      /'
  exit 1
fi

ok "AGENT MENJAWAB:"
printf '%s\n' "$reply" | head -10 | sed 's/^/      /'

printf '\n%s── Agent berfungsi ──%s\n\n' "$c_grn" "$c_rst"
printf 'Jalankan normal:\n'
printf '  cd ~/RocAgent\n'
printf '  rocvault run ~/.config/rocagent/app.env.vault -- npm start\n'
printf '  buka http://127.0.0.1:3000\n\n'
