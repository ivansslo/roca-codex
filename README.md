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
| Version | 5.20.0 |
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

---

## Operator tools

```bash
cd ~/RocAgent
bash tools/install.sh
source ~/.bashrc
```

Installs `rocvault` and `rocagent-vm` into `~/.local/bin` and adds that
directory to `PATH`. Checks dependencies first, including whether the local
OpenSSL actually supports `kdf` and HMAC. Safe to re-run.

| Tool | Purpose |
|---|---|
| `rocvault` | Encrypt `.env` at rest — PBKDF2 600k, AES-256-CBC, encrypt-then-MAC |
| `rocagent-vm` | Drive this repo on a remote VM from a phone, over SSH |

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
  tools.ts              Tool implementations (file, shell, git, http, ssh)
  commandGuard.ts       Shell command inspection — see Security model
  authMiddleware.ts     Timing-safe password auth, token cookies
  db.ts                 SQLite persistence: sessions, memories, logs
  scheduler.ts          Background routines
  __tests__/            Guard unit + integration tests
src/                    React frontend (Vite)
dashboard/              Standalone monitoring page
docs/                   Operational notes
```

### Related projects by the same author

RocAgent runs **on top of** this infrastructure. It does not import them as
libraries — they provide the environment, RocAgent runs inside it.

| Project | Role |
|---|---|
| [rootd-fs](https://github.com/ivansslo/rootd-fs) | Rootless container runtime for Termux (MIT) |
| [termuxrd](https://github.com/ivansslo/termuxrd) | Termux environment setup (MIT) |
| [termuxrd-cloud](https://github.com/ivansslo/termuxrd-cloud) | Phone-to-cloud VM bridge over Tailscale (MIT) |

---

## Attribution

Built by **Ivan Ssl** ([@ivansslo](https://github.com/ivansslo)).

Third-party dependencies retain their own licences; see `package.json`. Those
licences apply to those components only and grant no rights over this software.
