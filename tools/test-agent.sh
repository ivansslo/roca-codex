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
# Termux tidak menyediakan /tmp; TMPDIR menunjuk $PREFIX/tmp di sana.
TMP="${TMPDIR:-/tmp}"
[ -d "$TMP" ] || TMP="$HOME"

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
# Uji SETIAP penyedia mengikuti urutan PROVIDER. Versi sebelumnya memakai
# rantai elif yang mendahulukan OpenAI apa pun isi PROVIDER, lalu `exit 1`
# begitu OpenAI gagal — sehingga penyedia utama tidak pernah diuji dan
# seluruh gunanya failover hilang.
step "2-3. Uji tiap penyedia (urut sesuai PROVIDER)"

CHAIN="${PROVIDER:-openai}"
WORKING=""
FAILED=""

_try_openai() {
  local KEY="${OPENAI_API_KEY:-${OPENAI_KEY:-}}"
  [ -n "$KEY" ] || { printf '  %s·%s openai      tidak ada kunci\n' "$c_dim" "$c_rst"; return 1; }

  local list model
  list=$(curl -s --max-time 25 -H "Authorization: Bearer $KEY" https://api.openai.com/v1/models)
  model=$(printf '%s' "$list" | grep -o '"id": *"gpt-4o-mini"' | head -1)
  [ -n "$model" ] && model="gpt-4o-mini" || \
    model=$(printf '%s' "$list" | grep -o '"id": *"gpt-[^"]*"' | sed 's/.*"gpt-/gpt-/; s/"//' | head -1)
  [ -n "$model" ] || model="gpt-4o-mini"

  local chat
  chat=$(curl -s --max-time 30 -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
         -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":5}" \
         https://api.openai.com/v1/chat/completions)

  if printf '%s' "$chat" | grep -q '"choices"'; then
    ok "openai      BEKERJA ($model)"; return 0
  elif printf '%s' "$chat" | grep -qi 'insufficient_quota\|exceeded your current quota'; then
    bad "openai      saldo kredit habis"
    hint "Spend limit hanya BATAS ATAS, bukan saldo. OpenAI API prabayar:"
    hint "platform.openai.com/settings/organization/billing -> Add to credit balance"
    return 1
  elif printf '%s' "$chat" | grep -qi 'insufficient_permission\|missing scopes'; then
    bad "openai      kunci tanpa izin chat"
    hint "Kunci -> Model capabilities: ubah 'Request' menjadi 'Write'"
    return 1
  elif printf '%s' "$chat" | grep -qi 'model_not_found\|does not exist'; then
    bad "openai      $model ditolak project"
    hint "Project Settings -> Limits -> Allowed models"
    return 1
  elif printf '%s' "$chat" | grep -qi 'invalid_api_key\|Incorrect API key'; then
    bad "openai      kunci ditolak"; return 1
  else
    bad "openai      gagal: $(printf '%s' "$chat" | head -c 120)"; return 1
  fi
}

_try_groq() {
  [ -n "${GROQ_KEY:-}" ] || { printf '  %s·%s groq        tidak ada kunci\n' "$c_dim" "$c_rst"; return 1; }
  local chat
  chat=$(curl -s --max-time 30 -H "Authorization: Bearer $GROQ_KEY" -H 'Content-Type: application/json' \
         -d '{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
         https://api.groq.com/openai/v1/chat/completions)
  if printf '%s' "$chat" | grep -q '"choices"'; then
    ok "groq        BEKERJA (openai/gpt-oss-120b)"; return 0
  elif printf '%s' "$chat" | grep -qi 'model_not_found\|decommissioned\|does not exist'; then
    bad "groq        model tidak tersedia"
    hint "Groq rutin memensiunkan model: console.groq.com/docs/models"
    return 1
  elif printf '%s' "$chat" | grep -qi 'invalid_api_key\|Invalid API Key'; then
    bad "groq        kunci ditolak — console.groq.com/keys"; return 1
  else
    bad "groq        gagal: $(printf '%s' "$chat" | head -c 120)"; return 1
  fi
}

_try_gemini() {
  local GK="${GEMINI_API_KEY:-${GEMINI_KEY:-${X_GOOG_API_KEY:-}}}"
  [ -n "$GK" ] || { printf '  %s·%s gemini      tidak ada kunci\n' "$c_dim" "$c_rst"; return 1; }
  local chat
  chat=$(curl -s --max-time 30 -H 'Content-Type: application/json' \
         -d '{"contents":[{"parts":[{"text":"ping"}]}]}' \
         "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GK")
  if printf '%s' "$chat" | grep -q '"candidates"'; then
    ok "gemini      BEKERJA (gemini-2.5-flash)"; return 0
  elif printf '%s' "$chat" | grep -qi 'API_KEY_INVALID\|API key not valid'; then
    bad "gemini      kunci ditolak — aistudio.google.com/apikey"; return 1
  elif printf '%s' "$chat" | grep -qi 'RESOURCE_EXHAUSTED\|quota'; then
    bad "gemini      kuota habis"; return 1
  else
    bad "gemini      gagal: $(printf '%s' "$chat" | head -c 120)"; return 1
  fi
}

_try_openrouter() {
  local K="${OR_KEY:-${OPENROUTER_API_KEY:-}}"
  [ -n "$K" ] || { printf '  %s·%s openrouter  tidak ada kunci\n' "$c_dim" "$c_rst"; return 1; }
  local chat
  chat=$(curl -s --max-time 30 -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
         -d '{"model":"google/gemini-2.0-flash-001","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
         https://openrouter.ai/api/v1/chat/completions)
  if printf '%s' "$chat" | grep -q '"choices"'; then
    ok "openrouter  BEKERJA"; return 0
  else
    bad "openrouter  gagal: $(printf '%s' "$chat" | head -c 120)"; return 1
  fi
}

_try_cfai() {
  [ -n "${CF_AI_TOKEN:-${CF_TOKEN:-}}" ] && [ -n "${CF_ACCOUNT_ID:-}" ] || {
    printf '  %s·%s cfai        perlu CF_AI_TOKEN + CF_ACCOUNT_ID\n' "$c_dim" "$c_rst"; return 1; }
  local K="${CF_AI_TOKEN:-$CF_TOKEN}" chat
  chat=$(curl -s --max-time 30 -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
         -d '{"messages":[{"role":"user","content":"ping"}]}' \
         "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast")
  if printf '%s' "$chat" | grep -q '"success": *true'; then
    ok "cfai        BEKERJA"; return 0
  else
    bad "cfai        gagal: $(printf '%s' "$chat" | head -c 120)"; return 1
  fi
}

IFS=',' read -ra _plist <<< "$CHAIN"
for _p in "${_plist[@]}"; do
  _p=$(printf '%s' "$_p" | tr -d ' ' | tr '[:upper:]' '[:lower:]')
  case "$_p" in
    xgoog|google|googleai) _p=gemini ;;
    deepseek|deepsek)      _p=openrouter ;;
    cf|cloudflare)         _p=cfai ;;
  esac
  case "$_p" in
    openai|groq|gemini|openrouter|cfai)
      if "_try_$_p"; then WORKING="$WORKING $_p"; else FAILED="$FAILED $_p"; fi ;;
    *) printf '  %s·%s %-11s tidak dikenal\n' "$c_dim" "$c_rst" "$_p" ;;
  esac
done

printf '\n'
if [ -n "$WORKING" ]; then
  ok "Penyedia siap:$WORKING"
  [ -n "$FAILED" ] && warn "Gagal (dilewati failover):$FAILED"
else
  bad "TIDAK ADA penyedia yang bekerja:$FAILED"
  hint "Agent tidak akan bisa menjawab sampai minimal satu diperbaiki."
  exit 1
fi

# ── 4. Server ────────────────────────────────────────────────────
step "5. Server RocAgent"

[ -f package.json ] || { bad "Bukan direktori proyek. Jalankan dari ~/RocAgent"; exit 1; }
[ -f dist/server.cjs ] || { bad "Belum di-build. Jalankan: npm run build"; exit 1; }
ok "dist/server.cjs ada"

STARTED=no
if curl -s --max-time 5 -o /dev/null "$BASE/api/health" 2>/dev/null; then
  ok "Server sudah berjalan di $BASE"
else
  printf '  Menjalankan server sementara di port %s...\n' "$PORT"
  node dist/server.cjs >"$TMP/test-agent-server.log" 2>&1 &
  SRV=$!
  STARTED=yes
  for _ in $(seq 1 20); do
    curl -s --max-time 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break
    sleep 1
  done
  if ! curl -s --max-time 3 -o /dev/null "$BASE/api/health" 2>/dev/null; then
    bad "Server gagal start. Log:"
    tail -15 "$TMP/test-agent-server.log" | sed 's/^/      /'
    [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
    exit 1
  fi
  ok "Server hidup"
fi

cleanup() { [ "$STARTED" = yes ] && [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -f "$TMP/ta-cookie"; }
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
step "6. Kirim pesan ke agent"

curl -s -c "$TMP/ta-cookie" -X POST -H 'Content-Type: application/json' \
     -d "{\"password\":$(printf '%s' "$WEB_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')}" \
     -o /dev/null "$BASE/api/auth/login"

code=$(curl -s -b "$TMP/ta-cookie" -o "$TMP/ta-chat.json" -w '%{http_code}' \
       --max-time 90 -X POST -H 'Content-Type: application/json' \
       -d '{"messages":[{"role":"user","text":"Balas satu kata saja: OK"}]}' \
       "$BASE/api/chat")

if [ "$code" != "200" ]; then
  bad "HTTP $code dari /api/chat"
  head -c 400 "$TMP/ta-chat.json" | sed 's/^/      /'
  exit 1
fi

reply=$(python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    print((d.get('text') or d.get('error') or json.dumps(d))[:400])
except Exception as e:
    print('gagal membaca respons:', e)
" "$TMP/ta-chat.json" 2>/dev/null || head -c 300 "$TMP/ta-chat.json")

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
