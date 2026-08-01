/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */
import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { runOrchestrator } from "./server/orchestrator";
import { runAgentOrchestra } from "./server/agentOrchestra";
import { db } from "./server/db";
import { initScheduler } from "./server/scheduler";
import { createAuthMiddleware } from "./server/authMiddleware";
import { toolImplementations, sshExec, guardShell } from "./server/tools";

if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config();
process.env.DISABLE_HMR = 'true';

// Fail-closed security gate: the server refuses to start without a password.
// Previously auth was optional (`if (process.env.WEB_PASSWORD)`), which meant a
// missing env var silently produced a fully open server bound to 0.0.0.0.
const WEB_PASSWORD = process.env.WEB_PASSWORD || "";
const MIN_PASSWORD_LENGTH = 12;

if (!WEB_PASSWORD) {
  console.error(
    "\n❌ REFUSING TO START: environment variable WEB_PASSWORD is not set.\n" +
    "   This server can execute shell commands. Running it unauthenticated is unsafe.\n" +
    "   Set one, e.g.:  export WEB_PASSWORD=\"$(openssl rand -base64 24)\"\n"
  );
  process.exit(1);
}

if (WEB_PASSWORD.length < MIN_PASSWORD_LENGTH) {
  console.error(
    `\n❌ REFUSING TO START: WEB_PASSWORD is too short (${WEB_PASSWORD.length} chars, minimum ${MIN_PASSWORD_LENGTH}).\n` +
    "   Generate a strong one:  export WEB_PASSWORD=\"$(openssl rand -base64 24)\"\n"
  );
  process.exit(1);
}

// Bind to loopback by default. Exposing a shell-executing server on 0.0.0.0 puts it
// on every network the device is attached to (including public Wi-Fi).
// Override deliberately with HOST=... only when you know the network is trusted
// (e.g. a Tailscale-only address).
const HOST = process.env.HOST || "127.0.0.1";

// Containment check done right: `fullPath.startsWith(cwd)` also passes for a
// SIBLING directory (`/repo-evil` starts with `/repo`). path.relative() cannot
// be fooled that way. Every path-taking endpoint below uses this.
function isInsideCwd(fullPath: string): boolean {
  const rel = path.relative(process.cwd(), fullPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Secrets are masked in API responses: an authenticated session, a screenshot
// or a shared screen must not casually reveal full key material. Fields keep
// their last 4 characters so keys remain recognisable. POST /api/env/update
// refuses to write a value that still carries this mask (see below).
const ENV_SECRET_RE = /(KEY|TOKEN|SECRET|PASS|PWD|PAT|URI|PRIVATE|CREDENTIAL)/;
const ENV_MASK_PREFIX = "••••";
function maskEnvValue(key: string, value: string): string {
  if (!value || !ENV_SECRET_RE.test(key)) return value;
  return value.length <= 4 ? ENV_MASK_PREFIX : ENV_MASK_PREFIX + value.slice(-4);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
    console.warn(
      `\n⚠️  HOST=${HOST} — server is reachable beyond this device. ` +
      "Make sure the network is trusted (Tailscale/VPN), not open Wi-Fi.\n"
    );
  }

  initScheduler();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Mandatory password protection (validated above; the process exits if unset).
  app.use(createAuthMiddleware(WEB_PASSWORD));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // Public: tells the frontend whether password protection is enabled.
  app.get("/api/auth/status", (req, res) => {
    res.json({ protected: true });
  });

  app.get("/api/models", (req, res) => {
    // Ketersediaan dihitung dari kunci yang benar-benar ada, bukan dikeraskan
    // ke `active: true`. Sebelumnya kesembilan model selalu tampil aktif di UI
    // meski hanya satu penyedia yang punya kunci, sehingga memilih model mana
    // pun terlihat sah tetapi gagal tanpa penjelasan.
    const have = {
      gemini: !!(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY),
      groq: !!(process.env.GROQ_KEY || process.env.GROQ_API_KEY),
      openai: !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
      openrouter: !!(process.env.OPENROUTER_API_KEY || process.env.OR_KEY || process.env.OPENROUTER_KEY || process.env.DEEPSEK_API_KEY),
      cfai: !!(process.env.CF_AI_TOKEN || process.env.CF_TOKEN),
      cfsherlock: !!(process.env.CF_SHERLOCK_KEY || process.env.CLOUDFERRO_SHERLOCK_API_KEY || process.env.CLOUDFERRO_KEY),
    } as Record<string, boolean>;

    const catalog = [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Fast)", provider: "gemini", icon: "⚡" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Reasoning)", provider: "gemini", icon: "🧠" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", icon: "⚡" },
      { id: "openai/gpt-oss-120b", name: "Groq GPT-OSS 120B", provider: "groq", icon: "⚡" },
      { id: "gpt-4o", name: "OpenAI GPT-4o", provider: "openai", icon: "🟢" },
      { id: "gpt-4o-mini", name: "OpenAI GPT-4o mini", provider: "openai", icon: "🟢" },
      { id: "deepseek/deepseek-r1", name: "OpenRouter DeepSeek R1", provider: "openrouter", icon: "🌐" },
      { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Cloudflare Llama 3.3", provider: "cfai", icon: "☁️" },
      { id: "MiniMaxAI/MiniMax-M2.5", name: "CloudFerro Sherlock MiniMax M2.5", provider: "cfsherlock", icon: "🇵🇱" },
      { id: "meta-llama/Llama-3.3-70B-Instruct", name: "CloudFerro Sherlock Llama 3.3 70B", provider: "cfsherlock", icon: "🇵🇱" },
      // Added 2026-08-01: same upstream model id Groq's own catalog entry
      // above already uses ("openai/gpt-oss-120b") — that is expected and
      // fine, they are DIFFERENT (id, provider) pairs pointing at different
      // accounts/endpoints. See Header.tsx/ModelQuickSwitch.tsx/Sidebar.tsx
      // for the (id, provider) matching fix this relies on — id-only
      // matching would have silently mixed these two up. Live-verified via
      // a direct call to https://api-sherlock.cloudferro.com/openai/v1
      // (GET /models lists it, and a tool_choice:"auto" request against it
      // produced a real tool_calls response) before being added here.
      { id: "openai/gpt-oss-120b", name: "CloudFerro Sherlock GPT-OSS 120B", provider: "cfsherlock", icon: "🇵🇱" }
    ];

    const models = catalog.map(m => ({
      ...m,
      active: have[m.provider] === true,
      reason: have[m.provider] ? undefined : `Tidak ada kunci API untuk ${m.provider}`,
    }));

    // PROVIDER boleh berupa daftar ("groq,gemini,openai"). Yang aktif adalah
    // entri PERTAMA yang benar-benar punya kunci — mengembalikan daftar mentah
    // membuat UI mencari provider bernama "groq,gemini,openai" dan gagal.
    const ALIAS: Record<string, string> = {
      xgoog: "gemini", google: "gemini", googleai: "gemini",
      deepseek: "openrouter", deepsek: "openrouter",
      cf: "cfai", cloudflare: "cfai",
      sherlock: "cfsherlock", cloudferro: "cfsherlock",
    };
    const wanted = (process.env.PROVIDER || "")
      .toLowerCase().split(",").map(x => ALIAS[x.trim()] || x.trim()).filter(Boolean);

    const activeProvider =
      wanted.find(p => have[p]) ||
      (have.gemini ? "gemini" : have.openai ? "openai" : have.groq ? "groq" :
       have.openrouter ? "openrouter" : have.cfai ? "cfai" : have.cfsherlock ? "cfsherlock" : "gemini");

    res.json({
      active_provider: activeProvider,
      configured_providers: Object.keys(have).filter(k => have[k]),
      // Urutan failover yang diminta lewat PROVIDER, setelah alias & penyaringan.
      failover_chain: wanted.filter(p => have[p]),
      models,
    });
  });

  // Non-streaming chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, model, provider, persona } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages array" });
      }
      const result = await runOrchestrator(messages, { model, provider, persona });
      res.json(result);
    } catch (error: any) {
      console.error("Orchestrator Error:", error);
      res.status(500).json({ error: error.message || "Failed to process request" });
    }
  });

  // Streaming chat (SSE) — preferred path for low perceived latency (first token fast)
  app.post("/api/chat/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    try {
      const { messages, model, provider, persona } = req.body;
      if (!messages || !Array.isArray(messages)) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Invalid messages array" })}\n\n`);
        return res.end();
      }

      res.write(`event: status\ndata: ${JSON.stringify({ message: "Initializing Orchestrator..." })}\n\n`);

      const result = await runOrchestrator(messages, {
        model, provider, persona,
        onProgress: (evt) => {
          res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
          if (evt.type === 'tool_output' || evt.type === 'tool_start' || evt.type === 'tool_result') {
            broadcastToTerminal(evt.type, evt.data);
          }
        }
      });

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Stream Orchestrator Error:", error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || "Streaming failed" })}\n\n`);
      res.end();
    }
  });

  // Agent Multi — 8 roles across 2 selectable pipelines (SSE).
  //   pipeline=fast (default): Scout -> Builder/Modder -> Breaker -> Closer
  //   pipeline=engineering: Chief Architect -> Lead Developer ->
  //                         Security Pentester -> QA Supervisor
  //     (adapted from github.com/ivansslo/roc-webui's 4-agent orchestra,
  //     Apache-2.0, rebuilt on real RocAgent tools)
  // Same request/response shape as /api/chat/stream on purpose: it reuses
  // runOrchestrator underneath (see server/agentOrchestra.ts), so it inherits
  // auth, the shell guard, the SSRF guard and db logging without any changes
  // to those files.
  app.post("/api/agents/orchestra/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    try {
      const { messages, model, provider, persona, pipeline } = req.body;
      if (!messages || !Array.isArray(messages)) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Invalid messages array" })}\n\n`);
        return res.end();
      }

      res.write(`event: run_start\ndata: ${JSON.stringify({ message: "Agent Multi pipeline starting...", pipeline: pipeline || "fast" })}\n\n`);

      const result = await runAgentOrchestra(messages, {
        model, provider, persona, pipeline,
        onProgress: (evt) => {
          res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
          if (evt.type === "step_tool_start" || evt.type === "step_tool_result") {
            broadcastToTerminal(evt.type, evt.data);
          }
        }
      });

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Agent Orchestra Stream Error:", error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || "Agent Multi streaming failed" })}\n\n`);
      res.end();

    }
  });

  // Live terminal output stream
  const terminalClients: Set<any> = new Set();
  app.get("/api/terminal-stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    terminalClients.add(res);

    const pinger = setInterval(() => {
      try {
        res.write(": ping\n\n");
        if ((res as any).flush) (res as any).flush();
      } catch (_) {}
    }, 10000);

    req.on("close", () => {
      clearInterval(pinger);
      terminalClients.delete(res);
    });
  });

  function broadcastToTerminal(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of terminalClients) {
      try {
        client.write(payload);
        if (typeof client.flush === "function") client.flush();
      } catch (_) {}
    }
  }

  // ---- Workspace ----
  app.get("/api/workspace/sessions", (req, res) => {
    try {
      const sessionsDir = path.join(process.cwd(), "sessions");
      if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
      const chatSessions = db.getChatSessions();
      const chatMap = new Map(chatSessions.map(s => [s.id, s.title]));
      const result: any[] = [];
      for (const item of fs.readdirSync(sessionsDir)) {
        const fullPath = path.join(sessionsDir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            const folderStats = getFolderStats(fullPath);
            const sessionFiles = fs.readdirSync(fullPath).filter(f => !f.startsWith('.'));
            result.push({
              id: item,
              title: chatMap.get(item) || item.replace(/^session_/, 'Chat Session '),
              path: `sessions/${item}`,
              filesCount: folderStats.filesCount,
              sizeBytes: folderStats.sizeBytes,
              files: sessionFiles.map(file => ({
                name: file,
                path: `sessions/${item}/${file}`,
                sizeBytes: fs.statSync(path.join(fullPath, file)).size
              }))
            });
          }
        } catch (_) {}
      }
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  function getFolderStats(dirPath: string): { filesCount: number; sizeBytes: number } {
    let filesCount = 0, sizeBytes = 0;
    if (!fs.existsSync(dirPath)) return { filesCount, sizeBytes };
    try {
      for (const item of fs.readdirSync(dirPath)) {
        if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
        const full = path.join(dirPath, item);
        try {
          const stats = fs.statSync(full);
          if (stats.isDirectory()) {
            const sub = getFolderStats(full);
            filesCount += sub.filesCount; sizeBytes += sub.sizeBytes;
          } else { filesCount += 1; sizeBytes += stats.size; }
        } catch (_) {}
      }
    } catch (_) {}
    return { filesCount, sizeBytes };
  }

  app.get("/api/workspace/tree", (req, res) => {
    try {
      const showHidden = req.query.showHidden === 'true';
      const rootDir = process.cwd();
      const result: any[] = [];
      for (const item of fs.readdirSync(rootDir)) {
        if (!showHidden && item.startsWith('.')) continue;
        if (item === 'node_modules' || item === 'dist') continue;
        const fullPath = path.join(rootDir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            const folderStats = getFolderStats(fullPath);
            result.push({ name: item, path: item, isDirectory: true, filesCount: folderStats.filesCount, sizeBytes: folderStats.sizeBytes });
          } else {
            result.push({ name: item, path: item, isDirectory: false, filesCount: 1, sizeBytes: stats.size });
          }
        } catch (_) {}
      }
      result.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0));
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/workspace/zip-dir", async (req, res) => {
    try {
      const targetPath = (req.query.path as string || "").replace(/\.\./g, "");
      const fullPath = path.resolve(process.cwd(), targetPath || ".");
      if (!isInsideCwd(fullPath)) {
        return res.status(400).json({ error: "Path outside workspace" });
      }
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Target path not found" });
      // execFile WITHOUT a shell: previously the target path travelled inside a
      // double-quoted shell string — a `"` in the name escaped the quotes and
      // injected arbitrary commands. Argument arrays cannot inject. `zip`
      // interprets its own -x patterns internally, so no shell is needed.
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile) as (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
      const safeName = targetPath ? targetPath.replace(/[/\\?%*:|"<>]/g, '_') : 'workspace-full';
      const zipName = `${safeName}-archive.zip`;
      const tempZipPath = path.join(process.cwd(), zipName);
      await execFileAsync("zip", ["-r", "-q", tempZipPath, targetPath || ".", "-x", "node_modules/*", ".git/*", "dist/*", "*.zip"]);
      res.download(tempZipPath, zipName, () => {
        if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
      });
    } catch (err: any) { res.status(500).json({ error: err.message || "Failed to generate ZIP archive" }); }
  });

  app.delete("/api/workspace/item", (req, res) => {
    try {
      const targetPath = (req.query.path as string || "").replace(/\.\./g, "");
      if (!targetPath) return res.status(400).json({ error: "Path parameter required" });
      const fullPath = path.resolve(process.cwd(), targetPath);
      if (!isInsideCwd(fullPath)) return res.status(400).json({ error: "Path outside workspace" });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Path not found" });
      if (fs.statSync(fullPath).isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
      else fs.unlinkSync(fullPath);
      res.json({ status: "success", message: `Deleted ${targetPath}` });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Chat sessions ----
  app.get("/api/chat-sessions", (req, res) => {
    try { res.json(db.getChatSessions()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/chat-sessions", (req, res) => {
    try {
      const { session } = req.body;
      if (!session || !session.id) return res.status(400).json({ error: "Invalid session object" });
      db.saveChatSession(session);
      const sessionDirPath = path.join(process.cwd(), "sessions", session.id);
      if (!fs.existsSync(sessionDirPath)) {
        fs.mkdirSync(sessionDirPath, { recursive: true });
        fs.writeFileSync(path.join(sessionDirPath, "README.md"),
          `# Project Workspace for ${session.title}\n\nCreated: ${session.createdAt || new Date().toISOString()}\nSession ID: ${session.id}\n`);
      }
      res.json({ status: "success", session, sessionDirPath });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/chat-sessions/:id/rename", (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: "Title parameter required" });
      db.renameChatSession(req.params.id, title);
      res.json({ status: "success", message: `Renamed session ${req.params.id}` });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/chat-sessions/:id", (req, res) => {
    try {
      db.deleteChatSession(req.params.id);
      res.json({ status: "success", message: `Session ${req.params.id} deleted` });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Memories ----
  app.get("/api/memories", (req, res) => {
    try { res.json(db.getMemories()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post("/api/memories", (req, res) => {
    try {
      const { key, value, category } = req.body;
      if (!key || !value) return res.status(400).json({ error: "Key and value required" });
      db.saveMemory(key, value, category || 'general');
      res.json({ status: "success", message: "Memory saved" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete("/api/memories/:key", (req, res) => {
    try { db.deleteMemory(req.params.key); res.json({ status: "success", message: `Deleted memory ${req.params.key}` }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Self capabilities ----
  app.get("/api/self-capabilities", (req, res) => {
    try { res.json(db.getSelfCapabilities()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post("/api/self-capabilities", (req, res) => {
    try {
      const { name, codeSnippet, purpose, category } = req.body;
      if (!name || !codeSnippet) return res.status(400).json({ error: "Name and codeSnippet required" });
      const id = db.saveSelfCapability(name, codeSnippet, purpose || '', category || 'general');
      res.json({ status: "success", id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.patch("/api/self-capabilities/:id/pin", (req, res) => {
    try { res.json({ id: req.params.id, isPinned: db.togglePinSelfCapability(req.params.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.patch("/api/self-capabilities/:id/dependencies", (req, res) => {
    try {
      const { dependencies } = req.body;
      db.updateSelfCapabilityDependencies(req.params.id, dependencies || []);
      res.json({ status: "success" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Web search & logs ----
  app.post("/api/web-search", async (req, res) => {
    try {
      const { query, depth, category } = req.body;
      if (!query) return res.status(400).json({ error: "Query is required" });
      const searchRes = await toolImplementations.web_searching_module({ query, depth, category });
      res.json(searchRes);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/capability-logs/:name", (req, res) => {
    try {
      const nameDecoded = decodeURIComponent(req.params.name);
      const logs = db.getLogs().filter(l =>
        (l.toolName === "self_develop_capability" && (l.args?.name === nameDecoded || l.args?.name === req.params.name)) ||
        (l.args?.capabilityName === nameDecoded || l.args?.capabilityName === req.params.name)
      );
      res.json(logs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/routines/:name/history", (req, res) => {
    try {
      const nameDecoded = decodeURIComponent(req.params.name);
      const logs = db.getLogs().filter(l =>
        (l.toolName === "self_develop_capability" && (l.args?.name === nameDecoded || l.args?.name === req.params.name)) ||
        (l.args?.capabilityName === nameDecoded || l.args?.capabilityName === req.params.name)
      );
      res.json(logs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/upload", (req, res) => {
    try {
      const { filename, content } = req.body;
      if (!filename || content === undefined) return res.status(400).json({ error: "Filename and content required" });
      const fullPath = path.resolve(process.cwd(), filename);
      if (!isInsideCwd(fullPath)) return res.status(400).json({ error: "Path outside workspace" });
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      res.json({ status: "success", path: filename });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Files ----
  app.get("/api/files", (req, res) => {
    try {
      const files = fs.readdirSync(process.cwd()).filter(f => !['node_modules', '.git', 'dist'].includes(f));
      res.json(files);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/files/content", (req, res) => {
    try {
      const filePath = (req.query.path as string || "").replace(/\.\./g, "");
      if (!filePath) return res.status(400).send("Path parameter required");
      const fullPath = path.resolve(process.cwd(), filePath);
      if (!isInsideCwd(fullPath)) return res.status(400).send("Path outside workspace");
      if (!fs.existsSync(fullPath)) return res.status(404).send("File not found");
      const content = fs.readFileSync(fullPath, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    } catch (err: any) { res.status(500).send(err.message); }
  });

  // ---- .env management (used by EnvEditor + AiProviderValidator) ----
  app.get("/api/env/config", (req, res) => {
    try {
      const envPath = path.join(process.cwd(), ".env");
      const rawEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
      // Values are masked before leaving the server (see maskEnvValue). The UI
      // still shows which keys are set and their last 4 chars, but the full
      // secret never travels to a browser session, log or screenshot.
      const envVars: { key: string; value: string; isSet: boolean; masked: boolean }[] = [];
      const maskedRawLines: string[] = [];
      for (const line of rawEnv.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) {
          const v = m[2].replace(/^["']|["']$/g, "");
          const masked = maskEnvValue(m[1], v);
          envVars.push({ key: m[1], value: masked, isSet: v.length > 0, masked: masked !== v });
          maskedRawLines.push(`${m[1]}=${masked}`);
        } else {
          maskedRawLines.push(line); // comments and blank lines pass through
        }
      }
      res.json({ rawEnv: maskedRawLines.join("\n"), envVars, masking: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/env/update", (req, res) => {
    try {
      const { envs, rawEnv } = req.body;
      if (!Array.isArray(envs) && typeof rawEnv !== "string") {
        return res.status(400).json({ error: "envs array or rawEnv string required" });
      }
      const envPath = path.join(process.cwd(), ".env");
      let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8").split("\n") : [];
      let applied = 0, keptMasked = 0;

      // A value still carrying the display mask means "field was shown to the
      // user, never re-typed" — it must NEVER overwrite the real secret on disk.
      const isMaskedValue = (v: string) => v.trimStart().startsWith(ENV_MASK_PREFIX);

      if (Array.isArray(envs)) {
        for (const item of envs) {
          const key = String(item?.key || "");
          if (!/^[A-Z0-9_]+$/.test(key)) continue;
          const v = String(item?.value ?? "");
          if (isMaskedValue(v)) { keptMasked++; continue; }
          process.env[key] = v;
          const idx = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));
          if (idx >= 0) lines[idx] = `${key}=${v}`;
          else lines.push(`${key}=${v}`);
          applied++;
        }
      } else {
        // Raw text mode (this path previously did not exist — the UI's raw
        // editor silently failed with 400). Comments and blanks pass through;
        // masked secret lines keep the value currently on disk; new plain
        // values are applied to both the file and process.env.
        const currentVal = new Map<string, string>();
        for (const l of lines) {
          const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
          if (m) currentVal.set(m[1], m[2]);
        }
        lines = (rawEnv as string).split("\n").map((l: string) => {
          const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
          if (!m) return l;
          const key = m[1], val = m[2];
          if (isMaskedValue(val)) {
            if (currentVal.has(key)) { keptMasked++; return `${key}=${currentVal.get(key)}`; }
            return l; // masked value for an unknown key: store nothing new
          }
          process.env[key] = val;
          applied++;
          return l;
        });
      }

      fs.writeFileSync(envPath, lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n", "utf-8");
      try { dotenv.config({ override: true }); } catch {}
      res.json({ success: true, applied, keptMasked, message: `.env diperbarui (${applied} nilai diterapkan, ${keptMasked} mask dipertahankan) & dimuat ulang` });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/env/status", async (req, res) => {
    // Benar-benar memanggil endpoint tiap penyedia. Versi sebelumnya hanya
    // memeriksa apakah variabel env terisi lalu melabelinya "valid", sementara
    // UI mengklaim sedang "pinging REST endpoints & measuring latency". Kunci
    // yang dicabut atau kuotanya habis tetap tampil hijau, sehingga panel ini
    // menyesatkan justru ketika paling dibutuhkan.
    const first = (...names: string[]) => names.map(n => process.env[n]).find(Boolean) || "";

    type P = { name: string; status: "valid" | "invalid" | "missing"; latencyMs?: number; detail?: string };

    const timed = async (name: string, key: string, run: () => Promise<Response>): Promise<P> => {
      if (!key) return { name, status: "missing" };
      const t0 = Date.now();
      try {
        const r = await run();
        const latencyMs = Date.now() - t0;
        if (r.ok) return { name, status: "valid", latencyMs };
        const body = await r.text().catch(() => "");
        // Bedakan kunci mati dari kuota habis: keduanya membuat penyedia tidak
        // bisa dipakai, tapi tindakan perbaikannya sama sekali berbeda.
        let detail = `HTTP ${r.status}`;
        if (r.status === 429 || /quota|rate.?limit/i.test(body)) detail = "Kuota / rate limit habis";
        else if (r.status === 401 || r.status === 403) detail = "Kunci ditolak";
        else if (/insufficient_quota/i.test(body)) detail = "Saldo kredit habis";
        return { name, status: "invalid", latencyMs, detail };
      } catch (e: any) {
        return { name, status: "invalid", latencyMs: Date.now() - t0, detail: e?.name === "TimeoutError" ? "Timeout" : "Tidak terjangkau" };
      }
    };

    const sig = () => AbortSignal.timeout(8000);

    const gemini = first("GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_API_KEY", "X_GOOG_API_KEY");
    const groq = first("GROQ_KEY", "GROQ_API_KEY");
    const openai = first("OPENAI_API_KEY", "OPENAI_KEY");
    const openrouter = first("OPENROUTER_API_KEY", "OR_KEY", "OPENROUTER_KEY");
    const cfToken = first("CF_AI_TOKEN", "CF_TOKEN");
    const cfAcct = first("CF_ACCOUNT_ID");

    const providers = await Promise.all([
      timed("Gemini", gemini, () => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${gemini}`, { signal: sig() })),
      timed("Groq", groq, () => fetch("https://api.groq.com/openai/v1/models",
        { headers: { Authorization: `Bearer ${groq}` }, signal: sig() })),
      timed("OpenAI", openai, () => fetch("https://api.openai.com/v1/models",
        { headers: { Authorization: `Bearer ${openai}` }, signal: sig() })),
      timed("OpenRouter", openrouter, () => fetch("https://openrouter.ai/api/v1/models",
        { headers: { Authorization: `Bearer ${openrouter}` }, signal: sig() })),
      timed("Cloudflare AI", cfToken && cfAcct ? cfToken : "", () => fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAcct}/ai/models/search?per_page=1`,
        { headers: { Authorization: `Bearer ${cfToken}` }, signal: sig() })),
    ]);

    // Cloudflare perlu dua nilai; bedakan "belum diisi" dari "ditolak".
    if (cfToken && !cfAcct) {
      const i = providers.findIndex(p => p.name === "Cloudflare AI");
      if (i >= 0) providers[i] = { name: "Cloudflare AI", status: "missing", detail: "CF_ACCOUNT_ID belum diisi" };
    }

    res.json({ providers, checkedAt: new Date().toISOString() });
  });

  // ---- SSH Daemon (local device) config + exec ----
  app.get("/api/ssh/config", (req, res) => {
    res.json({
      host: process.env.SSH_HOST || "127.0.0.1",
      port: process.env.SSH_PORT || "8022",
      user: process.env.SSH_USER || "",
      password: process.env.SSH_PASSWORD ? "***" : "",
      keyPath: process.env.SSH_KEY_PATH || "/storage/emulated/0/SshDaemon/ssh_host_rsa_key"
    });
  });

  app.post("/api/ssh/config", async (req, res) => {
    try {
      const { host, port, user, password, keyPath } = req.body || {};
      const envPath = path.join(process.cwd(), ".env");
      let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8").split("\n") : [];
      const setEnv = (key: string, value: string) => {
        if (value === undefined || value === "***") return;
        process.env[key] = value;
        const idx = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));
        if (idx >= 0) lines[idx] = `${key}=${value}`;
        else lines.push(`${key}=${value}`);
      };
      setEnv("SSH_HOST", String(host ?? ""));
      setEnv("SSH_PORT", String(port ?? ""));
      setEnv("SSH_USER", String(user ?? ""));
      setEnv("SSH_PASSWORD", String(password ?? ""));
      setEnv("SSH_KEY_PATH", String(keyPath ?? ""));
      fs.writeFileSync(envPath, lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n", "utf-8");
      try { dotenv.config({ override: true }); } catch {}
      res.json({ success: true, message: "SSH config disimpan & dimuat ulang" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/ssh/exec", async (req, res) => {
    try {
      const command = String(req.body?.command || "");
      // Same choke point as the ssh_run TOOL — this endpoint previously ran
      // commands with no guard at all. SHELL_GUARD applies here too.
      const blocked = guardShell("api/ssh/exec", command);
      if (blocked) return res.status(403).json(blocked);
      const r = await sshExec(command);
      res.json(r);
    } catch (err: any) { res.status(500).json({ status: "error", error: err.message }); }
  });

  app.post("/api/ssh/generate-keys", async (req, res) => {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const home = process.env.HOME || "/data/data/com.termux/files/home";
      const sshDir = path.join(home, ".ssh");
      if (!fs.existsSync(sshDir)) fs.mkdirSync(sshDir, { recursive: true });
      const keyPath = path.join(sshDir, "rocagent_key");
      try { fs.unlinkSync(keyPath); fs.unlinkSync(keyPath + ".pub"); } catch {}
      try {
        await execAsync(`ssh-keygen -t ed25519 -f ${JSON.stringify(keyPath)} -N "" -C "rocagent"`, { timeout: 15000 });
      } catch (e: any) {
        return res.status(500).json({ error: "ssh-keygen gagal. Jalankan sekali: pkg install openssh. (" + e.message + ")" });
      }
      const pubKey = fs.existsSync(keyPath + ".pub") ? fs.readFileSync(keyPath + ".pub", "utf-8").trim() : "";

      // Best-effort: pasang pubkey ke authorized_keys daemon
      const authKeys = "/sdcard/SshDaemon/authorized_keys";
      let autoInstalled = false, autoInstallError = "";
      try {
        const dir = path.dirname(authKeys);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const existing = fs.existsSync(authKeys) ? fs.readFileSync(authKeys, "utf-8") : "";
        if (!existing.includes(pubKey)) fs.appendFileSync(authKeys, pubKey + "\n", "utf-8");
        autoInstalled = true;
      } catch (e: any) { autoInstallError = e.message; }

      // Simpan SSH_KEY_PATH ke .env + process.env
      process.env.SSH_KEY_PATH = keyPath;
      const envPath = path.join(process.cwd(), ".env");
      let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8").split("\n") : [];
      const idx = lines.findIndex(l => /^\s*SSH_KEY_PATH\s*=/.test(l));
      if (idx >= 0) lines[idx] = `SSH_KEY_PATH=${keyPath}`; else lines.push(`SSH_KEY_PATH=${keyPath}`);
      fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");

      res.json({ success: true, keyPath, publicKey: pubKey, authorizedKeysPath: authKeys, autoInstalled, autoInstallError });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- GitHub ----
  // Resolve "owner/repo" from the actual git remote (origin), with GITHUB_REPO override.
  async function resolveGitHubRepo(execAsync: any): Promise<string> {
    const envOverride = (process.env.GITHUB_REPO || "").trim();
    if (envOverride.includes("/")) return envOverride;
    try {
      const { stdout } = await execAsync("git remote get-url origin", { timeout: 3000 });
      const m = (stdout || "").trim().match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (m) return `${m[1]}/${m[2]}`;
    } catch {}
    return "ivansslo/RocAgent";
  }

  app.get("/api/github/updates", async (req, res) => {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const pat = process.env.GITHUB_PAT || process.env.GITHUB_OAUTH_TOKEN || process.env.GH_TOKEN || "";
      const repo = await resolveGitHubRepo(execAsync);

      let localHead = "";
      try { const { stdout } = await execAsync("git rev-parse HEAD", { timeout: 3000 }); localHead = stdout.trim(); } catch (_) {}

      const headers: any = { "User-Agent": "RocAgent-App", "Accept": "application/vnd.github.v3+json" };
      if (pat) headers["Authorization"] = `Bearer ${pat}`;

      let commits: any[] = [];
      let remoteHead = localHead ? localHead.substring(0, 7) : "0000000";
      let hasUpdates = false;
      try {
        const resp = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            remoteHead = data[0].sha;
            hasUpdates = localHead !== remoteHead;
            commits = data.map((c: any) => ({ sha: c.sha.substring(0, 7), message: c.commit?.message || "", author: c.commit?.author?.name || c.author?.login || "", date: c.commit?.author?.date || new Date().toISOString(), url: c.html_url }));
          }
        }
      } catch (fetchErr) { console.warn("[GitHub API] Could not fetch commits:", fetchErr); }
      res.json({ hasUpdates, localHead: localHead ? localHead.substring(0, 7) : "0000000", remoteHead, repo, commits });
    } catch (err: any) {
      res.json({ hasUpdates: false, localHead: "0000000", remoteHead: "0000000", repo: "unknown", commits: [] });
    }
  });

  app.post("/api/github/pull", async (req, res) => {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync("git pull origin main", { timeout: 30000 });
      try { dotenv.config({ override: true }); } catch (e) { console.warn("[dotenv] reload failed:", e); }
      res.json({ status: "success", stdout: stdout || "Pull successful", stderr: stderr || "" });
    } catch (err: any) { res.status(500).json({ status: "error", error: err.message }); }
  });

  app.post("/api/github/push", async (req, res) => {
    // Scrub EVERY token variant in output — not only the active one — so an
    // error message can never echo a different configured token.
    const tokensToScrub = [req.body?.token, process.env.GITHUB_PAT, process.env.GITHUB_OAUTH_TOKEN, process.env.GH_TOKEN].filter((t): t is string => typeof t === "string" && t.length > 0);
    const scrubAll = (t: string) => tokensToScrub.reduce((s, tok) => s.split(tok).join("***"), String(t || ""));
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const token = req.body?.token || process.env.GITHUB_PAT || process.env.GITHUB_OAUTH_TOKEN || process.env.GH_TOKEN;
      if (!token) return res.status(400).json({ status: "error", error: "GitHub token diperlukan untuk push." });
      const repo = await resolveGitHubRepo(execAsync);
      let branch = "main";
      try { const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { timeout: 3000 }); branch = stdout.trim() || "main"; } catch (_) {}
      await execAsync('git config user.name "RocAgent" && git config user.email "agent@rocagent.local"');
      await execAsync('git add . && git commit -m "chore: update via ROCAgents" || true');
      const pushUrl = `https://${token}@github.com/${repo}.git`;
      const { stdout, stderr } = await execAsync(`git push ${pushUrl} ${branch}`, { timeout: 45000 });
      res.json({ status: "success", message: `Push berhasil ke ${repo}:${branch}.`, stdout: scrubAll(stdout), stderr: scrubAll(stderr) });
    } catch (err: any) {
      res.status(500).json({ status: "error", error: scrubAll(String(err.message || "")) });
    }
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Serve pre-built static bundle if present, otherwise live Vite middleware
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(path.join(distPath, 'index.html')) && process.env.FORCE_DEV_VITE !== 'true') {
    console.log("📦 Serving pre-compiled static bundle from dist/...");
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log("⚡ Serving live Vite development middleware...");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 RocAgent Server running on http://${HOST}:${PORT} (auth: required)`);
  });
}

startServer();
