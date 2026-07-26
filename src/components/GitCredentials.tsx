import React, { useState, useEffect } from 'react';
import { GitBranch, Save, ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { PasteInput } from './PasteInput';
import { toast } from './Toast';

export function GitCredentials() {
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<null | { ok: boolean; msg: string }>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/env/config');
      if (r.ok) {
        const d = await r.json();
        const found = (d.envVars || []).find((v: any) => v.key === 'GITHUB_PAT');
        setPat(found?.value || '');
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/env/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envs: [{ key: 'GITHUB_PAT', value: pat.trim() }] })
      });
      const d = await r.json();
      if (r.ok) toast.success('GITHUB_PAT disimpan ke .env'); else toast.error(d.error || 'Gagal simpan');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const doTest = async () => {
    setTesting(true); setTest(null);
    try {
      const r = await fetch('/api/github/updates');
      const d = await r.json();
      if (r.ok && d.repo && d.repo !== 'unknown') {
        setTest({ ok: true, msg: `Token valid — repo: ${d.repo}, remote: ${d.remoteHead || '—'}` });
        toast.success('GitHub PAT valid');
      } else {
        setTest({ ok: false, msg: 'Token tidak valid / tak bisa akses repo' });
        toast.error('PAT gagal verifikasi');
      }
    } catch (e: any) { setTest({ ok: false, msg: e.message }); toast.error(e.message); }
    setTesting(false);
  };

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch size={16} className="text-indigo-400" />
        <h3 className="text-sm font-bold text-theme-text-primary">Git — GitHub PAT</h3>
        <span className="ml-auto text-[9px] text-theme-text-muted font-mono">untuk push/pull & tool git</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-theme-text-muted"><Loader2 size={14} className="animate-spin" /> Memuat…</div>
      ) : (
        <div className="space-y-3">
          <PasteInput label="GitHub Personal Access Token (PAT)" value={pat} onChange={setPat} type="password" placeholder="ghp_... atau github_pat_..." />
          <p className="text-[10px] text-theme-text-muted leading-relaxed flex items-start gap-1.5">
            <ShieldCheck size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            Disimpan di <code>.env</code> server (tak dikirim ke mana pun). Tool <code>git</code> &amp; tombol Push pakai token ini.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white text-xs font-bold rounded-lg cursor-pointer">
              <Save size={13} />{saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button onClick={doTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-primary border border-theme-border text-xs font-bold rounded-lg cursor-pointer">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {testing ? 'Menguji…' : 'Tes Token'}
            </button>
          </div>
          {test && (
            <div className={`text-[10px] font-mono p-2.5 rounded-lg border flex items-start gap-2 ${test.ok ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-red-500/10 border-red-500/25 text-red-300'}`}>
              {test.ok ? <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" /> : <XCircle size={13} className="mt-0.5 flex-shrink-0" />}
              <pre className="whitespace-pre-wrap break-words flex-1">{test.msg}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
