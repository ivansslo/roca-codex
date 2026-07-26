import React, { useState, useEffect } from 'react';
import { Sparkles, GitBranch, RefreshCw, Bot, CheckCircle2, XCircle, Cloud, HardDrive } from 'lucide-react';

interface SyncedApp { id: string; name: string; status: string; url?: string; filesCount?: number; lastSyncedAt?: string; }

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
          <p className="font-bold text-amber-300 mb-0.5">Integrasi eksternal non-inti telah dihapus</p>
          Build ini hanya menyimpan integrasi yang nyata (AI provider, GitHub, workspace apps, memories).
          Integrasi mock (Snowflake, Neon, Harness, Zapier, Clerk, Backboard, Honcho, Grafana, Jules, Qwen, Aperture, SSH, Tailscale, OCI status) sengaja dibuang karena hanya mengembalikan data palsu — mengisi .env untuk layanan tersebut <strong>tidak</strong> mengaktifkannya kembali.
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
          <Row k="Repo" v={github?.repo || '—'} />
          <Row k="Local" v={github?.localHead || '—'} />
          <Row k="Remote" v={github?.remoteHead || '—'} />
          <div className="mt-2">
            {github?.hasUpdates
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">Ada update baru</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">Tersinkron</span>}
          </div>
        </Card>


        {/* Account */}
        <Card title="Akun" icon={CheckCircle2} ok={!!userEmail || !!userGithub}>
          <Row k="Email" v={userEmail || '—'} />
          <Row k="GitHub" v={userGithub || '—'} />
        </Card>
      </div>

      {/* Workspace synced apps */}
      <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} className="text-indigo-400" />
          <span className="text-sm font-bold text-theme-text-primary">Workspace Apps</span>
        </div>
        {apps.length === 0 ? (
          <p className="text-xs text-theme-text-muted italic">Tidak ada app terdaftar.</p>
        ) : (
          <div className="space-y-2">
            {apps.map(a => (
              <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-theme-input/60 border border-theme-border">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-theme-text-primary truncate">{a.name}</p>
                  <p className="text-[10px] text-theme-text-muted font-mono truncate">{a.url || a.id} · {a.filesCount ?? 0} file</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${a.status === 'synced' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-slate-500/15 text-slate-300 border border-slate-500/25'}`}>{a.status}</span>
                  <button onClick={() => syncApp(a.id)} disabled={syncingId === a.id} className="p-1.5 rounded-lg border border-theme-border bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary cursor-pointer disabled:opacity-50" title="Sync">
                    <RefreshCw size={12} className={syncingId === a.id ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
