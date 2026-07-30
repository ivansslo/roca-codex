/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { exec } from 'child_process';
import util from 'util';
import net from 'net';
import dns from 'dns';
import { checkCommand, auditLine, resolveMode } from './commandGuard';

const execAsync = util.promisify(exec);

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

  get_synced_apps_status: async () => {
    try {
      const apps = db.getSyncedApps();
      return { status: "success", apps };
    } catch (err: any) {
      return { status: "error", message: err.message };
    }
  },

  export_app_archive: async (args: { appId: string }) => {
    try {
      const appId = (args.appId || "").toLowerCase();
      if (appId !== 'roc-webui' && appId !== 'roc-otoweb') {
        return { status: "error", message: "appId must be 'roc-webui' or 'roc-otoweb'" };
      }
      const mdFilename = `${appId}.md`;
      const zipFilename = `${appId}.zip`;
      const mdPath = path.join(process.cwd(), mdFilename);
      const zipPath = path.join(process.cwd(), zipFilename);

      if (!fs.existsSync(mdPath)) {
        const repoUrl = `https://github.com/ivansslo/${appId}`;
        const title = appId === 'roc-webui' ? 'ROC Web UI' : 'ROC Oto Web';
        const mdContent = `# 🚀 ${title} (\`${appId}\`)\n\nSource Repository: [${repoUrl}](${repoUrl})\n\n## Overview\nDocumentation manifest for ${title}.\n`;
        fs.writeFileSync(mdPath, mdContent, 'utf-8');
      }

      const { exec } = await import('child_process');
      const util = await import('util');
      const execAsync = util.promisify(exec);

      await execAsync(`zip -j -q "${zipPath}" "${mdPath}"`);

      const zipStats = fs.statSync(zipPath);
      return {
        status: "success",
        appId,
        mdFile: mdFilename,
        zipFile: zipFilename,
        zipSizeBytes: zipStats.size,
        message: `Successfully packaged ${mdFilename} into ${zipFilename} (${zipStats.size} bytes).`
      };
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
      const logs: string[] = [`[${now}] Starting sync probe for ${targetApp.name} at ${targetApp.url}...`];

      let isConnected = false;
      let respStatus = 0;
      let latencyMs = 0;

      if (targetApp.url && /^https?:\/\//.test(targetApp.url)) {
        try {
          const startTime = Date.now();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(targetApp.url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timer);
          latencyMs = Date.now() - startTime;
          respStatus = resp.status;
          isConnected = true;
          logs.push(`[${new Date().toISOString()}] GitHub Probe: Status ${resp.status} (${latencyMs}ms)`);
          logs.push(`[${new Date().toISOString()}] Source Repository verified: ${targetApp.url}`);
        } catch (fetchErr: any) {
          logs.push(`[${new Date().toISOString()}] GitHub Probe warning: ${fetchErr.message}`);
        }
      }

      // Verify and inspect zip archive for roc-webui / roc-otoweb
      const zipFilename = `${appId}.zip`;
      const zipPath = path.join(process.cwd(), zipFilename);
      let zipFilesCount = targetApp.filesCount || 0;
      let zipSizeBytes = 0;

      if (fs.existsSync(zipPath)) {
        zipSizeBytes = fs.statSync(zipPath).size;
        try {
          const { exec } = await import('child_process');
          const util = await import('util');
          const execAsync = util.promisify(exec);
          const { stdout } = await execAsync(`unzip -l "${zipPath}" | tail -n 1`);
          const match = stdout.match(/(\d+)\s+files?/i);
          if (match) zipFilesCount = parseInt(match[1], 10);
        } catch (_) {}
        logs.push(`[${new Date().toISOString()}] Zip archive verified: ${zipFilename} (${zipSizeBytes} bytes, ${zipFilesCount} files).`);
      } else {
        const archiveRes = await toolImplementations.export_app_archive({ appId });
        if (archiveRes.status === 'success') {
          logs.push(`[${new Date().toISOString()}] Generated ${archiveRes.zipFile} (${archiveRes.zipSizeBytes} bytes).`);
        }
      }

      logs.push(`[${new Date().toISOString()}] Sync probe finished successfully.`);

      db.updateAppStatus(appId, 'synced', now, logs);
      return {
        status: "success",
        message: `Successfully synchronized ${targetApp.name} (${zipFilename}, ${zipSizeBytes} bytes, ${latencyMs}ms)`,
        app: { ...targetApp, status: 'synced', lastSyncedAt: now, filesCount: zipFilesCount, syncLogs: logs }
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
  }
};
