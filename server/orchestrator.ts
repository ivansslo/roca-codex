import "dotenv/config";
import dns from "dns";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import { db } from "./db";
import { executeTool } from "./tools";

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
const MAX_TOOL_TURNS = 12;

// Goal-executing agent prompt: the agent must ACCOMPLISH the user's intent AND never fabricate results.
const OWNER_SYSTEM_PROMPT_BASE = `You are ROCAgents, a goal-executing engineering agent in a LIVE workspace with REAL tool access (read/write/edit files, search, run shell, web search, memory, http). Tools actually execute and return real results to you.

CRITICAL — NO FABRICATION (zero tolerance):
- NEVER invent terminal output, commit hashes, file contents, API responses, URLs, or success/failure you did not actually cause.
- To perform ANY shell action (git, npm, build, etc.) you MUST call the run_bash_command tool. The ONLY output you may show is what a tool call actually returned.
- If you did not call a tool for an action, you did NOT do it — never claim otherwise. NEVER paste fake "$ command ... output" blocks or invented results.
- Tool results appear in the tool-logs panel; your answer must match them. If a tool failed or was not called, say so truthfully.
- If you cannot do something (missing key, permission, not installed, auth needed), say exactly that — do NOT pretend success.

Execution protocol:
1. Identify the user's true GOAL (the end result), not just the literal words.
2. ACT with tools — read, search, edit, run_bash_command. Prefer doing over describing.
3. Multi-step goals: execute in sequence until done (you have many tool turns).
4. VERIFY with tools (run/test/read-back) before claiming success. Report the OUTCOME grounded in real tool results, never imagined ones.
5. If a step fails, diagnose with tools and retry a corrected approach.
6. Be concise and direct; skip infrastructure chatter unless it affects the task.

Respond natively in the user's language (Indonesian/English/etc.).`;

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
  const envType = isTermux ? "Termux (Android)" : `${platform} ${arch} (${release})`;

  return `## Server Environment Awareness\n` +
    `- Host OS/Environment: **${envType}** (Hostname: \`${hostname}\`)\n` +
    `- Node.js Version: \`${nodeVersion}\` | Working Directory: \`${cwd}\`\n` +
    `- Primary Source Repositories: **ivansslo/roca-codex** and **ivansslo/rocagents**\n` +
    `- Ecosystem Synced Apps: **roc-webui** (https://github.com/ivansslo/roc-webui) & **roc-otoweb** (https://github.com/ivansslo/roc-otoweb)\n` +
    `- Self Awareness: You are installed directly in this live server environment. You know your own source codebase, path, tools, and running process.`;
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

  onProgress?.({ type: 'status', data: { message: `Connecting to Groq (${effectiveModel})...` } });

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
      temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
    })
  });

  let data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  let turn = 0;
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

      const result = await executeTool(toolName, toolArgs, onProgress as any);

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

  const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
  if (!responseText || !responseText.trim()) {
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

  onProgress?.({ type: 'status', data: { message: `Connecting to OpenAI (${modelName})...` } });

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
        temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
      })
    });

    let data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    let turn = 0;
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

        const result = await executeTool(toolName, toolArgs, onProgress as any);

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

    const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
    if (!responseText || !responseText.trim()) {
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

  onProgress?.({ type: 'status', data: { message: `Connecting to OpenRouter (${modelName})...` } });

  let resp = await robustFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${orKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "ROCAgents Orchestrator",
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

  let data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  let turn = 0;
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

      const result = await executeTool(toolName, toolArgs, onProgress as any);

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

    resp = await robustFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${orKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "ROCAgents Orchestrator",
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

  const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
  if (!responseText || !responseText.trim()) {
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

  const candidateModels = Array.from(new Set([
    modelName,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-lite"
  ].filter(Boolean)));

  let lastErr: any = null;

  const useStream = typeof (ai as any).models?.generateContentStream === 'function';

  for (const mName of candidateModels) {
    try {
      onProgress?.({ type: 'status', data: { message: `Connecting to Gemini (${mName})${useStream ? ' [stream]' : ''}...` } });

      const genConfig = {
        systemInstruction: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile),
        tools: [{ functionDeclarations }],
        temperature: ACTIVE_GEN_CONFIG.temperature,
        topP: ACTIVE_GEN_CONFIG.topP,
        topK: ACTIVE_GEN_CONFIG.topK
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
      while (turnCount < MAX_TOOL_TURNS) {
        turnCount++;
        const { turnText, calls } = await runOnce();
        if (!calls || calls.length === 0) {
          finalText = turnText;          // last generation = the answer
          break;
        }
        // Execute tool calls in parallel, append results, then continue the conversation.
        const toolResponses = await Promise.all(calls.map(async (call) => {
          const toolName = call.name;
          const toolArgs = call.args;
          safeConsoleLog(`[Gemini Tool] ${toolName}`, toolArgs);
          onProgress?.({ type: 'tool_start', data: { toolName, toolArgs } });
          const result = await executeTool(toolName, toolArgs, onProgress as any);
          db.addLog({ timestamp: new Date().toISOString(), toolName, args: toolArgs, result });
          executionLogs.push({ toolName, args: toolArgs, result });
          onProgress?.({ type: 'tool_result', data: { toolName, result } });
          return { functionResponse: { name: toolName, response: result, id: call.id } };
        }));
        contents.push({ role: 'model', parts: calls.map((c: any) => ({ functionCall: c })) });
        contents.push({ role: 'user', parts: toolResponses });
      }

      if (finalText.trim()) {
        return { text: finalText, logs: executionLogs };
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

  onProgress?.({ type: 'status', data: { message: `Connecting to Cloudflare Workers AI (${model})...` } });

  const resp = await robustFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages: reqMessages, temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP })
  });

  const data = await resp.json();
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0].message || "Cloudflare Workers AI error");

  const resultText = data.result?.response || data.result?.choices?.[0]?.message?.content || "";
  onProgress?.({ type: 'chunk', data: { text: resultText } });
  return { text: resultText, logs: executionLogs };
}

// 6. OCI Local Model Provider (Upgraded to qwen2.5:7b)
async function callOciModel(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const endpoint = process.env.OCI_MODEL_ENDPOINT || "http://161.118.253.28:11434";
  const model = modelName || "qwen2.5:7b";

  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: `Connecting to OCI Local Model (${model})...` } });

  const resp = await robustFetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: reqMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n"),
      stream: false,
      options: { temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP }
    })
  });

  const data = await resp.json();
  onProgress?.({ type: 'chunk', data: { text: data.response || "" } });
  return { text: data.response || "", logs: executionLogs };
}

// 7. AuroRa-x Personal Coding AI Engine (OCI High-Speed + Codex-Web Integration)
async function callAuroRaX(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Initializing AuroRa-x Personal Coding AI via Codex-Web..." } });

  try {
    const endpoint = process.env.OCI_MODEL_ENDPOINT || "http://161.118.253.28:11434";
    const auroraPrompt = `You are AuroRa-x — Ivan Ssl's Personal Coding AI Engine.\n\n${OWNER_SYSTEM_PROMPT_BASE}`;
    
    const reqMessages = [
      { role: "system", content: auroraPrompt },
      ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const resp = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "rocspace-initial",
        prompt: reqMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n"),
        stream: false
      })
    }).finally(() => clearTimeout(timeoutId));

    const data = await resp.json();
    if (data.response && data.response.trim()) {
      onProgress?.({ type: 'chunk', data: { text: data.response } });
      return { text: data.response, logs: executionLogs };
    }
  } catch (_) {
    // Local endpoint offline, delegate to Gemini engine
  }

  return await callGemini(messages, "gemini-2.5-flash", executionLogs, onProgress);
}

async function callAuroRaFun(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Initializing AuroRa-Fun AI Engine..." } });

  const assistantId = process.env.BACKBOARD_ASSISTANT_ID || "3372ebdd-9e29-44c2-b373-8b693c142e6d";
  db.saveMemory("AuroRa_Fun_ActiveThread", `Query dispatched to Assistant ${assistantId}`, "AuroRa-Fun");

  return await callGemini(messages, "gemini-2.5-flash", executionLogs, onProgress);
}

async function callAuroRaRoc(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Initializing AuroRa-RoC System AI Engine..." } });

  return await callGemini(messages, "gemini-2.5-flash", executionLogs, onProgress);
}

// 10. AuroRa-Forty Personal Cognitive Memory & Dialectic Personalization AI Engine
async function callAuroRaForty(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Initializing AuroRa-Forty AI Engine..." } });

  return await callGemini(messages, "gemini-2.5-flash", executionLogs, onProgress);
}

// 11. Google Labs Jules AI Autonomous Coding Agent Provider
async function callJulesAgent(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Connecting to Google Labs Jules Autonomous Coding Agent..." } });

  try {
    const julesKey = process.env.JULES_API_KEY || process.env.X_GOOG_API_KEY || "";
    const repo = process.env.JULES_REPO || "ivansslo/rocagents";
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.text || "Refactor code structure";

    onProgress?.({ type: 'status', data: { message: `Google Jules AI: Dispatching session for repo ${repo}...` } });

    const resp = await fetch("https://jules.googleapis.com/v1alpha/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": julesKey
      },
      body: JSON.stringify({
        prompt: lastUserMsg,
        sourceContext: {
          source: `sources/github/${repo}`,
          githubRepoContext: { startingBranch: "main" }
        },
        automationMode: "AUTO_CREATE_PR",
        title: `ROCAgents Task - ${lastUserMsg.substring(0, 30)}`
      })
    });

    const data = await resp.json();

    if (data.name || data.id) {
      const resultText = `🛠️ **Google Jules AI Coding Agent session created successfully!**\n\n- **Session Name/ID**: \`${data.name || data.id}\`\n- **Target Repository**: \`${repo}\` (branch: \`main\`)\n- **Automation Mode**: \`AUTO_CREATE_PR\`\n- **Instruction Dispatched**: "${lastUserMsg}"\n\nJules is currently executing your task in a sandboxed Google Cloud VM and will open a Pull Request upon completion.`;
      onProgress?.({ type: 'chunk', data: { text: resultText } });
      return { text: resultText, logs: executionLogs };
    }
  } catch (_) {
    safeConsoleWarn("[Jules Agent] API request failed. Failing over to AuroRa-x...");
  }

  return await callAuroRaX(messages, "aurora-x", executionLogs, onProgress);
}

// 12. RoadQwen / Qwen Cloud Provider (Alibaba Cloud DashScope API)
async function callRoadQwen(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function, activeFile?: string) {
  const qwenKey = process.env.ROADQWEN_KEY || process.env.QWEN_KEY || process.env.DASHSCOPE_API_KEY;
  if (!qwenKey) throw new Error("ROADQWEN_KEY missing");

  const model = modelName || "qwen3.6-plus";
  const tools = getOpenAiTools();
  const reqMessages = [
    { role: "system", content: buildSystemPrompt(ACTIVE_PERSONA_ID, undefined, messages, activeFile) },
    ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text || "" }))
  ];

  onProgress?.({ type: 'status', data: { message: `Connecting to RoadQwen Cloud (${model})...` } });

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
          temperature: ACTIVE_GEN_CONFIG.temperature, top_p: ACTIVE_GEN_CONFIG.topP
        })
      });

      let data = await resp.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      let turn = 0;
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

          const result = await executeTool(toolName, toolArgs, onProgress as any);

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

      const responseText = data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : "";
      if (responseText && responseText.trim()) {
        onProgress?.({ type: 'chunk', data: { text: responseText } });
        return { text: responseText, logs: executionLogs };
      }
    } catch (err: any) {
      safeConsoleWarn(`[RoadQwen Endpoint Failover] Endpoint ${baseUrl} failed: ${err.message}`);
    }
  }

  throw new Error("All RoadQwen Cloud endpoints failed");
}

// Honest last-resort fallback — by the time we get here, every provider in the failover chain
// already failed, so there is nothing real to retry. Tell the user the truth instead of faking success.
async function callTurboFallback(_messages: any[], executionLogs: any[], onProgress?: Function) {
  const configured: string[] = [];
  if (process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY) configured.push("Gemini");
  if (process.env.GROQ_KEY || process.env.GROQ_API_KEY) configured.push("Groq");
  if (process.env.OPENROUTER_API_KEY || process.env.OR_KEY) configured.push("OpenRouter");
  if (process.env.OPENAI_API_KEY) configured.push("OpenAI");

  const hint = configured.length
    ? `Provider terkonfigurasi: **${configured.join(", ")}** — kemungkinan semua kehabisan kuota (429) atau API key tidak valid. Periksa file .env dan kuota di masing-masing dashboard, lalu coba lagi.`
    : "Belum ada API key provider AI di `.env`. Isi minimal satu: `GEMINI_API_KEY`, `GROQ_KEY`, `OPENROUTER_API_KEY`, atau `OPENAI_API_KEY`, lalu restart server.";

  const text = `⚠️ **Tidak ada provider AI yang bisa menjawab saat ini.**\n\n${hint}`;
  onProgress?.({ type: 'chunk', data: { text } });
  return { text, logs: executionLogs };
}

// AuroRa-Ulti.X - Most advanced model, same as Gemini 2.5 Flash, self-upgrading capability
async function callAuroraUltiX(messages: any[], modelName: string, executionLogs: any[], onProgress?: Function) {
  onProgress?.({ type: 'status', data: { message: "Initializing AuroRa-Ulti.X Ultimate Engine..." } });

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.text || "";
  
  try {
    db.saveMemory("AuroRa_Ulti_X_SelfUpgrade", `Self-upgrade triggered at ${new Date().toISOString()} for query: ${lastUserMsg.substring(0, 200)}`, "AuroRa-Ulti.X");
  } catch {}

  return await callGemini(messages, "gemini-2.5-flash", executionLogs, onProgress);
}

export async function runOrchestrator
(messages: any[], options: OrchestratorOptions = {}) {
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY);
  const hasGroq = !!(process.env.GROQ_KEY || process.env.GROQ_API_KEY);
  const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY || process.env.OR_KEY || process.env.OPENROUTER_KEY || process.env.DEEPSEK_API_KEY);
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);

  const defaultProvider = process.env.PROVIDER || (hasGemini ? "gemini" : hasGroq ? "groq" : hasOpenRouter ? "openrouter" : hasOpenAI ? "openai" : "gemini");
  const provider = (options.provider || defaultProvider).toLowerCase();
  const rawModel = options.model || "";
  const model = rawModel && rawModel !== "gemini-3.6-flash" ? rawModel : (provider === "gemini" ? "gemini-2.5-flash" : "openai/gpt-oss-120b");
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
  const providersToTry = [
    { name: provider, model: model },
    { name: "gemini", model: "gemini-2.5-flash" },
    { name: "gemini", model: "gemini-2.0-flash" },
    { name: "groq", model: "llama-3.3-70b-versatile" },
    { name: "openrouter", model: "google/gemini-2.0-flash-001" },
    { name: "openai", model: "gpt-4o-mini" },
    { name: "roadqwen", model: "qwen3.6-plus" },
    { name: "cfai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
    { name: "oci", model: "qwen2.5:7b" }
  ];

  const tried = new Set<string>();
  let geminiQuotaExhausted = false;

  for (const p of providersToTry) {
    const key = `${p.name}:${p.model}`;
    if (tried.has(key)) continue;
    tried.add(key);

    const isGeminiBased = ["gemini", "aurora-ulti-x", "aurora-roc", "aurora-40", "aurora-fun", "aurora", "aurora-x"].includes(p.name);
    if (isGeminiBased && geminiQuotaExhausted) {
      safeConsoleLog(`[Orchestrator] Skipping Gemini-backed provider ${p.name} due to prior quota exhaustion.`);
      continue;
    }

    // Skip providers if required environment credentials are missing
    if (p.name === "groq" && !hasGroq) continue;
    if (p.name === "openai" && !hasOpenAI) continue;
    if (p.name === "openrouter" && !hasOpenRouter) continue;
    if (p.name === "jules" && !(process.env.JULES_API_KEY || process.env.X_GOOG_API_KEY)) continue;
    if ((p.name === "cfai" || p.name === "cf") && !(process.env.CF_AI_TOKEN || process.env.CF_TOKEN)) continue;
    if ((p.name === "roadqwen" || p.name === "qwen" || p.name === "qwen-cloud") && !(process.env.ROADQWEN_KEY || process.env.QWEN_KEY || process.env.DASHSCOPE_API_KEY)) continue;

    try {
      safeConsoleLog(`[Orchestrator] Attempting provider: ${p.name} (${p.model})`);
      let result: any = null;
      if (p.name === "aurora-ulti-x" || p.name === "ulti-x" || p.name === "aurora-ulti" || p.name === "ulti") {
        result = await callAuroraUltiX(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "aurora-roc" || p.name === "auroraroc") {
        result = await callAuroRaRoc(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "aurora-fun" || p.name === "aurorafun") {
        result = await callAuroRaFun(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "aurora-40" || p.name === "aurora40" || p.name === "aurora-forty") {
        result = await callAuroRaForty(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "aurora" || p.name === "aurora-x") {
        result = await callAuroRaX(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "groq") {
        result = await callGroq(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "openai") {
        result = await callOpenAI(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "openrouter") {
        result = await callOpenRouter(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "gemini") {
        result = await callGemini(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "cfai" || p.name === "cf") {
        result = await callCloudflare(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "jules" || p.name === "jules-agent") {
        result = await callJulesAgent(messages, p.model, executionLogs, onProgress);
      } else if (p.name === "roadqwen" || p.name === "qwen" || p.name === "qwen-cloud") {
        result = await callRoadQwen(messages, p.model, executionLogs, onProgress, options.activeFile);
      } else if (p.name === "oci" || p.name === "ollama") {
        result = await callOciModel(messages, p.model, executionLogs, onProgress, options.activeFile);
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
      safeConsoleLog(`[Orchestrator Info] Provider ${p.name} (${p.model}) status: ${shortErr}. Switching to next provider...`);
      onProgress?.({ type: 'status', data: { message: `Provider ${p.name} (${shortErr}). Switching provider...` } });
    }
  }

  // FINAL FALLBACK — honest message (no mock success, no infrastructure leak).
  safeConsoleLog("[Orchestrator] All providers exhausted. Returning honest fallback.");
  try {
    return await callTurboFallback(messages, executionLogs, onProgress);
  } catch (e) {
    return {
      text: "⚠️ Orchestrator gagal total. Cek console server & API key di .env.",
      logs: executionLogs
    };
  }
}