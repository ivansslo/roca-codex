import React, { useState, useEffect } from 'react';
import { Sparkles, GitBranch, RefreshCw, Bot, CheckCircle2, XCircle, Cloud, HardDrive, ExternalLink, Download, FileCode } from 'lucide-react';

interface SyncedApp { id: string; name: string; status: string; url?: string; filesCount?: number; lastSyncedAt?: string; description?: string; }

export function SyncDashboard({ userEmail = '', userGithub = '' }: { userEmail?: string; userGithub?: string }) {
  const [models, setModels] = useState<any>(null);
  const [github, setGithub] = useState<any>(null);
  const [apps, setApps] = useState<SyncedApp[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    try { const r = await fetch('/api/models'); if (r.ok) setModels(await r.json()); } catch {}
    try { const r = await fetch('/api/github/updates'); if (r.ok) setGithub(await r.json()); } catch {}
    try { const r = await fetch('/api/synced-apps'); if (r.ok) setApps(await r.json()); } catch {}
  };
  useEffect(() => { load(); }, []);

  const syncApp = async (id: string) => {
    setSyncingId(id);
    try { await fetch(`/api/synced-apps/${id}/sync`, { method: 'POST' }); } catch {}
    setSyncingId(null); load();
  };

  const Card = ({ title, icon: Icon, ok, children }: any) => (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-indigo-400" />
        <span className="text-sm font-bold text-theme-text-primary">{title}</span>
        {ok === true && <CheckCircle2 size={14} className="text-emerald-400 ml-auto" />}
        {ok === false && <XCircle size={14} className="text-red-400 ml-auto" />}
      </div>
      {children}
    </div>
  );

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-theme-text-muted">{k}</span>
      <span className="font-mono text-theme-text-primary text-right truncate max-w-[60%]">{v}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Honest note about purged integrations */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3.5 text-xs text-amber-200/90 flex gap-2.5">
        <Cloud size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <p className="font-bold text-amber-300 mb-0.5">Ekosistem Synced Apps ROC</p>
          Workspace Apps tersinkronisasi langsung dengan repositori sumber <code className="text-indigo-300 font-mono">github.com/ivansslo/roc-webui</code> dan <code className="text-indigo-300 font-mono">github.com/ivansslo/roc-otoweb</code>. Paket <code className="font-mono text-emerald-300">roc-webui.zip</code> dan <code className="font-mono text-emerald-300">roc-otoweb.zip</code> diverifikasi langsung pada sistem.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI provider */}
        <Card title="AI Provider" icon={Sparkles} ok={!!models}>
          <Row k="Provider aktif" v={models?.active_provider || '—'} />
          <Row k="Model tersedia" v={`${models?.models?.length || 0} model`} />
          <p className="text-[10px] text-theme-text-muted mt-2 leading-relaxed">
            Aktifkan dengan mengisi <code className="text-indigo-300">.env</code>: GEMINI_API_KEY / GROQ_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY.
          </p>
        </Card>

        {/* GitHub */}
        <Card title="GitHub" icon={GitBranch} ok={github?.hasUpdates === false}>
          <Row k="Repo Utama" v={github?.repo || 'ivansslo/RocAgent'} />
          <Row k="Local Head" v={github?.localHead || '—'} />
          <Row k="Remote Head" v={github?.remoteHead || '—'} />
          <div className="mt-2">
            {github?.hasUpdates
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">Ada update baru</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">Tersinkron</span>}
          </div>
        </Card>

        {/* Account */}
        <Card title="Akun / Developer" icon={CheckCircle2} ok={!!userEmail || !!userGithub}>
          <Row k="Developer" v="ivansslo" />
                    <Row k="Repositori" v="ivansslo/RocAgent" />
        </Card>
      </div>

      {/* Workspace synced apps */}
      <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-theme-text-primary">Workspace Synced Apps</span>
          </div>
          <span className="text-[10px] text-theme-text-muted font-mono">{apps.length} apps active</span>
        </div>
        {apps.length === 0 ? (
          <p className="text-xs text-theme-text-muted italic">Tidak ada app terdaftar.</p>
        ) : (
          <div className="space-y-3">
            {apps.map(a => (
              <div key={a.id} className="p-3 rounded-xl bg-theme-input/60 border border-theme-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode size={16} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-theme-text-primary truncate">{a.name}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${a.status === 'synced' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-slate-500/15 text-slate-300 border border-slate-500/25'}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={() => syncApp(a.id)} 
                      disabled={syncingId === a.id} 
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-theme-border bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary cursor-pointer disabled:opacity-50 text-xs font-mono"
                      title="Sync application manifest & package"
                    >
                      <RefreshCw size={11} className={syncingId === a.id ? 'animate-spin' : ''} />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-theme-text-muted leading-relaxed font-sans">
                  {a.description || `Source app repository for ${a.id}.`}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-theme-border/50 text-[10px] font-mono text-theme-text-muted">
                  <div className="flex items-center gap-3">
                    <a 
                      href={a.url || `https://github.com/ivansslo/${a.id}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center gap-1 text-indigo-400 hover:underline"
                    >
                      <span>github.com/ivansslo/{a.id}</span>
                      <ExternalLink size={10} />
                    </a>
                    <span>·</span>
                    <span className="text-emerald-400 font-bold">{a.id}.zip package</span>
                  </div>
                  <span>{a.filesCount ?? 0} files</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
