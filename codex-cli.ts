/**
 * ⚡ Codex CLI — terminal client untuk ROCAgents.
 * Langsung pakai engine orchestrator (sama dgn web UI): streaming real-time, tool, persona, multi-provider.
 * Jalankan:  ./codex "tulis fungsi X"   |   ./codex   (REPL)   |   npm run codex -- "..."
 */
import dotenv from "dotenv";
import readline from "readline";
import { runOrchestrator, PERSONAS } from "./server/orchestrator";

dotenv.config();

const C = {
  dim: "\x1b[2m", reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m",
  yellow: "\x1b[33m", bold: "\x1b[1m", magenta: "\x1b[35m", red: "\x1b[31m", gray: "\x1b[90m"
};

function parseArgs(argv: string[]) {
  const args: any = { prompt: "", model: "", provider: "", persona: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-m" || a === "--model") args.model = argv[++i];
    else if (a === "-p" || a === "--provider") args.provider = argv[++i];
    else if (a === "--persona") args.persona = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else args.prompt += (args.prompt ? " " : "") + a;
  }
  return args;
}

function banner(model: string, provider: string, persona: string) {
  console.log(`${C.cyan}${C.bold}╭── ⚡ Codex CLI — ROCAgents ──╮${C.reset}`);
  console.log(`${C.dim}model: ${C.green}${model}${C.reset} ${C.dim}| provider: ${C.green}${provider}${C.reset} ${C.dim}| persona: ${C.green}${persona}${C.reset}`);
  console.log(`${C.dim}slash: /model /provider /persona /clear /help /quit${C.reset}\n`);
}

async function runTurn(messages: any[], model: string, provider: string, persona: string) {
  process.stdout.write(`${C.bold}🤖 ${C.reset}`);
  let buf = "";
  const result: any = await runOrchestrator(messages, {
    model, provider, persona,
    onProgress: (evt: any) => {
      if (evt.type === "chunk" && evt.data?.text) { process.stdout.write(evt.data.text); buf += evt.data.text; }
      else if (evt.type === "status" && evt.data?.message) { /* silent by default */ }
      else if (evt.type === "tool_start" && evt.data?.toolName) { process.stdout.write(`\n${C.gray}  ⚙ ${evt.data.toolName}${C.reset}`); }
      else if (evt.type === "tool_result" && evt.data?.toolName) {
        const r = evt.data.result || {};
        const ok = r.status === "success" || !r.error;
        process.stdout.write(`${C.gray} ${ok ? "✓" : "✗"}${C.reset}`);
      }
    }
  });
  const finalText = (result?.text && String(result.text).trim()) ? String(result.text) : buf;
  process.stdout.write("\n\n");
  messages.push({ role: "model", text: finalText });
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  let model = args.model || process.env.ROC_MODEL || "gemini-2.5-flash";
  let provider = args.provider || process.env.ROC_PROVIDER || "gemini";
  let persona = args.persona || process.env.ROC_PERSONA || "balanced";
  const messages: any[] = [];

  if (args.help) {
    console.log(`⚡ Codex CLI — ROCAgents

${C.bold}Pakai:${C.reset}
  codex "tuliskan fungsi X"          ${C.dim}# one-shot${C.reset}
  codex -m gemini-2.5-pro "..."      ${C.dim}# pilih model${C.reset}
  codex --persona creative "..."     ${C.dim}# pilih persona${C.reset}
  codex                              ${C.dim}# interactive REPL${C.reset}

${C.bold}Slash (REPL):${C.reset}
  /model <id>   /provider <p>   /persona <id>   /clear   /help   /quit
  ${C.dim}persona: ${Object.keys(PERSONAS).join(", ")}${C.reset}

${C.bold}Env (.env):${C.reset} GEMINI_API_KEY / GROQ_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY,
  ROC_MODEL, ROC_PROVIDER, ROC_PERSONA, GITHUB_PAT, SSH_*`);
    process.exit(0);
  }

  // One-shot
  if (args.prompt) {
    messages.push({ role: "user", text: args.prompt });
    try { await runTurn(messages, model, provider, persona); } catch (e: any) { console.log(`\n${C.red}error: ${e.message}${C.reset}`); }
    process.exit(0);
  }

  // Interactive REPL
  banner(model, provider, persona);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}codex❯ ${C.reset}` });
  let busy = false;
  rl.prompt();
  rl.on("line", async (line) => {
    const cmd = line.trim();
    if (busy || !cmd) { if (!busy) rl.prompt(); return; }
    if (cmd === "/quit" || cmd === "/exit") { process.exit(0); }
    if (cmd === "/clear") { messages.length = 0; console.log(`${C.dim}riwayat dihapus${C.reset}`); rl.prompt(); return; }
    if (cmd === "/help") { console.log(`${C.dim}/model <id>  /provider <p>  /persona <id>  /clear  /quit\npersonas: ${Object.keys(PERSONAS).join(", ")}${C.reset}`); rl.prompt(); return; }
    if (cmd.startsWith("/model ")) { model = cmd.slice(7).trim() || model; console.log(`${C.dim}model → ${model}${C.reset}`); rl.prompt(); return; }
    if (cmd.startsWith("/provider ")) { provider = cmd.slice(10).trim() || provider; console.log(`${C.dim}provider → ${provider}${C.reset}`); rl.prompt(); return; }
    if (cmd.startsWith("/persona ")) { persona = cmd.slice(9).trim() || persona; console.log(`${C.dim}persona → ${persona}${C.reset}`); rl.prompt(); return; }
    messages.push({ role: "user", text: cmd });
    busy = true;
    try { await runTurn(messages, model, provider, persona); }
    catch (e: any) { console.log(`${C.red}error: ${e.message}${C.reset}`); }
    busy = false;
    rl.prompt();
  }).on("SIGINT", () => { process.stdout.write("\n"); rl.prompt(); });
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
