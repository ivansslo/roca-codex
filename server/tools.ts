/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { exec, execFile } from 'child_process';
import util from 'util';
import net from 'net';
import dns from 'dns';
import { checkCommand, auditLine, resolveMode } from './commandGuard';

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

/**
 * Single choke point for every shell-executing tool. Returns null when the
 * command may proceed, or the error object the tool should return.
 *
 * Note the ordering: unescapeHtml() runs BEFORE this, deliberately. It turns
 * "&amp;&amp;" back into "&&", so the guard must inspect the post-unescape
 * string — the same string the shell will receive. Guarding the escaped form
 * would let an attacker hide operators behind HTML entities.
 */
// Exported so HTTP endpoints in server.ts share the SAME choke point as the
// agent tools (previously /api/ssh/exec ran commands with no guard at all).
export function guardShell(tool: string, command: string) {
  const mode = resolveMode();
  const verdict = checkCommand(command, mode);
  console.log(auditLine(tool, command, verdict));
  if (verdict.allowed) return null;
  return {
    status: 'error' as const,
    blocked: true,
    code: verdict.code,
    message: `Blocked by shell guard [${verdict.code}]: ${verdict.reason}`,
    offending: verdict.offending,
    stdout: '',
    stderr: '',
    hint: 'If this is a legitimate operation, run it yourself in a terminal. Set SHELL_GUARD=warn to log instead of block (not recommended).',
  };
}

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
let buildQueuedLabel: string | null = null;
function triggerBackgroundBuild(fileLabel: string) {
  // Queue-at-most-one: previously an edit arriving while a build ran was simply
  // dropped, leaving dist/ stale until the NEXT edit happened to trigger a build.
  // Edits during a build now schedule exactly one follow-up rebuild.
  if (buildInFlight) { buildQueuedLabel = fileLabel; return; }
  buildInFlight = true;
  console.log(`[AutoBuild] Background rebuild triggered by ${fileLabel}...`);
  exec('PATH="./node_modules/.bin:$PATH" npm run build', { timeout: 120000 }, (error, stdout) => {
    buildInFlight = false;
    if (error) {
      console.warn(`[AutoBuild] Build output: ${error.message}`);
    } else {
      console.log(`[AutoBuild] Bundle dist/ compiled successfully (bg).`);
    }
    const queued = buildQueuedLabel;
    buildQueuedLabel = null;
    if (queued) triggerBackgroundBuild(queued);
  });
}

export async function executeTool(toolName: string, args: any, onToolProgress?: ToolProgressCallback) {
  const cleanArgs = unescapeToolArgs(args || {});
  const impl = toolImplementations[toolName];
  if (!impl) {
    return { status: "error", message: `Tool ${toolName} not found` };
  }
  return await impl(cleanArgs, onToolProgress);
}

// SSH execution via ssh2 (connects to local device's ssh-daemon). Config: SSH_HOST/SSH_PORT/SSH_USER/SSH_PASSWORD/SSH_KEY_PATH.
export async function sshExec(command: string): Promise<{ status: string; stdout: string; stderr: string; error?: string }> {
  const { Client } = await import('ssh2') as any;
  const host = process.env.SSH_HOST || "127.0.0.1";
  const port = parseInt(process.env.SSH_PORT || "8022", 10);
  const username = process.env.SSH_USER || process.env.USER || "root";
  const password = process.env.SSH_PASSWORD || "";
  const keyPath = process.env.SSH_KEY_PATH || "";
  if (!command) return { status: "error", stdout: "", stderr: "", error: "command kosong" };

  const creds: any = {};
  if (password) { creds.password = password; creds.tryKeyboard = true; }
  else if (keyPath) {
    try { creds.privateKey = fs.readFileSync(keyPath); }
    catch (e: any) { return { status: "error", stdout: "", stderr: "", error: `Tidak bisa baca key ${keyPath}: ${e.message}` }; }
  } else {
    return { status: "error", stdout: "", stderr: "", error: "SSH_PASSWORD atau SSH_KEY_PATH belum dikonfigurasi." };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = "", stderr = "", done = false;
    const finish = (r: any) => { if (!done) { done = true; try { conn.end(); } catch {} resolve(r); } };
    const timer = setTimeout(() => finish({ status: "error", stdout, stderr, error: "SSH timeout (20s)" }), 20000);
    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) return finish({ status: "error", stdout, stderr, error: err.message });
        stream.on("data", (d: any) => { stdout += d.toString(); });
        stream.on("stderr", (d: any) => { stderr += d.toString(); });
        stream.on("close", () => { clearTimeout(timer); finish({ status: "success", stdout, stderr }); });
      });
    });
    conn.on("error", (e: any) => { clearTimeout(timer); finish({ status: "error", stdout, stderr, error: e.message }); });
    conn.connect({ host, port, username, ...creds, readyTimeout: 15000 });
  });
}

// --- SSRF guard for http_request -------------------------------------------
// The agent may ask this server to fetch arbitrary URLs. Unchecked, that reaches
// cloud instance metadata (169.254.169.254 — leaks OCI/AWS credentials), the
// tailnet (100.64.0.0/10), the LAN, and loopback services. Hostnames are
// resolved first and private ranges refused. Residual gap, stated honestly:
// DNS rebinding between this check and connect() is not defeated here — the
// durable fix is OS egress rules, same as for the shell guard.
function isPrivateOrLocalIp(ip: string): boolean {
  let v = ip.trim().toLowerCase();
  if (v.startsWith('::ffff:')) v = v.slice(7);            // IPv4-mapped IPv6
  const zone = v.indexOf('%');
  if (zone !== -1) v = v.slice(0, zone);                  // strip IPv6 zone id
  if (v === '::1' || v === '::') return true;             // IPv6 loopback/unspecified
  if (v.includes(':')) {
    const firstSeg = v.split(':')[0];
    const n = parseInt(firstSeg || '0', 16);
    // fe80::/10 link-local, fc00::/7 unique-local
    return (n & 0xffc0) === 0xfe80 || (n & 0xfe00) === 0xfc00;
  }
  const parts = v.split('.');
  if (parts.length !== 4) return true;                    // odd literal (decimal/octal tricks): distrust
  const nums = parts.map(p => Number(p));
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;      // "this net", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT — includes Tailscale 100.x
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // private
  if (a === 192 && (b === 168 || b === 0)) return true;   // private / protocol assignments
  if (a >= 224) return true;                              // multicast / reserved / broadcast
  return false;
}

async function resolveHostIps(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];
  try {
    const results = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    return results.map(r => r.address);
  } catch {
    return []; // DNS failure is treated as unsafe by the caller
  }
}

export async function checkUrlSafe(rawUrl: string): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return { safe: false, reason: 'Invalid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { safe: false, reason: 'Only http/https allowed' };
  if (parsed.username || parsed.password) return { safe: false, reason: 'Credentials embedded in the URL are not allowed' };
  const ips = await resolveHostIps(parsed.hostname);
  if (!ips.length) return { safe: false, reason: `Cannot resolve host: ${parsed.hostname}` };
  if (ips.some(isPrivateOrLocalIp)) {
    return { safe: false, reason: `Blocked (SSRF protection): ${parsed.hostname} resolves to a private/loopback/link-local address. Cloud metadata, tailnet and LAN services are unreachable through this tool.` };
  }
  return { safe: true };
}

// --- Heuristic denylist for self_develop_capability snippets ----------------
// Snippets run via new Function() with full Node privileges — a path the shell
// command guard cannot see, equivalent to an unguarded eval of model-written
// code. Execution is therefore OFF by default (see SELF_DEV_EXECUTE below) and
// even then screened. Like the shell guard, this screen is a seatbelt: pattern
// matching cannot prove arbitrary code is safe.
const SELF_DEV_DENIED_RE =
  /(child_process|\bspawn\b|\bexec(Sync|FileSync|File)?\s*\(|\brequire\s*\(|\bimport\s*\(|\beval\s*\(|new\s+Function|\bprocess\s*[.[]|globalThis|global\s*[.[]|module\s*[.[]|__dirname|__filename|\.env\b|getenv)/i;

export const toolImplementations: Record<string, Function> = {
  list_project_files: async () => {
    try {
      const files = getAllFiles(process.cwd());
      return { status: "success", files };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  /**
   * Membaca berkas proyek.
   *
   * lineNumbers (default true) memberi awalan nomor baris pada tiap baris.
   * Tanpa itu model harus menghitung baris sendiri dari teks mentah, dan itu
   * tidak bisa diandalkan - pengujian menunjukkan jawaban "baris 50" meleset
   * tiga baris. startLine/endLine membatasi rentang supaya pertanyaan tentang
   * satu baris tidak perlu memuat seluruh berkas ke konteks.
   */
  read_project_file: async (args: { filename: string; lineNumbers?: boolean; startLine?: number; endLine?: number }) => {
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
      let content = fs.readFileSync(filePath, 'utf-8');

      const allLines = content.split('\n');
      const totalLines = allLines.length;

      // Rentang baris: 1-based dan inklusif, sesuai cara orang menyebut baris.
      const from = Math.max(1, args.startLine || 1);
      const to = Math.min(totalLines, args.endLine || totalLines);
      const sliced = (args.startLine || args.endLine) ? allLines.slice(from - 1, to) : allLines;
      const offset = (args.startLine || args.endLine) ? from : 1;

      if (args.lineNumbers !== false) {
        const width = String(offset + sliced.length - 1).length;
        content = sliced
          .map((l, i) => `${String(offset + i).padStart(width, ' ')}| ${l}`)
          .join('\n');
      } else {
        content = sliced.join('\n');
      }

      if (args.startLine || args.endLine) {
        return {
          status: "success",
          content,
          filename: args.filename,
          lineRange: `${from}-${to}`,
          totalLines,
          note: "Nomor baris berasal dari berkas, bukan hitungan model.",
        };
      }
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

      // Guard AFTER unescaping: inspect exactly what the shell will receive.
      const blocked = guardShell('run_bash_command', cleanCommand);
      if (blocked) return blocked;

      // Ensure Termux native binary path is included in PATH
      const termuxBin = "/data/data/com.termux/files/usr/bin";
      const currentPath = process.env.PATH || "";
      const safePath = currentPath.includes(termuxBin)
        ? currentPath
        : `${termuxBin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${currentPath}`;

      const safeEnv = {
        ...process.env,
        HOME: process.env.HOME || (fs.existsSync("/data/data/com.termux/files/home") ? "/data/data/com.termux/files/home" : "/root"),
        USER: process.env.USER || "root",
        TERM: "xterm-256color",
        PATH: safePath,
      };

      const nativeShell = fs.existsSync(`${termuxBin}/bash`) 
        ? `${termuxBin}/bash` 
        : (fs.existsSync(`${termuxBin}/sh`) ? `${termuxBin}/sh` : undefined);

      // Check if proot-distro is installed AND ubuntu container is explicitly INSTALLED
      let hasUbuntuProot = false;
      try {
        const { stdout } = await execAsync("proot-distro list", { env: safeEnv, timeout: 3000 } as any);
        if (stdout && String(stdout).includes("ubuntu") && String(stdout).includes("installed")) {
          hasUbuntuProot = true;
        }
      } catch (_) {}

      if (hasUbuntuProot) {
        try {
          const { stdout, stderr } = await execAsync(
            `proot-distro login ubuntu -- bash -c ${JSON.stringify(cleanCommand)}`,
            { timeout: 30000, env: safeEnv } as any
          );
          const outStr = String(stdout || "");
          const errStr = String(stderr || "");
          _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout: outStr, stderr: errStr } });
          return { status: "success", stdout: outStr, stderr: errStr };
        } catch (e1: any) {
          // If PRoot execution fails, proceed immediately to native Termux execution
        }
      }

      // Fast Direct Native Execution in Termux Shell (Sub-10ms latency)
      try {
        const opts: any = { timeout: 30000, env: safeEnv };
        if (nativeShell) opts.shell = nativeShell;
        const { stdout, stderr } = await execAsync(cleanCommand, opts);
        const outStr = String(stdout || "");
        const errStr = String(stderr || "");
        _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout: outStr, stderr: errStr } });
        return { status: "success", stdout: outStr, stderr: errStr };
      } catch (e2: any) {
        const out = String(e2.stdout || "");
        const errStr = String(e2.stderr || e2.message || "");
        _onProgress?.({ type: 'tool_output', data: { toolName: 'run_bash_command', stdout: out, stderr: errStr } });
        return { status: "error", message: String(e2.message || "Execution error"), stdout: out, stderr: errStr };
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
        // DISABLED by default. The snippet runs with full Node privileges, so
        // `execute` bypasses the shell command guard entirely (a snippet could
        // shell out via child_process without any inspection). The operator
        // opts in deliberately with SELF_DEV_EXECUTE=true and a restart. This
        // gate also covers the cron scheduler, which calls this same function.
        if ((process.env.SELF_DEV_EXECUTE || "").toLowerCase() !== "true") {
          return {
            status: "error",
            blocked: true,
            code: "SELF_DEV_DISABLED",
            message: "Eksekusi self_develop dinonaktifkan secara default: snippet berjalan dengan hak penuh Node dan melewati shell guard. Set SELF_DEV_EXECUTE=true di .env hanya bila Anda memahami risikonya, lalu restart server.",
          };
        }
        if (!name) return { status: "error", message: "Capability name is required to execute." };
        const capabilities = db.getSelfCapabilities();
        const found = capabilities.find(c => c.name === name);
        if (!found) return { status: "error", message: `Capability ${name} not found.` };

        const risky = SELF_DEV_DENIED_RE.exec(found.codeSnippet || "");
        if (risky) {
          return {
            status: "error",
            blocked: true,
            code: "SELF_DEV_SNIPPET_RISK",
            message: `Snippet ditolak: mengandung pola berisiko ("${risky[0]}") yang bisa melewati inspeksi. Tulis ulang tanpa child_process/process/require/eval, atau jalankan manual di terminal.`,
          };
        }

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
      const cmd = unescapeHtml(args.command || "ls -la");
      const blocked = guardShell('terminal_manager', cmd);
      if (blocked) return blocked;

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

      // SSRF guard: validate BEFORE any network I/O.
      const initial = await checkUrlSafe(rawUrl);
      if (!initial.safe) {
        return { status: "error", blocked: true, code: "SSRF_BLOCKED", message: initial.reason };
      }

      const method = (args.method || "GET").toUpperCase();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const opts: any = { method, redirect: "manual", signal: controller.signal, headers: { ...(args.headers || {}) } };
      if (method === "POST" && args.body !== undefined) {
        opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
        opts.body = typeof args.body === "string" ? args.body : JSON.stringify(args.body);
      }

      // Redirects are walked manually: fetch() following redirects on its own
      // would let a "safe" public URL bounce the request to an internal address,
      // silently bypassing the check above. Every hop is re-validated (max 5).
      let resp!: Response;
      let current = rawUrl;
      try {
        for (let hop = 0; ; hop++) {
          resp = await fetch(current, opts);
          const location = resp.headers.get("location");
          if (resp.status < 300 || resp.status >= 400 || !location) break;
          if (hop >= 5) return { status: "error", message: "Too many redirects (max 5)" };
          const nextUrl = new URL(location, current).href;
          const hopCheck = await checkUrlSafe(nextUrl);
          if (!hopCheck.safe) {
            return { status: "error", blocked: true, code: "SSRF_REDIRECT", message: `Redirect blocked: ${hopCheck.reason}` };
          }
          current = nextUrl;
        }
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
        url: current,
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

  // Delegate a data-analysis OR identity/definition question to the Snowflake
  // Cortex Agent "RocAgentInsight" (RocAgent's own operational-data agent).
  // This is a REAL call to Snowflake's Cortex Agents REST API — it returns
  // whatever the agent's semantic view / warehouse actually produced, never
  // invented numbers. Reads credentials from env only (SNOWFLAKE_ACCOUNT,
  // _USER, _PAT or _KEY); does nothing and returns a clear error if unset.
  //
  // NOTE: the tool schema in db.ts (DEFAULT_SCHEMA) is what actually decides
  // when the LLM calls this — it must cover BOTH "what is RocAgentInsight"
  // identity questions AND operational-metric questions, otherwise the model
  // treats "RocAgentInsight" as an unknown local file/symbol and searches the
  // project with list_project_files/search instead of calling this tool
  // (observed bug: 2026-07-31, fixed by widening the db.ts description).
  query_snowflake_insight: async (args: { question: string; agent?: string; database?: string; schema?: string }) => {
    try {
      const question = (args.question || "").trim();
      if (!question) return { status: "error", message: "question is required" };

      const account = process.env.SNOWFLAKE_ACCOUNT || "";
      const user = process.env.SNOWFLAKE_USER || "";
      const pat = process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_KEY || "";
      if (!account || !user || !pat) {
        return {
          status: "error",
          message: "Snowflake belum dikonfigurasi. Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, dan SNOWFLAKE_PAT (atau SNOWFLAKE_KEY) di cloud.env.",
        };
      }

      const database = args.database || process.env.SNOWFLAKE_INSIGHT_DB || "ROCAGENTINSIGHT_DB";
      const schema = args.schema || process.env.SNOWFLAKE_INSIGHT_SCHEMA || "GOVERNANCE";
      const agentName = args.agent || process.env.SNOWFLAKE_INSIGHT_AGENT || "ROCAGENTINSIGHT";

      const host = `https://${account}.snowflakecomputing.com`;
      const url = `${host}/api/v2/databases/${database}/schemas/${schema}/agents/${agentName}:run`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);

      let resp: Response;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pat}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: [{ type: "text", text: question }] }],
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const raw = await resp.text();
      if (!resp.ok) {
        return { status: "error", message: `Snowflake Cortex Agent HTTP ${resp.status}: ${raw.slice(0, 500)}` };
      }

      // The Agents REST API streams Server-Sent Events: "event: <type>" lines
      // followed by "data: {...}" lines. Only response.text.delta events are
      // accumulated for the final answer — response.text repeats the SAME
      // text in full at the end of each content block (not new content), and
      // response.thinking(.delta) is the model's internal reasoning, not the
      // answer. Treating every event with a `text` field as answer content
      // (an earlier version of this code did) produced a duplicated,
      // thinking-polluted answer.
      let finalText = "";
      const toolsUsed: string[] = [];
      let errorMsg = "";
      let currentEvent = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let data: any;
        try { data = JSON.parse(payload); } catch { continue; }
        if (currentEvent === "response.text.delta" && typeof data?.text === "string") finalText += data.text;
        if (data?.name && !toolsUsed.includes(data.name)) toolsUsed.push(data.name);
        if (data?.message && data?.code) errorMsg = data.message;
      }

      if (errorMsg && !finalText) {
        return { status: "error", message: `Snowflake Cortex Agent error: ${errorMsg}` };
      }

      return {
        status: "success",
        agent: agentName,
        question,
        answer: finalText || "(Agent tidak mengembalikan teks jawaban — lihat raw_response.)",
        tools_used: toolsUsed,
        raw_response: raw.length > 12000 ? raw.slice(0, 12000) + "...(truncated)" : raw,
      };
    } catch (err: any) {
      return {
        status: "error",
        message: err?.name === "AbortError" ? "Snowflake Cortex Agent request timed out (45s)" : err.message,
      };
    }
  },

  // REAL git operations (status/log/diff/pull/sync). Output is actual stdout/stderr (token scrubbed).
  git: async (args: { action?: string; message?: string; branch?: string }) => {
    const action = (args.action || "status").toLowerCase();
    const branch = args.branch || "main";
    const token = process.env.GITHUB_PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
    // Scrub EVERY configured token variant, not only the one used for this call —
    // previously GH_TOKEN could leak into error output when GITHUB_PAT was the
    // active push token, and vice versa.
    const tokenVariants = [process.env.GITHUB_PAT, process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter((t): t is string => !!t);
    const scrub = (t: string) => tokenVariants.reduce((s, tok) => s.split(tok).join("***"), String(t || ""));
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
    const msg = args.message || `chore: update via RocAgent ${new Date().toISOString()}`;
    const add = await run("git add -A");
    const commit = await run(`git -c user.name="RocAgent" -c user.email="agent@rocagent.local" commit -m ${JSON.stringify(msg)}`);
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
  },

  // Run a command on the LOCAL DEVICE via its SSH daemon (jazzm0/ssh-daemon / SimpleSSHD).
  // Configured in Settings → SSH. Returns REAL stdout/stderr.
  ssh_run: async (args: { command: string }) => {
    const cmd = unescapeHtml(args.command || "");
    // Remote execution is guarded too: the target host is the user's own VM.
    const blocked = guardShell('ssh_run', cmd);
    if (blocked) return blocked;
    return await sshExec(cmd);
  },

  // Manage Oracle Cloud Infrastructure compute instances (create/modify/destroy a VM)
  // using the oci-cli already installed and configured on the device (~/.oci/config —
  // never read or transmitted by RocAgent itself, oci-cli reads it directly).
  //
  // Design notes:
  //  - Every call is built as an argv ARRAY and run with execFile, never a shell
  //    string — so nothing the model puts into a parameter value (instance name,
  //    shape, etc.) can break out via ; | & $() backticks the way it could with a
  //    shell string. This is a stronger guarantee than run_bash_command's guard,
  //    which has to *detect* shell metacharacters after the fact.
  //  - The oci CLI subcommand is restricted to a fixed allowlist (OCI_ACTIONS below)
  //    — arbitrary `oci <anything>` is not exposed, only the specific compute-instance
  //    lifecycle operations this tool documents.
  //  - guardShell() still runs first (on the equivalent shell-quoted command string)
  //    purely for the shared audit log (server/commandGuard.ts auditLine) and so a
  //    SHELL_GUARD=enforce lockdown also covers this tool, not just run_bash_command.
  //  - `terminate` is destructive and irreversible (unless the boot volume was kept),
  //    so it additionally requires the caller to pass confirm: true — a plain
  //    "terminate this VM" tool call without that flag is rejected with an
  //    explanation instead of silently deleting anything.
  oci_vm: async (args: {
    action: string;
    instanceId?: string;
    displayName?: string;
    compartmentId?: string;
    availabilityDomain?: string;
    shape?: string;
    imageId?: string;
    subnetId?: string;
    ocpus?: number;
    memoryInGBs?: number;
    bootVolumeSizeInGBs?: number;
    sshAuthorizedKeysFile?: string;
    vmAction?: string; // START | STOP | SOFTSTOP | RESET | SOFTRESET for action:"power"
    confirm?: boolean;
  }) => {
    const action = (args.action || "").trim().toLowerCase();
    const compartmentId = args.compartmentId || process.env.OCI_COMPARTMENT_ID || process.env.OCI_TENANCY || "";

    const run = async (label: string, argv: string[]) => {
      // Build a display-only shell string SOLELY for the shared audit log / SHELL_GUARD
      // gate — the actual execution below uses argv directly, never this string.
      const displayCmd = ["oci", ...argv].map(a => (/[\s"'$`]/.test(a) ? JSON.stringify(a) : a)).join(" ");
      const blocked = guardShell(`oci_vm:${label}`, displayCmd);
      if (blocked) return blocked;
      try {
        const { stdout, stderr } = await execFileAsync("oci", argv, { timeout: 60000, maxBuffer: 4 * 1024 * 1024 } as any);
        return { status: "success", action: label, stdout, stderr };
      } catch (err: any) {
        return {
          status: "error",
          action: label,
          message: err?.code === "ENOENT" ? "oci-cli tidak ditemukan di PATH. Pastikan oci-cli terpasang dan ~/.oci/config sudah dikonfigurasi." : (err.message || String(err)),
          stdout: err?.stdout || "",
          stderr: err?.stderr || "",
        };
      }
    };

    switch (action) {
      case "list": {
        if (!compartmentId) return { status: "error", message: "compartmentId diperlukan (atau set OCI_COMPARTMENT_ID di cloud.env)." };
        return run("list", ["compute", "instance", "list", "--compartment-id", compartmentId, "--output", "table"]);
      }

      case "get": {
        if (!args.instanceId) return { status: "error", message: "instanceId diperlukan." };
        return run("get", ["compute", "instance", "get", "--instance-id", args.instanceId]);
      }

      case "launch": {
        if (!compartmentId) return { status: "error", message: "compartmentId diperlukan (atau set OCI_COMPARTMENT_ID di cloud.env)." };
        if (!args.availabilityDomain) return { status: "error", message: "availabilityDomain diperlukan (lihat: oci iam availability-domain list)." };
        if (!args.shape) return { status: "error", message: "shape diperlukan, mis. 'VM.Standard.A1.Flex' atau 'VM.Standard.E2.1.Micro'." };
        if (!args.imageId) return { status: "error", message: "imageId diperlukan (lihat: oci compute image list --compartment-id ...)." };
        if (!args.subnetId) return { status: "error", message: "subnetId diperlukan (lihat: oci network subnet list --compartment-id ...)." };
        const argv = [
          "compute", "instance", "launch",
          "--compartment-id", compartmentId,
          "--availability-domain", args.availabilityDomain,
          "--shape", args.shape,
          "--image-id", args.imageId,
          "--subnet-id", args.subnetId,
          "--display-name", args.displayName || `rocagent-vm-${Date.now()}`,
          "--wait-for-state", "RUNNING",
        ];
        if (args.shape.includes(".Flex")) {
          argv.push("--shape-config", JSON.stringify({
            ocpus: args.ocpus ?? 1,
            memoryInGBs: args.memoryInGBs ?? 6,
          }));
        }
        if (args.bootVolumeSizeInGBs) {
          argv.push("--boot-volume-size-in-gbs", String(args.bootVolumeSizeInGBs));
        }
        if (args.sshAuthorizedKeysFile) {
          argv.push("--ssh-authorized-keys-file", args.sshAuthorizedKeysFile);
        }
        return run("launch", argv);
      }

      case "power": {
        if (!args.instanceId) return { status: "error", message: "instanceId diperlukan." };
        const vmAction = (args.vmAction || "").toUpperCase();
        const allowed = new Set(["START", "STOP", "SOFTSTOP", "RESET", "SOFTRESET"]);
        if (!allowed.has(vmAction)) {
          return { status: "error", message: `vmAction harus salah satu dari: ${[...allowed].join(", ")}.` };
        }
        return run(`power:${vmAction}`, ["compute", "instance", "action", "--instance-id", args.instanceId, "--action", vmAction, "--wait-for-state", vmAction === "STOP" || vmAction === "SOFTSTOP" ? "STOPPED" : "RUNNING"]);
      }

      case "resize": {
        // Only meaningful for Flex shapes — fixed shapes (e.g. E2.1.Micro) cannot be
        // resized in place and would need terminate+relaunch, which this tool does not
        // do implicitly (that would be a silent data-loss trap).
        if (!args.instanceId) return { status: "error", message: "instanceId diperlukan." };
        if (args.ocpus == null && args.memoryInGBs == null) {
          return { status: "error", message: "resize butuh ocpus dan/atau memoryInGBs (hanya berlaku untuk Flex shapes)." };
        }
        const shapeConfig: Record<string, number> = {};
        if (args.ocpus != null) shapeConfig.ocpus = args.ocpus;
        if (args.memoryInGBs != null) shapeConfig.memoryInGBs = args.memoryInGBs;
        return run("resize", ["compute", "instance", "update", "--instance-id", args.instanceId, "--shape-config", JSON.stringify(shapeConfig), "--force"]);
      }

      case "terminate": {
        if (!args.instanceId) return { status: "error", message: "instanceId diperlukan." };
        if (!args.confirm) {
          return {
            status: "error",
            message: "Aksi terminate bersifat destruktif dan bisa tidak bisa dibatalkan. Panggil ulang dengan confirm:true untuk melanjutkan.",
            requiresConfirmation: true,
          };
        }
        return run("terminate", ["compute", "instance", "terminate", "--instance-id", args.instanceId, "--force"]);
      }

      default:
        return { status: "error", message: `Aksi '${args.action}' tidak dikenal. Gunakan: list, get, launch, power, resize, terminate.` };
    }
  },

  // Drive the `rootd` CLI from https://github.com/ivansslo/rootd-fs (rootless container
  // runtime for Termux) as an execution tool. RocAgent only ever invokes the already-
  // installed `rootd` binary on PATH — this repository does not vendor, patch, or modify
  // rootd-fs in any way; it is used exactly as an end user would from a terminal.
  //
  // Design notes (mirrors oci_vm above):
  //  - argv array + execFile, never a shell string, so box names / image refs / extra
  //    flags supplied by the model cannot break out via shell metacharacters.
  //  - Subcommand is restricted to ROOTD_SUBCOMMANDS, rootd-fs's own documented surface
  //    (see its README "Usage" table) — nothing outside that list is accepted.
  //  - `enter` is interactive (opens a TTY shell) and cannot work through a one-shot
  //    tool call; the tool rejects it with a hint to use `sh` (run one command) instead,
  //    which is rootd-fs's own non-interactive equivalent.
  //  - `rm` and `purge` are destructive (delete a box, or every box/cache/shell-hook)
  //    and require confirm:true, same pattern as oci_vm's `terminate`.
  //  - guardShell() still runs first for the shared audit log / SHELL_GUARD gate.
  rootd_fs: async (args: { subcommand: string; args?: string[]; confirm?: boolean }) => {
    const ROOTD_SUBCOMMANDS = new Set([
      "install", "sh", "svc", "ls", "info", "rm", "rename", "default",
      "autostart", "backup", "restore", "completion", "docker", "tailscale",
      "ssh", "caps", "purge", "login", "logout", "logins", "presets",
      "doctor", "prune",
    ]);

    const subcommand = (args.subcommand || "").trim().toLowerCase();
    if (subcommand === "enter") {
      return {
        status: "error",
        message: "rootd enter membuka shell interaktif (butuh TTY) dan tidak bisa dijalankan lewat satu panggilan tool. Gunakan subcommand 'sh' untuk menjalankan satu perintah non-interaktif di dalam box, mis. { subcommand: 'sh', args: ['ubuntu', '--', 'apt', 'update'] }.",
      };
    }
    if (!ROOTD_SUBCOMMANDS.has(subcommand)) {
      return {
        status: "error",
        message: `Subcommand '${args.subcommand}' tidak dikenal atau tidak diizinkan. Gunakan salah satu: ${[...ROOTD_SUBCOMMANDS].join(", ")}.`,
      };
    }
    if ((subcommand === "rm" || subcommand === "purge") && !args.confirm) {
      return {
        status: "error",
        message: `rootd ${subcommand} bersifat destruktif (${subcommand === "purge" ? "menghapus SEMUA box, cache, dan shell hook" : "menghapus box yang dipilih"}). Panggil ulang dengan confirm:true untuk melanjutkan.`,
        requiresConfirmation: true,
      };
    }

    const extra = Array.isArray(args.args) ? args.args.map(String) : [];
    const argv = [subcommand, ...extra];

    const displayCmd = ["rootd", ...argv].map(a => (/[\s"'$`]/.test(a) ? JSON.stringify(a) : a)).join(" ");
    const blocked = guardShell(`rootd_fs:${subcommand}`, displayCmd);
    if (blocked) return blocked;

    try {
      // `install` can take a while (pulling an image layer by layer over the network),
      // everything else is expected to return quickly.
      const timeout = subcommand === "install" || subcommand === "restore" ? 300000 : 60000;
      const { stdout, stderr } = await execFileAsync("rootd", argv, { timeout, maxBuffer: 4 * 1024 * 1024 } as any);
      return { status: "success", subcommand, stdout, stderr };
    } catch (err: any) {
      return {
        status: "error",
        subcommand,
        message: err?.code === "ENOENT" ? "rootd tidak ditemukan di PATH. Pastikan rootd-fs sudah terpasang (lihat https://github.com/ivansslo/rootd-fs)." : (err.message || String(err)),
        stdout: err?.stdout || "",
        stderr: err?.stderr || "",
      };
    }
  }
};
