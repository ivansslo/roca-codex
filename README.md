# ⚡ RocAgent

**Autonomous AI agent & orchestrator — runs on your own hardware.**

Chat-driven agent that executes real shell commands, edits files, and manages
infrastructure from an Android phone (Termux) or a Linux server. No cloud
middleman: the model API is the only thing that leaves your machine.

---

## ⚠️ Proprietary — All Rights Reserved

**© 2026 Ivan Ssl (ivansslo). This is not open source software.**

The source is visible for evaluation and security review only. You may **not**
use, copy, fork, modify, deploy, or redistribute it, in whole or in part,
without **prior written permission** from the copyright holder.

This includes use as training data or retrieval material for AI systems.

See [LICENSE](LICENSE) for the full terms. For licensing enquiries, contact the
copyright holder.

> This project is under active development and has **not been publicly
> released**. It is published in its finished form, by its author, when it is
> ready — not before.

---

## Status

| | |
|---|---|
| Version | 5.22.0 |
| Stage | Active development — hardening phase |
| Runtime | Node.js 20+, Termux (aarch64) or Linux (x86_64) |
| Licence | Proprietary, all rights reserved |

---

## Security model

This server **executes shell commands on the host it runs on**. That is the
whole point of the product, and also its largest risk. Three layers guard it:

**1. Authentication is mandatory.**
`WEB_PASSWORD` must be set and at least 12 characters, or the process exits
with a non-zero status. There is no unauthenticated mode.

**2. Loopback binding by default.**
The server listens on `127.0.0.1` only. Reaching beyond the device requires
setting `HOST` deliberately, and a warning is printed when you do. Never expose
it on a network you do not control — put Tailscale or a VPN in front instead.

**3. Shell command guard.**
Every command from `run_bash_command`, `terminal_manager` and `ssh_run` passes
through [`server/commandGuard.ts`](server/commandGuard.ts). It parses the
command into the programs it would actually run — following pipes, `;`, `&&`,
command substitution and backticks, and recursing into `sh -c` payloads — then
blocks destructive binaries, inline interpreter code, `curl | sh`, credential
reads, `rm -rf`, and history-destroying git operations.

> **Honest limitation.** Pattern-based command filtering cannot be made
> airtight against someone who can already submit arbitrary strings. The guard
> is a seatbelt against agent mistakes, not a sandbox. The durable boundary is
> OS-level isolation: run this under a dedicated unprivileged user, in a
> container, on a machine you can afford to rebuild.

Guard mode is set with `SHELL_GUARD=enforce|warn|off` (default `enforce`).
Every decision is logged with the tool name, verdict, and command.

**Hardening around the edges.**

- `/api/ssh/exec` and the `ssh_run` tool share the same guard choke point.
- `http_request` refuses URLs that resolve to private, loopback or link-local
  addresses (cloud metadata `169.254.169.254`, the `100.x` tailnet, the LAN)
  and re-validates every redirect hop — SSRF protection.
- `oci_vm` (Oracle Cloud compute instance lifecycle) and `rootd_fs` (rootless
  container runtime — drives the already-installed `rootd` CLI, does not
  modify it) build every invocation as an argv array via `execFile`, never a
  shell string, so parameter values cannot break out via shell
  metacharacters; both restrict their action/subcommand surface to a fixed
  allowlist, and destructive operations (`oci_vm` terminate, `rootd_fs`
  rm/purge) require an explicit `confirm:true` rather than acting on the
  first request.
- `self_develop_capability` *execution* is **off by default**: snippets run with
  full Node privileges, so enabling them would bypass the guard entirely.
  Opt in deliberately with `SELF_DEV_EXECUTE=true`.
- Login is rate-limited: 5 wrong passwords from one address locks it for 15
  minutes. Rotating `WEB_PASSWORD` at runtime invalidates all live sessions.
- `/api/env/config` returns secrets masked (last 4 chars only); a masked value
  submitted back can never overwrite the real one.
- `db.json` logs are capped at 2000 entries.

**The durable boundary is the OS, not the guard.** For the VM, run the server
as a dedicated unprivileged user with a hardened systemd unit:
`sudo bash tools/setup-isolated-user.sh` — full recipe and Termux guidance in
[`docs/ISOLASI-OS.md`](docs/ISOLASI-OS.md).

---

## Operator tools

```bash
cd ~/RocAgent
bash tools/install.sh
source ~/.bashrc
```

Installs `rocvault` and `rocagent-vm` into `~/.local/bin`, adds that directory
to `PATH`, and creates `~/.config/rocagent/` (mode 700) with three env files
(mode 600) ready to edit:

| File | Holds |
|---|---|
| `app.env` | `WEB_PASSWORD`, one model key, `PORT`, `HOST` — all RocAgent reads |
| `cloud.env` | OCI, Cloudflare, Aiven, Neon |
| `personal.env` | GitHub, GitLab, npm |

Split deliberately: RocAgent only ever reads `app.env`, so compromising the
server exposes one model key rather than your whole estate.

`WEB_PASSWORD` is filled with `openssl rand -base64 24` on first run. Existing
files are **never overwritten** — re-running only tightens permissions on them.
Dependencies are checked first, including whether the local OpenSSL really
supports `kdf` and HMAC.

| Tool | Purpose |
|---|---|
| `rocvault` | Encrypt `.env` at rest — PBKDF2 600k, AES-256-CBC, encrypt-then-MAC |
| `rocagent-vm` | Drive this repo on a remote VM from a phone, over SSH |
| `verify-rotation.sh` | Prove old credentials are actually dead after rotating |
| `unhook-ubuntu.sh` | Remove the Termux auto-launch container hook |
| `test-agent.sh` | Layered check of why the agent is not replying |
| `fix-git-am.sh` | Clear a stuck `git am` and report what is blocking a patch |
| `install-bashrc-helpers.sh` | Shell helpers: `oci`, `awsx`, `ts`, `dock`, `roc` |

### Terminal client

```bash
rocvault run ~/.config/rocagent/app.env.vault -- npm run cli
rocvault run ~/.config/rocagent/app.env.vault -- npm run cli -- "one-shot prompt"
```

`rocagent-cli` talks to the local server over HTTP, so it shares sessions,
memory and tools with the web UI. In-session: `/model`, `/persona`, `/new`,
`/stat`, `/help`, `/exit`, plus Agent Multi:

```
/pipelines                              list both pipelines and their roles
/agents <task>                          run the "fast" pipeline (default)
/agents engineering <task>              run the "engineering" pipeline
```

Streams the same `/api/agents/orchestra/stream` SSE events the web UI's
"Agent Multi" tab uses — each role's report prints as it completes, with
`[ SCORE ]` / `[ COVERAGE ]` / `[ RELEASE ]` tags shown inline when the
engineering pipeline's Pentester/QA emit them. See [Agent
Multi](#agent-multi) above for what each of the 8 roles does.

### Multiple providers

`PROVIDER` accepts a comma-separated list. The first entry that has a key
becomes active; the rest form the failover order. Entries without a key are
skipped, so listing more than you have configured is safe.

```
PROVIDER=groq,gemini,openai,openrouter,cfai
```

Aliases: `xgoog`/`google` → gemini, `deepseek` → openrouter, `cf` → cfai.

On the VM: `rocagent-vm pull && rocagent-vm setup-tools`

### Termux drops you into an Ubuntu container on startup?

An older `termux-rocd` installer appended an auto-launch block to `~/.bashrc`.
RocAgent does not need it — the server runs natively on Termux. Remove it:

```bash
bash tools/unhook-ubuntu.sh --dry-run   # show what would change
bash tools/unhook-ubuntu.sh             # remove it, backing up .bashrc first
exec bash -l
```

**Termux needs `openssl-tool`, not `openssl`:**

```bash
pkg install -y openssl-tool coreutils git openssh
```

---

## Requirements

- Node.js 20 or newer
- At least one model API key (Gemini, Groq, OpenAI, or OpenRouter)
- Termux with `proot-distro` (Android), or any Linux distribution

---

## Configuration

Copy `.env.example` to `.env` and fill it in. The variables that matter:

| Variable | Required | Purpose |
|---|---|---|
| `WEB_PASSWORD` | **yes** | Server refuses to start without it. Minimum 12 chars. |
| `GEMINI_API_KEY` | one of | Model provider key — also `GROQ_KEY`, `OPENAI_API_KEY`, `OR_KEY` |
| `HOST` | no | Bind address. Default `127.0.0.1`. Change only for trusted networks. |
| `PORT` | no | Default `3000` |
| `SHELL_GUARD` | no | `enforce` (default), `warn`, or `off` |

Generate a password:

```bash
export WEB_PASSWORD="$(openssl rand -base64 24)"
```

---

## Running

> Requires a licence. See the notice above.

```bash
cp .env.example .env
# edit .env: set WEB_PASSWORD and at least one API key

npm install
npm run build      # frontend -> dist/, backend -> dist/server.cjs
npm start          # -> http://127.0.0.1:3000
```

Development mode with live Vite middleware:

```bash
npm run dev
```

### Termux (Android)

```bash
pkg update -y && pkg install -y nodejs-lts git curl openssh proot-distro
export WEB_PASSWORD="$(openssl rand -base64 24)"
npm install && npm run build && npm start
```

### Remote access

Do not change `HOST` to `0.0.0.0`. Use a private network overlay:

```bash
HOST=100.x.y.z npm start      # a Tailscale address, not a public one
```

---

## Tests

```bash
npm test              # guard unit tests + integration tests
npm run test:guard    # unit tests only
npm run lint          # tsc --noEmit
```

The integration test asserts that blocked commands never reach `execAsync`, and
verifies a canary file survives repeated `rm -rf` attempts.

---

## Architecture

```
server.ts               Express entry point, auth gate, HTTP API
server/
  orchestrator.ts       Model loop, tool dispatch, SSE streaming
  agentOrchestra.ts     Agent Multi — Scout/Builder/Breaker/Closer pipeline (see below)
  tools.ts              Tool implementations (file, shell, git, http, ssh)
  commandGuard.ts       Shell command inspection — see Security model
  authMiddleware.ts     Timing-safe password auth, token cookies
  db.ts                 JSON persistence (db.json): sessions, memories, capped logs
  scheduler.ts          Background routines
  __tests__/            Guard unit + integration tests
src/                    React frontend (Vite)
  components/AgentOrchestraTab.tsx      Agent Multi launcher + live visualizer
  components/OrchestraVisualizer.tsx    Node graph for the 4-role pipeline
  lib/agentOrchestraStream.ts           SSE client for /api/agents/orchestra/stream
dashboard/              Standalone monitoring page
docs/                   Operational notes
```

---

## Agent Multi

Eight roles across two selectable pipelines, built **on top of**
`runOrchestrator` — it does not replace or bypass it. Every role's tool calls
go through the exact same shell guard, SSRF guard, auth and `db.json` logging
as a normal chat turn.

```
fast:        Scout → Builder/Modder → Breaker → Closer
engineering: Chief Architect → Lead Developer → Security Pentester → QA Supervisor
```

The `engineering` pipeline is adapted from
[roc-webui](https://github.com/ivansslo/roc-webui)'s "4-Step Engineering
Orchestra" (Apache-2.0) — same four roles and the same `[ SCORE: A ]` /
`[ COVERAGE: 94% ]` / `[ RELEASE: v1.0.0-rc1 ]` sign-off convention, but
rebuilt here on real RocAgent tools instead of that project's offline
simulator: Architect reads the actual workspace before blueprinting,
Developer writes real files instead of stopping at a markdown block, and
Pentester/QA ground their score and coverage claims in files they actually
inspected or tests they actually ran.

| Pipeline | Role | Job | Typical tools |
|---|---|---|---|
| fast | **Scout** | Fast, read-only recon — catches project/file context before anything is built. | `list_project_files`, `read_project_file`, `search_codebase`, read-only shell |
| fast | **Builder/Modder** | Real implementation. Takes initiative and executes immediately — no clarifying questions. | `write_project_file`, `edit_project_file`, `run_bash_command`, `terminal_manager` |
| fast | **Breaker** | Tries to break what Builder just produced — injection, auth bypass, secret exposure, SSRF, path traversal — validated with real tool checks. | `search_codebase`, `run_bash_command`, `read_project_file` |
| fast | **Closer** | Reads the prior reports and makes the fast final call. | Spot-check tool calls only when a claim looks unverified |
| engineering | **Chief Architect** | Designs the system blueprint — file layout, tech stack, security posture, data schema. | `list_project_files`, `read_project_file`, `search_codebase`, `git log/diff` |
| engineering | **Lead Developer** | Implements the blueprint for real. | `write_project_file`, `edit_project_file`, `run_bash_command`, `terminal_manager` |
| engineering | **Security Pentester** | OWASP Top 10 audit of what Developer produced, with an explicit score. | `read_project_file`, `search_codebase`, `run_bash_command`, `[ SCORE ]` |
| engineering | **QA Supervisor** | Regression test spec/execution, coverage, release sign-off. | `write_project_file`, `run_bash_command`, `[ COVERAGE ]`, `[ RELEASE ]` |

Each role hands its report to every later role in its pipeline via the same
`## Current Context` mechanism `buildSystemPrompt` already uses for chat —
hand-off is generic (by pipeline order), not hardcoded per role name. If a
role's underlying provider call fails, the pipeline stops with an honest
failure instead of letting later roles verdict on missing data.

**Endpoint:** `POST /api/agents/orchestra/stream` — same SSE framing as
`/api/chat/stream` (`event: <type>\ndata: <json>\n\n`), with an added
`pipeline: "fast" | "engineering"` request field (default `fast`) and
per-role events: `run_start`, `step_start`, `step_chunk`, `step_tool_start`,
`step_tool_result`, `step_done` (carries `meta.securityScore` /
`meta.qaCoverage` / `meta.releaseTag` when the engineering pipeline's
Pentester/QA emit them), `step_failed`, `run_done`. Requires the same session
cookie as every other `/api/` route.

**UI:** the "Agent Multi" tab in the sidebar — pick a pipeline, launch a
prompt, watch the four nodes light up in sequence, and read the final role's
verdict at the end. The tab is lazy-loaded, so it adds no weight to the
default Chat bundle.

**CLI:** `rocagent-cli` (see [Terminal client](#terminal-client) below) has
the same pipelines via `/agents [fast|engineering] <task>` and `/pipelines`,
streaming the same SSE events straight to the terminal.

**Security note:** this pipeline does not loosen `SHELL_GUARD` or any other
protection — every role's tool calls are exactly as constrained as a normal
chat message. See [Security model](#security-model) above for what the guard
does and does not cover.

---

## Attribution

Built by **Ivan Ssl** ([@ivansslo](https://github.com/ivansslo)).

Third-party dependencies retain their own licences; see `package.json`. Those
licences apply to those components only and grant no rights over this software.
See [`NOTICE.md`](NOTICE.md) for the runtime environment and design
attribution this project does not otherwise duplicate here.
