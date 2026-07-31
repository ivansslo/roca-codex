#!/usr/bin/env node
/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */

/**
 * rocagent-cli — klien terminal untuk server RocAgent.
 *
 * Bicara ke server lokal lewat HTTP, sama seperti UI web, sehingga keduanya
 * berbagi sesi, memori, dan tool yang sama. Tidak memanggil penyedia model
 * secara langsung: seluruh trafik melewati orchestrator, jadi shell guard,
 * failover, dan pencatatan tetap berlaku.
 *
 * Pakai:
 *   rocvault run ~/.config/rocagent/app.env.vault -- npm run cli
 *   rocvault run ~/.config/rocagent/app.env.vault -- npm run cli -- "sebuah prompt"
 *
 * Perintah dalam sesi:
 *   /model [id]     lihat atau ganti model
 *   /persona [id]   lihat atau ganti persona
 *   /agents [pipeline] <task>   jalankan Agent Multi (8 role, 2 pipeline)
 *   /pipelines      daftar pipeline Agent Multi
 *   /new            mulai sesi baru
 *   /stat           status server dan penyedia
 *   /clear          bersihkan layar
 *   /help           bantuan
 *   /exit           keluar
 */

import readline from "node:readline";
import { stdin, stdout } from "node:process";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m",
  blu: "\x1b[34m", cyan: "\x1b[36m", mag: "\x1b[35m",
};

const PORT = process.env.PORT || "3000";
const BASE = process.env.ROCAGENT_URL || `http://127.0.0.1:${PORT}`;
const PASSWORD = process.env.WEB_PASSWORD || "";

let cookie = "";
let model = "";
let provider = "";
let persona = "auto";
let sessionId = `cli-${Date.now()}`;
const history: { role: string; text: string }[] = [];

const out = (s = "") => stdout.write(s + "\n");
const err = (s: string) => stdout.write(`${C.red}✗${C.reset} ${s}\n`);
const ok = (s: string) => stdout.write(`${C.grn}✓${C.reset} ${s}\n`);
const dim = (s: string) => stdout.write(`${C.dim}${s}${C.reset}\n`);

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> || {}),
  };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** Server hidup? Beri diagnosis yang bisa ditindaklanjuti, bukan sekadar "gagal". */
async function checkServer(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    err(`Server tidak merespons di ${BASE}`);
    out("");
    dim("  Jalankan di terminal lain:");
    dim("    cd ~/RocAgent");
    dim("    rocvault run ~/.config/rocagent/app.env.vault -- npm start");
    out("");
    dim("  Atau pakai server lain:  ROCAGENT_URL=http://host:port");
    return false;
  }
}

async function login(): Promise<boolean> {
  if (!PASSWORD) {
    err("WEB_PASSWORD tidak ada di environment.");
    dim("  Jalankan lewat rocvault supaya env termuat:");
    dim("    rocvault run ~/.config/rocagent/app.env.vault -- npm run cli");
    return false;
  }
  const r = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!r.ok) {
    err("Login ditolak — WEB_PASSWORD tidak cocok dengan yang dipakai server.");
    dim("  Server dan CLI harus memuat vault yang sama.");
    return false;
  }
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return true;
}

async function loadModels(): Promise<boolean> {
  const r = await req("/api/models");
  if (!r.ok) { err(`/api/models -> HTTP ${r.status}`); return false; }
  const d = await r.json();
  const usable = (d.models || []).filter((m: any) => m.active !== false);

  if (!usable.length) {
    err("Tidak ada model yang tersedia — tidak ada kunci API yang terbaca server.");
    dim("  rocvault edit ~/.config/rocagent/app.env.vault");
    return false;
  }

  const preferred = usable.find((m: any) => m.provider === d.active_provider) || usable[0];
  model = preferred.id;
  provider = preferred.provider;

  dim(`  provider aktif : ${d.active_provider}`);
  dim(`  model siap     : ${usable.length} dari ${d.models.length}`);
  return true;
}

/** Kirim prompt dan alirkan jawabannya. */
async function ask(text: string): Promise<void> {
  history.push({ role: "user", text });

  const started = Date.now();
  let spinner: NodeJS.Timeout | undefined;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  spinner = setInterval(() => {
    stdout.write(`\r${C.cyan}${frames[i++ % frames.length]}${C.reset} berpikir… `);
  }, 80);
  const stopSpinner = () => {
    if (spinner) { clearInterval(spinner); spinner = undefined; stdout.write("\r\x1b[K"); }
  };

  try {
    const r = await req("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: history,
        model,
        provider,
        persona,
        sessionId,
      }),
    });
    stopSpinner();

    if (!r.ok) {
      err(`HTTP ${r.status} dari /api/chat`);
      const body = await r.text();
      dim(body.slice(0, 300));
      return;
    }

    const d = await r.json();
    const reply = d.text || d.error || "(tidak ada teks dalam respons)";

    // Tool yang dijalankan agent, kalau ada — berguna untuk melihat apa yang
    // sebenarnya terjadi, bukan hanya jawaban akhirnya.
    if (Array.isArray(d.logs) && d.logs.length) {
      for (const l of d.logs) {
        const name = l.tool || l.toolName || l.name;
        if (name) dim(`  ⚙ ${name}${l.status ? ` (${l.status})` : ""}`);
      }
    }

    out(`${C.grn}${C.bold}◆${C.reset} ${reply}`);
    history.push({ role: "model", text: reply });

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    dim(`  ${secs}s · ${model}`);
  } catch (e: any) {
    stopSpinner();
    err(`Permintaan gagal: ${e?.message || e}`);
  }
}

async function cmdModel(arg: string) {
  const r = await req("/api/models");
  const d = await r.json();
  const models = d.models || [];

  if (!arg) {
    out(`${C.bold}Model${C.reset}  ${C.dim}(aktif: ${model})${C.reset}`);
    for (const m of models) {
      const mark = m.id === model ? `${C.grn}●${C.reset}` : m.active === false ? `${C.dim}○${C.reset}` : " ";
      const label = m.active === false
        ? `${C.dim}${m.id.padEnd(42)} ${m.provider} — tanpa kunci${C.reset}`
        : `${m.id.padEnd(42)} ${C.dim}${m.provider}${C.reset}`;
      out(`  ${mark} ${label}`);
    }
    dim("  /model <id> untuk mengganti");
    return;
  }

  const found = models.find((m: any) => m.id === arg || m.id.includes(arg));
  if (!found) { err(`Model tidak dikenal: ${arg}`); return; }
  if (found.active === false) {
    err(`${found.id} tidak punya kunci API (${found.provider})`);
    dim("  rocvault edit ~/.config/rocagent/app.env.vault");
    return;
  }
  model = found.id; provider = found.provider;
  ok(`Model: ${model} (${provider})`);
}

function cmdPersona(arg: string) {
  const list = [
    ["auto", "pilih otomatis sesuai konteks"],
    ["balanced", "jelas, akurat, to-the-point"],
    ["creative", "eksploratif & bervariasi"],
    ["precise", "faktual & ringkas, untuk coding"],
    ["casual", "rileks & ramah"],
  ];
  if (!arg) {
    out(`${C.bold}Persona${C.reset}  ${C.dim}(aktif: ${persona})${C.reset}`);
    for (const [id, desc] of list) {
      out(`  ${id === persona ? `${C.grn}●${C.reset}` : " "} ${id.padEnd(10)} ${C.dim}${desc}${C.reset}`);
    }
    return;
  }
  if (!list.some(([id]) => id === arg)) { err(`Persona tidak dikenal: ${arg}`); return; }
  persona = arg;
  ok(`Persona: ${persona}`);
}

async function cmdStat() {
  const r = await req("/api/models");
  const d = await r.json();
  out(`${C.bold}Status${C.reset}`);
  out(`  server    ${BASE}`);
  out(`  provider  ${d.active_provider}`);
  out(`  tersedia  ${(d.configured_providers || []).join(", ") || "—"}`);
  out(`  model     ${model}`);
  out(`  persona   ${persona}`);
  out(`  sesi      ${sessionId} (${history.length} pesan)`);
}

// ─── Agent Multi (8 role di 2 pipeline) ─────────────────────────────
// Sama seperti UI web: memanggil /api/agents/orchestra/stream (SSE), yang
// menjalankan runOrchestrator per role lewat orkestrator yang sama — shell
// guard, SSRF guard, dan pencatatan db.json tetap berlaku persis seperti
// chat biasa. CLI hanya mem-parsing frame SSE dan mencetaknya ke terminal.
const PIPELINE_ROLES: Record<string, string[]> = {
  fast: ["scout", "builder", "breaker", "closer"],
  engineering: ["architect", "developer", "pentester", "qa"],
};
const PIPELINE_DESC: Record<string, string> = {
  fast: "Scout → Builder/Modder → Breaker → Closer — cepat, inisiatif tinggi",
  engineering: "Chief Architect → Lead Developer → Security Pentester → QA Supervisor — pipeline rekayasa penuh",
};
const ROLE_LABEL: Record<string, string> = {
  scout: "Scout", builder: "Builder/Modder", breaker: "Breaker", closer: "Closer",
  architect: "Chief Architect", developer: "Lead Developer", pentester: "Security Pentester", qa: "QA Supervisor",
};

function cmdPipelines() {
  out(`${C.bold}Pipeline Agent Multi${C.reset}`);
  for (const [id, roles] of Object.entries(PIPELINE_ROLES)) {
    out(`  ${C.cyan}${id}${C.reset}  ${C.dim}${PIPELINE_DESC[id]}${C.reset}`);
    dim(`    role: ${roles.map((r) => ROLE_LABEL[r]).join(" → ")}`);
  }
  dim("  /agents [fast|engineering] <task> untuk menjalankan");
}

/** Parser SSE minimal untuk stream fetch() Node — sama framing dengan lib/agentOrchestraStream.ts. */
async function consumeAgentOrchestraStream(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: any) => void) {
  const reader = (body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); continue; }
      if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        let data: any = raw;
        try { data = JSON.parse(raw); } catch { /* keep raw string */ }
        onEvent(currentEvent, data);
      }
    }
  }
}

async function cmdAgents(arg: string) {
  const parts = arg.trim().split(/\s+/);
  let pipeline = "fast";
  let taskParts = parts;
  if (parts[0] === "fast" || parts[0] === "engineering") {
    pipeline = parts[0];
    taskParts = parts.slice(1);
  }
  const task = taskParts.join(" ").trim();

  if (!task) {
    err("Tugas kosong.");
    dim(`  Pakai: /agents [fast|engineering] <deskripsi tugas>`);
    dim(`  Lihat pipeline: /pipelines`);
    return;
  }

  const roles = PIPELINE_ROLES[pipeline];
  out(`${C.mag}${C.bold}▶ Agent Multi${C.reset} ${C.dim}(${pipeline}: ${roles.map((r) => ROLE_LABEL[r]).join(" → ")})${C.reset}`);
  out("");

  let resp: Response;
  try {
    resp = await req("/api/agents/orchestra/stream", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "cli_agent_multi", role: "user", text: task }],
        model, provider, persona, pipeline,
      }),
    });
  } catch (e: any) {
    err(`Permintaan gagal: ${e?.message || e}`);
    return;
  }

  if (!resp.ok || !resp.body) {
    err(`HTTP ${resp.status} dari /api/agents/orchestra/stream`);
    return;
  }

  let finalStatus = "unknown";
  await consumeAgentOrchestraStream(resp.body as any, (event, data) => {
    switch (event) {
      case "run_start":
        dim(`  ${data?.message || "pipeline dimulai"}`);
        break;
      case "step_start":
        out(`${C.cyan}${C.bold}◆ ${ROLE_LABEL[data.role] || data.role}${C.reset} ${C.dim}sedang bekerja…${C.reset}`);
        break;
      case "step_tool_start":
        dim(`    ⚙ ${data.toolName || data.tool || "(tool)"}`);
        break;
      case "step_done": {
        const meta = data.meta || {};
        const tags = [
          meta.securityScore ? `SCORE:${meta.securityScore}` : null,
          meta.qaCoverage ? `COVERAGE:${meta.qaCoverage}` : null,
          meta.releaseTag ? `RELEASE:${meta.releaseTag}` : null,
        ].filter(Boolean).join(" ");
        ok(`${ROLE_LABEL[data.role] || data.role} selesai${tags ? ` ${C.dim}[${tags}]${C.reset}` : ""}`);
        if (data.output) out(`  ${data.output.split("\n").join("\n  ")}`);
        out("");
        break;
      }
      case "step_failed":
        err(`${ROLE_LABEL[data.role] || data.role} gagal: ${data.error}`);
        break;
      case "done":
      case "run_done":
        finalStatus = data?.status || finalStatus;
        break;
      case "error":
        err(typeof data === "string" ? data : data?.error || "stream error");
        break;
    }
  });

  if (finalStatus === "completed") ok("Pipeline selesai.");
  else if (finalStatus === "failed") err("Pipeline berhenti karena error.");
}

function banner() {
  out("");
  out(`${C.mag}${C.bold}  ⚡ RocAgent CLI${C.reset}  ${C.dim}${BASE}${C.reset}`);
  out("");
}

function help() {
  out(`${C.bold}Perintah${C.reset}`);
  out(`  ${C.cyan}/model${C.reset} [id]     lihat / ganti model`);
  out(`  ${C.cyan}/persona${C.reset} [id]   lihat / ganti persona`);
  out(`  ${C.cyan}/agents${C.reset} [fast|engineering] <tugas>   jalankan Agent Multi (8 role)`);
  out(`  ${C.cyan}/pipelines${C.reset}      daftar pipeline Agent Multi & role-nya`);
  out(`  ${C.cyan}/new${C.reset}            sesi baru (riwayat dikosongkan)`);
  out(`  ${C.cyan}/stat${C.reset}           status server & penyedia`);
  out(`  ${C.cyan}/clear${C.reset}          bersihkan layar`);
  out(`  ${C.cyan}/help${C.reset}           bantuan ini`);
  out(`  ${C.cyan}/exit${C.reset}           keluar`);
  out("");
  dim("  Teks lain dikirim sebagai prompt.");
}

async function main() {
  banner();
  if (!await checkServer()) process.exit(1);
  if (!await login()) process.exit(1);
  if (!await loadModels()) process.exit(1);
  ok(`Siap — ${model} (${provider})`);

  // Mode sekali jalan: rocagent-cli "prompt"
  const oneShot = process.argv.slice(2).join(" ").trim();
  if (oneShot) { await ask(oneShot); process.exit(0); }

  out("");
  dim("  /help untuk perintah, /exit untuk keluar");
  out("");

  const rl = readline.createInterface({
    input: stdin, output: stdout,
    prompt: `${C.blu}${C.bold}❯${C.reset} `,
  });
  rl.prompt();

  rl.on("line", async (line) => {
    const t = line.trim();
    if (!t) { rl.prompt(); return; }

    if (t.startsWith("/")) {
      const [cmd, ...rest] = t.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd) {
        case "exit": case "quit": case "q": rl.close(); return;
        case "help": case "h": help(); break;
        case "clear": stdout.write("\x1b[2J\x1b[H"); banner(); break;
        case "model": case "m": await cmdModel(arg); break;
        case "persona": case "p": cmdPersona(arg); break;
        case "agents": case "orchestra": await cmdAgents(arg); break;
        case "pipelines": cmdPipelines(); break;
        case "stat": case "status": await cmdStat(); break;
        case "new":
          history.length = 0;
          sessionId = `cli-${Date.now()}`;
          ok("Sesi baru");
          break;
        default:
          err(`Perintah tidak dikenal: /${cmd}`);
          dim("  /help untuk daftar");
      }
      rl.prompt();
      return;
    }

    await ask(t);
    rl.prompt();
  });

  rl.on("close", () => { out(""); dim("  sampai jumpa"); process.exit(0); });
}

main().catch((e) => { err(String(e?.message || e)); process.exit(1); });
