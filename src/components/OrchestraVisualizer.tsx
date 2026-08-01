/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Hammer,
  ShieldAlert,
  CheckCircle2,
  Landmark,
  Code2,
  FlaskConical,
  Sparkles,
  Database,
} from 'lucide-react';
import { AgentRole, AgentStep, AgentMultiPipelineId } from '../types';

interface OrchestraVisualizerProps {
  pipeline: AgentMultiPipelineId;
  activeStepIndex: number;
  steps: AgentStep[];
  status: 'idle' | 'running' | 'completed' | 'failed';
}

interface AgentNode {
  id: AgentRole;
  name: string;
  title: string;
  badge: string;
  avatar: string;
  icon: any;
  description: string;
  capabilities: string[];
}

const AGENT_LIBRARY: Record<AgentRole, AgentNode> = {
  scout: {
    id: 'scout',
    name: 'Scout',
    title: 'Fast Recon / Context Catcher',
    badge: 'SCOUT',
    avatar: '🔎',
    icon: Search,
    description: 'Read-only recon: catches project/file context fast (list, read, search, git status/log) to ground the pipeline in real facts before anything is built.',
    capabilities: ['list_project_files', 'read_project_file', 'search_codebase', 'Read-only shell'],
  },
  builder: {
    id: 'builder',
    name: 'Builder/Modder',
    title: 'Implementation & Execution',
    badge: 'BUILD',
    avatar: '🛠️',
    icon: Hammer,
    description: 'Takes initiative and executes for real: writes/edits/patches files, runs builds/installs, mods the project — no clarifying questions, decisive action.',
    capabilities: ['write_project_file', 'edit_project_file', 'exec', 'terminal_manager'],
  },
  breaker: {
    id: 'breaker',
    name: 'Breaker',
    title: 'Security / Break-Test',
    badge: 'BREAK',
    avatar: '🕵️',
    icon: ShieldAlert,
    description: 'Tries to break what Builder just produced — injection, auth bypass, secret exposure, path traversal, SSRF — validated with real tool checks, not guesses.',
    capabilities: ['search_codebase', 'exec', 'read_project_file', 'OWASP-style review'],
  },
  closer: {
    id: 'closer',
    name: 'Closer',
    title: 'Final Verdict',
    badge: 'CLOSE',
    avatar: '✅',
    icon: CheckCircle2,
    description: 'Reads all prior reports and makes the fast final call: PASS / PASS WITH NOTES / FAIL, with concrete next steps if anything remains.',
    capabilities: ['Verdict synthesis', 'Spot-check tool calls', 'Risk summary'],
  },
  architect: {
    id: 'architect',
    name: 'Chief Architect',
    title: 'System Architecture Blueprint',
    badge: 'ARCH',
    avatar: '🏛️',
    icon: Landmark,
    description: 'Designs the system blueprint: file layout, tech stack, security posture and data schema, grounded in the real codebase when one already exists.',
    capabilities: ['list_project_files', 'read_project_file', 'search_codebase', 'git log/diff'],
  },
  developer: {
    id: 'developer',
    name: 'Lead Developer',
    title: 'Multi-File Code Synthesis',
    badge: 'DEV',
    avatar: '💻',
    icon: Code2,
    description: 'Implements the Architect blueprint for real — writes/edits files and runs builds, not just markdown code blocks.',
    capabilities: ['write_project_file', 'edit_project_file', 'exec', 'terminal_manager'],
  },
  pentester: {
    id: 'pentester',
    name: 'Security Pentester',
    title: 'OWASP Static Security Audit',
    badge: 'PEN',
    avatar: '🛡️',
    icon: ShieldAlert,
    description: 'Audits the Developer\'s real output against OWASP Top 10 and assigns an explicit security score.',
    capabilities: ['read_project_file', 'search_codebase', 'exec', '[ SCORE ]'],
  },
  qa: {
    id: 'qa',
    name: 'QA Supervisor',
    title: 'Regression Tests & Sign-off',
    badge: 'QA',
    avatar: '🧪',
    icon: FlaskConical,
    description: 'Writes/validates regression tests, reports coverage, and assigns a release tag and final verdict.',
    capabilities: ['write_project_file', 'exec', '[ COVERAGE ]', '[ RELEASE ]'],
  },
};

const PIPELINE_ROLES: Record<AgentMultiPipelineId, AgentRole[]> = {
  fast: ['scout', 'builder', 'breaker', 'closer'],
  engineering: ['architect', 'developer', 'pentester', 'qa'],
};

const PIPELINE_LABEL: Record<AgentMultiPipelineId, string> = {
  fast: 'Fast Multi — Scout → Builder/Modder → Breaker → Closer',
  engineering: 'Engineering Orchestra — Architect → Developer → Pentester → QA',
};

// Fixed positions for a 4-node diamond layout (top-left, top-right, bottom-right, bottom-left).
const NODE_POSITIONS = [
  { top: '5%', left: '10%' },
  { top: '5%', left: '90%' },
  { top: '95%', left: '90%' },
  { top: '95%', left: '10%' },
];

export default function OrchestraVisualizer({
  pipeline,
  activeStepIndex,
  steps,
  status,
}: OrchestraVisualizerProps) {
  const roles = PIPELINE_ROLES[pipeline];
  const agents = roles.map((r) => AGENT_LIBRARY[r]);
  const [selectedAgent, setSelectedAgent] = useState<AgentNode>(agents[0]);

  const getAgentState = (role: AgentRole) => {
    const step = steps.find((s) => s.agentRole === role);
    if (!step) return 'idle';
    return step.status;
  };

  return (
    <div id="orchestra_visualizer" className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 shadow-xl relative overflow-hidden my-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h2 className="text-lg font-medium text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            {PIPELINE_LABEL[pipeline]}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {pipeline === 'fast'
              ? 'Fast autonomous pipeline: recon, real implementation, break-test, final verdict.'
              : 'Full engineering pipeline: blueprint, real implementation, security audit, test & release sign-off.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-mono flex items-center gap-1.5 ${
            status === 'running' ? 'bg-amber-950 border border-amber-800 text-amber-400' :
            status === 'completed' ? 'bg-emerald-950 border border-emerald-800 text-emerald-400' :
            status === 'failed' ? 'bg-rose-950 border border-rose-800 text-rose-400' :
            'bg-slate-900 border border-slate-800 text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'running' ? 'bg-amber-400 animate-ping' :
              status === 'completed' ? 'bg-emerald-400' :
              status === 'failed' ? 'bg-rose-400' :
              'bg-slate-400'
            }`} />
            {status.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Orchestra Node Graph */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center py-6 min-h-[300px]">
          <div className="relative w-full max-w-[480px] aspect-[4/3] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.2))' }}>
              <line x1="25%" y1="20%" x2="75%" y2="20%"
                className={`stroke-2 transition-all duration-700 ${getAgentState(roles[1]) !== 'idle' ? 'stroke-cyan-500' : 'stroke-slate-800'}`}
                strokeDasharray={status === 'running' && activeStepIndex === 1 ? '5 5' : 'none'} />
              <line x1="75%" y1="20%" x2="75%" y2="80%"
                className={`stroke-2 transition-all duration-700 ${getAgentState(roles[2]) !== 'idle' ? 'stroke-violet-500' : 'stroke-slate-800'}`}
                strokeDasharray={status === 'running' && activeStepIndex === 2 ? '5 5' : 'none'} />
              <line x1="75%" y1="80%" x2="25%" y2="80%"
                className={`stroke-2 transition-all duration-700 ${getAgentState(roles[3]) !== 'idle' ? 'stroke-emerald-500' : 'stroke-slate-800'}`}
                strokeDasharray={status === 'running' && activeStepIndex === 3 ? '5 5' : 'none'} />
              <line x1="25%" y1="80%" x2="25%" y2="20%"
                className={`stroke-2 transition-all duration-700 ${status === 'completed' ? 'stroke-teal-500' : 'stroke-slate-800'}`}
                strokeDasharray={status === 'running' && activeStepIndex === 0 ? '5 5' : 'none'} />
            </svg>

            {agents.map((agent, idx) => (
              <div
                key={agent.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ top: NODE_POSITIONS[idx].top, left: NODE_POSITIONS[idx].left }}
              >
                <NodeButton
                  agent={agent}
                  state={getAgentState(agent.id)}
                  isActive={activeStepIndex === idx && status === 'running'}
                  isSelected={selectedAgent.id === agent.id}
                  onClick={() => setSelectedAgent(agent)}
                />
              </div>
            ))}

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
              <motion.div
                className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg relative"
                animate={status === 'running' ? { rotate: 360 } : {}}
                transition={status === 'running' ? { repeat: Infinity, duration: 20, ease: 'linear' } : {}}
              >
                <div className="absolute inset-1 rounded-full border border-dashed border-cyan-500/30" />
                <Database className="w-6 h-6 text-cyan-400" />
              </motion.div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-2">ROC BUS</span>
            </div>
          </div>
        </div>

        {/* Selected Agent Details Spec */}
        <div className="lg:col-span-5 bg-slate-900/60 rounded-xl border border-slate-800 p-5">
          <AnimatePresence mode="wait">
            {selectedAgent && (
              <motion.div
                key={selectedAgent.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{selectedAgent.avatar}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      {selectedAgent.name}
                    </h3>
                    <p className="text-xs text-cyan-400">{selectedAgent.title}</p>
                  </div>
                </div>

                <div className="border-t border-slate-800/80 pt-3 space-y-3">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-mono">Role Description</span>
                    <p className="text-xs text-slate-300 leading-relaxed mt-0.5">{selectedAgent.description}</p>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-mono">Tools This Role May Use</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedAgent.capabilities.map((cap, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-[10px] text-slate-300 font-mono flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-cyan-400" />
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const matchingStep = steps.find((s) => s.agentRole === selectedAgent.id);
                    if (!matchingStep) return null;
                    return (
                      <>
                        {matchingStep.meta && (
                          <div className="flex flex-wrap gap-1.5">
                            {matchingStep.meta.securityScore && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-[10px] text-amber-300 font-mono">SCORE: {matchingStep.meta.securityScore}</span>
                            )}
                            {matchingStep.meta.qaCoverage && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-[10px] text-emerald-300 font-mono">COVERAGE: {matchingStep.meta.qaCoverage}</span>
                            )}
                            {matchingStep.meta.releaseTag && (
                              <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] text-cyan-300 font-mono">RELEASE: {matchingStep.meta.releaseTag}</span>
                            )}
                          </div>
                        )}
                        {matchingStep.thoughts && (
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block font-mono">Report</span>
                            <p className="text-xs text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap max-h-40 overflow-y-auto">{matchingStep.thoughts}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

interface NodeButtonProps {
  agent: AgentNode;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'idle';
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function NodeButton({ agent, state, isActive, isSelected, onClick }: NodeButtonProps) {
  const Icon = agent.icon;

  const colors = {
    idle: { bg: 'bg-slate-900', border: 'border-slate-800', icon: 'text-slate-500', glow: '' },
    pending: { bg: 'bg-slate-950', border: 'border-slate-850', icon: 'text-slate-600', glow: '' },
    running: { bg: 'bg-amber-950/60', border: 'border-amber-500', icon: 'text-amber-400', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.4)]' },
    completed: { bg: 'bg-emerald-950/40', border: 'border-emerald-500/80', icon: 'text-emerald-400', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.2)]' },
    failed: { bg: 'bg-rose-950/40', border: 'border-rose-500', icon: 'text-rose-400', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.4)]' }
  };

  const scheme = colors[state] || colors.idle;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 w-24 h-24 cursor-pointer z-20 ${
        scheme.bg} ${scheme.border} ${scheme.glow} ${
        isSelected ? 'ring-2 ring-cyan-500/50' : ''
      }`}
    >
      <span className="absolute -top-6 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
        {agent.badge}
      </span>

      {isActive && (
        <span className="absolute inset-0 rounded-xl border border-cyan-400 animate-ping opacity-60 pointer-events-none" />
      )}

      <span className="text-xl mb-1">{agent.avatar}</span>

      <div className={`absolute bottom-2 right-2 p-1 rounded-md bg-slate-900/80 border border-slate-800 ${scheme.icon}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>

      <span className="text-[10px] font-semibold text-slate-100 truncate w-full text-center mt-1">
        {agent.name}
      </span>
    </motion.button>
  );
}
