/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 *
 * Agent Multi — a 4-role autonomous pipeline built ON TOP of the existing,
 * already-tested `runOrchestrator` (server/orchestrator.ts). This file does
 * NOT modify orchestrator.ts, commandGuard.ts, tools.ts or authMiddleware.ts:
 * every role call goes through the exact same provider failover, tool
 * dispatch (executeTool -> guardShell -> commandGuard), SSRF guard and
 * db logging as a normal chat turn. No new execution surface is introduced.
 *
 * Pipeline: Scout -> Builder/Modder -> Breaker -> Closer.
 *   Scout    — fast, read-only recon (list/read/search files, no mutation).
 *   Builder  — real implementation: writes/edits files, runs build/install,
 *              takes initiative, does not stop to ask clarifying questions.
 *   Breaker  — security/break-test pass on what Builder just produced.
 *   Closer   — final verdict (PASS / PASS WITH NOTES / FAIL) grounded in the
 *              three reports above, with tool-based verification if needed.
 *
 * Each role's own tool calls are still gated by the SAME shell guard as any
 * other chat message — this pipeline does not weaken or bypass it. Speed
 * comes from each role having a narrow, decisive mission (no back-and-forth
 * with the user), not from removing safety checks.
 */
import { runOrchestrator, OrchestratorProgressEvent } from "./orchestrator";

export type AgentMultiRole = "scout" | "builder" | "breaker" | "closer";

export interface AgentMultiStep {
  id: string;
  role: AgentMultiRole;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  logs?: any[];
}

export type AgentMultiProgressEvent = {
  type: "step_start" | "step_chunk" | "step_tool_start" | "step_tool_result" | "step_done" | "step_failed" | "run_done";
  data: any;
};

export interface AgentMultiOptions {
  model?: string;
  provider?: string;
  persona?: string;
  activeFile?: string;
  onProgress?: (event: AgentMultiProgressEvent) => void;
}

export const AGENT_MULTI_ROLE_ORDER: AgentMultiRole[] = ["scout", "builder", "breaker", "closer"];

export const AGENT_MULTI_ROLE_SPEC: Record<AgentMultiRole, { title: string; description: string; mission: string }> = {
  scout: {
    title: "Scout",
    description: "Cepat catching/inspect file & konteks proyek (read-only).",
    mission: `You are acting as SCOUT inside a 4-role autonomous pipeline (Scout -> Builder/Modder -> Breaker -> Closer).
Your ONLY job this turn: rapidly reconnoitre the task. Use list_project_files / read_project_file / search_codebase / run_bash_command (read-only commands: ls, cat, find, grep, file, unzip -l, git status/log/diff) to gather REAL facts about the workspace and the goal.
Be fast and decisive — do not write or edit files, do not run mutating or destructive commands, do not ask the user clarifying questions. If something is ambiguous, make the most reasonable assumption and state it.
End your reply with a concise "SCOUT REPORT": relevant files/paths found, key facts grounded in tool output, and a short recommended plan for the Builder role.`,
  },
  builder: {
    title: "Builder/Modder",
    description: "Implementasi nyata: tulis/edit/patch file, build, install, eksekusi shell.",
    mission: `You are acting as BUILDER/MODDER inside a 4-role autonomous pipeline (Scout -> Builder/Modder -> Breaker -> Closer).
You receive the SCOUT REPORT below as ground truth context. Your job: EXECUTE the implementation for real — write/edit files (write_project_file, edit_project_file, delete_project_file), run builds/installs/tests (run_bash_command, terminal_manager), patch or mod whatever is needed to accomplish the goal.
Take initiative. Do not ask the user clarifying questions — make the best reasonable engineering decision and proceed immediately. Prefer decisive action over lengthy explanation.
End your reply with a concise "BUILD REPORT": what you changed (real file paths), commands run, and their actual results (never invented).`,
  },
  breaker: {
    title: "Breaker",
    description: "Security/pentest cepat: cari celah, exploit-check, validasi hardening.",
    mission: `You are acting as BREAKER inside a 4-role autonomous pipeline (Scout -> Builder/Modder -> Breaker -> Closer).
You receive the BUILD REPORT below. Your job: try to break what was just built — look for real vulnerabilities (OWASP-style: injection, auth bypass, secrets exposure, path traversal, SSRF, unsafe eval) in the actual changed files, and run quick validation/tests (run_bash_command, read_project_file, search_codebase) to confirm or refute each concern.
Note: the platform's own shell guard will still block genuinely destructive commands regardless of what you try — work within that. Do not ask the user clarifying questions.
Be fast and concrete — cite real file/line evidence, not generic advice.
End your reply with a concise "BREAK REPORT": findings (or "no issues found"), severity per finding, and suggested fixes if any.`,
  },
  closer: {
    title: "Closer",
    description: "Verifikasi akhir, ambil kesimpulan cepat, keputusan pass/fail/ship.",
    mission: `You are acting as CLOSER inside a 4-role autonomous pipeline (Scout -> Builder/Modder -> Breaker -> Closer).
You receive the SCOUT REPORT, BUILD REPORT and BREAK REPORT below. Your job: make the final call, fast. If any claim looks unverified, you may call a tool once or twice to confirm it directly — otherwise ground your verdict in the reports above.
Do not ask the user clarifying questions. Be decisive.
End your reply with a concise "CLOSER VERDICT": one of PASS / PASS WITH NOTES / FAIL, a one-paragraph summary, and concrete next steps if anything remains.`,
  },
};

function buildRoleMessages(
  originalMessages: any[],
  role: AgentMultiRole,
  priorOutputs: Partial<Record<AgentMultiRole, string>>
): any[] {
  const spec = AGENT_MULTI_ROLE_SPEC[role];
  let directive = `[AGENT MULTI — ROLE: ${role.toUpperCase()}]\n${spec.mission}`;

  if (role !== "scout" && priorOutputs.scout) {
    directive += `\n\n--- SCOUT REPORT ---\n${priorOutputs.scout}`;
  }
  if ((role === "breaker" || role === "closer") && priorOutputs.builder) {
    directive += `\n\n--- BUILD REPORT ---\n${priorOutputs.builder}`;
  }
  if (role === "closer" && priorOutputs.breaker) {
    directive += `\n\n--- BREAK REPORT ---\n${priorOutputs.breaker}`;
  }

  return [
    ...originalMessages,
    { id: `agent_multi_${role}_directive_${Date.now()}`, role: "user", text: directive },
  ];
}

/**
 * Runs the Scout -> Builder -> Breaker -> Closer pipeline sequentially.
 * Stops (honest failure, no fabricated continuation) if any role's
 * underlying provider call throws — a Breaker cannot meaningfully test a
 * Builder step that never actually ran, and a Closer cannot verdict on
 * incomplete data.
 */
export async function runAgentOrchestra(messages: any[], options: AgentMultiOptions = {}) {
  const onProgress = options.onProgress;
  const priorOutputs: Partial<Record<AgentMultiRole, string>> = {};
  const steps: AgentMultiStep[] = [];

  for (const role of AGENT_MULTI_ROLE_ORDER) {
    const spec = AGENT_MULTI_ROLE_SPEC[role];
    const step: AgentMultiStep = {
      id: `step_${role}`,
      role,
      title: spec.title,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    steps.push(step);
    onProgress?.({ type: "step_start", data: { role, title: spec.title } });

    try {
      const roleMessages = buildRoleMessages(messages, role, priorOutputs);

      const result = await runOrchestrator(roleMessages, {
        model: options.model,
        provider: options.provider,
        persona: options.persona,
        activeFile: options.activeFile,
        onProgress: (evt: OrchestratorProgressEvent) => {
          if (evt.type === "tool_start") {
            onProgress?.({ type: "step_tool_start", data: { role, ...evt.data } });
          } else if (evt.type === "tool_result" || evt.type === "tool_output") {
            onProgress?.({ type: "step_tool_result", data: { role, ...evt.data } });
          } else if (evt.type === "chunk") {
            onProgress?.({ type: "step_chunk", data: { role, ...evt.data } });
          }
        },
      });

      step.status = "completed";
      step.finishedAt = new Date().toISOString();
      step.output = result?.text || "";
      step.logs = result?.logs || [];
      priorOutputs[role] = step.output;
      onProgress?.({ type: "step_done", data: { role, output: step.output, logs: step.logs } });
    } catch (err: any) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.output = `Error: ${err?.message || String(err)}`;
      onProgress?.({ type: "step_failed", data: { role, error: step.output } });
      onProgress?.({ type: "run_done", data: { status: "failed", steps } });
      return { status: "failed" as const, steps };
    }
  }

  onProgress?.({ type: "run_done", data: { status: "completed", steps } });
  return { status: "completed" as const, steps };
}
