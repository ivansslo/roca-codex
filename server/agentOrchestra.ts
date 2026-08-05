/**
 * RocAgent — proprietary software.
 * Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.
 * Unauthorised use, copying, modification, or distribution is prohibited.
 * See LICENSE in the project root.
 *
 * Agent Multi — two selectable 4-role autonomous pipelines (8 roles total),
 * built ON TOP of the existing, already-tested `runOrchestrator`
 * (server/orchestrator.ts). This file does NOT modify orchestrator.ts,
 * commandGuard.ts, tools.ts or authMiddleware.ts: every role call goes
 * through the exact same provider failover, tool dispatch
 * (executeTool -> guardShell -> commandGuard), SSRF guard and db logging as
 * a normal chat turn. No new execution surface is introduced.
 *
 * Pipelines:
 *
 *   "fast" — Scout -> Builder/Modder -> Breaker -> Closer
 *     Optimised for speed and initiative: narrow missions, no clarifying
 *     questions, decisive action. Good for "just do it" tasks.
 *
 *   "engineering" — Chief Architect -> Lead Developer -> Security Pentester
 *                   -> QA Supervisor
 *     Adapted from the roc-webui / roc-cli "4-Step Engineering Orchestra"
 *     (github.com/ivansslo/roc-webui, Apache-2.0), rebuilt here on real
 *     RocAgent tools instead of that project's offline simulator — Architect
 *     and Developer are still narrative/blueprint-first, but every role can
 *     actually read/write the workspace, and Pentester/QA report structured
 *     sign-off tags ([ SCORE: A ], [ COVERAGE: 94% ], [ RELEASE: v1.0.0 ])
 *     the way roc-webui's agents did, parsed here into step metadata.
 *
 * Each role hands its own report to every later role in the same pipeline
 * (generic hand-off, not hardcoded per role name) via the same
 * `## Current Context` mechanism buildSystemPrompt already uses for chat.
 * If a role's underlying provider call fails, the pipeline stops with an
 * honest failure instead of letting later roles verdict on missing data.
 */
import { runOrchestrator, OrchestratorProgressEvent } from "./orchestrator.js";

export type AgentMultiRole =
  | "scout" | "builder" | "breaker" | "closer"
  | "architect" | "developer" | "pentester" | "qa";

export type AgentMultiPipelineId = "fast" | "engineering";

export interface AgentMultiStepMeta {
  securityScore?: string;
  qaCoverage?: string;
  releaseTag?: string;
}

export interface AgentMultiStep {
  id: string;
  role: AgentMultiRole;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  logs?: any[];
  meta?: AgentMultiStepMeta;
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
  pipeline?: AgentMultiPipelineId;
  onProgress?: (event: AgentMultiProgressEvent) => void;
}

export const AGENT_MULTI_PIPELINES: Record<AgentMultiPipelineId, AgentMultiRole[]> = {
  fast: ["scout", "builder", "breaker", "closer"],
  engineering: ["architect", "developer", "pentester", "qa"],
};

export const AGENT_MULTI_PIPELINE_LABEL: Record<AgentMultiPipelineId, string> = {
  fast: "Fast Multi — Scout → Builder/Modder → Breaker → Closer",
  engineering: "Engineering Orchestra — Architect → Developer → Pentester → QA",
};

function pipelineChain(pipeline: AgentMultiPipelineId): string {
  return AGENT_MULTI_PIPELINES[pipeline].map((r) => AGENT_MULTI_ROLE_SPEC[r].title).join(" -> ");
}

export const AGENT_MULTI_ROLE_SPEC: Record<AgentMultiRole, { title: string; description: string; mission: (pipeline: AgentMultiPipelineId) => string }> = {
  // ---- "fast" pipeline ----
  scout: {
    title: "Scout",
    description: "Cepat catching/inspect file & konteks proyek (read-only).",
    mission: (p) => `You are acting as SCOUT inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Your ONLY job this turn: rapidly reconnoitre the task. Use list_project_files / read_project_file / search_codebase / exec (read-only commands: ls, cat, find, grep, file, unzip -l, git status/log/diff) to gather REAL facts about the workspace and the goal.
Be fast and decisive — do not write or edit files, do not run mutating or destructive commands, do not ask the user clarifying questions. If something is ambiguous, make the most reasonable assumption and state it.
End your reply with a concise "SCOUT REPORT": relevant files/paths found, key facts grounded in tool output, and a short recommended plan for the next role.`,
  },
  builder: {
    title: "Builder/Modder",
    description: "Implementasi nyata: tulis/edit/patch file, build, install, eksekusi shell.",
    mission: (p) => `You are acting as BUILDER/MODDER inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the reports from earlier roles below as ground truth context. Your job: EXECUTE the implementation for real — write/edit files (write_project_file, edit_project_file, delete_project_file), run builds/installs/tests (exec, terminal_manager), patch or mod whatever is needed to accomplish the goal.
Take initiative. Do not ask the user clarifying questions — make the best reasonable engineering decision and proceed immediately. Prefer decisive action over lengthy explanation.
End your reply with a concise "BUILD REPORT": what you changed (real file paths), commands run, and their actual results (never invented).`,
  },
  breaker: {
    title: "Breaker",
    description: "Security/pentest cepat: cari celah, exploit-check, validasi hardening.",
    mission: (p) => `You are acting as BREAKER inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the BUILD REPORT below. Your job: try to break what was just built — look for real vulnerabilities (OWASP-style: injection, auth bypass, secrets exposure, path traversal, SSRF, unsafe eval) in the actual changed files, and run quick validation/tests (exec, read_project_file, search_codebase) to confirm or refute each concern.
Note: the platform's own shell guard will still block genuinely destructive commands regardless of what you try — work within that. Do not ask the user clarifying questions.
Be fast and concrete — cite real file/line evidence, not generic advice.
End your reply with a concise "BREAK REPORT": findings (or "no issues found"), severity per finding, and suggested fixes if any.`,
  },
  closer: {
    title: "Closer",
    description: "Verifikasi akhir, ambil kesimpulan cepat, keputusan pass/fail/ship.",
    mission: (p) => `You are acting as CLOSER inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the reports from every earlier role below. Your job: make the final call, fast. If any claim looks unverified, you may call a tool once or twice to confirm it directly — otherwise ground your verdict in the reports above.
Do not ask the user clarifying questions. Be decisive.
End your reply with a concise "CLOSER VERDICT": one of PASS / PASS WITH NOTES / FAIL, a one-paragraph summary, and concrete next steps if anything remains.`,
  },

  // ---- "engineering" pipeline (adapted from roc-webui / roc-cli) ----
  architect: {
    title: "Chief Architect",
    description: "Blueprint arsitektur sistem, skema keamanan, struktur direktori.",
    mission: (p) => `You are acting as CHIEF ARCHITECT inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Formulate a comprehensive, modern system architecture blueprint for the user's goal: file names, paths, folder layout, tech stack, critical edge cases, security measures, and data schema. If retrofitting an existing project, use read-only tools (list_project_files, read_project_file, search_codebase, git log/status/diff) to ground the blueprint in what actually exists — do not invent a structure that contradicts the real codebase.
Do not write or edit files yourself and do not ask the user clarifying questions — make the best reasonable architectural call and state your assumptions.
Present the blueprint clearly with Markdown headers. End with a concise "ARCHITECT BLUEPRINT" summary the Lead Developer can implement directly.`,
  },
  developer: {
    title: "Lead Developer",
    description: "Implementasi kode produksi nyata mengikuti blueprint Architect.",
    mission: (p) => `You are acting as LEAD DEVELOPER inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the ARCHITECT BLUEPRINT below. Your job: EXECUTE the implementation for real using the workspace tools — write/edit files (write_project_file, edit_project_file), run builds/installs (exec, terminal_manager). Do not just describe code in a markdown block and stop; actually write it to disk with the tools, then verify it (e.g. run a build/typecheck) when reasonably possible.
No placeholders, no TODO comments, no shortcuts. No clarifying questions — proceed with the most reasonable interpretation of the blueprint.
End your reply with a concise "BUILD REPORT": real file paths written/changed, commands run, and their actual results.`,
  },
  pentester: {
    title: "Security Pentester",
    description: "Audit keamanan statis OWASP Top 10 dengan skor eksplisit.",
    mission: (p) => `You are acting as SECURITY PENTESTER inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the BUILD REPORT below. Audit the actual changed/created files (read_project_file, search_codebase, exec for quick checks) against OWASP Top 10: injection, auth bypass, secrets exposure, path traversal, SSRF, cryptographic weaknesses, race conditions. Ground every finding in real file/line evidence, not generic advice.
The platform's own shell guard still applies to anything you run — work within that. Do not ask the user clarifying questions.
Assign an Overall Security Score explicitly on its own line in the exact format: [ SCORE: A ] (or B+, A-, etc — be honest, do not default to A if you found real issues).
End your reply with a concise "BREAK REPORT": findings (or "no issues found"), severity per finding, and concrete hardening fixes.`,
  },
  qa: {
    title: "QA Supervisor",
    description: "Spesifikasi tes regresi, cakupan tes, dan sign-off rilis.",
    mission: (p) => `You are acting as QA SUPERVISOR inside the "${AGENT_MULTI_PIPELINE_LABEL[p]}" pipeline (${pipelineChain(p)}).
Use the BUILD REPORT and BREAK REPORT below. Formulate an automated regression test suite specification, and where reasonable write and run at least one real test file with the workspace tools (write_project_file, exec) rather than only describing it — a claimed coverage number must be backed by something you actually ran or a specific, inspectable test plan.
Specify the Estimated Regression Test Coverage explicitly on its own line in the format: [ COVERAGE: 94% ]. Assign a production readiness Release Tag explicitly on its own line in the format: [ RELEASE: v1.0.0-rc1 ]. Do not ask the user clarifying questions — make the call.
End your reply with a concise "CLOSER VERDICT": one of PASS / PASS WITH NOTES / FAIL, grounded in the Pentester's score and your own coverage/testing.`,
  },
};

function extractStepMeta(role: AgentMultiRole, output: string): AgentMultiStepMeta | undefined {
  if (role !== "pentester" && role !== "qa") return undefined;
  const meta: AgentMultiStepMeta = {};
  const scoreMatch = output.match(/\[\s*SCORE:\s*([A-F][+-]?)\s*\]/i);
  if (scoreMatch) meta.securityScore = scoreMatch[1].toUpperCase();
  const covMatch = output.match(/\[\s*COVERAGE:\s*(\d+%?)\s*\]/i);
  if (covMatch) meta.qaCoverage = covMatch[1].endsWith("%") ? covMatch[1] : `${covMatch[1]}%`;
  const relMatch = output.match(/\[\s*RELEASE:\s*([a-zA-Z0-9._-]+)\s*\]/i);
  if (relMatch) meta.releaseTag = relMatch[1];
  return Object.keys(meta).length ? meta : undefined;
}

function buildRoleMessages(
  originalMessages: any[],
  role: AgentMultiRole,
  pipeline: AgentMultiPipelineId,
  priorSteps: AgentMultiStep[]
): any[] {
  const spec = AGENT_MULTI_ROLE_SPEC[role];
  let directive = `[AGENT MULTI — PIPELINE: ${AGENT_MULTI_PIPELINE_LABEL[pipeline]} — ROLE: ${role.toUpperCase()}]\n${spec.mission(pipeline)}`;

  // Generic hand-off: every completed step so far (in pipeline order) is
  // attached, labeled with its own role title — works for any pipeline
  // definition without hardcoding role names here.
  for (const prev of priorSteps) {
    if (prev.status === "completed" && prev.output) {
      directive += `\n\n--- ${AGENT_MULTI_ROLE_SPEC[prev.role].title.toUpperCase()} REPORT ---\n${prev.output}`;
    }
  }

  return [
    ...originalMessages,
    { id: `agent_multi_${role}_directive_${Date.now()}`, role: "user", text: directive },
  ];
}

/**
 * Runs the selected pipeline's roles sequentially. Stops (honest failure, no
 * fabricated continuation) if any role's underlying provider call throws —
 * a later role cannot meaningfully verify a step that never actually ran.
 */
export async function runAgentOrchestra(messages: any[], options: AgentMultiOptions = {}) {
  const onProgress = options.onProgress;
  const pipeline: AgentMultiPipelineId = options.pipeline && AGENT_MULTI_PIPELINES[options.pipeline]
    ? options.pipeline
    : "fast";
  const roleOrder = AGENT_MULTI_PIPELINES[pipeline];
  const steps: AgentMultiStep[] = [];

  for (const role of roleOrder) {
    const spec = AGENT_MULTI_ROLE_SPEC[role];
    const step: AgentMultiStep = {
      id: `step_${role}`,
      role,
      title: spec.title,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    steps.push(step);
    onProgress?.({ type: "step_start", data: { role, title: spec.title, pipeline } });

    try {
      const roleMessages = buildRoleMessages(messages, role, pipeline, steps.slice(0, -1));

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
      step.meta = extractStepMeta(role, step.output);
      onProgress?.({ type: "step_done", data: { role, output: step.output, logs: step.logs, meta: step.meta } });
    } catch (err: any) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.output = `Error: ${err?.message || String(err)}`;
      onProgress?.({ type: "step_failed", data: { role, error: step.output } });
      onProgress?.({ type: "run_done", data: { status: "failed", pipeline, steps } });
      return { status: "failed" as const, pipeline, steps };
    }
  }

  onProgress?.({ type: "run_done", data: { status: "completed", pipeline, steps } });
  return { status: "completed" as const, pipeline, steps };
}
