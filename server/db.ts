import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

export interface ExecutionLog {
  timestamp: string;
  toolName: string;
  args: any;
  result: any;
}

export interface SyncedApp {
  id: string;
  name: string;
  status: 'unsynced' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  url: string;
  componentsCount: number;
  filesCount: number;
  apiEndpointsCount: number;
  description: string;
  syncLogs: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: any[];
}

export interface MemoryItem {
  key: string;
  value: string;
  category: string;
  updatedAt: string;
}

export interface SelfCapability {
  id: string;
  name: string;
  codeSnippet: string;
  purpose: string;
  active: boolean;
  category?: string;
  isPinned?: boolean;
  dependencies?: string[];
}

export interface ScheduledRoutine {
  id: string;
  name: string;
  cron: string;
  capabilityName: string;
  active: boolean;
  lastRunAt?: string;
}

interface DatabaseSchema {
  tools: ToolDefinition[];
  logs: ExecutionLog[];
  syncedApps: SyncedApp[];
  chatSessions?: ChatSession[];
  memories?: MemoryItem[];
  selfCapabilities?: SelfCapability[];
  scheduledRoutines?: ScheduledRoutine[];
  snowflakeModels?: string[];
}

const DEFAULT_SCHEMA: DatabaseSchema = {
  tools: [
    {
      name: "list_project_files",
      description: "List the files currently in the developer workspace.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "read_project_file",
      description: "Read the content of a specific file in the workspace.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The name of the file to read (e.g. 'server.ts')." }
        },
        required: ["filename"]
      }
    },
    {
      name: "write_project_file",
      description: "Write or overwrite an entire file in the workspace.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The name of the file to write (e.g. 'src/utils/math.ts')." },
          content: { type: "string", description: "The full content to write to the file." }
        },
        required: ["filename", "content"]
      }
    },
    {
      name: "edit_file",
      description: "Edit an existing file in the workspace by replacing search text with new text. Primary tool for editing UI components, layout React files, and styling.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Relative path to file (e.g. 'src/App.tsx' or 'src/components/ChatMessage.tsx')." },
          old_text: { type: "string", description: "The existing code text block to find and replace." },
          new_text: { type: "string", description: "The replacement code text block." }
        },
        required: ["filename", "old_text", "new_text"]
      }
    },
    {
      name: "edit_project_file",
      description: "Alias for edit_file. Edit a file in the workspace by replacing target text.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Relative path to file." },
          old_text: { type: "string", description: "Existing code text to find." },
          new_text: { type: "string", description: "Replacement code text." }
        },
        required: ["filename", "old_text", "new_text"]
      }
    },
    {
      name: "delete_project_file",
      description: "Delete a file from the workspace.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The name of the file to delete." }
        },
        required: ["filename"]
      }
    },
    {
      name: "search_codebase",
      description: "Search for specific text across all files in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The text query or term to search for." }
        },
        required: ["query"]
      }
    },
    {
      name: "add_new_tool",
      description: "Dynamically register a new tool definition into the database so the orchestrator can use it in future turns.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique name of the new tool." },
          description: { type: "string", description: "A detailed description of what the tool does." },
          parameters: { 
            type: "object", 
            description: "JSON schema describing the parameters."
          }
        },
        required: ["name", "description", "parameters"]
      }
    },
    {
      name: "get_synced_apps_status",
      description: "Retrieve the current synchronization status, file counts, and configuration details.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "sync_external_app",
      description: "Trigger synchronization for an external app to fetch and index its components and files.",
      parameters: {
        type: "object",
        properties: {
          appId: { type: "string", description: "The ID of the application to sync (e.g., 'webvirtcloud')." }
        },
        required: ["appId"]
      }
    },
    {
      name: "inspect_synced_app",
      description: "Inspect component names, API endpoints, or file lists of a synced application.",
      parameters: {
        type: "object",
        properties: {
          appId: { type: "string", description: "The ID of the application." },
          inspectType: { type: "string", description: "What to inspect: 'files', 'endpoints', or 'logs'." }
        },
        required: ["appId", "inspectType"]
      }
    },
    {
      name: "manage_memory",
      description: "Store, retrieve, or clear structured long-term memory facts (daya ingat / penyimpanan banyak) to build an advanced cognitive base.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Memory action: 'store', 'retrieve', 'delete', or 'list'." },
          key: { type: "string", description: "Unique key identifying the fact." },
          value: { type: "string", description: "Text description or JSON string to store (required for 'store')." },
          category: { type: "string", description: "Optional category tag (e.g. 'webvirtcloud', 'lsmod', 'general')." }
        },
        required: ["action"]
      }
    },
    {
      name: "self_develop_capability",
      description: "Autonomous self-improvement: Register or execute code patterns to patch applications or dynamically construct system adapters.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'register', 'execute', or 'list'." },
          name: { type: "string", description: "Name of the self-development capability (e.g. 'PatchDriver', 'OptimizeSync')." },
          codeSnippet: { type: "string", description: "Active JavaScript/TypeScript statements executing edits or system optimizations." },
          purpose: { type: "string", description: "Purpose of the patch or enhancement." },
          category: { type: "string", description: "Optional category tag or group for the capability (e.g. 'WebVirtCloud', 'lsmod', 'general')." }
        },
        required: ["action"]
      }
    },
    {
      name: "run_bash_command",
      description: "Run a bash command in the terminal.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to run." }
        },
        required: ["command"]
      }
    },
    {
      name: "npm_package_manager",
      description: "Manage, query, or publish npm packages using authenticated NPM_API_KEY (roadcx account).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action to perform: 'whoami', 'view', or 'publish'." },
          packageName: { type: "string", description: "Package name for view command." }
        },
        required: ["action"]
      }
    },
    {
      name: "clawhub_sync",
      description: "Synchronize packages or workspace components with ClawHub ecosystem hub.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Sync action: 'sync', 'status', or 'publish'." },
          moduleName: { type: "string", description: "Module name to synchronize." }
        },
        required: []
      }
    },
    {
      name: "clawlink_bridge",
      description: "Bridge mesh network communications and route inter-agent messages across ClawLink nodes.",
      parameters: {
        type: "object",
        properties: {
          targetNode: { type: "string", description: "Target node (e.g. 'OCI-Singapore-VM' or 'Termux-Android-Host')." }
        },
        required: []
      }
    },
    {
      name: "skilllm_executor",
      description: "Execute or register autonomous skills via SkillLM cognitive model engine.",
      parameters: {
        type: "object",
        properties: {
          skillName: { type: "string", description: "Skill name to execute." }
        },
        required: []
      }
    },
    {
      name: "codex_refact_engine",
      description: "Self-Cognitive AST code refactoring and structural optimization engine powered by ivansslo/codex-refact.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Target file to refactor." },
          instruction: { type: "string", description: "Refactoring instruction." }
        },
        required: []
      }
    },
    {
      name: "lsmod_kernel_analyzer",
      description: "Self-Cognitive kernel driver monitoring, module symbols inspector, and device memory analyzer powered by ivansslo/lsmod.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'list', 'inspect', or 'symbols'." },
          moduleName: { type: "string", description: "Target module name to inspect." }
        },
        required: []
      }
    },
    {
      name: "neon_data_api",
      description: "Execute serverless HTTP REST queries and data synchronization against Neon Console PostgreSQL cluster (Project: ROCAgents).",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "REST endpoint path relative to /neondb/rest/v1 (e.g. '/memories')." },
          method: { type: "string", description: "HTTP method: 'GET' or 'POST'." },
          payload: { type: "object", description: "JSON payload for POST requests." }
        },
        required: []
      }
    },
    {
      name: "harness_kv_store",
      description: "Synchronize or manage secrets, API keys, and KV feature flags using Harness.io Vault (Account: arrayfs, Service Account: ROCAgents-Service).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'sync', 'get', or 'set'." },
          secretKey: { type: "string", description: "Key name to store or read." },
          secretValue: { type: "string", description: "Secret string value." }
        },
        required: []
      }
    },
    {
      name: "zapier_mcp_action",
      description: "Execute Zapier automation workflows via Model Context Protocol (MCP v1).",
      parameters: {
        type: "object",
        properties: {
          actionName: { type: "string", description: "Name of the Zapier workflow action." },
          payload: { type: "object", description: "JSON payload for the Zapier action." }
        },
        required: []
      }
    },
    {
      name: "clerk_auth_manager",
      description: "Manage Clerk user authentication sessions and identity directory (Domain: awake-chicken-95.clerk.accounts.dev).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'verify', 'get_user', or 'list_sessions'." },
          userId: { type: "string", description: "Clerk User ID to query." }
        },
        required: []
      }
    },
    {
      name: "github_oauth_app_manager",
      description: "Connect, synchronize, and execute repository actions via GitHub OAuth App 'ROCAgents' (Client ID: Ov23litvasZbgpCiNHIg).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'sync', or 'get_user'." }
        },
        required: []
      }
    },
    {
      name: "backboard_assistant_engine",
      description: "Query or execute custom workflows with Backboard.io AI Assistant Engine (Assistant ID: 3372ebdd-9e29-44c2-b373-8b693c142e6d).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status' or 'query'." },
          prompt: { type: "string", description: "Query prompt for the Backboard assistant." }
        },
        required: []
      }
    },
    {
      name: "honcho_memory_engine",
      description: "Manage, query, and synchronize long-term dialectic memory and cognitive user cards for Ivan Ssl (ivansslo) via Plastic Labs Honcho API.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'save_user_card', or 'get_context'." },
          factKey: { type: "string", description: "Fact key or user card trait name." },
          factValue: { type: "string", description: "Fact content or preference summary." }
        },
        required: []
      }
    },
    {
      name: "grafana_telemetry_manager",
      description: "Inspect metrics, alert triggers, and Grafana.com OAuth SSO telemetry for Organization 'roc' across local Termux and OCI nodes.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'list_dashboards', or 'query_metrics'." },
          targetMetric: { type: "string", description: "Metric name e.g. 'orchestrator_ttft_ms' or 'container_cpu_usage'." }
        },
        required: []
      }
    },
    {
      name: "jules_coding_agent",
      description: "Dispatch autonomous asynchronous code refactoring, bug fixes, and feature PR tasks to Google Labs Jules AI Agent on repository ivansslo/rocagents.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status' or 'create_session'." },
          prompt: { type: "string", description: "Coding instruction prompt for Jules AI agent." },
          targetRepo: { type: "string", description: "Target GitHub repository e.g. 'ivansslo/rocagents'." }
        },
        required: []
      }
    },
    {
      name: "qwen_cloud_manager",
      description: "Manage, inspect and dispatch queries to RoadQwen & Qwen Cloud Models (qwen3.6-plus, qwen3.7-max, qwen3-coder-plus) via Alibaba Cloud Model Studio API.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status' or 'list_models'." },
          modelName: { type: "string", description: "Qwen model ID e.g. 'qwen3.6-plus'." }
        },
        required: []
      }
    },
    {
      name: "rocspace_monorepo_manager",
      description: "Inspect, manage, and synchronize the single source of truth monorepo ivansslo/rocspace (v19.1.1 Command Center, roc-site router, hermes-cloudflare gateway).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'list_workers', or 'inspect_handoff'." }
        },
        required: []
      }
    },
    {
      name: "aperture_tailscale_connector",
      description: "Manage Aperture Beta node roadfx - isolated browser inside Tailscale tailnet. Handles QR/auth authorization flow (Waiting for authorization → Ready), mesh status, and private service access for OCI/Grafana/rocspace. Critical for understanding screenshot aperture.tailscale.com/signup Setting up roadfx.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'authorize_guide', or 'generate_auth_key_instructions'." }
        },
        required: []
      }
    },
    {
      name: "oci_tailscale_shell_integration",
      description: "Configure OCI Singapore VM (100.93.139.73 / 161.118.253.28) as default local shell in Termux. Installs tailscale, sets up auto SSH/Mosh, rocd oci launcher, Ollama tunnel 11434, and makes Termux boot directly into OCI shell with Termux local fallback.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'install_guide', or 'generate_bashrc_block'." }
        },
        required: []
      }
    },
    {
      name: "ssh_daemon_manager",
      description: "Auto-detect and manage local SSH daemon like SimpleSSHD app screenshot (port 8022, user ubuntu, fingerprints 65:ff:dd:47:54:4e:8e:17:f0:83:1c:10:a1:1c:63:1c, path /storage/emulated/0/, Password enabled, GENERATE button). Scans listening ports 22/8022/2222, ps aux sshd, tailscale IPs 100.91.232.91/100.106.22.112/100.100.237.104, and can connect via ssh -p 8022 ubuntu@127.0.0.1 or via Tailscale. Agent capability 100% for SSH daemon.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'scan', 'connect', or 'generate_keys'. Scans ports 8022/22 like screenshot." },
          host: { type: "string", description: "SSH host (default 127.0.0.1 or Tailscale IP 100.91.232.91 / 100.106.22.112)" },
          port: { type: "number", description: "SSH port (default 8022 as in screenshot, or 22)" },
          user: { type: "string", description: "SSH user (default ubuntu as in screenshot)" }
        },
        required: []
      }
    },
    {
      name: "terminal_manager",
      description: "Dedicated terminal for project with 100% local execution (fix page reload + logs rapi). Executes bash commands via POST /api/terminal/exec, returns stdout/stderr, never depends on external AI quotas. Use for: ls -la, pwd, cat .env, npm start logs, tailscale status, etc. Implements Turbo Proxy for all executions.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bash command to execute, e.g. 'ls -la', 'cat server.ts | head -n 50', 'tailscale status', 'npm start 2>&1 | head -n 100'" },
          timeout: { type: "number", description: "Timeout ms (default 30000)" }
        },
        required: ["command"]
      }
    },
        {
      name: "advanced_reasoning_engine",
      description: "Exclusive array function thinking: thinking, observation, grounding, hacking, viewing. Replaces simple KV and asking Terry with exclusive 5-step reasoning. thinking=internal chain-of-thought, observation=read files/logs/env, grounding=verify with tools, hacking=exec/edit code, viewing=render final output. Returns array of reasoning steps for best results.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'think', 'observe', 'ground', 'hack', 'view', or 'full_cycle'. Full cycle runs all 5." },
          query: { type: "string", description: "User query to reason about, e.g. 'Koneksi ke sshdaemon Key semua ada di .env'" },
          context: { type: "string", description: "Optional context (file content, logs, env snippet)" }
        },
        required: []
      }
    },
    {
      name: "fiche_client",
      description: "Pastebin client using ivansslo/fiche (https://github.com/ivansslo/fiche) - fork of solusipse/fiche, command line pastebin. Replaces termbin.com:9999. Uses: echo text | nc termbin.com 9999 or local fiche server localhost 9999. User request: TermBin masih digunakan kah? Jika iya gunakan source saya di ivansslo/fiche. Returns URL like http://termbin.com/xxxx or local fiche URL. For neat logs display.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to upload to fiche/termbin, e.g. logs, tailscale status, npm build output. Max 100k chars." },
          action: { type: "string", description: "Action: 'upload' to termbin.com via nc, or 'upload_local' to local fiche at localhost:9999, or 'status'" },
          server: { type: "string", description: "Fiche server: termbin.com or localhost or custom, default termbin.com (or ivansslo/fiche instance)" }
        },
        required: ["content"]
      }
    },
    {
      name: "web_searching_module",
      description: "Peningkatan Module WebSearching: Eksekusi pencarian web multi-engine dengan 4-tahap analisa kognitif (1. Analisa, 2. Pemahaman, 3. Kesimpulan, 4. Penerapan). Menyajikan fakta web langsung, ekstraksi kode, dan langkah eksekusi real-time secara komprehensif.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topik atau query pencarian web yang akan dianalisa." },
          depth: { type: "string", description: "Kedalaman pencarian: 'quick' atau 'deep' (default: 'deep')." },
          category: { type: "string", description: "Kategori pencarian: 'tech', 'code', 'general', atau 'doc'." }
        },
        required: ["query"]
      }
    },
    {
      name: "turbo_proxy_manager",
      description: "Manage Turbo Proxy speed - build additional proxy from all connected clouds (OCI 161.118.253.28, Tailscale mesh 100.91.232.91/100.100.237.104/100.106.22.112, Cloudflare Workers hub.roadfx.biz.id, SimpleSSHD 8022, TermOnePlus). Speed: Sub-5ms FastCache. When Turbo Proxy active, only user models for upgrade. Implements auto refresh IP roadfx connected oci as localhost tailscale.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'speed_test', 'build_proxy', 'list_clouds', 'filter_models'" },
          cloud: { type: "string", description: "Cloud to test: oci, tailscale, cloudflare, sshdaemon, all" }
        },
        required: []
      }
    },
    {
      name: "pastebin_js_client",
      description: "Logs pastebin Api Wrapper NodeJS https://github.com/j3lte/pastebin-js - Pastebin.com API wrapper for NodeJS. Use for neat logs display in chat with pastebin.com. Replaces termbin.com and termoneplus. User request gunakan logs pastebin Api Wrapper NodeJS https://github.com/j3lte/pastebin-js",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to paste to Pastebin.com via pastebin-js wrapper" },
          title: { type: "string", description: "Paste title" },
          format: { type: "string", description: "Syntax format (e.g. javascript, python, text)" },
          privacy: { type: "string", description: "0=public, 1=unlisted, 2=private" },
          expiration: { type: "string", description: "Expiration: N=never, 10M, 1H, 1D, 1W, 2W, 1M, 6M, 1Y" }
        },
        required: ["content"]
      }
    },
    {
      name: "pastebin_python_client",
      description: "Logs pastebin Api Wrapper Python https://github.com/six519/PastebinPython - Pastebin.com API wrapper for Python. Use for neat logs display. User request Api Wrapper Python https://github.com/six519/PastebinPython",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to paste via PastebinPython" },
          title: { type: "string", description: "Paste title" },
          format: { type: "string", description: "Format" }
        },
        required: ["content"]
      }
    },
    {
      name: "cubecl_backend",

      description: "Backend ivansslo/cubecl - Multi-platform high-performance compute language extension for Rust (CUDA/WebGPU/Metal). User request Backend; ivansslo/cubecl. Provides GPU compute kernels, ML tensor ops.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'clone', 'build', 'test'" }
        },
        required: []
      }
    },
    {
      name: "cmux_module",
      description: "Module tambahan ivansslo/cmux - terminal multiplexer for TermOnePlus + SimpleSSHD. User request module tambahan; ivansslo/cmux. Manages panes, sessions, SSH multiplexing.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action: 'status', 'clone', 'start', 'list_sessions'" }
        },
        required: []
      }
    }
  ],
  logs: [],
  syncedApps: [
    {
      id: "roc-webui",
      name: "ROC Web UI",
      status: "unsynced",
      url: "http://localhost:8080",
      componentsCount: 18,
      filesCount: 42,
      apiEndpointsCount: 9,
      description: "The main web-based dashboard and control interface for managing the robotic fleet telemetry and operations.",
      syncLogs: []
    },
    {
      id: "roc-otoweb",
      name: "ROC Oto Web",
      status: "unsynced",
      url: "http://localhost:8090",
      componentsCount: 12,
      filesCount: 29,
      apiEndpointsCount: 6,
      description: "An autonomous fleet operations hub specializing in routing, spatial maps, and turn-by-turn navigation data syncing.",
      syncLogs: []
    },
    {
      id: "lsmod-analyzer",
      name: "lsmod Kernel Driver Analyzer",
      status: "unsynced",
      url: "http://localhost:9095",
      componentsCount: 0,
      filesCount: 12,
      apiEndpointsCount: 8,
      description: "Linux kernel modules driver monitor. Synchronizes driver maps, loaded symbols, module dependencies, and direct VM memory allocations.",
      syncLogs: []
    },
    {
      id: "codex-web",
      name: "Codex Web IDE",
      status: "unsynced",
      url: "http://localhost:3010",
      componentsCount: 15,
      filesCount: 38,
      apiEndpointsCount: 10,
      description: "Self-Cognitive AST code refactoring and advanced code generation engine powered by ivansslo/codex-web.",
      syncLogs: []
    }
  ],
  chatSessions: [],
  memories: [],
  selfCapabilities: [],
  snowflakeModels: [
    "Snowflake-Cortex-Roc-v1",
    "Predictive-Robotic-Maintenance-v4"
  ]
};

function sanitizeSchema(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSchema);

  const res: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'type' && typeof v === 'string') {
      res[k] = v.toLowerCase();
    } else {
      res[k] = sanitizeSchema(v);
    }
  }
  return res;
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);

        // Sanitize existing tool parameters in db.json
        if (this.data.tools) {
          this.data.tools = this.data.tools.map(t => ({
            ...t,
            parameters: sanitizeSchema(t.parameters)
          }));
        }

        // Ensure default tools are present
        const existingNames = new Set(this.data.tools.map(t => t.name));
        DEFAULT_SCHEMA.tools.forEach(defaultTool => {
          if (!existingNames.has(defaultTool.name)) {
            this.data.tools.push(defaultTool);
          }
        });

        // Ensure default syncedApps are present
        if (!this.data.syncedApps) {
          this.data.syncedApps = [];
        }
        const existingAppIds = new Set(this.data.syncedApps.map(a => a.id));
        DEFAULT_SCHEMA.syncedApps.forEach(defaultApp => {
          if (!existingAppIds.has(defaultApp.id)) {
            this.data.syncedApps.push(defaultApp);
          }
        });
        
        this.save();
      } catch {
        this.data = DEFAULT_SCHEMA;
        this.save();
      }
    } else {
      this.data = DEFAULT_SCHEMA;
      this.save();
    }
  }

  private save() {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
  }

  getTools() {
    return (this.data.tools || []).map(t => ({
      ...t,
      parameters: sanitizeSchema(t.parameters)
    }));
  }

  addTool(tool: ToolDefinition) {
    tool.parameters = sanitizeSchema(tool.parameters);
    if (!this.data.tools.some(t => t.name === tool.name)) {
      this.data.tools.push(tool);
      this.save();
    }
  }

  addLog(log: ExecutionLog) {
    this.data.logs.push(log);
    this.save();
  }

  getLogs() {
    return this.data.logs;
  }

  getSyncedApps() {
    return this.data.syncedApps || [];
  }

  updateAppStatus(id: string, status: 'unsynced' | 'syncing' | 'synced' | 'error', lastSyncedAt?: string, syncLogs?: string[]) {
    if (!this.data.syncedApps) {
      this.data.syncedApps = DEFAULT_SCHEMA.syncedApps;
    }
    const app = this.data.syncedApps.find(a => a.id === id);
    if (app) {
      app.status = status;
      if (lastSyncedAt) app.lastSyncedAt = lastSyncedAt;
      if (syncLogs) app.syncLogs = syncLogs;
      this.save();
    }
  }

  getChatSessions(): ChatSession[] {
    return this.data.chatSessions || [];
  }

  saveChatSession(session: ChatSession) {
    if (!this.data.chatSessions) {
      this.data.chatSessions = [];
    }
    const index = this.data.chatSessions.findIndex(s => s.id === session.id);
    if (index !== -1) {
      this.data.chatSessions[index] = session;
    } else {
      this.data.chatSessions.push(session);
    }
    this.save();
  }

  deleteChatSession(id: string) {
    if (!this.data.chatSessions) return;
    this.data.chatSessions = this.data.chatSessions.filter(s => s.id !== id);
    this.save();
  }

  renameChatSession(id: string, title: string) {
    if (!this.data.chatSessions) return;
    const session = this.data.chatSessions.find(s => s.id === id);
    if (session) {
      session.title = title;
      this.save();
    }
  }

  getMemories(): MemoryItem[] {
    return this.data.memories || [];
  }

  getMemory(key: string): string | null {
    if (!this.data.memories) return null;
    const found = this.data.memories.find(m => m.key === key);
    return found ? found.value : null;
  }

  saveMemory(key: string, value: string, category: string = 'general') {
    if (!this.data.memories) {
      this.data.memories = [];
    }
    const existing = this.data.memories.find(m => m.key === key);
    const now = new Date().toISOString();
    if (existing) {
      existing.value = value;
      existing.category = category;
      existing.updatedAt = now;
    } else {
      this.data.memories.push({ key, value, category, updatedAt: now });
    }
    this.save();
  }

  deleteMemory(key: string) {
    if (!this.data.memories) return;
    this.data.memories = this.data.memories.filter(m => m.key !== key);
    this.save();
  }

  clearMemories() {
    this.data.memories = [];
    this.save();
  }

  getSelfCapabilities(): SelfCapability[] {
    return this.data.selfCapabilities || [];
  }

  togglePinSelfCapability(id: string): boolean {
    if (!this.data.selfCapabilities) return false;
    const cap = this.data.selfCapabilities.find(c => c.id === id);
    if (cap) {
      cap.isPinned = !cap.isPinned;
      this.save();
      return cap.isPinned;
    }
    return false;
  }

  updateSelfCapabilityDependencies(id: string, dependencies: string[]): boolean {
    if (!this.data.selfCapabilities) return false;
    const cap = this.data.selfCapabilities.find(c => c.id === id);
    if (cap) {
      cap.dependencies = dependencies;
      this.save();
      return true;
    }
    return false;
  }

  saveSelfCapability(name: string, codeSnippet: string, purpose: string, category: string = 'general') {
    if (!this.data.selfCapabilities) {
      this.data.selfCapabilities = [];
    }
    const id = 'cap_' + Date.now();
    this.data.selfCapabilities.push({
      id,
      name,
      codeSnippet,
      purpose,
      category,
      active: true
    });
    this.save();
    return id;
  }

  getScheduledRoutines(): ScheduledRoutine[] {
    return this.data.scheduledRoutines || [];
  }

  saveScheduledRoutine(name: string, cron: string, capabilityName: string) {
    if (!this.data.scheduledRoutines) {
      this.data.scheduledRoutines = [];
    }
    const id = 'routine_' + Date.now();
    this.data.scheduledRoutines.push({
      id,
      name,
      cron,
      capabilityName,
      active: true
    });
    this.save();
    return id;
  }

  deleteScheduledRoutine(id: string) {
    if (!this.data.scheduledRoutines) return;
    this.data.scheduledRoutines = this.data.scheduledRoutines.filter(r => r.id !== id);
    this.save();
  }

  getSnowflakeModels(): string[] {
    if (!this.data.snowflakeModels) {
      this.data.snowflakeModels = ["Snowflake-Cortex-Roc-v1", "Predictive-Robotic-Maintenance-v4"];
      this.save();
    }
    return this.data.snowflakeModels;
  }

  addSnowflakeModel(modelName: string) {
    if (!this.data.snowflakeModels) {
      this.data.snowflakeModels = ["Snowflake-Cortex-Roc-v1", "Predictive-Robotic-Maintenance-v4"];
    }
    if (!this.data.snowflakeModels.includes(modelName)) {
      this.data.snowflakeModels.push(modelName);
      this.save();
    }
  }
}

export const db = new Database();
