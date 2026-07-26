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
      description: "Store, retrieve, or clear structured long-term memory facts to build a persistent knowledge base.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Memory action: 'store', 'retrieve', 'delete', or 'list'." },
          key: { type: "string", description: "Unique key identifying the fact." },
          value: { type: "string", description: "Text description or JSON string to store (required for 'store')." },
          category: { type: "string", description: "Optional category tag." }
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
          name: { type: "string", description: "Name of the self-development capability." },
          codeSnippet: { type: "string", description: "JavaScript/TypeScript statements executing edits or system optimizations." },
          purpose: { type: "string", description: "Purpose of the patch or enhancement." },
          category: { type: "string", description: "Optional category tag." }
        },
        required: ["action"]
      }
    },
    {
      name: "run_bash_command",
      description: "Run a bash command in the terminal and return stdout/stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to run." }
        },
        required: ["command"]
      }
    },
    {
      name: "terminal_manager",
      description: "Execute a bash command in the project workspace and return stdout/stderr. Use for: ls, cat files, build output, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bash command to execute, e.g. 'ls -la', 'cat server.ts | head -n 50'." },
          timeout: { type: "number", description: "Timeout ms (default 30000)." }
        },
        required: ["command"]
      }
    },
    {
      name: "web_searching_module",
      description: "Search the web for up-to-date information and return extracted text snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The web search query." },
          depth: { type: "string", description: "Search depth: 'quick' or 'deep' (default 'deep')." },
          category: { type: "string", description: "Category: 'tech', 'general', or 'doc'." }
        },
        required: ["query"]
      }
    },
    {
      name: "http_request",
      description: "Connect to an EXTERNAL service/API on the user's request (integration). Fetch any URL with GET/POST, optional headers and JSON body. Use this to integrate with or pull data from external APIs the user asks for. Responses are capped (timeout 20s, body 64KB).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full external URL (e.g. 'https://api.example.com/data')." },
          method: { type: "string", description: "HTTP method: 'GET' or 'POST' (default GET)." },
          headers: { type: "object", description: "Optional request headers as key/value pairs." },
          body: { type: "object", description: "Optional JSON body for POST requests." }
        },
        required: ["url"]
      }
    },
    {
      name: "ask_model",
      description: "Delegate a sub-question to ANOTHER AI model/provider (model-cascading) when the user asks the AI to consult/compare models. Calls gemini/groq/openai/openrouter with the given prompt and returns that model's answer text. Use when the owner requests input from another model.",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", description: "Target provider: 'gemini', 'groq', 'openai', or 'openrouter'." },
          model: { type: "string", description: "Optional model id for that provider (e.g. 'gemini-2.5-flash', 'llama-3.3-70b-versatile', 'gpt-4o-mini'). Defaults to a sensible model per provider." },
          prompt: { type: "string", description: "The question/prompt to send to the other model." }
        },
        required: ["provider", "prompt"]
      }
    },
    {
      name: "git",
      description: "REAL git operations on the workspace repository. Actions: 'status' (git status), 'log' (recent commits), 'diff' (unstaged diff), 'pull' (git pull), 'sync' (stage all + commit + push, uses GITHUB_PAT). Returns ACTUAL stdout/stderr — never invent. Use when the user asks to check/update/push the repo.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "One of: 'status', 'log', 'diff', 'pull', 'sync' (default 'status')." },
          message: { type: "string", description: "Commit message (only for 'sync')." },
          branch: { type: "string", description: "Branch for 'sync' (default 'main')." }
        },
        required: ["action"]
      }
    },
    {
      name: "ssh_run",
      description: "Run a command on the LOCAL DEVICE through its SSH daemon (configured in Settings → SSH: port/user/password or key). Use to inspect/control the device itself when the user asks about the local machine (e.g. netstat, ps, files under /sdcard). Returns REAL stdout/stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run on the device over SSH." }
        },
        required: ["command"]
      }
    },
    {
      name: "export_app_archive",
      description: "Convert app documentation markdown (roc-webui.md or roc-otoweb.md) into a downloadable .zip archive for the ecosystem apps (github.com/ivansslo/roc-webui or github.com/ivansslo/roc-otoweb).",
      parameters: {
        type: "object",
        properties: {
          appId: { type: "string", description: "App ID: 'roc-webui' or 'roc-otoweb'." }
        },
        required: ["appId"]
      }
    }
  ],
  logs: [],
  syncedApps: [
    {
      id: "roc-webui",
      name: "ROC Web UI",
      status: "unsynced",
      url: "https://github.com/ivansslo/roc-webui",
      componentsCount: 18,
      filesCount: 42,
      apiEndpointsCount: 9,
      description: "Primary web UI control panel and telemetry dashboard. Source: github.com/ivansslo/roc-webui (roc-webui.md -> roc-webui.zip).",
      syncLogs: []
    },
    {
      id: "roc-otoweb",
      name: "ROC Oto Web",
      status: "unsynced",
      url: "https://github.com/ivansslo/roc-otoweb",
      componentsCount: 12,
      filesCount: 29,
      apiEndpointsCount: 6,
      description: "Autonomous fleet operations and spatial mapping hub. Source: github.com/ivansslo/roc-otoweb (roc-otoweb.md -> roc-otoweb.zip).",
      syncLogs: []
    }
  ],
  chatSessions: [],
  memories: [],
  selfCapabilities: []
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

        // Reconcile tools: keep only the ones defined in DEFAULT_SCHEMA plus any user-added tools.
        if (this.data.tools) {
          const defaultNames = new Set(DEFAULT_SCHEMA.tools.map(t => t.name));
          // Replace any default tool definitions with the latest version; keep user-added extras.
          const userExtras = (this.data.tools || []).filter(t => !defaultNames.has(t.name));
          this.data.tools = [...DEFAULT_SCHEMA.tools, ...userExtras];
        }

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
}

export const db = new Database();
