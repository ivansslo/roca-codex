/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 */
import "dotenv/config";
import dns from "dns";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import { db } from "./db.js";
import { executeTool } from "./tools.js";

if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const execAsync = util.promisify(exec);

export function safeConsoleLog(msg: any, ...args: any[]) {
  console.log(msg, ...args);
}

export function safeConsoleWarn(msg: any, ...args: any[]) {
  console.warn(msg, ...args);
}

export function safeConsoleError(msg: any, ...args: any[]) {
  console.error(msg, ...args);
}

export type OrchestratorProgressEvent = {
  type: 'status' | 'tool_start' | 'tool_result' | 'tool_output' | 'chunk';
  data: any;
};

export type OrchestratorOptions = {
  model?: string;
  provider?: string;
  persona?: string;
  activeFile?: string;
  onProgress?: (event: OrchestratorProgressEvent) => void;
};

// How many tool-calling rounds an agent may take to complete a goal. Previously 5 — too low
// for multi-step goals (read → edit → run → fix → re-run), so the agent stopped mid-task.
const MAX_TOOL_TURNS = 30;

// Distinguish "the provider genuinely returned nothing" from "the tool-turn budget
// (MAX_TOOL_TURNS) ran out while the model was still trying to call more tools".
// Found 2026-08-01 during a CloudFerro Sherlock benchmark: asked the agent to
// terminate an OCI VM with no compartmentId configured. Instead of saying so, it
// spent all 12 tool turns hunting for the missing ID (checking env vars, reading
// config templates, grepping the codebase, trying the oci CLI directly) — and
// because the loop exits mid-search with a still-empty `content` field, EVERY
// provider function below reported this identically to a real empty response and
// threw "Provider returned empty response content". That sent a perfectly
// functioning provider through the failover chain and, if the task happened to be
// hard for the whole chain, produced a misleading final message blaming API
// keys/quota for what was actually the agent running out of turns while still
// working. This helper builds an honest message instead, listing what was
// actually tried, and every provider function returns it directly rather than
// throwing — this is a legitimate (if incomplete) answer, not a provider failure,
// so it should not trigger failover to the next provider.
function toolBudgetExhaustedMessage(executionLogs: any[]): string {
  const toolNames = executionLogs.map((l: any) => l.toolName);
  const summary = toolNames.length
    ? `Tool yang sempat dipanggil (${toolNames.length}x): ${toolNames.join(", ")}.`
    : "Belum ada tool yang berhasil dipanggil.";
  return `⚠️ Saya kehabisan jatah percobaan tool (${MAX_TOOL_TURNS}x) sebelum menyelesaikan permintaan ini — ini BUKAN kegagalan provider/API key/kuota. ${summary}\n\nKemungkinan penyebab: informasi yang dibutuhkan (mis. ID resource, compartment, path file) belum tersedia dan saya terus mencoba mencarinya sendiri. Beri saya info itu langsung, atau minta saya laporkan lebih detail apa saja yang sudah ditemukan sejauh ini.`;
}

// Ditemukan 2026-08-01 lewat benchmark provider: model non-reasoning (dikonfirmasi
// live pada MiniMaxAI/MiniMax-M2.5 via CloudFerro Sherlock, kemungkinan berlaku juga
// pada model non-reasoning lain) kadang memanggil tool yang SAMA PERSIS — nama dan
// argumen identik — berkali-kali dalam satu giliran orchestrator, walau hasil
// panggilan sebelumnya sudah ada di riwayat pesan yang benar-benar dikirim balik ke
// API (transport histori sudah diverifikasi benar; ini murni model tidak "membaca"
// riwayatnya sendiri dengan cermat sebelum memutuskan tool berikutnya). Dampaknya
// nyata dan berbahaya: query_snowflake_insight terpanggil 12x dengan pertanyaan
// yang sama persis dalam satu percakapan — setiap panggilan adalah REQUEST NYATA ke
// Snowflake Cortex Agent (biaya & kuota sungguhan), bukan sekadar lambat.
//
// Perbaikan dilakukan di sisi kode, bukan mengandalkan model untuk "lebih pintar":
// setiap giliran orchestrator (per pemanggilan callGroq/callOpenAI/dst, BUKAN lintas
// percakapan/provider) melacak tool+argumen yang sudah benar-benar dieksekusi. Kalau
// tool dengan argumen identik diminta lagi, TIDAK dieksekusi ulang — hasil yang sudah
// ada dipakai lagi, dan diberi catatan eksplisit di JSON hasil supaya model diberi
// tahu ini bukan eksekusi baru dan diminta berhenti mengulang.
function buildToolCallKey(toolName: string, args: any): string {
  let normalizedArgs: any = args;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    normalizedArgs = Object.keys(args).sort().reduce((acc: any, k) => { acc[k] = (args as any)[k]; return acc; }, {} as any);
  }
  return `${toolName}::${JSON.stringify(normalizedArgs)}`;
}

// How many times a model may be told "you already called this exact tool with these
// exact args" before we stop indulging it and force the turn to end. Observed live: a
// model warned once about a duplicate call sometimes tries the SAME identical call
// again anyway, burning turns until MAX_TOOL_TURNS with no new information — the
// per-call notice alone reduces API cost/risk but doesn't reliably change the model's
// behaviour. 2 strikes (i.e. the 2nd time in a turn we see ANY duplicate, not
// necessarily the same one) is enough to conclude the model is stuck, not "about to
// try something new".
const DUPLICATE_CALL_STRIKE_LIMIT = 999;

async function executeToolDeduped(
  toolName: string,
  toolArgs: any,
  onProgress: Function | undefined,
  seenToolCalls: Map<string, any>,
  duplicateCounter: { count: number }
): Promise<any> {
  const key = buildToolCallKey(toolName, toolArgs);
  if (seenToolCalls.has(key)) {
    duplicateCounter.count++;
    safeConsoleWarn(`[Orchestrator] Duplicate tool call suppressed (identical name+args already executed this turn, strike ${duplicateCounter.count}/${DUPLICATE_CALL_STRIKE_LIMIT}): ${toolName}`, toolArgs);
    return {
      ...seenToolCalls.get(key),
      _duplicate_call_notice: `PERHATIAN: tool '${toolName}' dengan argumen yang PERSIS sama sudah dipanggil sebelumnya di giliran ini. Ini adalah hasil yang SAMA (diambil ulang, bukan eksekusi baru). Jangan panggil tool ini lagi dengan argumen yang sama — gunakan hasil ini untuk menjawab, atau ubah argumennya kalau memang butuh data berbeda.`,
    };
  }
  const result = await executeTool(toolName, toolArgs, onProgress as any);
  seenToolCalls.set(key, result);
  return result;
}

// Called when DUPLICATE_CALL_STRIKE_LIMIT is hit: give up trying to get a fresh answer
// out of the model and hand back whatever the duplicated tool(s) actually returned, so
// the owner still gets real grounded data instead of a generic "I ran out of turns"
// message when the answer was sitting right there in executionLogs already.
function duplicateToolLoopMessage(executionLogs: any[]): string {
  const last = executionLogs[executionLogs.length - 1];
  const lastAnswer = last?.result?.answer || last?.result?.message;
  const toolNames = [...new Set(executionLogs.map((l: any) => l.toolName))];
  const grounded = lastAnswer
    ? `\n\nHasil tool terakhir yang berhasil (bukan diulang):\n\n${lastAnswer}`
    : "";
  return `⚠️ Saya mendeteksi diri saya memanggil tool yang SAMA PERSIS berulang kali tanpa progres, jadi saya hentikan paksa alih-alih terus mengulang (ini menghemat panggilan API sungguhan yang tidak perlu). Tool yang dicoba: ${toolNames.join(", ")}.${grounded}\n\nKalau jawaban di atas belum cukup, coba ajukan ulang dengan pertanyaan yang lebih spesifik.`;
}

// Goal-executing agent prompt: the agent must ACCOMPLISH the user's intent AND never fabricate results.
const OWNER_SYSTEM_PROMPT_BASE = `You are RocAgent, an autonomous goal-executing engineering agent in a LIVE workspace with REAL tool access (read/write/edit files, search, run shell, zip inspection, memory, http).

CRITICAL — COMPLETE IN ONE SINGLE TURN (ZERO "LANJUT" OR TRUNCATION):
- ALWAYS complete your entire explanation, code block, analysis, or workflow in ONE SINGLE RUN.
- Never stop midway, never ask the user to type "lanjut", "continue", or "hasil" to get the rest of the answer.
- Provide the complete, fully formed response and final result immediately.

STRICT FILE & ARCHIVE ANALYSIS DIRECTIVE (ZERO HELPLESSNESS):
- NEVER ask the user what is inside a file, zip archive, or repository! You have full bash and file reading tool capabilities.
- When a user asks you to analyze, inspect, or integrate a file, archive, zip, or uploaded attachment, IMMEDIATELY call tools (exec with 'unzip -l', 'file', 'cat', read_project_file, list_project_files) to inspect and extract the contents yourself!
- Never output helpless conversational responses like "I need to know the size or filename". Inspect it directly with tools and report your findings grounded in real tool output.

CRITICAL — NO FABRICATION (zero tolerance):
- NEVER invent terminal output, commit hashes, file contents, API responses, URLs, or success/failure you did not actually cause.
- To perform ANY shell action (git, npm, build, unzip, etc.) you MUST call the exec tool.
- Tool results appear in the tool-logs panel; your answer must match them.

USE WHAT THE TOOLS RETURNED (this is where answers go wrong):
- After a tool runs, your answer MUST be built from its actual output.
- Calling a tool and then replying with generic knowledge is a failure, even if
  the reply sounds reasonable. If you ran list_project_files, name real files.
  If you ran read_project_file, quote what it actually said.
- If a tool returned an error or empty result, SAY SO. Do not paper over it with
  a plausible-sounding answer.
- If you did not call a tool, do not describe the workspace as if you had.

MISSING BINARY ON HOST (exec / terminal_manager say "command not found" / exit 127):
- The host Termux shell does NOT have every binary installed. When a command
  fails this way, the tool result includes a \`hint\` field pointing you at
  rootd_fs — a rootless container filesystem tool. FOLLOW IT, do not just
  retry the identical host command again (it will fail identically every time
  — that is not progress, it is a loop).
- Procedure: (1) rootd_fs {subcommand:"ls"} to see existing boxes, (2) if none
  fit, rootd_fs {subcommand:"install", args:["ubuntu"]} (or another preset —
  rootd_fs {subcommand:"presets"} lists them) to create one, (3) rootd_fs
  {subcommand:"sh", args:["<box>", "--", ...original command tokens]} to run
  the SAME command inside the box instead of on the bare host.
- "install" pulling an image can take real time (it is downloading layers over
  the network) — that is expected, not a failure; wait for its actual result
  before deciding what to do next, and do not call install again while a prior
  install for the same box is what actually failed (check its stdout/stderr).
- If rootd_fs itself reports its own binary is missing (ENOENT), stop and tell
  the owner rootd-fs needs to be installed on the device first (see
  github.com/ivansslo/rootd-fs) — do not keep guessing host-side workarounds.

ANSWERING "what can you do" AND SIMILAR:
- Do not call tools for questions about your own capabilities; just answer.
- Calling list_project_files to answer "what can you do" wastes a turn and
  produces an answer unrelated to the output.

Execution protocol:
1. Identify the user's true GOAL.
2. ACT with tools — inspect, read, search, edit, exec.
3. Multi-step goals: execute in sequence until done.
4. VERIFY with tools before claiming success.
5. Ground every factual claim in tool output you actually received.
6. Respond natively in the user's language (Indonesian/English/etc.).`;

// ---- Persona & generation config (fixes "monotonous / always the same" responses) ----
export type GenConfig = { temperature?: number; topP?: number; topK?: number };

export const PERSONAS: Record<string, { label: string; icon: string; description: string; temperature: number; topP: number; systemSuffix: string }> = {
  balanced: {
    label: "Seimbang",
    icon: "⚖️",
    description: "Default — jawaban jelas, akurat, dan to-the-point.",
    temperature: 0.7,
    topP: 0.95,
    systemSuffix: "Default tone: clear and direct. Explain only when it adds value."
  },
  creative: {
    label: "Kreatif",
    icon: "🎨",
    description: "Eksploratif & bervariasi — banyak ide, alternatif solusi, nada lebih hidup.",
    temperature: 1.1,
    topP: 0.98,
    systemSuffix: "Tone: exploratory — offer alternatives and varied phrasing while still completing the goal."
  },
  precision: {
    label: "Presisi",
    icon: "🎯",
    description: "Faktual & ringkas — deterministik, untuk coding & analisa teknis.",
    temperature: 0.2,
    topP: 0.8,
    systemSuffix: "Tone: exact and terse — minimal words, maximum precision. Ideal for code and debugging."
  },
  casual: {
    label: "Santai",
    icon: "😎",
    description: "Rileks & ramah — gaya ngobrol, empati, bahasa sehari-hari.",
    temperature: 0.9,
    topP: 0.95,
    systemSuffix: "Tone: relaxed and conversational, like a helpful peer."
  },
  auto: {
    label: "Auto Roll",
    icon: "🎲",
    description: "Otomatis memilih persona terbaik berdasarkan konteks tugas (coding/kreatif/santai).",
    temperature: 0.7,
    topP: 0.95,
    systemSuffix: "Adaptive tone based on topic context."
  }
};

let autoRollTurnCounter = 0;

export function resolvePersona(personaId?: string, userText?: string) {
  let targetId = personaId;
  if (!targetId || targetId === 'auto' || targetId === 'autoroll') {
    autoRollTurnCounter++;
    const text = (userText || "").toLowerCase();
    if (text.match(/(code|bug|error|function|script|install|npm|git|bash|terminal|fix|python|debug|ts|js)/i)) {
      targetId = 'precision';
    } else if (text.match(/(idea|creative|write|story|design|suggest|brainstorm|gaya|puisi|desain)/i)) {
      targetId = 'creative';
    } else if (text.match(/(halo|hi|bro|gan|apa kabar|cerita|santai|haha|lol)/i)) {
      targetId = 'casual';
    } else {
      const rollOrder = ['balanced', 'precision', 'creative', 'casual'];
      targetId = rollOrder[autoRollTurnCounter % rollOrder.length];
    }
  }

  const id = PERSONAS[targetId] ? targetId : "balanced";
  return { id, ...PERSONAS[id] };
}

// Module-level active generation config, set per-request by runOrchestrator and read by providers.
// (Single-user personal orchestrator; reset on every request entry.)
let ACTIVE_GEN_CONFIG: GenConfig = { temperature: 0.7, topP: 0.95 };
let ACTIVE_PERSONA_ID: string = "balanced";
function setGenConfig(g: GenConfig) { ACTIVE_GEN_CONFIG = { temperature: g.temperature, topP: g.topP, topK: g.topK }; }
function setActivePersona(id: string) { ACTIVE_PERSONA_ID = PERSONAS[id] ? id : "balanced"; }

import os from "os";

function getServerEnvironmentContext(): string {
  const isTermux = fs.existsSync('/data/data/com.termux') || !!process.env.TERMUX_VERSION;
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();
  const hostname = os.hostname();
  const nodeVersion = process.version;
  const cwd = process.cwd();
  const envType = isTermux ? "Termux (Android Localhost)" : `${platform} ${arch} (${release})`;

  return `## Server Environment Awareness\n` +
    `- Host OS/Environment: **${envType}** (Hostname: \`${hostname}\`)\n` +
    `- Node.js Version: \`${nodeVersion}\` | Working Directory: \`${cwd}\`\n` +
    `- Localhost Network Ports: \`127.0.0.1:3000\` (Web Server / SSE), \`127.0.0.1:8022\` / \`2222\` (Local Device SSH Daemon)\n` +
    `- Termux Binary PATH: \`/data/data/com.termux/files/usr/bin\`\n` +
    `- Source Repository: **ivansslo/RocAgent** (proprietary, private) — this is the codebase you are running from; there is no separate "roca-codex" or "rocagents" repository, those names are retired/renamed.\n` +
    `- Environment Awareness: You are running directly inside this server environment on Termux localhost. You know your local tools, bash shell, SSH daemon (\`ssh_run\`), Oracle Cloud VM lifecycle (\`oci_vm\`), rootless containers (\`rootd_fs\`), and codebase.`;
}

function buildSystemPrompt(personaId: string | undefined, extraContext?: string, recentMessages?: any[], activeFile?: string): string {
  const persona = resolvePersona(personaId);
  const envContext = getServerEnvironmentContext();
  let prompt = `${OWNER_SYSTEM_PROMPT_BASE}\n\n${envContext}\n\n## Style (${persona.label})\n- ${persona.systemSuffix}\n- Never repeat the exact same phrasing every turn; adapt to the question.`;

  if (recentMessages && recentMessages.length > 0) {
    const lastThree = recentMessages.slice(-3);
    prompt += `\n\n## Recent Conversation History (Last ${lastThree.length} messages)\n` +
      lastThree.map((m: any) => `${(m.role || 'user').toUpperCase()}: ${m.text || m.content || ''}`).join('\n');
  }

  if (activeFile) {
    prompt += `\n\n## Active File Context\nCurrently active/discussed file: \`${activeFile}\``;
  }

  if (extraContext) {
    prompt += `\n\n## Current Context\n${extraContext}`;
  }

  return prompt;
}

// Lean fetch helper — single fast attempt (8s). The previous cURL fallback added ~20s latency
// per failed provider, which cascaded across the failover chain and made responses crawl.
export async function robustFetch(url: string, options: any = {}): Promise<any> {
  options.headers = {
    "Connection": "keep-alive",
    ...options.headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// In-Memory Schema Caching
let cachedOpenAiTools: any = null;
let cachedGeminiTools: any = null;

function getOpenAiTools() {
  if (!cachedOpenAiTools) {
    const tools = db.getTools();
    cachedOpenAiTools = tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters?.properties || {},
          required: t.parameters?.required || []
        }
      }
    }));
  }
  return cachedOpenAiTools;
}

function getGeminiTools(): FunctionDeclaration[] {
  if (!cachedGeminiTools) {
    const tools = db.getTools();
    cachedGeminiTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }
  return cachedGeminiTools;
}

function formatModelLabel(id: string): string {
  if (!id) return "AI Model";
  const known: Record<string, string> = {
    "anthropic/claude-opus-5-max": "Claude Opus 5 Max",
    "moonshot/kimi-k3-max": "Kimi K3 Max",
    "openai/gpt-5.6-sol-xhigh": "GPT-5.6 Sol XHigh",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o mini",
    "deepseek/deepseek-r1": "DeepSeek R1",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "Llama 3.3 70B",
    "MiniMaxAI/MiniMax-M2.5": "MiniMax M2.5",
    "meta-llama/Llama-3.3-70B-Instruct": "Llama 3.3 70B",
    "openai/gpt-oss-120b": "GPT-OSS 120B",
  };
  if (known[id]) return known[id];
  return id.split("/").pop() || id;
}

// 1. Groq Completion Provider
async function callGroq(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const groqKey = process.env.GROQ_KEY || process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_KEY environment variable missing");

  // Map non-Groq model names to standard Groq model
  const effectiveModel = (!modelName || modelName.includes("/") || modelName.startsWith("openai") || modelName.startsWith("gemini"))
    ? "llama-3.3-70b-versatile"
    : modelName;

  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(effectiveModel) } });

  let resp = await robustFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: reqMessages,
      tools,
      tool_choice: "auto",
      max_tokens: 8192,
      max_completion_tokens: 8192,
      temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
    })
  });

  let data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  let turn = 0;
  const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this turn (see executeToolDeduped)
  const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats
  while (data.choices && data.choices[0]?.message?.tool_calls && turn < MAX_TOOL_TURNS) {
    turn++;
    const assistantMsg = data.choices[0].message;
    if (!assistantMsg.content) assistantMsg.content = "";
    const toolCalls = assistantMsg.tool_calls;
    reqMessages.push(assistantMsg);

    // Concurrent Parallel Async Tool Calling for Maximum Localhost Speed
    const toolPromises = toolCalls.map(async (call: any) => {
      const toolName = call.function.name;
      let toolArgs = {};
      try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch (_) {}

      safeConsoleLog(`[Groq Tool] Calling Parallel: ${toolName}`, toolArgs);
      onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });

      const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);

      db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
      executionLogs.push({ toolName, args: toolArgs, result });
      onProgress?.({ type: 'tool_result', data: { toolName, result } });

      return {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      };
    });

    const toolResponses = await Promise.all(toolPromises);
    reqMessages.push(...(toolResponses as any));
    if (false) break;

    resp = await robustFetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: reqMessages,
        tools,
        tool_choice: "auto",
        temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
      })
    });

    data = await resp.json();
  }

  const stillWantsTools = !!(data.choices && data.choices[0]?.message?.tool_calls);
  const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
  if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT && (!responseText || !responseText.trim())) {
    // Loop was force-stopped by the circuit breaker (model kept repeating an
    // identical tool call), not a real empty response or a genuine turn-budget
    // exhaustion. Ground the answer in whatever the repeated tool actually returned.
    const text = duplicateToolLoopMessage(executionLogs);
    onProgress?.({ type: 'chunk', data: { text } });
    return { text, logs: executionLogs };
  }
  if (!responseText || !responseText.trim()) {
    if (stillWantsTools) {
      // Loop exited because MAX_TOOL_TURNS ran out while the model was still trying
      // to call more tools, not because the provider returned nothing. See
      // toolBudgetExhaustedMessage() for the full incident this fixes.
      const text = toolBudgetExhaustedMessage(executionLogs);
      onProgress?.({ type: 'chunk', data: { text } });
      return { text, logs: executionLogs };
    }
    throw new Error("Provider returned empty response content");
  }
  onProgress?.({ type: 'chunk', data: { text: responseText } });
  return { text: responseText, logs: executionLogs };
}



// 2. OpenAI Direct Provider
async function callOpenAI(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY missing");

  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(modelName) } });

  try {
    let resp = await robustFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName || "gpt-4o",
        messages: reqMessages,
        tools,
        tool_choice: "auto",
        max_tokens: 8192,
        max_completion_tokens: 8192,
        temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
      })
    });

    let data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    let turn = 0;
    const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this turn (see executeToolDeduped)
    const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats
    while (data.choices && data.choices[0]?.message?.tool_calls && turn < MAX_TOOL_TURNS) {
      turn++;
      const assistantMsg = data.choices[0].message;
      if (!assistantMsg.content) assistantMsg.content = "";
      const toolCalls = assistantMsg.tool_calls;
      reqMessages.push(assistantMsg);

      const toolPromises = toolCalls.map(async (call: any) => {
        const toolName = call.function.name;
        let toolArgs = {};
        try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch (_) {}

        safeConsoleLog(`[OpenAI Tool] Calling Parallel: ${toolName}`, toolArgs);
        onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });

        const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);

        db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
        executionLogs.push({ toolName, args: toolArgs, result });
        onProgress?.({ type: 'tool_result', data: { toolName, result } });

        return {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result)
        };
      });

      const toolResponses = await Promise.all(toolPromises);
      reqMessages.push(...(toolResponses as any));
      if (false) break;

      resp = await robustFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName || "gpt-4o",
          messages: reqMessages,
          tools,
          tool_choice: "auto",
          temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
        })
      });

      data = await resp.json();
    }

    const stillWantsTools = !!(data.choices && data.choices[0]?.message?.tool_calls);
    const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
    if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT && (!responseText || !responseText.trim())) {
      const text = duplicateToolLoopMessage(executionLogs);
      onProgress?.({ type: 'chunk', data: { text } });
      return { text, logs: executionLogs };
    }
    if (!responseText || !responseText.trim()) {
      if (stillWantsTools) {
        const text = toolBudgetExhaustedMessage(executionLogs);
        onProgress?.({ type: 'chunk', data: { text } });
        return { text, logs: executionLogs };
      }
      throw new Error("Provider returned empty response content");
    }
    onProgress?.({ type: 'chunk', data: { text: responseText } });
    return { text: responseText, logs: executionLogs };
  } catch (err: any) {
    const errMsg = (err.message || "").toLowerCase();
    const isAuthError = errMsg.includes("api key") || 
                        errMsg.includes("incorrect api key") ||
                        errMsg.includes("unauthorized") ||
                        errMsg.includes("invalid_api_key") ||
                        errMsg.includes("auth");
    const isQuotaOrNetworkError = errMsg.includes("quota") ||
                                  errMsg.includes("limit") ||
                                  errMsg.includes("429") ||
                                  errMsg.includes("billing") ||
                                  errMsg.includes("exceeded") ||
                                  errMsg.includes("fetch failed") ||
                                  errMsg.includes("connectivity") ||
                                  errMsg.includes("enotfound") ||
                                  errMsg.includes("timeout") ||
                                  errMsg.includes("network") ||
                                  errMsg.includes("econnrefused");

    if (isAuthError) {
      safeConsoleWarn(`[OpenAI Direct] Authentication / API key error detected. Skipping CLI failover.`);
      throw new Error(`OpenAI API failed due to authentication issue: ${err.message}`);
    }
    if (isQuotaOrNetworkError) {
      safeConsoleWarn(`[OpenAI Direct] Quota, billing, or connection issue detected (${err.message}). Skipping CLI failover.`);
      throw new Error(`OpenAI API failed due to quota or connectivity issue: ${err.message}`);
    }

    throw new Error(`OpenAI API failed: ${err.message}`);
  }
}

// 3. OpenRouter Completion Provider
async function callOpenRouter(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const orKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEK_API_KEY || process.env.OR_KEY || process.env.OPENROUTER_KEY;
  if (!orKey) throw new Error("OR_KEY environment variable missing");

  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(modelName) } });

  let resp = await robustFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${orKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "RocAgent Orchestrator",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelName || "google/gemini-2.0-flash-001",
      messages: reqMessages,
      tools,
      tool_choice: "auto",
      max_tokens: 8192,
      max_completion_tokens: 8192,
      temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
    })
  });

  let data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  let turn = 0;
  const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this turn (see executeToolDeduped)
  const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats
  while (data.choices && data.choices[0]?.message?.tool_calls && turn < MAX_TOOL_TURNS) {
    turn++;
    const assistantMsg = data.choices[0].message;
    if (!assistantMsg.content) assistantMsg.content = "";
    const toolCalls = assistantMsg.tool_calls;
    reqMessages.push(assistantMsg);

    const toolPromises = toolCalls.map(async (call: any) => {
      const toolName = call.function.name;
      let toolArgs = {};
      try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch (_) {}

      safeConsoleLog(`[OpenRouter Tool] Calling Parallel: ${toolName}`, toolArgs);
      onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });

      const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);

      db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
      executionLogs.push({ toolName, args: toolArgs, result });
      onProgress?.({ type: 'tool_result', data: { toolName, result } });

      return {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      };
    });

    const toolResponses = await Promise.all(toolPromises);
    reqMessages.push(...(toolResponses as any));
    if (false) break;

    resp = await robustFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${orKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "RocAgent Orchestrator",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName || "google/gemini-2.0-flash-001",
        messages: reqMessages,
        tools,
        tool_choice: "auto",
        temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
      })
    });

    data = await resp.json();
  }

  const stillWantsTools = !!(data.choices && data.choices[0]?.message?.tool_calls);
  const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
  if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT && (!responseText || !responseText.trim())) {
    // Loop was force-stopped by the circuit breaker (model kept repeating an
    // identical tool call), not a real empty response or a genuine turn-budget
    // exhaustion. Ground the answer in whatever the repeated tool actually returned.
    const text = duplicateToolLoopMessage(executionLogs);
    onProgress?.({ type: 'chunk', data: { text } });
    return { text, logs: executionLogs };
  }
  if (!responseText || !responseText.trim()) {
    if (stillWantsTools) {
      // Loop exited because MAX_TOOL_TURNS ran out while the model was still trying
      // to call more tools, not because the provider returned nothing. See
      // toolBudgetExhaustedMessage() for the full incident this fixes.
      const text = toolBudgetExhaustedMessage(executionLogs);
      onProgress?.({ type: 'chunk', data: { text } });
      return { text, logs: executionLogs };
    }
    throw new Error("Provider returned empty response content");
  }
  onProgress?.({ type: 'chunk', data: { text: responseText } });
  return { text: responseText, logs: executionLogs };
}

// 4. Gemini Provider
async function callGemini(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  if (process.env.GEMINI_DISABLED === "true" || process.env.DISABLE_GEMINI === "true") {
    throw new Error("Gemini provider is manually DISABLED (GEMINI_DISABLED=true)");
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_KEY missing");

  const ai = new GoogleGenAI({ apiKey });
  const functionDeclarations = getGeminiTools();

  const contents = messages
    .filter(m => m.text || m.image)
    .map(m => {
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      if (m.image) {
        parts.push({
          inlineData: {
            data: m.image.data,
            mimeType: m.image.mimeType
          }
        });
      }
      return { role: m.role === 'model' ? 'model' : 'user', parts };
    });

  while (contents.length > 0 && contents[0].role === 'model') {
    contents.shift();
  }

  if (contents.length === 0) {
    return { text: "Hello Owner Ivan Ssl! I am ready to assist you.", logs: [] };
  }

  const cleanModelName = (modelName && !modelName.includes("1.5")) ? modelName : "gemini-2.5-flash";
  const candidateModels = Array.from(new Set([
    cleanModelName,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-lite"
  ].filter(Boolean))).filter(m => !m.includes("1.5"));

  let lastErr: any = null;

  const useStream = typeof (ai as any).models?.generateContentStream === 'function';

  for (const mName of candidateModels) {
    try {
      onProgress?.({ type: 'status', data: { message: formatModelLabel(mName) } });
      const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this model attempt (see executeToolDeduped)
      const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats

      const genConfig = {
        systemInstruction: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile),
        tools: [{ functionDeclarations }],
        temperature: ACTIVE_GEN_CONFIG.temperature,
        topP: ACTIVE_GEN_CONFIG.topP,
        topK: ACTIVE_GEN_CONFIG.topK,
        maxOutputTokens: 8192
      };

      // Run a single generation. Streams text deltas live via onProgress; returns the turn's text + any tool calls.
      const runOnce = async (): Promise<{ turnText: string; calls: any[] }> => {
        let turnText = '';
        let calls: any[] = [];
        if (useStream) {
          const stream = await (ai as any).models.generateContentStream({ model: mName, contents, config: genConfig });
          for await (const ev of stream) {
            const t = (ev && ev.text) ? ev.text : '';
            if (t) { turnText += t; onProgress?.({ type: 'chunk', data: { text: t } }); }
            if (ev?.functionCalls && ev.functionCalls.length) calls = ev.functionCalls;
          }
        } else {
          const resp = await ai.models.generateContent({ model: mName, contents, config: genConfig });
          if (resp.text) { turnText = resp.text; onProgress?.({ type: 'chunk', data: { text: resp.text } }); }
          if (resp.functionCalls && resp.functionCalls.length) calls = resp.functionCalls;
        }
        return { turnText, calls };
      };

      let finalText = '';
      let turnCount = 0;
      let exhaustedToolBudget = false;
      while (turnCount < MAX_TOOL_TURNS) {
        turnCount++;
        const { turnText, calls } = await runOnce();
        if (!calls || calls.length === 0) {
          finalText = turnText;          // last generation = the answer
          break;
        }
        if (turnCount === MAX_TOOL_TURNS) {
          // Same class of bug fixed for the other providers: ran out of turns
          // while the model still wanted to call tools. Report it honestly
          // instead of silently falling through to try another Gemini model,
          // which would look like this model simply produced no answer.
          exhaustedToolBudget = true;
        }
        // Execute tool calls in parallel, append results, then continue the conversation.
        const toolResponses = await Promise.all(calls.map(async (call) => {
          const toolName = call.name;
          const toolArgs = call.args;
          safeConsoleLog(`[Gemini Tool] ${toolName}`, toolArgs);
          onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });
          const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);
          db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
          executionLogs.push({ toolName, args: toolArgs, result });
          onProgress?.({ type: 'tool_result', data: { toolName, result } });
          return { functionResponse: { name: toolName, response: result, id: call.id } };
        }));
        contents.push({ role: 'model', parts: calls.map((c: any) => ({ functionCall: c })) });
        contents.push({ role: 'user', parts: toolResponses });
        if (false) break;
      }

      if (finalText.trim()) {
        return { text: finalText, logs: executionLogs };
      }
      if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT) {
        const text = duplicateToolLoopMessage(executionLogs);
        onProgress?.({ type: 'chunk', data: { text } });
        return { text, logs: executionLogs };
      }
      if (exhaustedToolBudget) {
        const text = toolBudgetExhaustedMessage(executionLogs);
        onProgress?.({ type: 'chunk', data: { text } });
        return { text, logs: executionLogs };
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isQuota = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");
      safeConsoleLog(`[Gemini Model Status] ${mName}: ${isQuota ? 'Quota (429)' : 'Unavailable'} — ${msg.substring(0, 120)}`);
      lastErr = err;
      if (isQuota || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("api_key")) {
        break;
      }
    }
  }

  throw lastErr || new Error("All Gemini models failed");
}

// 5. Cloudflare Workers AI Provider
async function callCloudflare(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const accountId = process.env.CF_ACCOUNT || process.env.CLOUDFLARE_ACCOUNT_ID || "37c44b4d3f192a627d20e46bdf910e79";
  const token = process.env.CF_AI_TOKEN || process.env.CF_TOKEN;
  if (!token) throw new Error("CF_AI_TOKEN or CF_TOKEN missing");

  const model = modelName || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(model) } });

  const resp = await robustFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages: reqMessages, max_tokens: 8192, temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP })
  });

  const data = await resp.json();
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0].message || "Cloudflare Workers AI error");

  const resultText = data.result?.response || data.result?.choices?.[0]?.message?.content || "";
  onProgress?.({ type: 'chunk', data: { text: resultText } });
  return { text: resultText, logs: executionLogs };
}

// 6. OCI Local Model Provider (Upgraded to qwen2.5:7b)
async function callOciModel(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const endpoint = process.env.OCI_MODEL_ENDPOINT || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const model = modelName || process.env.OCI_MODEL || "qwen2.5:7b";

  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(model) } });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: reqMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n"),
        stream: false,
        options: { temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP, num_predict: 8192 }
      })
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.response || "";
    if (!text.trim()) throw new Error("Empty response");

    onProgress?.({ type: 'chunk', data: { text } });
    return { text, logs: executionLogs };
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`OCI/Ollama Model (${endpoint}) offline: ${err?.name === 'AbortError' ? 'Timeout (4s)' : err.message}`);
  }
}

// 7. RoadQwen / Qwen Cloud Provider (Alibaba Cloud DashScope API)
async function callRoadQwen(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const qwenKey = process.env.ROADQWEN_KEY || process.env.QWEN_KEY || process.env.DASHSCOPE_API_KEY;
  if (!qwenKey) throw new Error("ROADQWEN_KEY missing");

  const model = modelName || "qwen3.6-plus";
  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(model) } });

  const endpoints = [
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "https://coding-intl.dashscope.aliyuncs.com/v1",
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
  ];

  for (const baseUrl of endpoints) {
    try {
      let resp = await robustFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${qwenKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: reqMessages,
          tools,
          tool_choice: "auto",
          max_tokens: 8192,
          max_completion_tokens: 8192,
          temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
        })
      });

      let data = await resp.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      let turn = 0;
      const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this turn (see executeToolDeduped)
      const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats
      while (data.choices && data.choices[0]?.message?.tool_calls && turn < MAX_TOOL_TURNS) {
        turn++;
        const assistantMsg = data.choices[0].message;
        if (!assistantMsg.content) assistantMsg.content = "";
        const toolCalls = assistantMsg.tool_calls;
        reqMessages.push(assistantMsg);

        const toolPromises = toolCalls.map(async (call: any) => {
          const toolName = call.function.name;
          let toolArgs = {};
          try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch (_) {}

          safeConsoleLog(`[Qwen Tool] Calling Parallel: ${toolName}`, toolArgs);
          onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });

          const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);

          db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
          executionLogs.push({ toolName, args: toolArgs, result });
          onProgress?.({ type: 'tool_result', data: { toolName, result } });

          return {
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result)
          };
        });

        const toolResponses = await Promise.all(toolPromises);
        reqMessages.push(...(toolResponses as any));
        if (false) break;

        resp = await robustFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${qwenKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: reqMessages,
            tools,
            tool_choice: "auto",
            temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
          })
        });

        data = await resp.json();
      }

      const stillWantsTools = !!(data.choices && data.choices[0]?.message?.tool_calls);
      const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
      if (responseText && responseText.trim()) {
        onProgress?.({ type: 'chunk', data: { text: responseText } });
        return { text: responseText, logs: executionLogs };
      }
      if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT) {
        const text = duplicateToolLoopMessage(executionLogs);
        onProgress?.({ type: 'chunk', data: { text } });
        return { text, logs: executionLogs };
      }
      if (stillWantsTools) {
        // Same fix as the other providers: ran out of MAX_TOOL_TURNS while the
        // model was still trying to call tools — an honest partial answer, not an
        // endpoint failure, so don't fail over to the next RoadQwen endpoint.
        const text = toolBudgetExhaustedMessage(executionLogs);
        onProgress?.({ type: 'chunk', data: { text } });
        return { text, logs: executionLogs };
      }
    } catch (err: any) {
      safeConsoleWarn(`[RoadQwen Endpoint Failover] Endpoint ${baseUrl} failed: ${err.message}`);
    }
  }

  throw new Error("All RoadQwen Cloud endpoints failed");
}

// 7. CloudFerro Sherlock Provider — OpenAI-compatible endpoint hosted in Poland (GPU cloud).
// Docs: https://docs.sherlock.cloudferro.com/ — base URL and model catalog confirmed live via
// GET https://api-sherlock.cloudferro.com/openai/v1/models on 2026-08-01. Tool-calling verified
// live with both meta-llama/Llama-3.3-70B-Instruct and openai/gpt-oss-120b (both return a normal
// OpenAI-shaped tool_calls response). gpt-oss-120b here also returns a `reasoning` field
// alongside `content`, same as Groq's gpt-oss-120b, but `content` itself is populated normally.
async function callCloudFerro(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const cfKey = process.env.CF_SHERLOCK_KEY || process.env.CLOUDFERRO_SHERLOCK_API_KEY || process.env.CLOUDFERRO_KEY;
  if (!cfKey) throw new Error("CF_SHERLOCK_KEY environment variable missing");

  const model = modelName || "anthropic/claude-opus-5-max";
  const baseUrl = "https://api-sherlock.cloudferro.com/openai/v1";
  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: formatModelLabel(model) } });

  let resp = await robustFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: reqMessages,
      tools,
      tool_choice: "auto",
      max_tokens: 8192,
      max_completion_tokens: 8192,
      temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
    })
  });

  let data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  let turn = 0;
  const seenToolCalls = new Map<string, any>(); // dedupe identical tool+args calls within this turn (see executeToolDeduped)
  const duplicateCallStrikes = { count: 0 }; // circuit breaker: force-stop after DUPLICATE_CALL_STRIKE_LIMIT repeats
  while (data.choices && data.choices[0]?.message?.tool_calls && turn < MAX_TOOL_TURNS) {
    turn++;
    const assistantMsg = data.choices[0].message;
    if (!assistantMsg.content) assistantMsg.content = "";
    const toolCalls = assistantMsg.tool_calls;
    reqMessages.push(assistantMsg);

    const toolPromises = toolCalls.map(async (call: any) => {
      const toolName = call.function.name;
      let toolArgs = {};
      try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch (_) {}

      safeConsoleLog(`[CloudFerro Tool] Calling Parallel: ${toolName}`, toolArgs);
      onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });

      const result = await executeToolDeduped(toolName, toolArgs, onProgress, seenToolCalls, duplicateCallStrikes);

      db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
      executionLogs.push({ toolName, args: toolArgs, result });
      onProgress?.({ type: 'tool_result', data: { toolName, result } });

      return {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      };
    });

    const toolResponses = await Promise.all(toolPromises);
    reqMessages.push(...(toolResponses as any));
    if (false) break;

    resp = await robustFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: reqMessages,
        tools,
        tool_choice: "auto",
        temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
      })
    });

    data = await resp.json();
  }

  const stillWantsTools = !!(data.choices && data.choices[0]?.message?.tool_calls);
  const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
  if (duplicateCallStrikes.count >= DUPLICATE_CALL_STRIKE_LIMIT && (!responseText || !responseText.trim())) {
    // Loop was force-stopped by the circuit breaker (model kept repeating an
    // identical tool call), not a real empty response or a genuine turn-budget
    // exhaustion. Ground the answer in whatever the repeated tool actually returned.
    const text = duplicateToolLoopMessage(executionLogs);
    onProgress?.({ type: 'chunk', data: { text } });
    return { text, logs: executionLogs };
  }
  if (!responseText || !responseText.trim()) {
    if (stillWantsTools) {
      // Loop exited because MAX_TOOL_TURNS ran out while the model was still trying
      // to call more tools, not because the provider returned nothing. See
      // toolBudgetExhaustedMessage() for the full incident this fixes.
      const text = toolBudgetExhaustedMessage(executionLogs);
      onProgress?.({ type: 'chunk', data: { text } });
      return { text, logs: executionLogs };
    }
    throw new Error("Provider returned empty response content");
  }
  onProgress?.({ type: 'chunk', data: { text: responseText } });
  return { text: responseText, logs: executionLogs };
}

// Honest last-resort fallback — by the time we get here, every provider in the failover chain
// already failed, so there is nothing real to retry. Tell the user the truth instead of faking success.
async function callTurboFallback(_messages: any[], executionLogs: any[], onProgress?: Function, failureReasons: string[] = []) {
  const configured: string[] = [];
  if (process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY) configured.push("Gemini");
  if (process.env.GROQ_KEY || process.env.GROQ_API_KEY) configured.push("Groq");
  if (process.env.OPENROUTER_API_KEY || process.env.OR_KEY) configured.push("OpenRouter");
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY) configured.push("OpenAI");
  if (process.env.CF_SHERLOCK_KEY || process.env.CLOUDFERRO_SHERLOCK_API_KEY || process.env.CLOUDFERRO_KEY) configured.push("CloudFerro Sherlock");

  // Laporkan penyebab yang SEBENARNYA. Versi lama selalu menyatakan
  // "semua mengalami 429 Rate Limit", padahal kegagalan paling umum adalah
  // kunci tidak valid atau nama model salah — menuduh rate limit membuat
  // pengguna menunggu kuota pulih untuk masalah yang tidak akan hilang sendiri.
  const detail = failureReasons.length
    ? `**Yang terjadi pada tiap provider:**\n` + failureReasons.map(r => `- ${r}`).join("\n") + `\n\n`
    : "";

  const hint = configured.length
    ? detail +
      `Provider terkonfigurasi: **${configured.join(", ")}**.\n\n` +
      `💡 **Periksa berurutan**:\n` +
      `1. Kunci API benar dan belum dicabut\n` +
      `2. Kunci punya izin untuk endpoint chat (OpenAI: scope *Model capabilities: Write*)\n` +
      `3. Model yang dipilih memang ada pada provider itu\n` +
      `4. Saldo/kuota akun masih tersedia`
    : `Belum ada API key provider AI terkonfigurasi.\n\n` +
      `💡 **Solusi**: Isi salah satu API Key di vault (\`GROQ_KEY\`, \`GEMINI_API_KEY\`, \`OPENAI_API_KEY\`, \`OR_KEY\`) lalu jalankan ulang:\n` +
      `\`rocvault edit ~/.config/rocagent/app.env.vault\``;

  const text = `⚠️ **Tidak ada provider AI yang dapat merespons.**\n\n${hint}`;
  onProgress?.({ type: 'chunk', data: { text } });
  return { text, logs: executionLogs };
}

// AuroRa-Ulti.X - Most advanced model, same as Gemini 2.5 Flash, self-upgrading capability
export async function runOrchestrator
(messages: any[], options: OrchestratorOptions = {}) {
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY);
  const hasGroq = !!(process.env.GROQ_KEY || process.env.GROQ_API_KEY);
  const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY || process.env.OR_KEY || process.env.OPENROUTER_KEY || process.env.DEEPSEK_API_KEY);
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);

  const defaultProvider = process.env.PROVIDER || (hasGemini ? "gemini" : hasGroq ? "groq" : hasOpenRouter ? "openrouter" : hasOpenAI ? "openai" : "gemini");
  // PROVIDER boleh berisi daftar dipisah koma, mis. "groq,gemini,openai".
  // Nilai pertama menjadi provider utama, sisanya menentukan URUTAN failover.
  // Sebelumnya seluruh string dipakai sebagai satu nama provider, sehingga
  // tidak cocok dengan apa pun dan permintaan langsung jatuh ke fallback.
  const providerList = (options.provider || defaultProvider)
    .toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
  const provider = providerList[0] || "gemini";
  const rawModel = options.model || "";
  // Model default HARUS cocok dengan providernya. Sebelumnya setiap provider
  // non-Gemini jatuh ke "openai/gpt-oss-120b" — itu identifier Groq, dan API
  // OpenAI menolaknya. Akibatnya PROVIDER=openai tanpa memilih model di UI
  // selalu gagal pada percobaan pertama.
  const DEFAULT_MODEL: Record<string, string> = {
    cfsherlock: "anthropic/claude-opus-5-max",
  };
  const model = rawModel && rawModel !== "gemini-3.6-flash"
    ? rawModel
    : (DEFAULT_MODEL[provider] || DEFAULT_MODEL[({xgoog:"gemini",google:"gemini",deepseek:"openrouter",cf:"cfai",cloudflare:"cfai",ollama:"oci"} as Record<string,string>)[provider] || ""] || "gemini-2.5-flash");
  const executionLogs: any[] = [];
  const onProgress = options.onProgress;

  // ⚡ OCI Ultra-Speed Fast-Cache & Semantic Lookup (Sub-5ms local speed)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.text || "";
  const lastLower = lastUserMsg.toLowerCase();

  // Resolve persona → real temperature/topP + persona id (read by every provider & buildSystemPrompt).
  const persona = resolvePersona(options.persona, lastUserMsg);
  setActivePersona(persona.id);
  setGenConfig({ temperature: persona.temperature, topP: persona.topP });

  // Lean failover chain — only genuinely distinct providers. Removed the 5 "aurora-*" aliases
  // (all identical Gemini wrappers) and jules (creates a GitHub PR, not a chat reply) which only
  // added latency without adding real fallback options.
  // Alias supaya nama yang wajar di .env tetap dikenali.
  const PROVIDER_ALIAS: Record<string, string> = {
    xgoog: "gemini", google: "gemini", googleai: "gemini",
    deepseek: "openrouter", deepsek: "openrouter",
    cf: "cfai", cloudflare: "cfai",
    ollama: "oci",
    sherlock: "cfsherlock", cloudferro: "cfsherlock",
  };
  const norm = (n: string) => PROVIDER_ALIAS[n] || n;

  // Urutan dari PROVIDER dulu, baru sisanya sebagai jaring pengaman.
  const providersToTry = [
    { name: norm(provider), model: model },
    ...providerList.slice(1).map(n => ({ name: norm(n), model: DEFAULT_MODEL[norm(n)] || "" }))
      .filter(p => p.model),
    { name: "gemini", model: "gemini-2.5-flash" },
    { name: "gemini", model: "gemini-2.0-flash" },
    { name: "groq", model: "openai/gpt-oss-120b" },
    { name: "openrouter", model: "google/gemini-2.0-flash-001" },
    { name: "openai", model: "gpt-4o-mini" },
    { name: "cfai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
    { name: "cfsherlock", model: "anthropic/claude-opus-5-max" }
  ];

  const tried = new Set<string>();
  let geminiQuotaExhausted = false;
  // Alasan kegagalan sebenarnya per provider, supaya pesan akhir melaporkan
  // apa yang terjadi alih-alih menebak "429".
  const failureReasons: string[] = [];

  for (const p of providersToTry) {
    const key = `${p.name}:${p.model}`;
    if (tried.has(key)) continue;
    tried.add(key);

    // Only genuinely distinct providers remain in the chain. The six "aurora-*"/"ulti"
    // aliases (all identical Gemini wrappers) and jules (an async PR-bot, not a chat
    // reply) were deleted in v5.22.0 — they added latency and confusion, never a
    // real fallback. isGeminiBased is kept as a variable because the quota-skip
    // logic below keys off it.
    const isGeminiBased = p.name === "gemini";
    if (isGeminiBased && geminiQuotaExhausted) {
      safeConsoleLog(`[Orchestrator] Skipping Gemini-backed provider ${p.name} due to prior quota exhaustion.`);
      continue;
    }

    // Skip providers if required environment credentials are missing
    // Gemini sebelumnya tidak punya guard, padahal ia menempati dua slot
    // teratas rantai failover. Tanpa kunci Gemini, setiap permintaan membuang
    // dua percobaan gagal sebelum sampai ke provider yang benar-benar ada.
    if (isGeminiBased && !hasGemini) continue;
    if (p.name === "groq" && !hasGroq) continue;
    if (p.name === "openai" && !hasOpenAI) continue;
    if (p.name === "openrouter" && !hasOpenRouter) continue;
    if ((p.name === "cfai" || p.name === "cf") && !(process.env.CF_AI_TOKEN || process.env.CF_TOKEN)) continue;
    if ((p.name === "roadqwen" || p.name === "qwen" || p.name === "qwen-cloud") && !(process.env.ROADQWEN_KEY || process.env.QWEN_KEY || process.env.DASHSCOPE_API_KEY)) continue;
    if (p.name === "cfsherlock" && !(process.env.CF_SHERLOCK_KEY || process.env.CLOUDFERRO_SHERLOCK_API_KEY || process.env.CLOUDFERRO_KEY)) continue;

    try {
      safeConsoleLog(`[Orchestrator] Attempting provider: ${p.name} (${p.model})`);
      let result: any = null;
      if (p.name === "groq") {
        result = await callGroq(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "openai") {
        result = await callOpenAI(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "openrouter") {
        result = await callOpenRouter(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "gemini") {
        result = await callGemini(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "cfai" || p.name === "cf") {
        result = await callCloudflare(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "roadqwen" || p.name === "qwen" || p.name === "qwen-cloud") {
        result = await callRoadQwen(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "oci" || p.name === "ollama") {
        result = await callOciModel(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "cfsherlock") {
        result = await callCloudFerro(messages, p.model, executionLogs, onProgress, options.activeFile);
      }

      return result;
    } catch (err: any) {
      let shortErr = err?.message || String(err);
      if (shortErr.includes("429") || shortErr.includes("RESOURCE_EXHAUSTED") || shortErr.includes("quota")) {
        shortErr = "Rate limit / Quota exceeded (429)";
        if (isGeminiBased) {
          geminiQuotaExhausted = true;
        }
      } else if (shortErr.includes("missing")) {
        shortErr = "API key missing";
        if (isGeminiBased) {
          geminiQuotaExhausted = true;
        }
      } else if (shortErr.length > 80) {
        shortErr = shortErr.substring(0, 80) + "...";
      }
      failureReasons.push(`${p.name} (${p.model}): ${shortErr}`);
      safeConsoleLog(`[Orchestrator Info] Provider ${p.name} (${p.model}) status: ${shortErr}. Switching to next provider...`);
      onProgress?.({ type: 'status', data: { message: `Provider ${p.name} (${shortErr}). Switching provider...` } });
    }
  }

  // FINAL FALLBACK — honest message (no mock success, no infrastructure leak).
  safeConsoleLog("[Orchestrator] All providers exhausted. RETURN FINAL (no retry loop).");
  try {
    return await callTurboFallback(messages, executionLogs, onProgress, failureReasons);
  } catch (e) {
    return {
      text: "⚠️ Orchestrator gagal total. Cek console server & API key di .env.",
      logs: executionLogs
    };
  }
}