import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { runOrchestrator } from "./server/orchestrator";
import { db } from "./server/db";
import { initScheduler } from "./server/scheduler";
import { createAuthMiddleware } from "./server/authMiddleware";
import { toolImplementations, sshExec } from "./server/tools";

if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config();
process.env.DISABLE_HMR = 'true';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  initScheduler();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Optional Password Protection Middleware
  if (process.env.WEB_PASSWORD) {
    app.use(createAuthMiddleware(process.env.WEB_PASSWORD));
  }

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // Public: tells the frontend whether password protection is enabled.
  app.get("/api/auth/status", (req, res) => {
    res.json({ protected: Boolean(process.env.WEB_PASSWORD) });
  });

  app.get("/api/models", (req, res) => {
    const models = [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Fast)", provider: "gemini", icon: "⚡", active: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Reasoning)", provider: "gemini", icon: "🧠", active: true },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", icon: "⚡", active: true },
      { id: "llama-3.3-70b-versatile", name: "Groq Llama 3.3 70B", provider: "groq", icon: "⚡", active: true },
      { id: "gpt-4o", name: "OpenAI GPT-4o", provider: "openai", icon: "🟢", active: true },
      { id: "gpt-4o-mini", name: "OpenAI GPT-4o mini", provider: "openai", icon: "🟢", active: true },
      { id: "deepseek/deepseek-r1", name: "OpenRouter DeepSeek R1", provider: "openrouter", icon: "🌐", active: true },
      { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Cloudflare Llama 3.3", provider: "cfai", icon: "☁️", active: true }
    ];
    const activeProvider = process.env.PROVIDER || (
      (process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY) ? "gemini" :
      (process.env.GROQ_KEY || process.env.GROQ_API_KEY) ? "groq" : "gemini"
    );
    res.json({ active_provider: activeProvider, models });
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
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    try {
      const { messages, model, provider, persona } = req.body;
      if (!messages || !Array.isArray(messages)) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Invalid messages array" })}\n\n`);
        if ((res as any).flush) (res as any).flush();
        return res.end();
      }

      res.write(`event: status\ndata: ${JSON.stringify({ message: "Initializing Orchestrator..." })}\n\n`);
      if ((res as any).flush) (res as any).flush();

      const result = await runOrchestrator(messages, {
        model, provider, persona,
        onProgress: (evt) => {
          res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
          if ((res as any).flush) (res as any).flush();
          if (evt.type === 'tool_output' || evt.type === 'tool_start' || evt.type === 'tool_result') {
            broadcastToTerminal(evt.type, evt.data);
          }
        }
      });

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      if ((res as any).flush) (res as any).flush();
      res.end();
    } catch (error: any) {
      console.error("Stream Orchestrator Error:", error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || "Streaming failed" })}\n\n`);
      if ((res as any).flush) (res as any).flush();
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
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    terminalClients.add(res);

    // Keep-alive ping every 10 seconds to keep SSE connection open on Android/Termux mobile browser
    const pinger = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
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
        if (typeof client.flush === 'function') client.flush();
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
      // Containment check
      if (!fullPath.startsWith(process.cwd())) {
        return res.status(400).json({ error: "Path outside workspace" });
      }
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Target path not found" });
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const safeName = targetPath ? targetPath.replace(/[/\\?%*:|"<>]/g, '_') : 'workspace-full';
      const zipName = `${safeName}-archive.zip`;
      const tempZipPath = path.join(process.cwd(), zipName);
      await execAsync(`zip -r -q "${tempZipPath}" "${targetPath || '.'}" -x "node_modules/*" ".git/*" "dist/*" "*.zip"`);
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
      if (!fullPath.startsWith(process.cwd())) return res.status(400).json({ error: "Path outside workspace" });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Item not found" });
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ---- Env config ----
  app.get("/api/env-check", (req, res) => {
    const checks = [
      { name: "Gemini", keys: ["GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_API_KEY"] },
      { name: "Groq", keys: ["GROQ_KEY", "GROQ_API_KEY"] },
      { name: "OpenAI", keys: ["OPENAI_API_KEY", "OPENAI_KEY"] },
      { name: "OpenRouter", keys: ["OPENROUTER_API_KEY", "OR_KEY", "OPENROUTER_KEY"] },
      { name: "Cloudflare AI", keys: ["CF_AI_TOKEN", "CF_TOKEN"] },
      { name: "GitHub", keys: ["GITHUB_PAT", "GH_TOKEN", "GITHUB_TOKEN"] },
    ];
    const providers = checks.map(c => ({ name: c.name, status: c.keys.some(k => process.env[k]) ? "valid" : "missing" }));
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
      const keyPath = path.join(sshDir, "rocagents_key");
      try { fs.unlinkSync(keyPath); fs.unlinkSync(keyPath + ".pub"); } catch {}
      try {
        await execAsync(`ssh-keygen -t ed25519 -f ${JSON.stringify(keyPath)} -N "" -C "rocagents"`, { timeout: 15000 });
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
  async function resolveGitHubRepo(execAsync: any): Promise<string> {
    const envOverride = (process.env.GITHUB_REPO || "").trim();
    if (envOverride.includes("/")) return envOverride;
    try {
      const { stdout } = await execAsync("git remote get-url origin", { timeout: 3000 });
      const m = (stdout || "").trim().match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (m) return `${m[1]}/${m[2]}`;
    } catch {}
    return "ivansslo/roca-codex";
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

      const headers: any = { "User-Agent": "ROCAgents-App", "Accept": "application/vnd.github.v3+json" };
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
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const token = req.body?.token || process.env.GITHUB_PAT || process.env.GITHUB_OAUTH_TOKEN || process.env.GH_TOKEN;
      if (!token) return res.status(400).json({ status: "error", error: "GitHub token diperlukan untuk push." });
      const repo = await resolveGitHubRepo(execAsync);
      let branch = "main";
      try { const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { timeout: 3000 }); branch = stdout.trim() || "main"; } catch (_) {}
      await execAsync('git config user.name "ROCAgents" && git config user.email "agent@rocagents.local"');
      await execAsync('git add . && git commit -m "chore: update via ROCAgents" || true');
      const pushUrl = `https://${token}@github.com/${repo}.git`;
      const { stdout, stderr } = await execAsync(`git push ${pushUrl} ${branch}`, { timeout: 45000 });
      const scrub = (t: string) => String(t || "").split(token).join("***");
      res.json({ status: "success", message: `Push berhasil ke ${repo}:${branch}.`, stdout: scrub(stdout), stderr: scrub(stderr) });
    } catch (err: any) {
      const tok = req.body?.token || process.env.GITHUB_PAT || "";
      res.status(500).json({ status: "error", error: String(err.message || "").split(tok).join("***") });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 ROCAgents Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
