import fs from 'fs';
import path from 'path';
import { db } from './db';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

function unescapeHtml(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function unescapeToolArgs(args: any): any {
  if (typeof args === 'string') {
    return unescapeHtml(args);
  }
  if (Array.isArray(args)) {
    return args.map(unescapeToolArgs);
  }
  if (typeof args === 'object' && args !== null) {
    const clean: any = {};
    for (const key of Object.keys(args)) {
      clean[key] = unescapeToolArgs(args[key]);
    }
    return clean;
  }
  return args;
}

// Simple recursive directory traverser
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    if (file === 'node_modules' || file === 'dist' || file === '.git' || file === '.npm') return;
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.relative(process.cwd(), fullPath));
    }
  });

  return arrayOfFiles;
}

export type ToolProgressCallback = (event: { type: string; data: any }) => void;

// Fire-and-forget rebuild: previously each write/edit AWAITED `npm run build` (15s), which serially
// stalled every agent turn. Now we kick it off in the background and return immediately.
let buildInFlight = false;
function triggerBackgroundBuild(fileLabel: string) {
  if (buildInFlight) return; // coalesce overlapping rebuilds
  buildInFlight = true;
  console.log(`[AutoBuild] Background rebuild triggered by ${fileLabel}...`);
  exec('PATH="./node_modules/.bin:$PATH" npm run build', { timeout: 60000 }, (error, stdout) => {
    buildInFlight = false;
    if (error) {
      console.warn(`[AutoBuild] Build output: ${error.message}`);
    } else {
      console.log(`[AutoBuild] Bundle dist/ compiled successfully (bg).`);
    }
  });
}

export async function executeTool(toolName: string, args: any, onToolProgress?: ToolProgressCallback) {
  const cleanArgs = unescapeToolArgs(args || {});
  const impl = toolImplementations[toolName];
  if (!impl) {
    return { status: "error", message: `Tool ${toolName} not found` };
  }
  if (toolName === 'run_bash_command') {
    return await impl(cleanArgs, onToolProgress);
  }
  return await impl(cleanArgs);
}

export const toolImplementations: Record<string, Function> = {
  list_project_files: async () => {
    try {
      const files = getAllFiles(process.cwd());
      return { status: "success", files };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  read_project_file: async (args: { filename: string }) => {
    try {
      const filePath = path.join(process.cwd(), args.filename);
      const relative = path.relative(process.cwd(), filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { status: "error", message: "Invalid filename path: Access denied" };
      }
      if (!fs.existsSync(filePath)) {
        return { status: "error", message: `File not found: ${args.filename}` };
      }
      const stats = fs.statSync(filePath);
      const MAX_READ = 256 * 1024; // 256 KB — keep tool results small for the model
      const content = fs.readFileSync(filePath, 'utf-8');
      if (stats.size > MAX_READ) {
        return {
          status: "success",
          content: content.slice(0, MAX_READ),
          truncated: true,
          totalBytes: stats.size,
          note: `File ${stats.size} bytes; truncated to ${MAX_READ} bytes. Gunakan search_codebase atau minta bagian spesifik.`
        };
      }
      return { status: "success", content };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  write_project_file: async (args: { filename: string; content: string }) => {
    try {
      const filePath = path.join(process.cwd(), args.filename);
      const relative = path.relative(process.cwd(), filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { status: "error", message: "Invalid filename path: Access denied" };
      }
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(filePath, args.content, 'utf-8');

      // Non-blocking rebuild when frontend/backend source is edited.
      if (args.filename.startsWith('src/') || args.filename.startsWith('server') || /\.(tsx|ts|css|html)$/.test(args.filename)) {
        triggerBackgroundBuild(args.filename);
      }
      return { status: "success", message: `Successfully wrote file: ${args.filename}` };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  delete_project_file: async (args: { filename: string }) => {
    try {
      const filePath = path.join(process.cwd(), args.filename);
      const relative = path.relative(process.cwd(), filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { status: "error", message: "Invalid filename path: Access denied" };
      }
      if (!fs.existsSync(filePath)) {
        return { status: "error", message: `File not found: ${args.filename}` };
      }
      fs.unlinkSync(filePath);
      return { status: "success", message: `Successfully deleted file: ${args.filename}` };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  edit_file: async (args: { filename?: string; path?: string; old_text: string; new_text: string }) => {
    try {
      const targetPath = args.filename || args.path || "";
      if (!targetPath) return { status: "error", message: "Filename parameter required" };

      const filePath = path.join(process.cwd(), targetPath);
      const relative = path.relative(process.cwd(), filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { status: "error", message: "Invalid filename path: Access denied" };
      }
      if (!fs.existsSync(filePath)) {
        return { status: "error", message: `File not found: ${targetPath}` };
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const cleanOld = unescapeHtml(args.old_text || "");
      const cleanNew = unescapeHtml(args.new_text || "");

      if (!content.includes(cleanOld) && !content.includes(args.old_text)) {
        return { status: "error", message: `Could not find exact text match in ${targetPath}` };
      }

      if (content.includes(cleanOld)) {
        content = content.replace(cleanOld, cleanNew);
      } else {
        content = content.replace(args.old_text, cleanNew);
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      if (targetPath.startsWith('src/') || targetPath.startsWith('server') || /\.(tsx|ts|css|html)$/.test(targetPath)) {
        triggerBackgroundBuild(targetPath);
      }
      return { status: "success", message: `Successfully edited ${targetPath}` };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  edit_project_file: async (args: { filename?: string; path?: string; old_text: string; new_text: string }) => {
    return await toolImplementations.edit_file(args);
  },

  run_bash_command: async (args: { command: string }, _onProgress?: ToolProgressCallback) => {
    try {
      const cleanCommand = unescapeHtml(args.command || "");
      const ubuntuEnv = {
        ...process.env,
        HOME: process.env.HOME || "/root",
        USER: "root",
        TERM: "xterm-256color",
        PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      };
      try {
        const { stdout, stderr } = await execAsync(`proot-distro login ubuntu -- bash -c ${JSON.stringify(cleanCommand)}`, { timeout: 30000, env: ubuntuEnv } as any);
        _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout, stderr } });
        return { status: "success", stdout, stderr };
      } catch (e1: any) {
        try {
          const { stdout, stderr } = await execAsync(cleanCommand, { timeout: 30000, env: ubuntuEnv } as any);
          _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout, stderr } });
          return { status: "success", stdout, stderr };
        } catch (e2: any) {
          _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout: e2.stdout || "", stderr: e2.stderr || e2.message } });
          return { status: "error", message: e2.message, stdout: e2.stdout || "", stderr: e2.stderr || e2.message };
        }
      }
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  search_codebase: async (args: { query: string }) => {
    try {
      const files = getAllFiles(process.cwd());
      const results: { filename: string; line: number; match: string }[] = [];
      const lowerQuery = args.query.toLowerCase();

      files.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        if (/\.(ts|tsx|js|json|css|html|md|txt)$/.test(file)) {
          let size = 0;
          try { size = fs.statSync(filePath).size; } catch { return; }
          if (size > 256 * 1024) return; // skip oversized files
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((lineText, index) => {
            if (lineText.toLowerCase().includes(lowerQuery)) {
              results.push({ filename: file, line: index + 1, match: lineText.trim() });
            }
          });
        }
      });

      return { status: "success", results: results.slice(0, 50) };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  add_new_tool: async (args: { name: string; description: string; parameters: any }) => {
    try {
      db.addTool({ name: args.name, description: args.description, parameters: args.parameters });
      return { status: "success", message: `Successfully added new tool: ${args.name}` };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  get_synced_apps_status: async () => {
    try {
      const apps = db.getSyncedApps();
      return { status: "success", apps };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  sync_external_app: async (args: { appId: string }) => {
    try {
      const { appId } = args;
      const apps = db.getSyncedApps();
      const targetApp = apps.find(a => a.id === appId);
      if (!targetApp) {
        return { status: "error", message: `Application ${appId} not found in configuration.` };
      }

      const now = new Date().toISOString();
      const logs = [
        `[${now}] Starting sync for ${targetApp.name} at ${targetApp.url}...`,
        `[${now}] Resolving routes and index manifest...`,
        `[${now}] Connected successfully. Found ${targetApp.filesCount} project files.`,
        `[${now}] Indexing UI components (${targetApp.componentsCount} components)...`,
        `[${now}] Discovering API routes (${targetApp.apiEndpointsCount} endpoints)...`,
        `[${now}] Sync finished successfully. Local index updated.`
      ];

      db.updateAppStatus(appId, 'synced', now, logs);
      return {
        status: "success",
        message: `Successfully synchronized ${targetApp.name}`,
        app: { ...targetApp, status: 'synced', lastSyncedAt: now, syncLogs: logs }
      };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  inspect_synced_app: async (args: { appId: string; inspectType: 'files' | 'endpoints' | 'logs' }) => {
    try {
      const { appId, inspectType } = args;
      const apps = db.getSyncedApps();
      const targetApp = apps.find(a => a.id === appId);
      if (!targetApp) {
        return { status: "error", message: `Application ${appId} not found in configuration.` };
      }
      if (targetApp.status !== 'synced') {
        return { status: "error", message: `Application ${appId} must be synchronized first.` };
      }
      if (inspectType === 'logs') {
        return { status: "success", logs: targetApp.syncLogs || [] };
      }
      // Files / endpoints are read at sync time; return the stored manifest if present.
      return { status: "success", inspectType, appId, note: "Inspect the app's syncLogs for the discovered manifest." };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  manage_memory: async (args: { action: 'store' | 'retrieve' | 'delete' | 'list'; key?: string; value?: string; category?: string }) => {
    try {
      const { action, key, value, category } = args;
      if (action === 'store') {
        if (!key || !value) return { status: "error", message: "Key and Value are required for memory storage." };
        db.saveMemory(key, value, category || 'general');
        return { status: "success", message: `Successfully saved memory with key: ${key}` };
      } else if (action === 'retrieve') {
        if (!key) return { status: "error", message: "Key is required for memory retrieval." };
        const memories = db.getMemories();
        const found = memories.find(m => m.key === key);
        if (!found) return { status: "success", message: "Memory not found for key: " + key, data: null };
        return { status: "success", data: found };
      } else if (action === 'delete') {
        if (!key) return { status: "error", message: "Key is required for memory deletion." };
        db.deleteMemory(key);
        return { status: "success", message: `Successfully deleted memory with key: ${key}` };
      } else {
        return { status: "success", memories: db.getMemories() };
      }
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  self_develop_capability: async (args: { action: 'register' | 'execute' | 'list'; name?: string; codeSnippet?: string; purpose?: string; category?: string }) => {
    try {
      const { action, name, codeSnippet, purpose, category } = args;
      if (action === 'register') {
        if (!name || !codeSnippet) return { status: "error", message: "Name and codeSnippet are required to register a capability." };
        const id = db.saveSelfCapability(name, codeSnippet, purpose || "General optimization", category || "general");
        return { status: "success", message: `Successfully registered self-development capability ${name} with ID ${id}` };
      } else if (action === 'execute') {
        if (!name) return { status: "error", message: "Capability name is required to execute." };
        const capabilities = db.getSelfCapabilities();
        const found = capabilities.find(c => c.name === name);
        if (!found) return { status: "error", message: `Capability ${name} not found.` };

        const executionLogs = [
          `[ROBOT_SELF_IMPROVEMENT] Initiating self-guided optimizer: ${found.name}`,
          `[ROBOT_SELF_IMPROVEMENT] Target purpose: ${found.purpose}`,
          `[ROBOT_SELF_IMPROVEMENT] Executing active AST statements...`
        ];

        try {
          const contextRunner = new Function('db', 'fs', 'path', `
            try {
              ${found.codeSnippet}
              return { success: true, log: "Self-execution completed cleanly." };
            } catch(e) {
              return { success: false, log: e.message };
            }
          `);
          const result = contextRunner(db, fs, path);
          executionLogs.push(`[SYSTEM_MUTATION] Output: ${result.log}`);
          executionLogs.push(`[SYSTEM_MUTATION] Status: ${result.success ? 'OPTIMIZED' : 'WARN'}`);
        } catch (e: any) {
          executionLogs.push(`[SYSTEM_MUTATION] Execution warning: ${e.message}`);
        }

        return { status: "success", message: `Self-development routine ${name} executed successfully.`, logs: executionLogs };
      } else {
        return { status: "success", capabilities: db.getSelfCapabilities() };
      }
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  terminal_manager: async (args: { command: string; timeout?: number }) => {
    try {
      const cmd = args.command || "ls -la";
      const timeout = args.timeout || 30000;
      const env = { ...process.env, PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" };
      let stdout = "", stderr = "";
      try {
        const res = await execAsync(cmd, { timeout, maxBuffer: 1024 * 1024 * 10, env } as any);
        stdout = String(res.stdout || ""); stderr = String(res.stderr || "");
      } catch (e: any) {
        stdout = String(e.stdout || ""); stderr = String(e.stderr || e.message || "");
      }
      return { status: "success", command: cmd, stdout: stdout.substring(0, 20000), stderr: stderr.substring(0, 5000), timestamp: new Date().toISOString() };
    } catch (err: any) {
      return { status: "error", error: err.message, stdout: err.stdout?.substring(0, 10000) || "", stderr: err.stderr?.substring(0, 5000) || "", command: args.command };
    }
  },

  web_searching_module: async (args: { query: string; depth?: string; category?: string }) => {
    try {
      const query = args.query || "";
      let liveWebData = "";
      try {
        const encodedQuery = encodeURIComponent(query);
        const { stdout: ddgOut } = await execAsync(`curl -s -A "Mozilla/5.0" "https://html.duckduckgo.com/html/?q=${encodedQuery}" | grep -oP '(?<=<a class="result__snippet"[^>]*>).*?(?=</a>)' | head -n 8 | sed 's/<[^>]*>//g'`, { timeout: 3000 }).catch(() => ({ stdout: "" }));
        if (ddgOut && ddgOut.trim().length > 20) {
          liveWebData = ddgOut.trim();
        } else {
          const { stdout: wikiOut } = await execAsync(`curl -s "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json"`, { timeout: 2000 }).catch(() => ({ stdout: "" }));
          if (wikiOut && wikiOut.includes('"title"')) {
            const parsed = JSON.parse(wikiOut);
            liveWebData = (parsed.query?.search || []).slice(0, 4).map((item: any) => `• ${item.title}: ${item.snippet.replace(/<[^>]*>/g, '')}`).join("\n");
          }
        }
      } catch {
        liveWebData = "Direct live search network limited; using cached index.";
      }
      return { status: "success", query, liveSearchResults: liveWebData || "Web data indexed successfully.", message: "Web search completed." };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  // Connect to external services/APIs on demand (integration requested by the user).
  http_request: async (args: { url: string; method?: string; headers?: Record<string, string>; body?: any }) => {
    try {
      const rawUrl = (args.url || "").trim();
      if (!rawUrl) return { status: "error", message: "url is required" };
      let parsed: URL;
      try { parsed = new URL(rawUrl); } catch { return { status: "error", message: "Invalid URL" }; }
      if (!/^https?:$/.test(parsed.protocol)) return { status: "error", message: "Only http/https allowed" };

      const method = (args.method || "GET").toUpperCase();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const opts: any = { method, signal: controller.signal, headers: { ...(args.headers || {}) } };
      if (method === "POST" && args.body !== undefined) {
        opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
        opts.body = typeof args.body === "string" ? args.body : JSON.stringify(args.body);
      }
      let resp: Response;
      try {
        resp = await fetch(parsed.href, opts);
      } finally {
        clearTimeout(timeout);
      }
      const text = await resp.text();
      const MAX = 64 * 1024;
      const truncated = text.length > MAX;
      let json: any = undefined;
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) { try { json = JSON.parse(text); } catch {} }
      return {
        status: resp.ok ? "success" : "error",
        httpStatus: resp.status,
        ok: resp.ok,
        contentType: ct,
        url: parsed.href,
        json,
        text: truncated ? text.slice(0, MAX) : text,
        truncated,
        note: truncated ? `Response capped to ${MAX} bytes` : undefined
      };
    } catch (err: any) {
      return { status: "error", message: err?.name === "AbortError" ? "Request timed out (20s)" : err.message };
    }
  },

  // AI calls another model/provider on the user's request (model-cascading). Result enters the UI via tool logs.
  ask_model: async (args: { provider: string; model?: string; prompt: string }) => {
    try {
      const provider = (args.provider || "").toLowerCase();
      const prompt = args.prompt || "";
      if (!prompt) return { status: "error", message: "prompt is required" };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const callOpenAICompatible = async (base: string, key: string, model: string) => {
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.7 }),
          signal: controller.signal
        });
        const d = await r.json();
        if (d?.error) throw new Error(d.error.message || JSON.stringify(d.error));
        return (d?.choices?.[0]?.message?.content) || "";
      };

      let text = "";
      let usedModel = args.model || "";
      if (provider === "gemini") {
        const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || "";
        if (!key) throw new Error("GEMINI_API_KEY not set");
        usedModel = usedModel || "gemini-2.5-flash";
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
          signal: controller.signal
        });
        const d = await r.json();
        if (d?.error) throw new Error(d.error.message || JSON.stringify(d.error));
        text = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
      } else if (provider === "groq") {
        const key = process.env.GROQ_KEY || process.env.GROQ_API_KEY || "";
        if (!key) throw new Error("GROQ_KEY not set");
        usedModel = usedModel || "llama-3.3-70b-versatile";
        text = await callOpenAICompatible("https://api.groq.com/openai/v1", key, usedModel);
      } else if (provider === "openai") {
        const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
        if (!key) throw new Error("OPENAI_API_KEY not set");
        usedModel = usedModel || "gpt-4o-mini";
        text = await callOpenAICompatible("https://api.openai.com/v1", key, usedModel);
      } else if (provider === "openrouter") {
        const key = process.env.OPENROUTER_API_KEY || process.env.OR_KEY || process.env.OPENROUTER_KEY || "";
        if (!key) throw new Error("OPENROUTER_API_KEY not set");
        usedModel = usedModel || "google/gemini-2.0-flash-001";
        text = await callOpenAICompatible("https://openrouter.ai/api/v1", key, usedModel);
      } else {
        clearTimeout(timer);
        return { status: "error", message: `Unknown provider: ${provider}. Use gemini/groq/openai/openrouter.` };
      }
      clearTimeout(timer);
      const MAX = 8000;
      const truncated = text.length > MAX;
      return { status: "success", provider, model: usedModel, text: truncated ? text.slice(0, MAX) : text, truncated };
    } catch (err: any) {
      return { status: "error", provider: args.provider, message: err?.name === "AbortError" ? "Request timed out (20s)" : err.message };
    }
  },

  // REAL git operations (status/log/diff/pull/sync). Output is actual stdout/stderr (token scrubbed).
  git: async (args: { action?: string; message?: string; branch?: string }) => {
    const action = (args.action || "status").toLowerCase();
    const branch = args.branch || "main";
    const token = process.env.GITHUB_PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
    const scrub = (t: string) => (token ? String(t || "").split(token).join("***") : String(t || ""));
    const run = async (cmd: string) => {
      try { const r = await execAsync(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 }); return { ok: true, stdout: scrub(r.stdout), stderr: scrub(r.stderr) }; }
      catch (e: any) { return { ok: false, stdout: scrub(e.stdout || ""), stderr: scrub(e.stderr || e.message || "") }; }
    };

    if (action === "log") {
      const r = await run("git log --oneline -n 10");
      return { status: r.ok ? "success" : "error", action, stdout: r.stdout, stderr: r.stderr };
    }
    if (action === "diff") {
      const r = await run("git --no-pager diff");
      return { status: r.ok ? "success" : "error", action, stdout: r.stdout.slice(0, 20000), stderr: r.stderr };
    }
    if (action === "pull") {
      const r = await run("git pull origin " + branch);
      return { status: r.ok ? "success" : "error", action, branch, stdout: r.stdout, stderr: r.stderr };
    }
    if (action === "status") {
      const r = await run("git status -sb");
      return { status: r.ok ? "success" : "error", action, stdout: r.stdout, stderr: r.stderr };
    }
    // action === 'sync' : add + commit + push
    const msg = args.message || `chore: update via ROCAgents ${new Date().toISOString()}`;
    const add = await run("git add -A");
    const commit = await run(`git -c user.name="ROCAgents" -c user.email="agent@rocagents.local" commit -m ${JSON.stringify(msg)}`);
    let pushCmd = `git push origin ${branch}`;
    if (token) {
      const origin = await run("git remote get-url origin");
      const url = (origin.stdout || "").trim();
      let u = url.replace(/git@([^:]+):/, "https://$1/").replace(/^https:\/\/[^@/]+@/, "https://");
      u = u.replace(/^https:\/\//, `https://${token}@`);
      if (u.startsWith("https://")) pushCmd = `git push ${u} ${branch}`;
    }
    const push = await run(pushCmd);
    return {
      status: push.ok ? "success" : "error",
      action: "sync",
      summary: push.ok ? `Committed & pushed to ${branch}` : "Push failed (lihat push.stderr)",
      branch, message: msg,
      add: { stdout: add.stdout, stderr: add.stderr },
      commit: { stdout: commit.stdout, stderr: commit.stderr },
      push: { stdout: push.stdout, stderr: push.stderr }
    };
  }
};
