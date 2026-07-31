import React, { useState, useEffect } from 'react';
import { Sparkles, GitBranch, CheckCircle2, XCircle } from 'lucide-react';

export function SyncDashboard({ userEmail = '', userGithub = '' }: { userEmail?: string; userGithub?: string }) {
  const [models, setModels] = useState<any>(null);
  const [github, setGithub] = useState<any>(null);

  const load = async () => {
    try { const r = await fetch('/api/models'); if (r.ok) setModels(await r.json()); } catch {}
    try { const r = await fetch('/api/github/updates'); if (r.ok) setGithub(await r.json()); } catch {}
  };
  useEffect(() => { load(); }, []);

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
    </div>
  );
}
