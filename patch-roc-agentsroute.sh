#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
#  LEGACY PATCH for roc-agentsroute/hermes  (AIS-DEV + Orchestrator)
#
#  NOTE: Since v5.11.0 all of these features are built into `hermes`
#  natively (and the old double-patching damage was cleaned up).
#  Running this script on v5.11.0+ is a safe NO-OP.
#
#  It is kept only for people still on v5.9.x / v5.10.x binaries.
#  The patch is now IDEMPOTENT — safe to run any number of times.
# ═════════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

HERMES="hermes"
[ ! -f "$HERMES" ] && { echo "❌ hermes not found — run from the roc-agentsroute dir"; exit 1; }

CUR_VER="$(grep -m1 '^VERSION=' "$HERMES" | cut -d'"' -f2)"
echo "Found hermes v$CUR_VER"

# ─── Already up to date? ─────────────────────────────────────────────────────
if grep -q '^cmd_orchestrator()' "$HERMES" && [ "$(grep -c '^cmd_orchestrator()' "$HERMES")" -eq 1 ]; then
  echo "✅ Orchestrator already integrated (single copy) — nothing to patch."
  echo "   (v5.11.0+ includes AIS-DEV provider, orchestrator and AI-Studio export natively)"
  exit 0
fi

echo "Backing up..."
cp "$HERMES" "$HERMES.bak.$(date +%s)"

# ─── 1. AIS_DEV constant ─────────────────────────────────────────────────────
grep -q '^AIS_DEV=' "$HERMES" || \
  sed -i '/^CLOUDRUN=/a AIS_DEV="https://ais-dev-4kbznhxyc5wsr5c6oxw6zz-70765440683.asia-east1.run.app"  # Google AI Studio Applet (fast + high thinking)' "$HERMES"

# ─── 2. Default model for AIS provider ───────────────────────────────────────
grep -q 'ais|aisdev|newcr|ais-dev) echo' "$HERMES" || \
  sed -i '/gateway)      echo "llama-3.3-70b-versatile" ;;/a \    ais|aisdev|newcr|ais-dev) echo "gemini-1.5-flash" ;;  # fast + high-thinking' "$HERMES"

# ─── 3. _provider_ready for AIS ──────────────────────────────────────────────
grep -q 'ais|aisdev|newcr|ais-dev) \[ -n "\$TOKEN" \]' "$HERMES" || \
  sed -i '/cloudrun)      \[ -n "\$TOKEN" \] ;;/a \    ais|aisdev|newcr|ais-dev) [ -n "$TOKEN" ] ;;  # same TOKEN as gateway' "$HERMES"

# ─── 4. AIS in best-runtime ranking (right after groq) ───────────────────────
grep -q '_provider_ready ais' "$HERMES" || \
  sed -i '/echo "groq|\$(_default_model_for groq)"; return/,/fi/!b; /fi/a \  if _provider_ready ais; then\n    echo "ais|$(_default_model_for ais)"; return\n  fi' "$HERMES"

# ─── 5. Orchestrator + AI-Studio export BEFORE the MAIN case dispatcher ──────
#     (The old patch appended them AFTER `case ... esac`, so the commands
#      could never actually run. We insert before the dispatcher instead.)
if ! grep -q '^cmd_orchestrator()' "$HERMES"; then
  TMP="$(mktemp)"
  cat > "$TMP" <<'NEW_FUNCS'

# ═════════════════════════════════════════════════════════════════════════════
#  AUTONOMOUS ORCHESTRATOR (High Thinking + Coding + Grounding)
# ═════════════════════════════════════════════════════════════════════════════
cmd_orchestrator() {
  local task="$*"
  [ -z "$task" ] && { err "Usage: hermes orchestrator <complex task>"; return 1; }
  header
  echo -e "${BOLD}🧠 Autonomous Orchestrator${N} — High Thinking + Grounding"
  echo -e "  Task: ${C}$task${N}"
  echo -e "  Flow: Planner → Researcher → Coder → Reviewer → Tester + Grounding\n"
  local workdir="${HERMES_CODE_WORKSPACE:-$(pwd)}"
  local steps="${HERMES_ORCHESTRATOR_STEPS:-6}"
  local last=""
  for step in $(seq 1 "$steps"); do
    echo -e "${Y}── Step $step/$steps ──${N}"
    local prompt="You are Hermes Autonomous Orchestrator (high-thinking, coding, grounding).
Task: $task
Step: $step/$steps
Previous: $last
Return ONLY compact JSON:
{\"thought\":\"reasoning\",\"role\":\"planner|researcher|coder|reviewer|tester\",\"action\":\"shell|read|write|search|done\",\"command\":\"...\",\"path\":\"...\",\"content\":\"...\",\"message\":\"summary\"}"
    local resp json
    resp=$(cmd_ask_internal "$prompt" "Output ONLY valid JSON.")
    json=$(printf "%s" "$resp" | _extract_json_object 2>/dev/null)
    [ -z "$json" ] && { warn "Bad JSON from model"; last="invalid JSON"; continue; }
    local action
    action=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("action",""))' "$json" 2>/dev/null)
    case "$action" in
      shell)
        local c out
        c=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("command",""))' "$json" 2>/dev/null)
        echo -e "  ${BOLD}$ $c${N}"
        out=$(cd "$workdir" && timeout 90 bash -lc "$c" 2>&1 | head -60)
        printf "    %s\n" "$out"
        last="shell: $c"
        ;;
      write)
        local p ct
        p=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("path",""))' "$json" 2>/dev/null)
        ct=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("content",""))' "$json" 2>/dev/null)
        mkdir -p "$(dirname "$workdir/$p")"
        printf "%s\n" "$ct" > "$workdir/$p"
        ok "Wrote $p"; last="wrote: $p"
        ;;
      done)
        python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("message","Complete"))' "$json" 2>/dev/null
        return 0
        ;;
      *) last="$action" ;;
    esac
    echo ""
  done
  warn "Max steps reached. Continue with: hermes coding"
}

cmd_import_to_aistudio() {
  local task="${*:-Autonomous Hermes Orchestrator}"
  task="${task//\\/\\\\}"; task="${task//\"/\\\"}"
  header
  echo -e "${BOLD}📥 Auto Export for Google AI Studio / AIS-DEV${N}\n"
  cat << JSON
{"name":"Hermes Autonomous Orchestrator","version":"5.11.0","task":"$task","providers":["ais","gateway","gemini","groq","openrouter"],"ais_dev":"$AIS_DEV","gateway":"$GATEWAY","recommended_model":"gemini-1.5-flash"}
JSON
  ok "Agent definition ready for AI Studio / AIS-DEV"
}

NEW_FUNCS
  awk -v inject="$TMP" '
    /^#  MAIN$/ && !done {
      while ((getline line < inject) > 0) print line
      done=1
    }
    { print }
  ' "$HERMES" > "$HERMES.new"
  mv "$HERMES.new" "$HERMES"
  chmod +x "$HERMES"
  rm -f "$TMP"

  # Register commands in the dispatcher (once)
  sed -i '/case "${1:-help}" in/a \  orchestrator) shift; cmd_orchestrator "$@" ;;\n  import|ais-import) shift; cmd_import_to_aistudio "$@" ;;' "$HERMES"
fi

bash -n "$HERMES" && echo "✅ Syntax OK"
echo "✅ Patch applied (idempotent — re-running is a no-op)."
