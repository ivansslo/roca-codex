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
  Sparkles,
  Database,
} from 'lucide-react';
import { AgentRole, AgentStep } from '../types';

interface OrchestraVisualizerProps {
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

const AGENTS: AgentNode[] = [
  {
    id: 'scout',
    name: 'Scout',
    title: 'Fast Recon / Context Catcher',
    badge: 'SCOUT',
    avatar: '🔎',
    icon: Search,
    description: 'Read-only recon: catches project/file context fast (list, read, search, git status/log) to ground the pipeline in real facts before anything is built.',
    capabilities: ['list_project_files', 'read_project_file', 'search_codebase', 'Read-only shell']
  },
  {
    id: 'builder',
    name: 'Builder/Modder',
    title: 'Implementation & Execution',
    badge: 'BUILD',
    avatar: '🛠️',
    icon: Hammer,
    description: 'Takes initiative and executes for real: writes/edits/patches files, runs builds/installs, mods the project — no clarifying questions, decisive action.',
    capabilities: ['write_project_file', 'edit_project_file', 'run_bash_command', 'terminal_manager']
  },
  {
    id: 'breaker',
    name: 'Breaker',
    title: 'Security / Break-Test',
    badge: 'BREAK',
    avatar: '🕵️',
    icon: ShieldAlert,
    description: 'Tries to break what Builder just produced — injection, auth bypass, secret exposure, path traversal, SSRF — validated with real tool checks, not guesses.',
    capabilities: ['search_codebase', 'run_bash_command', 'read_project_file', 'OWASP-style review']
  },
  {
    id: 'closer',
    name: 'Closer',
    title: 'Final Verdict',
    badge: 'CLOSE',
    avatar: '✅',
    icon: CheckCircle2,
    description: 'Reads all three prior reports and makes the fast final call: PASS / PASS WITH NOTES / FAIL, with concrete next steps if anything remains.',
    capabilities: ['Verdict synthesis', 'Spot-check tool calls', 'Risk summary']
  }
];

export default function OrchestraVisualizer({
  activeStepIndex,
  steps,
  status,
}: OrchestraVisualizerProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(AGENTS[0]);

  // Helper to check state of each agent node
  const getAgentState = (role: AgentRole) => {
    const step = steps.find(s => s.agentRole === role);
    if (!step) return 'idle';
    return step.status;
  };

  return (
    <div id="orchestra_visualizer" className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 shadow-xl relative overflow-hidden my-4">
      {/* Decorative background grid and gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Visualizer header */}
      <div className="relative z-10 flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h2 className="text-lg font-medium text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            Agent Multi — Scout → Builder → Breaker → Closer
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Fast autonomous pipeline: recon, real implementation, break-test, final verdict.
          </p>
        </div>

        {/* Status indicator */}
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

      {/* Grid Layout: Graph on Left, Agent spec details on Right */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Orchestra Node Graph */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center py-6 min-h-[300px]">
          <div className="relative w-full max-w-[480px] aspect-[4/3] flex items-center justify-center">
            {/* Connection Paths/Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.2))' }}>
              <line
                x1="25%" y1="20%" x2="75%" y2="20%"
                className={`stroke-2 transition-all duration-700 ${
                  getAgentState('builder') !== 'idle' ? 'stroke-cyan-500' : 'stroke-slate-800'
                }`}
                strokeDasharray={status === 'running' && activeStepIndex === 1 ? '5 5' : 'none'}
              />
              <line
                x1="75%" y1="20%" x2="75%" y2="80%"
                className={`stroke-2 transition-all duration-700 ${
                  getAgentState('breaker') !== 'idle' ? 'stroke-violet-500' : 'stroke-slate-800'
                }`}
                strokeDasharray={status === 'running' && activeStepIndex === 2 ? '5 5' : 'none'}
              />
              <line
                x1="75%" y1="80%" x2="25%" y2="80%"
                className={`stroke-2 transition-all duration-700 ${
                  getAgentState('closer') !== 'idle' ? 'stroke-emerald-500' : 'stroke-slate-800'
                }`}
                strokeDasharray={status === 'running' && activeStepIndex === 3 ? '5 5' : 'none'}
              />
              <line
                x1="25%" y1="80%" x2="25%" y2="20%"
                className={`stroke-2 transition-all duration-700 ${
                  status === 'completed' ? 'stroke-teal-500' : 'stroke-slate-800'
                }`}
                strokeDasharray={status === 'running' && activeStepIndex === 0 ? '5 5' : 'none'}
              />
            </svg>

            {/* Agent 1: Scout */}
            <div className="absolute top-[5%] left-[10%] -translate-x-1/2 -translate-y-1/2">
              <NodeButton
                agent={AGENTS[0]}
                state={getAgentState('scout')}
                isActive={activeStepIndex === 0 && status === 'running'}
                isSelected={selectedAgent?.id === 'scout'}
                onClick={() => setSelectedAgent(AGENTS[0])}
              />
            </div>

            {/* Agent 2: Builder/Modder */}
            <div className="absolute top-[5%] left-[90%] -translate-x-1/2 -translate-y-1/2">
              <NodeButton
                agent={AGENTS[1]}
                state={getAgentState('builder')}
                isActive={activeStepIndex === 1 && status === 'running'}
                isSelected={selectedAgent?.id === 'builder'}
                onClick={() => setSelectedAgent(AGENTS[1])}
              />
            </div>

            {/* Agent 3: Breaker */}
            <div className="absolute top-[95%] left-[90%] -translate-x-1/2 -translate-y-1/2">
              <NodeButton
                agent={AGENTS[2]}
                state={getAgentState('breaker')}
                isActive={activeStepIndex === 2 && status === 'running'}
                isSelected={selectedAgent?.id === 'breaker'}
                onClick={() => setSelectedAgent(AGENTS[2])}
              />
            </div>

            {/* Agent 4: Closer */}
            <div className="absolute top-[95%] left-[10%] -translate-x-1/2 -translate-y-1/2">
              <NodeButton
                agent={AGENTS[3]}
                state={getAgentState('closer')}
                isActive={activeStepIndex === 3 && status === 'running'}
                isSelected={selectedAgent?.id === 'closer'}
                onClick={() => setSelectedAgent(AGENTS[3])}
              />
            </div>

            {/* Center Status Hub */}
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
                    const matchingStep = steps.find(s => s.agentRole === selectedAgent.id);
                    if (!matchingStep?.thoughts) return null;
                    return (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-mono">Report</span>
                        <p className="text-xs text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap max-h-40 overflow-y-auto">{matchingStep.thoughts}</p>
                      </div>
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
