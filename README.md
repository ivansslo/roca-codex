# ⚡ ROCAgents — Unified Hermes AI Agent CLI & Local Web UI

<div align="center">

![ROCAgents Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

**Integrated Autonomous AI System combining Hermes Agent CLI (v5.14.0 "Oracle") and the Local DevAgent Orchestrator Web UI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Hermes CLI](https://img.shields.io/badge/Hermes%20CLI-v5.14.0%20Oracle-blueviolet)](./hermes)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)

</div>

---

## 🌟 Overview

**ROCAgents** combines two primary modes of operation into a single repository:

1. **⚡ Hermes Agent CLI**: Terminal-based AI agent, code generator, multi-turn orchestrator, and utility suite compatible with Linux and Termux.
2. **🌐 Local Web UI Server**: Full-stack web interface powered by Express, Vite, and React 19 featuring Live Terminal execution, multi-session state persistence, file archive, task scheduling, and real-time app sync.

---

## 🚀 Quick Start (Local Setup)

### Prerequisites

- **Node.js**: v18.x or higher
- **npm** / **bun** / **yarn**
- **Google Gemini API Key**: Get your key from [Google AI Studio](https://aistudio.google.com)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/ivansslo/rocagents.git
cd rocagents
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create or copy the environment configuration file:

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```env
GEMINI_API_KEY="your_gemini_api_key_here"
GEMINI_MODEL="gemini-1.5-flash"
PORT=3000
```

---

## 🖥️ Running the Local Web UI Agent

You can start the local Web UI server using `npm` or directly through the `hermes` CLI:

### Option A: Via Hermes CLI

```bash
./hermes webui start
```

### Option B: Via npm

```bash
npm run dev
```

Once started, open your browser at:
👉 **`http://localhost:3000`**

### Web UI Features:
- **💬 Multi-Session Chat**: Persistent chat histories backed by JSON/SQLite.
- **🖥️ Live Terminal**: In-browser command line execution.
- **📊 Sync Dashboard**: Integrated status tracking and app syncing.
- **📁 File Archive**: Browse, edit, and inspect local workspace files.
- **🕒 Routine Scheduler**: Define and monitor automated cron tasks.

---

## ⌨️ Running Hermes Agent CLI

The `hermes` CLI can be executed directly from your terminal:

```bash
# Set execute permission if needed
chmod +x ./hermes

# Interactive AI Chat
./hermes chat

# Execute complex task with Autonomous Orchestrator
./hermes orchestrator "Refactor server.ts and run tests"

# Multi-step coding agent
./hermes agent "Create a math helper utility in src/utils/math.ts"

# Check local Web UI status
./hermes webui status

# Open Web UI in browser
./hermes webui open

# View system health check & available models
./hermes status
./hermes models
```

---

## 🛠️ Built-in Tool Ecosystem

The local Web UI agent and Hermes CLI share an active set of workspace tools:

| Tool | Description |
| :--- | :--- |
| `list_project_files` | List directory structure and workspace files |
| `read_project_file` | Read content of workspace files |
| `write_project_file` | Write or update files in the workspace |
| `delete_project_file` | Remove obsolete files |
| `search_codebase` | Full-text search across all files |
| `execute_terminal_command` | Execute shell/terminal commands in workspace |
| `execute_hermes_command` | Run Hermes CLI commands directly |
| `self_develop_capability` | Dynamically register and execute custom patches/tools |
| `sync_external_app` | Synchronize and index external app components |
| `manage_memory` | Store & retrieve persistent structured knowledge |

---

## 📑 Hermes CLI Commands Reference

```bash
./hermes webui [start|status|open]   # Control local Web UI agent server
./hermes chat [model] [provider]    # Interactive AI session
./hermes orchestrator <task>       # Planner → Coder → Reviewer pipeline
./hermes agent <task>              # Multi-step code agent
./hermes coding                     # Interactive code session (/run /agent /venv)
./hermes crawl <url>                # Crawl web content to markdown
./hermes firebase [status|save]     # Firestore REST/Admin operations
./hermes models                     # List available AI models
./hermes doctor                     # Diagnostic test for keys & endpoints
```

---

## 📂 Project Structure

```
rocagents/
├── hermes                  # Main Hermes Agent CLI executable script
├── server.ts               # Local Express + Vite Agent Web UI server
├── server/                 # Express backend handlers & database layer
│   ├── db.ts               # Persistence, tool schema & chat storage
│   ├── orchestrator.ts     # Gemini tool-calling orchestration engine
│   ├── scheduler.ts        # Cron task runner
│   └── tools.ts            # Active tool implementations
├── src/                    # React 19 Frontend Web UI
│   ├── components/         # Web UI panels (Chat, Terminal, Sync, Scheduler, etc.)
│   ├── App.tsx             # Primary web layout
│   ├── main.tsx            # React entry point
│   └── index.css           # Tailwind styling
├── dashboard/              # Firebase Web Dashboard static files
├── oci/                    # Private OCI model installers
├── install.sh              # Quick installer script
└── README.md               # Unified documentation
```

---

## 🛡️ License

Licensed under the MIT License.
