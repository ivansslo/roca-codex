import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Minimize2, Maximize2, Loader2 } from 'lucide-react';

interface TerminalLine {
  id: number;
  text: string;
  type: 'info' | 'stdout' | 'stderr' | 'success' | 'error' | 'status';
  timestamp: string;
}

interface LiveTerminalProps {
  isLoading: boolean;
  logs?: any[];
}

export function LiveTerminal({ isLoading, logs = [] }: LiveTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [connected, setConnected] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const processedCountRef = useRef(0);

  const addLine = (text: string, type: TerminalLine['type'] = 'info') => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLines(prev => [...prev, { id: lineIdRef.current++, text, type, timestamp: ts }]);
  };

  // Populate terminal dari logs prop — fallback jika SSE tidak tersedia
  // Skip jika SSE sudah terhubung (data real-time dari SSE lebih baik)
  useEffect(() => {
    if (!logs || logs.length === 0) return;
    // Jika SSE sudah connected, biarkan SSE handle real-time — tidak perlu duplikasi dari logs
    if (connected) return;

    // Proses hanya log entries yang belum ditampilkan
    const newLogs = logs.slice(processedCountRef.current);
    if (newLogs.length === 0) return;

    processedCountRef.current = logs.length;

    newLogs.forEach((log) => {
      const cmd = log.args?.command || log.args?.cmd || '';
      setActiveTool(log.toolName);
      addLine(`▶ Running ${log.toolName}${cmd ? `: $ ${cmd}` : ''}...`, 'info');

      if (log.result) {
        // Tampilkan stdout jika ada
        if (log.result.stdout) {
          const outLines = log.result.stdout.trim().split('\n');
          outLines.forEach((line: string) => addLine(line, 'stdout'));
        }
        // Tampilkan stderr jika ada
        if (log.result.stderr) {
          const errLines = log.result.stderr.trim().split('\n');
          errLines.forEach((line: string) => addLine(line, 'stderr'));
        }
        const status = log.result.status === 'error' ? '❌' : '✅';
        const exitCode = log.result.exitCode;
        const suffix = exitCode !== undefined ? ` (exit ${exitCode})` : '';
        addLine(`${status} ${log.toolName} finished${suffix}`, log.result.status === 'error' ? 'error' : 'success');
      }
      setActiveTool(null);
    });

    if (!isLoading && processedCountRef.current === logs.length) {
      addLine(`📊 Execution complete — ${logs.length} tool(s) executed`, 'success');
    }
  }, [logs, isLoading]);

  // Connect ke SSE /api/terminal-stream untuk real-time output jika tersedia
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/terminal-stream');
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      // Handle real-time tool events from SSE
      es.addEventListener('tool_start', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const cmd = data.toolArgs?.command || data.toolArgs?.cmd || '';
          setActiveTool(data.toolName);
          addLine(`▶ Running ${data.toolName}${cmd ? ': $ ' + cmd : ''}...`, 'info');
        } catch (_) {}
      });

      es.addEventListener('tool_output', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.stdout && String(data.stdout).trim()) {
            String(data.stdout).trim().split('\n').forEach((line: string) => addLine(line, 'stdout'));
          }
          if (data.stderr && String(data.stderr).trim()) {
            String(data.stderr).trim().split('\n').forEach((line: string) => addLine(line, 'stderr'));
          }
        } catch (_) {}
      });

      es.addEventListener('tool_result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const r = data.result || {};
          const ok = r.status === 'success' || !r.error;
          const exitCode = r.exitCode !== undefined ? ` (exit ${r.exitCode})` : '';
          addLine(`${ok ? '✅' : '❌'} ${data.toolName} finished${exitCode}`, ok ? 'success' : 'error');
          setActiveTool(null);
        } catch (_) {}
      });

      es.onerror = () => {
        setConnected(false);
      };
    } catch (_) {
      // SSE tidak support di environment ini (Termux WebView dll) — tidak masalah
      // logs prop sudah cukup sebagai fallback
      setConnected(false);
    }

    return () => {
      if (es) {
        es.close();
        esRef.current = null;
      }
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!minimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, minimized]);

  const lineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'stdout': return 'text-emerald-300';
      case 'stderr': return 'text-red-400';
      case 'success': return 'text-emerald-400 font-semibold';
      case 'error': return 'text-red-400 font-semibold';
      case 'status': return 'text-indigo-400';
      default: return 'text-neutral-300';
    }
  };

  return (
    <div className="bg-neutral-950 border border-theme-border rounded-xl flex flex-col font-mono text-xs overflow-hidden shadow-2xl transition-all">
      {/* Header */}
      <div
        onClick={() => setMinimized(!minimized)}
        className="bg-neutral-900 border-b border-theme-border px-4 py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-neutral-800/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-emerald-400" />
          <span className="text-neutral-200 font-semibold uppercase tracking-wider text-[10px] hidden sm:inline">
            Terminal
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {minimized ? 'MIN' : connected ? 'LIVE' : 'OFFLINE'}
          </span>
          {activeTool && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold animate-pulse">
              {activeTool}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors"
            title={minimized ? 'Maximize terminal' : 'Minimize terminal'}
          >
            {minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500/80"></span>
            <span className="w-2 h-2 rounded-full bg-yellow-500/80"></span>
            <span className="w-2 h-2 rounded-full bg-green-500/80"></span>
          </div>
        </div>
      </div>

      {/* Terminal Body */}
      {!minimized && (
        <div className="p-3 overflow-y-auto space-y-1 max-h-[400px] bg-black/40">
          {lines.length === 0 && !isLoading && (
            <div className="text-neutral-500 text-[11px] py-4 text-center">
              Waiting for tool execution...
            </div>
          )}
          {lines.map((line) => (
            <div key={line.id} className={`leading-relaxed break-all text-[11px] flex gap-2 ${lineColor(line.type)}`}>
              <span className="text-neutral-600 select-none flex-shrink-0">{line.timestamp}</span>
              <span className="flex-1">{line.text}</span>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-1.5 text-indigo-400 py-1">
              <Loader2 size={11} className="animate-spin" />
              <span className="text-[11px]">Thinking...</span>
              <span className="w-1 h-2.5 bg-indigo-400 animate-pulse"></span>
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
}
