import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Message } from '../types';
import {
  Bot, User, FileText, Sparkles, Copy,
  Terminal, Check, ChevronDown, ChevronRight, FileCode, ChevronUp, Download, CheckCircle2, XCircle, Eye, EyeOff, RefreshCw, Globe, Wrench, Search
} from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

// Helper to format execution duration in ms or s
function formatDuration(ms?: number): string {
  if (!ms) return '94ms';
  if (ms >= 1000) {
    const sec = ms / 1000;
    return sec % 1 === 0 ? `${sec}s` : `${sec.toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

// Bulletproof Copy to Clipboard for all environments (HTTP, HTTPS, Termux, Mobile WebViews)
function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  } else {
    return Promise.resolve(fallbackCopy(text));
  }
}

function fallbackCopy(text: string): boolean {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  }
}

// CodeBlock matching Image 2 & Image 4 with Line Numbers, Copy & Download buttons
function CodeBlock({ language, value, filename }: { language: string; value: string; filename?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap: Record<string, string> = {
      typescript: 'ts',
      ts: 'ts',
      tsx: 'tsx',
      javascript: 'js',
      js: 'js',
      jsx: 'jsx',
      python: 'py',
      py: 'py',
      bash: 'sh',
      sh: 'sh',
      json: 'json',
      html: 'html',
      css: 'css'
    };
    const cleanLang = (language || '').toLowerCase().trim();
    const ext = extMap[cleanLang] || 'txt';
    const name = filename || `script.${ext}`;
    const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const lines = value.split('\n');

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl my-3 overflow-hidden shadow-2xl font-mono text-xs">
      {/* Code Header Bar matching Image 2 */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={15} className="text-indigo-400 flex-shrink-0" />
          <span className="font-mono text-[12px] font-bold text-slate-50 truncate">
            {filename || (language ? `${language} snippet` : 'code')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-300 text-[10px] font-bold uppercase tracking-wider mr-1">
            {language ? language.toUpperCase() : 'TXT'}
          </span>
          <button 
            type="button"
            onClick={handleCopy} 
            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 rounded-lg transition-colors cursor-pointer flex items-center justify-center border border-slate-700/50 bg-slate-950/60"
            title={copied ? "Copied!" : "Copy code"}
          >
            {copied ? <Check size={13} className="text-emerald-400 font-bold" /> : <Copy size={13} />}
          </button>
          <button 
            type="button"
            onClick={handleDownload} 
            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center border border-slate-700/50 bg-slate-950/60"
            title="Download script"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Code Body with Line Numbers matching Image 2 */}
      <div className="flex overflow-x-auto leading-relaxed select-text bg-slate-950 max-h-96">
        {/* Line Numbers Column */}
        <div className="py-3 px-2.5 bg-slate-900/40 text-slate-600 text-[11px] font-mono select-none text-right border-r border-slate-800/80 flex flex-col min-w-[2.5rem]">
          {lines.map((_, i) => (
            <span key={i} className="leading-5">{i + 1}</span>
          ))}
        </div>
        {/* Code Lines */}
        <pre className="p-3 text-xs font-mono text-slate-100 leading-5 overflow-x-auto flex-1 bg-slate-950">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
}

// Diff Card view matching Image 1 (`</> rocagents/src/App.tsx   +1 -1`)
function FileDiffCard({ filename, content }: { filename: string; content: string }) {
  const shortFilename = filename.split('/').pop() || filename;
  const lines = content.split('\n');
  const addedLines = lines.filter(l => l.startsWith('+') || !l.startsWith('-')).length;
  const removedLines = lines.filter(l => l.startsWith('-')).length;

  return (
    <div className="bg-slate-950 border border-slate-800/90 rounded-2xl my-2.5 overflow-hidden shadow-2xl font-mono text-xs animate-fade-in">
      {/* Header matching Image 1: </> rocagents/src/App.tsx   +1 -1 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
        <div className="flex items-center gap-2 truncate pr-2">
          <FileCode size={15} className="text-indigo-400 flex-shrink-0" />
          <span className="font-mono text-[12px] font-bold text-slate-50 truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-2 font-bold text-[11px] flex-shrink-0">
          <span className="text-emerald-400">+{addedLines || 1}</span>
          <span className="text-red-400">-{removedLines || 1}</span>
        </div>
      </div>

      {/* Diff Code Container */}
      <div className="p-3 bg-slate-950/90 font-mono text-xs leading-relaxed overflow-x-auto max-h-72">
        {lines.map((line, idx) => {
          const isAdded = line.startsWith('+');
          const isRemoved = line.startsWith('-');

          return (
            <div 
              key={idx} 
              className={`flex items-start gap-3 px-2 py-0.5 rounded ${
                isRemoved ? 'bg-red-950/30 text-red-300' : isAdded ? 'bg-emerald-950/30 text-emerald-300' : 'text-slate-200'
              }`}
            >
              <span className="select-none text-slate-600 text-[10px] w-4 text-right">{idx + 1}</span>
              <span className="select-none text-slate-500 font-bold">{isRemoved ? '-' : isAdded ? '+' : ' '}</span>
              <span className="whitespace-pre-wrap flex-1">{line.replace(/^[+-]/, '')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Single Execution Tool Card matching Latest Screenshots
function ExecutionCard({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(true);

  const isWriteFile = log.toolName === 'write_project_file' || log.toolName === 'create_file';
  const isReadFile = log.toolName === 'read_project_file' || log.toolName === 'read_file';
  const isBash = log.toolName === 'run_bash_command' || log.toolName === 'shell';

  const filename = log.args?.filename || log.args?.path || 'file';
  const shortFilename = filename.split('/').pop() || filename;
  const content = log.args?.content || (log.result?.content ? log.result.content : '');
  const command = log.args?.command || log.args?.cmd || '';
  const exitCode = log.result?.exitCode !== undefined ? log.result.exitCode : (log.result?.status === 'error' ? 2 : 0);
  const isError = exitCode !== 0 || log.result?.status === 'error';
  const durationStr = formatDuration(log.timeMs);

  return (
    <div className="space-y-1.5 font-mono text-xs select-none">
      {/* Step Header Bar matching Screenshots: used Bash ❌ exit 2 110ms ^ or used Bash ✓ 2.3s v */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between py-1.5 px-2.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 rounded-lg text-slate-300 text-xs cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 truncate pr-2">
          {isBash ? (
            <>
              <span className="p-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                <Terminal size={12} className={isError ? "text-red-400" : "text-emerald-400"} />
              </span>
              <span className="font-semibold text-slate-200">used Bash</span>
              {isError ? (
                <span className="flex items-center gap-1 text-red-400 text-[11px] font-bold">
                  <XCircle size={13} />
                  <span>exit {exitCode}</span>
                </span>
              ) : (
                <CheckCircle2 size={13} className="text-emerald-400 font-bold" />
              )}
              <span className="text-[11px] text-slate-500 font-sans">{durationStr}</span>
            </>
          ) : isReadFile ? (
            <>
              <Eye size={13} className="text-indigo-400" />
              <span className="text-slate-400">Read</span>
              <span className="font-mono text-[12px] font-bold text-slate-50">{shortFilename}</span>
            </>
          ) : isWriteFile ? (
            <>
              <span className="text-indigo-400 font-bold">Edit</span>
              <span className="font-mono text-[12px] font-bold text-slate-50 truncate px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-600/70 shadow-sm">{filename}</span>
            </>
          ) : (
            <>
              <FileCode size={13} className="text-indigo-400" />
              <span className="font-semibold text-slate-200">{log.toolName}</span>
            </>
          )}
        </div>

        <button type="button" className="text-slate-400 hover:text-slate-200 p-0.5 flex-shrink-0 flex items-center gap-1">
          {expanded ? (
            <>
              <Eye size={13} className="text-indigo-400" />
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              <EyeOff size={13} className="text-slate-500" />
              <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {/* If tool call is actively running in real-time (no result returned yet) */}
      {!log.result && (
        <div className="flex items-center justify-between py-2 px-3 bg-slate-900/90 border border-amber-500/50 rounded-xl text-amber-300 text-xs animate-pulse shadow-md my-1.5">
          <div className="flex items-center gap-2 truncate pr-2">
            <Terminal size={14} className="animate-spin text-amber-400 flex-shrink-0" />
            <span className="font-bold">Running {log.toolName}...</span>
            {command && <span className="text-slate-300 font-mono truncate text-[11px]">$ {command}</span>}
          </div>
          <span className="text-[10px] font-mono bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 text-amber-200 font-bold flex-shrink-0">RUNNING ⚡</span>
        </div>
      )}

      {/* Expanded Step Body with COMMAND and STDERR/STDOUT boxes matching Image 2 */}
      {expanded && log.result && (
        <div className="pl-3 border-l-2 border-indigo-500/30 space-y-2 py-1">
          {/* COMMAND Box with Top-Right Copy Button */}
          {command && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>COMMAND</span>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(command);
                    alert("Command copied to clipboard!");
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="Copy command"
                >
                  <Copy size={12} />
                </button>
              </div>
              <pre className="p-3 text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                <span className="text-emerald-400 font-bold">$ </span>
                <span>{command}</span>
              </pre>
            </div>
          )}

          {/* Read File Content Box */}
          {isReadFile && log.result?.content && (
            <CodeBlock 
              language={filename.split('.').pop() || 'txt'} 
              value={log.result.content} 
              filename={filename} 
            />
          )}

          {/* List Project Files Box */}
          {log.toolName === 'list_project_files' && log.result?.files && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2 p-3 space-y-2">
              <div className="flex items-center justify-between text-indigo-300 font-bold text-[11px] border-b border-slate-800 pb-1.5">
                <span>📂 Workspace Files ({log.result.files.length} items)</span>
                <span className="text-slate-500 font-normal">ROOT WORKSPACE</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pt-1">
                {log.result.files.map((file: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-slate-200 text-[11px]">
                    <FileCode size={13} className="text-indigo-400 flex-shrink-0" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Codebase Results Box */}
          {log.toolName === 'search_codebase' && log.result?.results && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2 p-3 space-y-2">
              <div className="text-indigo-300 font-bold text-[11px] border-b border-slate-800 pb-1.5">
                🔍 Codebase Search Matches ({log.result.results.length} results)
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pt-1">
                {log.result.results.map((item: any, idx: number) => (
                  <div key={idx} className="p-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px]">
                    <div className="flex items-center justify-between text-indigo-400 font-bold mb-1">
                      <span>{item.filename}:{item.line}</span>
                    </div>
                    <code className="text-slate-300 block bg-slate-950 p-1.5 rounded border border-slate-800/60 font-mono text-[10px] overflow-x-auto">
                      {item.match}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isWriteFile && content && (
            <FileDiffCard filename={filename} content={content} />
          )}

          {/* STDOUT Box with Top-Right Copy Button */}
          {log.result?.stdout && !content && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                <span>STDOUT</span>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(log.result.stdout);
                    alert("STDOUT copied to clipboard!");
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="Copy stdout"
                >
                  <Copy size={12} />
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                {log.result.stdout}
              </pre>
            </div>
          )}

          {/* STDERR Box with Top-Right Copy Button matching Image 2 */}
          {log.result?.stderr && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                <span>STDERR</span>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(log.result.stderr);
                    alert("STDERR copied to clipboard!");
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="Copy stderr"
                >
                  <Copy size={12} />
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-red-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                {log.result.stderr}
              </pre>
            </div>
          )}

          {/* Generic JSON / Tool Result Message fallback */}
          {!isBash && !isWriteFile && !isReadFile && log.toolName !== 'list_project_files' && log.toolName !== 'search_codebase' && log.result && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs my-2">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                <span>TOOL RESULT</span>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(JSON.stringify(log.result, null, 2));
                    alert("Result copied to clipboard!");
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="Copy result JSON"
                >
                  <Copy size={12} />
                </button>
              </div>
              <pre className="p-3 text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                {typeof log.result === 'string' ? log.result : JSON.stringify(log.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Collapsible Group Container matching Screenshots 1 & 2
function ExecutionLogsGroup({ logs }: { logs: any[] }) {
  // Tools run silently by default: data is KEPT (in message.logs) but hidden; one Show button reveals it.
  const [shown, setShown] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!Array.isArray(logs) || logs.length === 0) return null;

  const has = (...names: string[]) => logs.filter(l => names.includes(l?.toolName));
  const readLogs = has('read_project_file', 'read_file');
  const editLogs = has('write_project_file', 'create_file', 'edit_file', 'edit_project_file');
  const bashLogs = has('run_bash_command', 'shell', 'terminal_manager');
  const searchLogs = has('search_codebase');
  const webLogs = has('web_searching_module');
  const httpLogs = has('http_request');
  const modelLogs = has('ask_model');
  const used = new Set([...readLogs, ...editLogs, ...bashLogs, ...searchLogs, ...webLogs, ...httpLogs, ...modelLogs]);
  const otherLogs = logs.filter(l => !used.has(l));

  const groups = [
    { key: 'read', label: 'Read', Icon: Eye, color: 'text-sky-400', logs: readLogs },
    { key: 'edit', label: 'Edit', Icon: FileCode, color: 'text-indigo-400', logs: editLogs },
    { key: 'bash', label: 'Bash', Icon: Terminal, color: 'text-emerald-400', logs: bashLogs },
    { key: 'search', label: 'Search', Icon: Search, color: 'text-amber-400', logs: searchLogs },
    { key: 'web', label: 'Web', Icon: Globe, color: 'text-cyan-400', logs: webLogs },
    { key: 'http', label: 'HTTP', Icon: Globe, color: 'text-fuchsia-400', logs: httpLogs },
    { key: 'model', label: 'Model', Icon: Sparkles, color: 'text-purple-400', logs: modelLogs },
    { key: 'other', label: 'Lainnya', Icon: FileCode, color: 'text-slate-400', logs: otherLogs },
  ].filter(g => g.logs.length > 0);

  const total = logs.length;

  return (
    <div className="mt-3 space-y-2 font-mono text-xs animate-fade-in select-none">
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        className="flex items-center gap-2 w-full p-2 px-3 rounded-xl border border-slate-700/70 bg-slate-900/70 hover:bg-slate-800/80 hover:border-slate-600 text-slate-300 hover:text-white transition-all cursor-pointer"
        title={shown ? "Sembunyikan aktivitas tool" : "Tampilkan aktivitas tool"}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex-shrink-0">
          <Wrench size={13} className={shown ? "text-indigo-300" : "text-slate-400"} />
        </span>
        <span className="font-bold text-slate-100">{total} tool{total > 1 ? 's' : ''} dijalankan</span>
        <span className="hidden sm:flex items-center gap-1 ml-1 overflow-hidden flex-wrap">
          {groups.map(g => (
            <span key={g.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[9px] font-bold ${g.color}`} title={`${g.label}: ${g.logs.length}`}>
              <g.Icon size={9} />{g.logs.length}
            </span>
          ))}
        </span>
        <span className={`ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${shown ? 'text-indigo-300' : 'text-slate-500'}`}>
          {shown ? (<><ChevronUp size={12} /> Sembunyikan</>) : (<><ChevronDown size={12} /> Tampilkan</>)}
        </span>
      </button>

      {shown && (
        <div className="space-y-1.5 pl-1">
          {groups.map(g => {
            const open = openKey === g.key;
            return (
              <div key={g.key} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                <div
                  onClick={() => setOpenKey(open ? null : g.key)}
                  className="flex items-center justify-between p-2 px-3 bg-slate-900/70 hover:bg-slate-900 text-slate-300 hover:text-white cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''} ${open ? g.color : 'text-slate-500'}`} />
                    <g.Icon size={14} className={g.color} />
                    <span className="font-bold text-slate-100">{g.label}</span>
                    <span className="text-[10px] text-slate-500">{g.logs.length}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{open ? 'Sembunyikan' : 'Tampilkan'}</span>
                </div>
                {open && (
                  <div className="p-2 space-y-2 bg-slate-950 border-t border-slate-800/60">
                    {g.logs.map((log, i) => <ExecutionCard key={i} log={log} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Clean, elegant Thinking Indicator (Codex App / modern AI style)
function ThinkingIndicator({ statusMessage }: { statusMessage?: string }) {
  const [dots, setDots] = useState('');

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 450);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="my-2 select-none animate-fade-in font-sans">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs shadow-xs">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
        </span>
        <span className="font-semibold text-slate-100 text-[11px] tracking-wide">
          Thinking{dots}
        </span>
        {statusMessage && (
          <span className="text-[11px] text-slate-400 border-l border-slate-800 pl-2 font-mono truncate max-w-xs sm:max-w-md">
            {statusMessage}
          </span>
        )}
      </div>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Copy Chat Message Handler matching Image 3 & Frame 028
  const handleCopyMessage = async () => {
    if (message.text) {
      await copyToClipboard(message.text);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  return (
    <div className={`flex w-full mb-8 group animate-fade-in justify-start`}>
      <div className={`flex flex-col max-w-4xl min-w-0 items-start`}>
        {/* Message Header (Sender Name) - Minimalist style */}
        <div className={`flex items-center gap-2 mb-1 px-1 select-none flex-row`}>
          <span className="text-[10px] font-bold text-theme-text-muted uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-opacity">
            {isUser ? 'You' : 'Codex AI'}
          </span>
          {!isUser && (
            <span className="h-1 w-1 rounded-full bg-indigo-500 animate-pulse" />
          )}
        </div>

        {/* Message Content Container - "Polos" (Plain) without boxes */}
        <div className={`relative flex flex-col gap-2 min-w-0 text-theme-text-primary px-1 py-0.5 ${
          'text-left'
        }`}>
          
          {/* Uploaded Attachments */}
          {message.image && (
            <div className="relative w-full rounded-xl overflow-hidden my-2">
              <img
                src={message.image.url}
                alt="Uploaded attachment"
                className="w-full max-h-80 object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {message.file && (
            <div className={`flex items-center gap-2.5 mb-1 max-w-md mr-auto`}>
              <div className="p-1.5 text-indigo-400 rounded-lg flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-theme-text-primary truncate">{message.file.name}</p>
                <p className="text-[9px] text-theme-text-muted font-mono">
                  {message.file.savedToWorkspace ? 'Saved to Workspace' : 'Attachment'}
                </p>
              </div>
            </div>
          )}

          {/* High-Contrast Markdown Text Body - Clean and Direct */}
          {message.text && (
            <div className={`prose dark:prose-invert prose-sm sm:prose-base max-w-none text-theme-text-primary break-words leading-relaxed text-left`}>
              <Markdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')} />
                    ) : (
                      <code className="bg-slate-800/50 text-indigo-300 font-mono text-[11px] px-1.5 py-0.5 rounded border border-slate-700/30 font-medium" {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.text}
              </Markdown>
            </div>
          )}

          {/* Actions Bar - Subtle hover actions */}
          <div className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity justify-start`}>
            {message.text && (
              <button
                type="button"
                onClick={handleCopyMessage}
                className="p-1 rounded text-theme-text-muted hover:text-indigo-400 transition-colors cursor-pointer"
                title="Copy message"
              >
                {copiedMessage ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            )}
          </div>

          {/* Execution Output Group */}
          {message.logs && message.logs.length > 0 && (
            <div className={`w-full `}>
              <div className="w-full max-w-2xl">
                <ExecutionLogsGroup logs={message.logs} />
              </div>
            </div>
          )}

          {/* Thinking Indicator */}
          {message.isTyping && (
            <div className={''}>
              <ThinkingIndicator statusMessage={message.statusMessage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}