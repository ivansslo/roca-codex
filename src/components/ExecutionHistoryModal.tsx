import React, { useState, useEffect } from 'react';
import { X, Clock, Terminal, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Activity, GitCompare, Code2, FileCode2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ExecutionLog {
  timestamp: string;
  toolName: string;
  args: any;
  result: any;
}

interface ExecutionHistoryModalProps {
  capabilityName: string;
  onClose: () => void;
}

interface DiffLine {
  type: 'add' | 'delete' | 'unchanged';
  oldLineNum?: number;
  newLineNum?: number;
  content: string;
}

function computeCodeDiff(oldCode: string = '', newCode: string = '') {
  const oldLines = oldCode ? oldCode.split('\n') : [];
  const newLines = newCode ? newCode.split('\n') : [];
  const diffLines: DiffLine[] = [];

  let added = 0;
  let deleted = 0;

  if (!oldCode.trim() && newCode.trim()) {
    newLines.forEach((line, idx) => {
      diffLines.push({ type: 'add', newLineNum: idx + 1, content: line });
      added++;
    });
    return { diffLines, added, deleted };
  }

  let i = 0, j = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push({ type: 'unchanged', oldLineNum, newLineNum, content: oldLines[i] });
      i++;
      j++;
      oldLineNum++;
      newLineNum++;
    } else {
      let foundInNew = -1;
      let foundInOld = -1;

      for (let k = j; k < Math.min(j + 6, newLines.length); k++) {
        if (oldLines[i] === newLines[k]) {
          foundInNew = k;
          break;
        }
      }

      for (let k = i; k < Math.min(i + 6, oldLines.length); k++) {
        if (newLines[j] === oldLines[k]) {
          foundInOld = k;
          break;
        }
      }

      if (i < oldLines.length && (foundInNew !== -1 || j >= newLines.length)) {
        diffLines.push({ type: 'delete', oldLineNum, content: oldLines[i] });
        i++;
        oldLineNum++;
        deleted++;
      } else if (j < newLines.length) {
        diffLines.push({ type: 'add', newLineNum, content: newLines[j] });
        j++;
        newLineNum++;
        added++;
      } else {
        break;
      }
    }
  }

  return { diffLines, added, deleted };
}

export function ExecutionHistoryModal({ capabilityName, onClose }: ExecutionHistoryModalProps) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(0);
  const [viewTab, setViewTab] = useState<Record<number, 'logs' | 'diff'>>({});
  const [globalDiffMode, setGlobalDiffMode] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        let response = await fetch(`/api/routines/${encodeURIComponent(capabilityName)}/history`);
        if (!response.ok) {
          response = await fetch(`/api/capability-logs/${encodeURIComponent(capabilityName)}`);
        }
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const data = await response.json();
          const sorted = (Array.isArray(data) ? data : []).sort((a: ExecutionLog, b: ExecutionLog) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setLogs(sorted);
        }
      } catch (err) {
        console.error("Failed to fetch execution history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [capabilityName]);

  const toggleExpand = (index: number) => {
    setExpandedLogIndex(expandedLogIndex === index ? null : index);
  };

  const getLogTab = (index: number) => {
    return viewTab[index] || (globalDiffMode ? 'diff' : 'logs');
  };

  const setLogTab = (index: number, tab: 'logs' | 'diff') => {
    setViewTab(prev => ({ ...prev, [index]: tab }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-theme-card border border-theme-border rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-theme-border flex items-center justify-between bg-theme-sidebar/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Activity size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-theme-text-primary tracking-tight">Execution & Diff History</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Self-Dev Capability
                </span>
              </div>
              <p className="text-xs text-theme-text-secondary mt-0.5 font-mono">Capability: <span className="text-indigo-400 font-semibold">{capabilityName}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setGlobalDiffMode(!globalDiffMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                globalDiffMode 
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-sm' 
                  : 'bg-theme-sidebar border-theme-border text-theme-text-muted hover:text-theme-text-primary'
              }`}
              title="Toggle Diff View for all executions"
            >
              <GitCompare size={14} />
              <span>{globalDiffMode ? 'Diff Mode Active' : 'Show Code Diffs'}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-theme-btn-hover rounded-xl text-theme-text-muted transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-theme-text-secondary">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-xs font-mono">Retrieving cognitive capability logs and diff snapshots...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center bg-theme-sidebar/20 border border-dashed border-theme-border rounded-2xl">
              <Terminal size={40} className="mx-auto text-theme-text-muted/40 mb-3" />
              <p className="text-sm font-semibold text-theme-text-primary">No execution history found</p>
              <p className="text-xs text-theme-text-secondary mt-1">This capability hasn't recorded an execution log yet.</p>
            </div>
          ) : (
            logs.map((log, index) => {
              const isSuccess = log.result?.status === 'success' || log.result?.success !== false;
              const isExpanded = expandedLogIndex === index;
              const activeTab = getLogTab(index);

              // Determine current code vs previous code for diff view
              const currentCode = String(log.args?.codeSnippet || log.result?.codeSnippet || log.args?.code || '');
              const prevLog = logs[index + 1];
              const previousCode = String(log.result?.previousCodeSnippet || prevLog?.args?.codeSnippet || prevLog?.result?.codeSnippet || '');

              const { diffLines, added, deleted } = computeCodeDiff(previousCode, currentCode);
              
              return (
                <div 
                  key={index} 
                  className={`border rounded-xl transition-all overflow-hidden ${
                    isExpanded ? 'bg-theme-bg/80 border-theme-border shadow-lg' : 'bg-theme-sidebar/40 border-theme-border/50 hover:border-theme-border'
                  }`}
                >
                  <div 
                    onClick={() => toggleExpand(index)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold uppercase tracking-wider ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isSuccess ? 'Execution Success' : 'Execution Error'}
                          </span>
                          <span className="text-[10px] text-theme-text-muted">•</span>
                          <span className="text-[10px] font-mono text-theme-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(log.timestamp).toLocaleString()}
                          </span>

                          {/* Code Diff Badge */}
                          {(added > 0 || deleted > 0) && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-700">
                              <span className="text-emerald-400">+{added}</span>
                              <span className="text-red-400">-{deleted}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-theme-text-primary mt-1 font-medium truncate">
                          {log.result?.message || (isSuccess ? 'Capability executed cleanly' : 'Execution encountered issue')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-theme-text-muted">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-4 pb-4 border-t border-theme-border/50 bg-neutral-950/40">
                          {/* Inner Tabs Header */}
                          <div className="flex items-center justify-between my-3 pt-1 border-b border-theme-border/30 pb-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => setLogTab(index, 'logs')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  activeTab === 'logs'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                                }`}
                              >
                                <Terminal size={12} /> Execution Logs
                              </button>
                              <button
                                onClick={() => setLogTab(index, 'diff')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  activeTab === 'diff'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                                }`}
                              >
                                <GitCompare size={12} /> Diff View
                                {(added > 0 || deleted > 0) && (
                                  <span className="ml-1 text-[9px] font-mono px-1.5 py-0.2 bg-black/40 rounded">
                                    +{added}/-{deleted}
                                  </span>
                                )}
                              </button>
                            </div>

                            <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">
                              Log ID: #{index + 1}
                            </span>
                          </div>

                          {/* Tab Content 1: Execution Stream & Call Args */}
                          {activeTab === 'logs' ? (
                            <div className="space-y-4">
                              {/* Call Arguments */}
                              <div>
                                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <Code2 size={11} /> Invocation Payload
                                </div>
                                <pre className="text-[11px] font-mono p-3 bg-neutral-900 border border-theme-border/50 rounded-lg text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-40">
                                  {JSON.stringify(log.args, null, 2)}
                                </pre>
                              </div>

                              {/* Console Output Stream */}
                              <div>
                                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <Activity size={11} /> Execution Output Stream
                                </div>
                                <div className="space-y-1 font-mono text-[11px] p-3 bg-neutral-900 border border-theme-border/50 rounded-lg max-h-56 overflow-y-auto text-left">
                                  {log.result?.logs && Array.isArray(log.result.logs) && log.result.logs.length > 0 ? (
                                    log.result.logs.map((line: any, i: number) => {
                                      const l = String(line || '');
                                      return (
                                        <div key={i} className={`whitespace-pre-wrap ${
                                          l.includes('OPTIMIZED') || l.includes('Success') || l.includes('success') ? 'text-emerald-400' : 
                                          l.includes('WARN') || l.includes('warning') ? 'text-amber-400' : 
                                          l.includes('ERROR') || l.includes('error') ? 'text-red-400' : 'text-neutral-300'
                                        }`}>
                                          {l}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-neutral-500 italic text-[11px]">No stdout/stderr stream captured for this execution step.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Tab Content 2: Diff View */
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                                <div className="flex items-center gap-2">
                                  <FileCode2 size={13} className="text-indigo-400" />
                                  <span>Code Changes vs Baseline</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-emerald-400 font-bold">+{added} additions</span>
                                  <span className="text-red-400 font-bold">-{deleted} deletions</span>
                                </div>
                              </div>

                              <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950 font-mono text-[11px] max-h-96 overflow-y-auto custom-scrollbar">
                                {diffLines.length === 0 ? (
                                  <div className="p-6 text-center text-neutral-500 italic">
                                    No code snippet defined or no changes detected in this step.
                                  </div>
                                ) : (
                                  diffLines.map((line, lineIdx) => {
                                    let bg = 'hover:bg-neutral-900/50 text-neutral-300';
                                    let prefix = ' ';
                                    let indicatorColor = 'text-neutral-600';

                                    if (line.type === 'add') {
                                      bg = 'bg-emerald-950/40 text-emerald-200 border-l-2 border-emerald-500';
                                      prefix = '+';
                                      indicatorColor = 'text-emerald-400 font-bold';
                                    } else if (line.type === 'delete') {
                                      bg = 'bg-red-950/40 text-red-300 border-l-2 border-red-500';
                                      prefix = '-';
                                      indicatorColor = 'text-red-400 font-bold';
                                    }

                                    return (
                                      <div key={lineIdx} className={`flex items-start px-3 py-1 font-mono transition-colors ${bg}`}>
                                        <div className="w-8 text-right text-neutral-600 select-none pr-3 flex-shrink-0 text-[10px]">
                                          {line.oldLineNum || ''}
                                        </div>
                                        <div className="w-8 text-right text-neutral-600 select-none pr-3 flex-shrink-0 text-[10px]">
                                          {line.newLineNum || ''}
                                        </div>
                                        <div className={`w-4 select-none ${indicatorColor} flex-shrink-0`}>
                                          {prefix}
                                        </div>
                                        <div className="flex-1 whitespace-pre-wrap break-all pr-2">
                                          {line.content}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-theme-border bg-theme-sidebar/40 flex justify-between items-center">
          <p className="text-[11px] text-theme-text-muted font-mono">
            Total historical logs: <span className="text-indigo-400 font-bold">{logs.length}</span>
          </p>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-primary rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-theme-border"
          >
            Close History Viewer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

