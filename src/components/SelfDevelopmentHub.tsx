import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LineChart, Line, Tooltip, CartesianGrid } from 'recharts';
import {
  Sparkles, Settings, Terminal as TerminalIcon, Plus, Edit2, X, Search, Copy, Clock, Folder,
  HardDrive, Activity, BarChart2, FileDown, Upload, ShieldCheck, TrendingUp, CheckCircle2,
  Globe, Brain, Target, Pin, GitBranch, Link2, AlertTriangle, Info, RefreshCw
} from 'lucide-react';
import { ExecutionHistoryModal } from './ExecutionHistoryModal';

interface SelfDevelopmentHubProps {
  isPro: boolean;
  userEmail: string;
  activeSessionId: string;
  autoSaveMemoryEnabled: boolean;
  autoSaveCapEnabled: boolean;
  setAutoSaveMemoryEnabled: (v: boolean) => void;
  setAutoSaveCapEnabled: (v: boolean) => void;
}

export function SelfDevelopmentHub({
  isPro, userEmail, activeSessionId,
  autoSaveMemoryEnabled, autoSaveCapEnabled, setAutoSaveMemoryEnabled, setAutoSaveCapEnabled
}: SelfDevelopmentHubProps) {
  // ---- State owned by the hub ----
  const [memories, setMemories] = useState<any[]>([]);
  const [memSearchQuery, setMemSearchQuery] = useState('');
  const [memFilterCat, setMemFilterCat] = useState('all');
  const [memSortMode, setMemSortMode] = useState<'newest' | 'oldest' | 'alphabetical'>('newest');
  const [newMemoryKey, setNewMemoryKey] = useState('');
  const [newMemoryVal, setNewMemoryVal] = useState('');
  const [newMemoryCat, setNewMemoryCat] = useState('general');

  const [selfCapabilities, setSelfCapabilities] = useState<any[]>([]);
  const [newCapName, setNewCapName] = useState('NewRoutine');
  const [newCapSnippet, setNewCapSnippet] = useState(`// New System Routine\nconsole.log("Executing custom routine...");`);
  const [newCapPurpose, setNewCapPurpose] = useState('Automated optimization routine');
  const [newCapCat, setNewCapCat] = useState('SystemOptimization');
  const [capSearchQuery, setCapSearchQuery] = useState('');
  const [executingCapId, setExecutingCapId] = useState<string | null>(null);
  const [historyModalCap, setHistoryModalCap] = useState<string | null>(null);
  const [capLogs, setCapLogs] = useState<string[]>([]);
  const [copiedCapId, setCopiedCapId] = useState<string | null>(null);

  const [capViewMode, setCapViewMode] = useState<'memories' | 'routines' | 'performance' | 'websearch'>('routines');
  const [performanceSubView, setPerformanceSubView] = useState<'metrics' | 'dependencies'>('metrics');
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);
  const [capabilityExecutionLogs, setCapabilityExecutionLogs] = useState<Record<string, any[]>>({});

  const [webSearchQuery, setWebSearchQuery] = useState('Optimasi modul belajar mandiri otomatis');
  const [webSearchDepth, setWebSearchDepth] = useState<'quick' | 'standard' | 'deep'>('deep');
  const [webSearchCategory, setWebSearchCategory] = useState('tech');
  const [webSearchLoading, setWebSearchLoading] = useState(false);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);

  const [lastBackupDate, setLastBackupDate] = useState<string>(() => localStorage.getItem('ROC_LAST_DAILY_BACKUP_DATE') || '');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => localStorage.getItem('ROC_AUTO_BACKUP_ENABLED') !== 'false');
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Fetchers ----
  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories');
      if (res.ok) setMemories(Array.isArray(await res.json()) ? await res.clone().json() : []);
    } catch {}
  };
  const fetchLogsForCapability = async (capName: string) => {
    try {
      const res = await fetch(`/api/capability-logs/${encodeURIComponent(capName)}`);
      if (res.ok) {
        const logs = await res.json();
        setCapabilityExecutionLogs(prev => ({ ...prev, [capName]: Array.isArray(logs) ? logs : [] }));
      }
    } catch {}
  };
  const fetchSelfCapabilities = async () => {
    try {
      const res = await fetch('/api/self-capabilities');
      if (res.ok) {
        const data = await res.json();
        const safe = Array.isArray(data) ? data : [];
        setSelfCapabilities(safe);
        safe.forEach((c: any) => c?.name && fetchLogsForCapability(c.name));
      }
    } catch {}
  };

  useEffect(() => { fetchMemories(); fetchSelfCapabilities(); }, []);

  // ---- Handlers ----
  const handleSaveMemory = async () => {
    if (!newMemoryKey.trim() || !newMemoryVal.trim()) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newMemoryKey, value: newMemoryVal, category: newMemoryCat })
      });
      if (res.ok) { fetchMemories(); setNewMemoryKey(''); setNewMemoryVal(''); }
    } catch {}
  };
  const handleDeleteMemory = async (key: string) => {
    try { const r = await fetch(`/api/memories/${encodeURIComponent(key)}`, { method: 'DELETE' }); if (r.ok) fetchMemories(); } catch {}
  };
  const handleCopySnippet = (s: string, id: string) => {
    navigator.clipboard.writeText(s).then(() => { setCopiedCapId(id); setTimeout(() => setCopiedCapId(null), 2000); }).catch(() => {});
  };
  const handleTogglePinCapability = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/self-capabilities/${id}/pin`, { method: 'PATCH' });
      if (res.ok) { const d = await res.json(); setSelfCapabilities(prev => prev.map(c => c.id === id ? { ...c, isPinned: d.isPinned } : c)); }
    } catch {}
  };
  const handleSaveDependencies = async (id: string, dependencies: string[]) => {
    try {
      const res = await fetch(`/api/self-capabilities/${id}/dependencies`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencies })
      });
      if (res.ok) setSelfCapabilities(prev => prev.map(c => c.id === id ? { ...c, dependencies } : c));
    } catch {}
  };
  const handleExecuteWebSearch = async () => {
    if (!webSearchQuery.trim()) return;
    setWebSearchLoading(true); setWebSearchError(null);
    try {
      const res = await fetch('/api/web-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: webSearchQuery, depth: webSearchDepth, category: webSearchCategory })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') setWebSearchError(data.error || data.message || 'Pencarian web gagal.');
    } catch (err: any) { setWebSearchError(err?.message || 'Koneksi terputus.'); }
    finally { setWebSearchLoading(false); }
  };
  const handleExecuteCapability = async (name: string, id: string) => {
    setExecutingCapId(id); setCapLogs([`[INIT] Querying self-development block...`]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', text: `Execute the self-development capability named "${name}"` }] })
      });
      const data = await res.json();
      if (res.ok && data.logs) setCapLogs(data.logs);
      else setCapLogs(prev => [...prev, `[ERROR] Failed to compile capability elements.`]);
    } catch (err: any) { setCapLogs(prev => [...prev, `[ERROR] System fault: ${err.message}`]); }
    finally { setExecutingCapId(null); }
  };
  const archiveLogs = async () => {
    if (capLogs.length === 0) return;
    const content = capLogs.join('\n');
    const filename = `logs/execution_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    try {
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, content, isText: true, sessionId: activeSessionId || '' }) });
      if (!r.ok) throw new Error('Failed'); alert(`Logs diarsipkan ke ${filename}`);
    } catch (e: any) { alert(`Arsip gagal: ${e.message}`); }
  };
  const triggerLocalBackupDownload = (isAuto = false) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const payload = { version: "1.0", backupType: isAuto ? "Automated Daily" : "Manual", backupDate: todayStr, timestamp: new Date().toISOString(), data: { memories: memories || [], selfCapabilities: selfCapabilities || [], capabilityExecutionLogs } };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `roc_backup_${todayStr}.json`; a.click(); URL.revokeObjectURL(url);
    localStorage.setItem('ROC_LAST_DAILY_BACKUP_DATE', todayStr); setLastBackupDate(todayStr);
    setBackupNotice(`Backup tersimpan (${todayStr})`); setTimeout(() => setBackupNotice(null), 6000);
  };
  const handleImportBackupJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string); const data = parsed.data || parsed; let n = 0;
        if (Array.isArray(data.memories)) { for (const m of data.memories) if (m.key && m.value) { await fetch('/api/memories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: m.key, value: m.value, category: m.category || 'Restored' }) }); n++; } await fetchMemories(); }
        if (Array.isArray(data.selfCapabilities)) { for (const c of data.selfCapabilities) if (c.name && c.codeSnippet) await fetch('/api/self-capabilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: c.name, codeSnippet: c.codeSnippet, purpose: c.purpose || 'Restored', category: c.category || 'Restored' }) }); await fetchSelfCapabilities(); }
        alert(`Backup direstore (${n} memory).`);
      } catch (err: any) { alert(`Gagal parse: ${err.message}`); }
    };
    reader.readAsText(file); if (e.target) e.target.value = '';
  };

  // ---- Auto-save effects (gated by shared toggles) ----
  useEffect(() => {
    if (!autoSaveMemoryEnabled || !newMemoryKey.trim() || !newMemoryVal.trim() || newMemoryVal.length < 10) return;
    const h = setTimeout(() => {
      fetch('/api/memories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: newMemoryKey, value: newMemoryVal, category: newMemoryCat }) })
        .then(r => r.ok && fetchMemories()).catch(() => {});
    }, 2000);
    return () => clearTimeout(h);
  }, [newMemoryKey, newMemoryVal, newMemoryCat, autoSaveMemoryEnabled]);

  useEffect(() => {
    if (!autoSaveCapEnabled || !newCapName.trim() || !newCapSnippet.trim() || newCapSnippet.length < 20) return;
    const h = setTimeout(() => {
      fetch('/api/self-capabilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCapName, codeSnippet: newCapSnippet, purpose: newCapPurpose, category: newCapCat }) })
        .then(async r => { if (r.ok) { const d = await r.json().catch(() => ({})); await fetchSelfCapabilities(); if (isPro && d.id) handleExecuteCapability(newCapName, d.id); } }).catch(() => {});
    }, 2500);
    return () => clearTimeout(h);
  }, [newCapName, newCapSnippet, newCapPurpose, newCapCat, autoSaveCapEnabled, isPro]);

  useEffect(() => {
    if (!autoBackupEnabled) return;
    const today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('ROC_LAST_DAILY_BACKUP_DATE') !== today && ((memories?.length || 0) > 0 || (selfCapabilities?.length || 0) > 0)) {
      const t = setTimeout(() => triggerLocalBackupDownload(true), 3000);
      return () => clearTimeout(t);
    }
  }, [memories, selfCapabilities, autoBackupEnabled]);

  useEffect(() => { if (webSearchError) { const t = setTimeout(() => setWebSearchError(null), 6000); return () => clearTimeout(t); } }, [webSearchError]);

  // ---- Derived ----
  const processedMemories = memories.filter(m => {
    const q = memSearchQuery.trim().toLowerCase();
    const ms = !q || String(m.key || '').toLowerCase().includes(q) || String(m.value || '').toLowerCase().includes(q) || String(m.category || '').toLowerCase().includes(q);
    const mc = memFilterCat === 'all' || String(m.category || '').toLowerCase() === memFilterCat.toLowerCase();
    return ms && mc;
  }).sort((a, b) => {
    if (memSortMode === 'alphabetical') return String(a.key || '').localeCompare(String(b.key || ''));
    const ta = new Date(a.updated_at || a.timestamp || 0).getTime(); const tb = new Date(b.updated_at || b.timestamp || 0).getTime();
    return memSortMode === 'newest' ? tb - ta : ta - tb;
  });

  const filteredCapabilities = selfCapabilities.filter(c => {
    const q = (capSearchQuery || '').trim().toLowerCase(); if (!q) return true;
    return String(c.name || '').toLowerCase().includes(q) || String(c.purpose || '').toLowerCase().includes(q) || String(c.category || '').toLowerCase().includes(q);
  }).sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  const getRoutinePerformanceStats = (capName: string) => {
    const logs = capabilityExecutionLogs[capName] || []; const total = logs.length;
    if (total === 0) return { total: 0, successes: 0, failures: 0, rate: 100, avgTime: 0, status: 'Untested' };
    const successes = logs.filter((l: any) => l.result?.status === 'success' || !l.result?.error).length;
    const failures = total - successes; const rate = Math.round((successes / total) * 100);
    const times = logs.map((l: any) => l.timeMs || 0).filter(Boolean);
    const avgTime = times.length ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : 110;
    return { total, successes, failures, rate, avgTime, status: rate >= 90 ? 'Optimal' : rate >= 60 ? 'Stable' : 'Needs Patch' };
  };

  return (
    <div className="border-t border-theme-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-theme-sidebar border border-theme-border p-2 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCapViewMode('routines')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${capViewMode === 'routines' ? 'bg-indigo-600 text-white shadow-xs' : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-btn-hover'}`}>
            <TerminalIcon size={14} /> Self-Development ({selfCapabilities.length})
          </button>
          <button type="button" onClick={() => setCapViewMode('performance')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${capViewMode === 'performance' ? 'bg-indigo-600 text-white shadow-xs' : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-btn-hover'}`}>
            <BarChart2 size={14} /> Intelligence & Capability Growth
          </button>
        </div>
      </div>

      <div className="pb-12 animate-fade-in">
        {isPro ? (
          <>
            {capViewMode === 'performance' ? (
              <div className="space-y-4 mb-6 animate-fade-in">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-theme-sidebar border border-theme-border p-3.5 rounded-xl">
                    <div className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider mb-1">Total Routines</div>
                    <div className="text-xl font-bold text-theme-text-primary">{selfCapabilities.length}</div>
                  </div>
                  <div className="bg-theme-sidebar border border-theme-border p-3.5 rounded-xl">
                    <div className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider mb-1">Success Rate</div>
                    <div className="text-xl font-bold text-emerald-400">{(() => { const all = Object.values(capabilityExecutionLogs).flat(); return all.length === 0 ? '100%' : `${Math.round(all.filter((l: any) => l.result?.status === 'success' || !l.result?.error).length / all.length * 100)}%`; })()}</div>
                  </div>
                  <div className="bg-theme-sidebar border border-theme-border p-3.5 rounded-xl">
                    <div className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider mb-1">Total Executions</div>
                    <div className="text-xl font-bold text-theme-text-primary">{Object.values(capabilityExecutionLogs).flat().length}</div>
                  </div>
                  <div className="bg-theme-sidebar border border-theme-border p-3.5 rounded-xl">
                    <div className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider mb-1">Avg Time</div>
                    <div className="text-xl font-bold text-indigo-400 font-mono">~115 ms</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-theme-sidebar border border-theme-border/60 p-1.5 rounded-xl mb-4">
                  <button type="button" onClick={() => setPerformanceSubView('metrics')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${performanceSubView === 'metrics' ? 'bg-indigo-600 text-white shadow-xs' : 'text-theme-text-muted hover:text-theme-text-primary'}`}><Activity size={13} /> Speed & Success</button>
                  <button type="button" onClick={() => setPerformanceSubView('dependencies')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${performanceSubView === 'dependencies' ? 'bg-indigo-600 text-white shadow-xs' : 'text-theme-text-muted hover:text-theme-text-primary'}`}><GitBranch size={13} /> Dependency Graph</button>
                </div>

                {performanceSubView === 'dependencies' ? (
                  <DependencyGraph capabilities={selfCapabilities} selectedDepId={selectedDepId} setSelectedDepId={setSelectedDepId} onSaveDependencies={handleSaveDependencies} />
                ) : (
                  <div className="bg-theme-sidebar border border-theme-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-theme-border pb-2.5">
                      <h4 className="font-bold text-xs text-theme-text-primary uppercase tracking-wider flex items-center gap-1.5"><Activity size={14} className="text-indigo-400" /> Success-Rate Summary</h4>
                    </div>
                    {selfCapabilities.length === 0 ? (
                      <p className="text-xs text-theme-text-muted italic py-6 text-center">Belum ada routine terdaftar.</p>
                    ) : (
                      <div className="space-y-3">
                        {[...selfCapabilities].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)).map((cap) => {
                          const stats = getRoutinePerformanceStats(cap.name);
                          return (
                            <div key={cap.id} className={`bg-theme-input/60 border rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${cap.isPinned ? 'border-amber-500/40 bg-amber-500/5' : 'border-theme-border/60'}`}>
                              <div className="flex-1 space-y-2 w-full">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-theme-text-primary">{cap.name}</span>
                                    {cap.isPinned && <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded uppercase flex items-center gap-1"><Pin size={9} className="fill-amber-400 text-amber-400" /> PINNED</span>}
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stats.status === 'Optimal' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : stats.status === 'Stable' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{stats.status}</span>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px] font-mono"><span className="text-theme-text-muted">Success:</span><span className="font-bold text-emerald-400">{stats.rate}% ({stats.successes}/{stats.total})</span></div>
                                  <div className="w-full bg-theme-sidebar h-2 rounded-full overflow-hidden border border-theme-border/40"><div className={`h-full ${stats.rate >= 90 ? 'bg-emerald-500' : stats.rate >= 60 ? 'bg-indigo-500' : 'bg-amber-500'}`} style={{ width: `${stats.rate}%` }} /></div>
                                </div>
                                {capabilityExecutionLogs[cap.name]?.length > 0 && (
                                  <div className="mt-2 bg-theme-sidebar/50 border border-theme-border/40 rounded-xl p-3 h-24">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={capabilityExecutionLogs[cap.name].slice(0, 20).reverse().map((log: any, i: number) => ({ name: `#${i + 1}`, duration: log.timeMs || 100 }))}>
                                        <Line type="monotone" dataKey="duration" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 2 }} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                              <div className="flex sm:flex-col gap-2 w-full sm:w-auto flex-shrink-0">
                                <button type="button" onClick={(e) => handleTogglePinCapability(cap.id, e)} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer ${cap.isPinned ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-theme-btn-active text-theme-text-secondary border-theme-border'}`}><Pin size={12} className={cap.isPinned ? "fill-amber-400 text-amber-400" : ""} />{cap.isPinned ? 'Unpin' : 'Pin'}</button>
                                <button type="button" disabled={executingCapId === cap.id} onClick={() => handleExecuteCapability(cap.name, cap.id)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer">{executingCapId === cap.id ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}Execute</button>
                                <button type="button" onClick={() => setHistoryModalCap(cap.name)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-theme-btn-active text-theme-text-secondary border border-theme-border text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer"><Clock size={12} />History</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {selfCapabilities.length > 0 && (
                  <div className="relative mb-4">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Search size={14} className="text-theme-text-muted" /></span>
                    <input type="text" placeholder="Search routines..." value={capSearchQuery} onChange={(e) => setCapSearchQuery(e.target.value)} className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg pl-9 pr-8 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" />
                    {capSearchQuery && <button onClick={() => setCapSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-theme-text-muted hover:text-theme-text-primary cursor-pointer"><X size={14} /></button>}
                  </div>
                )}
                <div className="space-y-4 mb-4">
                  {filteredCapabilities.length === 0 ? (
                    <p className="text-xs text-theme-text-muted italic bg-theme-sidebar p-3.5 rounded-lg border border-theme-border">Belum ada capability. Gunakan form di bawah untuk menambahkan.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredCapabilities.map((cap) => (
                        <div key={cap.id} className={`bg-theme-sidebar border p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4 transition-all ${cap.isPinned ? 'border-amber-500/50 bg-amber-500/5' : 'border-theme-border'}`}>
                          <div className="flex-1">
                            <h4 className="font-bold text-sm text-theme-text-primary flex items-center flex-wrap gap-2"><span>{cap.name}</span>{cap.isPinned && <span className="px-2 py-0.5 text-[9px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md uppercase flex items-center gap-1"><Pin size={10} className="fill-amber-400 text-amber-400" />PINNED</span>}</h4>
                            <p className="text-xs text-theme-text-secondary mt-1">{cap.purpose}</p>
                            <div className="relative mt-2 group/snippet">
                              <pre className="text-[10px] font-mono text-theme-text-muted bg-theme-input p-3.5 pr-10 rounded-lg border border-theme-border/50 max-h-24 overflow-y-auto w-full whitespace-pre-wrap">{cap.codeSnippet}</pre>
                              <button onClick={() => handleCopySnippet(cap.codeSnippet, cap.id)} className="absolute top-2 right-2 p-1.5 rounded-md bg-theme-sidebar border border-theme-border/60 text-theme-text-muted hover:text-theme-text-primary transition-colors cursor-pointer" title="Copy">{copiedCapId === cap.id ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}</button>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button onClick={(e) => handleTogglePinCapability(cap.id, e)} className={`flex items-center justify-center gap-1.5 border text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer ${cap.isPinned ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-theme-btn-active text-theme-text-secondary border-theme-border'}`}><Pin size={13} className={cap.isPinned ? "fill-amber-400 text-amber-400" : ""} />{cap.isPinned ? 'Unpin' : 'Pin'}</button>
                            <button disabled={executingCapId === cap.id} onClick={() => handleExecuteCapability(cap.name, cap.id)} className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer">{executingCapId === cap.id ? <><RefreshCw size={13} className="animate-spin" />Compiling...</> : <><Plus size={13} />Execute</>}</button>
                            <button onClick={() => setHistoryModalCap(cap.name)} className="flex items-center justify-center gap-1.5 bg-theme-btn-active text-theme-text-secondary border border-theme-border text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer"><Clock size={13} />History</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add routine form */}
                <div className="bg-theme-sidebar border border-theme-border p-4 rounded-xl space-y-3 mb-4">
                  <div className="text-xs font-bold text-theme-text-primary uppercase tracking-wider">Add Routine</div>
                  <input type="text" placeholder="Name" value={newCapName} onChange={(e) => setNewCapName(e.target.value)} className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs outline-none" />
                  <input type="text" placeholder="Purpose" value={newCapPurpose} onChange={(e) => setNewCapPurpose(e.target.value)} className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs outline-none" />
                  <textarea placeholder="Code snippet" value={newCapSnippet} onChange={(e) => setNewCapSnippet(e.target.value)} className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg p-3 text-xs outline-none h-20 resize-none font-mono" />
                </div>

                {capLogs.length > 0 && (
                  <div className="bg-neutral-950 border border-theme-border rounded-xl p-4 mb-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-theme-border/60 pb-2 mb-3">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Output</span>
                      <div className="flex gap-2"><button onClick={() => setCapLogs([])} className="text-neutral-500 hover:text-white text-[10px]">Clear</button><button onClick={archiveLogs} className="text-neutral-500 hover:text-indigo-400 text-[10px]">Archive</button></div>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">{capLogs.map((log, i) => <div key={i} className={`whitespace-pre-wrap ${String(log).includes('[ERROR]') ? 'text-red-400' : String(log).includes('[INIT]') ? 'text-indigo-400' : 'text-neutral-300'}`}>{String(log)}</div>)}</div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="bg-theme-sidebar/45 border-2 border-dashed border-theme-border p-8 rounded-2xl text-center space-y-4 max-w-2xl mx-auto my-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20 text-lg">🔒</div>
            <div>
              <h4 className="font-bold text-sm text-theme-text-primary">Self-Development Module Locked</h4>
              <p className="text-xs text-theme-text-secondary mt-1 max-w-md mx-auto leading-relaxed">Modul ini hanya untuk akun owner terverifikasi ({userEmail}).</p>
            </div>
          </div>
        )}
      </div>

      {/* Memories & Backup (compact) */}
      <div className="border-t border-theme-border pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-theme-text-primary flex items-center gap-2"><ShieldCheck size={16} className="text-indigo-400" /> Memories & Backup</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => triggerLocalBackupDownload(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer"><FileDown size={14} />Backup</button>
            <button type="button" onClick={() => backupFileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-btn-active text-theme-text-primary border border-theme-border text-xs font-semibold rounded-lg cursor-pointer"><Upload size={14} />Import</button>
            <input type="file" ref={backupFileInputRef} accept=".json" onChange={handleImportBackupJSON} className="hidden" />
          </div>
        </div>
        {backupNotice && <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 px-3 py-2 rounded-xl text-xs flex items-center justify-between"><span className="flex items-center gap-1.5"><CheckCircle2 size={14} />{backupNotice}</span><button onClick={() => setBackupNotice(null)}><X size={13} /></button></div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="text" placeholder="Key" value={newMemoryKey} onChange={(e) => setNewMemoryKey(e.target.value)} className="bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs outline-none" />
          <input type="text" placeholder="Category" value={newMemoryCat} onChange={(e) => setNewMemoryCat(e.target.value)} className="bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs outline-none" />
          <button onClick={handleSaveMemory} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs py-2 cursor-pointer">Save Memory</button>
        </div>
        <textarea placeholder="Memory details..." value={newMemoryVal} onChange={(e) => setNewMemoryVal(e.target.value)} className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg p-3 text-xs outline-none h-16 resize-none" />
        {memories.length === 0 ? (
          <p className="text-xs text-theme-text-muted italic">Belum ada memory.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {processedMemories.map((m) => (
              <div key={m.key} className="bg-theme-sidebar border border-theme-border p-3 rounded-xl relative group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-indigo-400 font-mono">[{m.category}] {m.key}</span>
                  <button onClick={() => handleDeleteMemory(m.key)} className="text-theme-text-muted hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 cursor-pointer"><X size={12} /></button>
                </div>
                <p className="text-xs text-theme-text-primary whitespace-pre-wrap">{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {historyModalCap && <ExecutionHistoryModal capabilityName={historyModalCap} onClose={() => setHistoryModalCap(null)} />}
    </div>
  );
}

// ---- Dependency Graph sub-component ----
function DependencyGraph({ capabilities, selectedDepId, setSelectedDepId, onSaveDependencies }: {
  capabilities: any[]; selectedDepId: string | null; setSelectedDepId: (id: string | null) => void; onSaveDependencies: (id: string, deps: string[]) => void;
}) {
  if (capabilities.length === 0) {
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl p-8 text-center">
        <GitBranch size={28} className="mx-auto text-theme-text-muted mb-2" />
        <p className="text-xs text-theme-text-muted">No routines to map.</p>
      </div>
    );
  }
  const levels: Record<string, number> = {}; capabilities.forEach(c => { levels[c.id] = 0; });
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    capabilities.forEach(c => { (c.dependencies || []).forEach((d: string) => { const dn = capabilities.find(x => x.name === d); if (dn && levels[c.id] <= levels[dn.id]) { levels[c.id] = levels[dn.id] + 1; changed = true; } }); });
    if (!changed) break;
  }
  const columns: Record<number, string[]> = {}; capabilities.forEach(c => { const l = levels[c.id] || 0; (columns[l] = columns[l] || []).push(c.id); });
  const maxLvl = Math.max(...Object.keys(columns).map(Number), 0) || 1;
  const W = 500, H = 360, pX = 70, pY = 40;
  const pos: Record<string, { x: number; y: number; level: number }> = {};
  Object.entries(columns).forEach(([ls, ids]) => { const l = Number(ls); const x = pX + (l / maxLvl) * (W - 2 * pX); ids.forEach((id, i) => { const y = pY + (ids.length > 1 ? (i / (ids.length - 1)) * (H - 2 * pY) : H / 2); pos[id] = { x, y, level: l }; }); });

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-xl p-4 h-[420px] relative overflow-hidden">
      <div className="font-bold text-xs text-theme-text-primary uppercase tracking-wider flex items-center gap-1.5 mb-3"><GitBranch size={14} className="text-indigo-400" /> Workflow Dependencies</div>
      <div className="flex-1 relative bg-theme-bg/50 border border-theme-border/40 rounded-xl overflow-hidden h-[340px]">
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs><marker id="dep-arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" /></marker></defs>
          {capabilities.map(c => (c.dependencies || []).map((dn: string) => {
            const s = capabilities.find(x => x.name === dn); if (!s || !pos[s.id] || !pos[c.id]) return null;
            return <path key={`${s.id}-${c.id}`} d={`M ${pos[s.id].x} ${pos[s.id].y} C ${pos[s.id].x + 60} ${pos[s.id].y}, ${pos[c.id].x - 60} ${pos[c.id].y}, ${pos[c.id].x} ${pos[c.id].y}`} stroke={selectedDepId && (selectedDepId === c.id || selectedDepId === s.id) ? "#10b981" : "#312e81"} strokeWidth={selectedDepId && (selectedDepId === c.id || selectedDepId === s.id) ? 2.5 : 1.5} fill="none" markerEnd="url(#dep-arrow)" />;
          }))}
        </svg>
        {capabilities.map(c => {
          const p = pos[c.id]; if (!p) return null;
          const sel = selectedDepId === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setSelectedDepId(sel ? null : c.id)} style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }} className={`absolute -translate-x-1/2 -translate-y-1/2 border px-3 py-2 rounded-xl text-left shadow-md cursor-pointer max-w-[140px] ${sel ? 'border-indigo-500 bg-indigo-950/25 ring-2 ring-indigo-500/30' : 'border-theme-border bg-theme-sidebar hover:border-indigo-500/80'}`}>
              <div className="font-bold text-[10px] text-theme-text-primary truncate">{c.name}</div>
              <div className="text-[8px] text-theme-text-muted truncate">{c.purpose || '—'}</div>
            </button>
          );
        })}
      </div>
      {selectedDepId && (() => {
        const cap = capabilities.find(c => c.id === selectedDepId); if (!cap) return null;
        const explicitDeps = cap.dependencies || [];
        return (
          <div className="absolute bottom-3 right-3 bg-theme-sidebar border border-theme-border rounded-xl p-3 w-56 max-h-[300px] overflow-y-auto">
            <div className="text-[10px] font-bold text-theme-text-primary mb-2">Rely On — {cap.name}</div>
            {capabilities.filter(o => o.id !== cap.id).map(o => {
              const linked = explicitDeps.includes(o.name);
              return (
                <label key={o.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" checked={linked} onChange={() => onSaveDependencies(cap.id, linked ? explicitDeps.filter((n: string) => n !== o.name) : [...explicitDeps, o.name])} className="text-indigo-600 w-3.5 h-3.5 cursor-pointer" />
                  <span className="text-[10px] text-theme-text-primary">{o.name}</span>
                </label>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
