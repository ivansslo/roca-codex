import { useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Bot, Loader2, PlayCircle, Square } from 'lucide-react';
import OrchestraVisualizer from './OrchestraVisualizer';
import { AgentMultiPipelineId, AgentRole, AgentStep } from '../types';
import { streamAgentOrchestra } from '../lib/agentOrchestraStream';
import { toast } from './Toast';

const PIPELINE_ROLES: Record<AgentMultiPipelineId, AgentRole[]> = {
  fast: ['scout', 'builder', 'breaker', 'closer'],
  engineering: ['architect', 'developer', 'pentester', 'qa'],
};

const ROLE_TITLE: Record<AgentRole, string> = {
  scout: 'Scout',
  builder: 'Builder/Modder',
  breaker: 'Breaker',
  closer: 'Closer',
  architect: 'Chief Architect',
  developer: 'Lead Developer',
  pentester: 'Security Pentester',
  qa: 'QA Supervisor',
};

const PIPELINE_OPTIONS: { id: AgentMultiPipelineId; label: string; description: string }[] = [
  {
    id: 'fast',
    label: 'Fast Multi',
    description: 'Scout → Builder/Modder → Breaker → Closer — cepat, inisiatif tinggi, minim basa-basi.',
  },
  {
    id: 'engineering',
    label: 'Engineering Orchestra',
    description: 'Chief Architect → Lead Developer → Security Pentester → QA Supervisor — pipeline rekayasa penuh dengan skor & sign-off.',
  },
];

function initialSteps(pipeline: AgentMultiPipelineId): AgentStep[] {
  return PIPELINE_ROLES[pipeline].map((role) => ({
    id: `step_${role}`,
    agentRole: role,
    title: ROLE_TITLE[role],
    status: 'idle',
    timestamp: '',
  }));
}

interface AgentOrchestraTabProps {
  selectedModel: string;
  selectedProvider: string;
  persona: string;
}

export function AgentOrchestraTab({ selectedModel, selectedProvider, persona }: AgentOrchestraTabProps) {
  const [pipeline, setPipeline] = useState<AgentMultiPipelineId>('fast');
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>(initialSteps('fast'));
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [runStatusMessage, setRunStatusMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = status === 'running';
  const roleOrder = PIPELINE_ROLES[pipeline];
  const lastRole = roleOrder[roleOrder.length - 1];

  const handleSelectPipeline = (id: AgentMultiPipelineId) => {
    if (isRunning) return;
    setPipeline(id);
    setSteps(initialSteps(id));
    setStatus('idle');
    setActiveStepIndex(-1);
    setRunStatusMessage('');
  };

  const handleRun = async () => {
    if (!prompt.trim() || isRunning) return;

    setSteps(initialSteps(pipeline));
    setStatus('running');
    setActiveStepIndex(-1);
    setRunStatusMessage('Menyiapkan pipeline...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAgentOrchestra(
        {
          messages: [{ id: 'agent_multi_prompt', role: 'user', text: prompt }],
          model: selectedModel,
          provider: selectedProvider,
          persona,
          pipeline,
          signal: controller.signal,
        },
        {
          onRunStart: (msg) => setRunStatusMessage(msg),
          onStepStart: ({ role }) => {
            const idx = roleOrder.indexOf(role as AgentRole);
            setActiveStepIndex(idx);
            setRunStatusMessage(`${ROLE_TITLE[role as AgentRole] || role} sedang bekerja...`);
            setSteps((prev) =>
              prev.map((s) => (s.agentRole === role ? { ...s, status: 'running', timestamp: new Date().toLocaleTimeString() } : s))
            );
          },
          onStepChunk: ({ role, text }) => {
            setSteps((prev) =>
              prev.map((s) => (s.agentRole === role ? { ...s, thoughts: text } : s))
            );
          },
          onStepDone: ({ role, output, meta }: any) => {
            setSteps((prev) =>
              prev.map((s) =>
                s.agentRole === role
                  ? { ...s, status: 'completed', thoughts: output, meta, timestamp: new Date().toLocaleTimeString() }
                  : s
              )
            );
          },
          onStepFailed: ({ role, error }) => {
            setSteps((prev) =>
              prev.map((s) =>
                s.agentRole === role ? { ...s, status: 'failed', thoughts: error, timestamp: new Date().toLocaleTimeString() } : s
              )
            );
          },
          onDone: (result) => {
            setStatus(result?.status === 'failed' ? 'failed' : 'completed');
            setRunStatusMessage(result?.status === 'failed' ? 'Pipeline berhenti karena error.' : 'Pipeline selesai.');
          },
          onError: (err) => {
            setStatus('failed');
            setRunStatusMessage(`Error: ${err}`);
            toast.error(`Agent Multi error: ${err}`);
          },
        }
      );
    } finally {
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setRunStatusMessage('Dihentikan oleh pengguna.');
  };

  const finalStep = steps.find((s) => s.agentRole === lastRole);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
      <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 text-theme-text-primary font-semibold">
          <Bot className="w-5 h-5 text-indigo-500" />
          <h2>Agent Multi — Launcher</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PIPELINE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelectPipeline(opt.id)}
              disabled={isRunning}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                pipeline === opt.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-theme-border bg-theme-input hover:bg-theme-btn-hover'
              }`}
            >
              <div className="text-xs font-bold text-theme-text-primary">{opt.label}</div>
              <div className="text-[10px] text-theme-text-secondary mt-1 leading-relaxed">{opt.description}</div>
            </button>
          ))}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={isRunning}
          placeholder={`Deskripsikan tugas untuk pipeline ${roleOrder.map((r) => ROLE_TITLE[r]).join(' → ')}...`}
          className="w-full bg-theme-input border border-theme-border rounded-xl p-3 text-sm text-theme-text-primary outline-none focus:border-indigo-500 disabled:opacity-60"
        />
        <div className="flex items-center gap-3">
          {!isRunning ? (
            <button
              onClick={handleRun}
              disabled={!prompt.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              Launch Agent Multi
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
          {isRunning && (
            <span className="flex items-center gap-2 text-xs text-theme-text-secondary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {runStatusMessage}
            </span>
          )}
          {!isRunning && runStatusMessage && (
            <span className="text-xs text-theme-text-secondary">{runStatusMessage}</span>
          )}
        </div>
        <p className="text-[10px] text-theme-text-secondary font-mono leading-relaxed">
          Setiap role tetap melewati shell guard, SSRF guard, dan auth yang sama seperti chat biasa —
          pipeline ini tidak melonggarkan proteksi apa pun.
        </p>
      </div>

      <OrchestraVisualizer pipeline={pipeline} activeStepIndex={activeStepIndex} steps={steps} status={status} />

      {finalStep?.status === 'completed' && finalStep.thoughts && (
        <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-5 shadow-lg">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2 flex items-center gap-2">
            <Bot className="w-4 h-4 text-emerald-500" /> {ROLE_TITLE[lastRole]} — Hasil Akhir
          </h3>
          <div className="prose prose-sm prose-invert max-w-none text-theme-text-primary">
            <Markdown>{finalStep.thoughts}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
