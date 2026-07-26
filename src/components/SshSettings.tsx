import React, { useState, useEffect } from 'react';
import { Terminal, Save, Plug, CheckCircle2, XCircle, Loader2, Key, Copy } from 'lucide-react';
import { toast } from './Toast';
import { PasteInput } from './PasteInput';

export function SshSettings() {
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('8022');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('ubuntu');
  const [keyPath, setKeyPath] = useState('/storage/emulated/0/SshDaemon/ssh_host_rsa_key');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<null | { publicKey: string; keyPath: string; autoInstalled: boolean; autoInstallError: string }>(null);

  const generate = async () => {
    setGenerating(true); setGenResult(null);
    try {
      const r = await fetch('/api/ssh/generate-keys', { method: 'POST' });
      const d = await r.json();
      if (r.ok && d.success) {
        setKeyPath(d.keyPath);
        setPassword('');
        setGenResult({ publicKey: d.publicKey, keyPath: d.keyPath, autoInstalled: d.autoInstalled, autoInstallError: d.autoInstallError || '' });
        toast.success('Keypair digenerate');
      } else toast.error(d.error || 'Gagal generate');
    } catch (e: any) { toast.error(e.message); }
    setGenerating(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ssh/config');
      if (r.ok) {
        const d = await r.json();
        setHost(d.host || '127.0.0.1');
        setPort(d.port || '8022');
        setUser(d.user || '');
        setPassword(d.password || ''); // "***" if set
        setKeyPath(d.keyPath || '/storage/emulated/0/SshDaemon/ssh_host_rsa_key');
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/ssh/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, keyPath })
      });
      const d = await r.json();
      if (r.ok) toast.success('SSH config tersimpan'); else toast.error(d.error || 'Gagal simpan');
      load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/ssh/exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'echo SSH_OK; whoami; uname -a' })
      });
      const d = await r.json();
      if (r.ok && d.status === 'success') {
        setTestResult({ ok: true, msg: (d.stdout || '').slice(0, 160) });
        toast.success('SSH terhubung');
      } else {
        setTestResult({ ok: false, msg: d.error || d.stderr || 'Gagal konek' });
        toast.error(d.error || 'SSH gagal');
      }
    } catch (e: any) { setTestResult({ ok: false, msg: e.message }); toast.error(e.message); }
    setTesting(false);
  };

  const Field = ({ label, value, set, type = 'text', placeholder }: any) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">{label}</label>
      <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
        className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-mono" />
    </div>
  );

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={16} className="text-indigo-400" />
        <h3 className="text-sm font-bold text-theme-text-primary">SSH Daemon — Koneksi ke Device Lokal</h3>
        <span className="ml-auto text-[9px] text-theme-text-muted font-mono">jazzm0/ssh-daemon</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-theme-text-muted"><Loader2 size={14} className="animate-spin" /> Memuat…</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Host" value={host} set={setHost} placeholder="127.0.0.1" />
            <Field label="Port" value={port} set={setPort} placeholder="8022" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="User" value={user} set={setUser} placeholder="ubuntu" />
            <PasteInput label="Password" value={password} onChange={setPassword} type="password" placeholder="(pakai key jika kosong)" />
          </div>
          <PasteInput label="Path private key" value={keyPath} onChange={setKeyPath} placeholder="/storage/emulated/0/SshDaemon/ssh_host_rsa_key" />
          <p className="text-[10px] text-theme-text-muted leading-relaxed">
            Password & key dipakai alternatif: isi <strong>password</strong> untuk auth password, atau kosongkan & isi <strong>path key</strong> untuk auth key. Pastikan ssh-daemon aktif di device.
          </p>

          <details className="text-[10px] text-theme-text-muted border border-theme-border rounded-lg p-2.5 bg-theme-input/40">
            <summary className="cursor-pointer font-semibold text-theme-text-secondary">Bantuan CLI (opsional — tes manual via <code>ssh</code>)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-emerald-300/90 font-mono leading-relaxed">{`# 1. Load key ke agent (sekali per sesi Termux)
eval $(ssh-agent)
ssh-add ~/.ssh/rocagents_key

# 2. Tes konek manual
ssh -i ~/.ssh/rocagents_key -p 8022 ubuntu@127.0.0.1
# atau pakai password default:
ssh -p 8022 ubuntu@127.0.0.1   # password: ubuntu`}</pre>
            <p className="mt-1.5">Web app memakai koneksi sendiri (baca key/password langsung) — <strong>tidak perlu ssh-agent</strong>. Ini hanya untuk verifikasi via CLI.</p>
          </details>

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white text-xs font-bold rounded-lg cursor-pointer">
              <Save size={13} />{saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button onClick={test} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-primary border border-theme-border text-xs font-bold rounded-lg cursor-pointer">
              <Plug size={13} />{testing ? 'Menguji…' : 'Tes Koneksi'}
            </button>
            <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900 text-white text-xs font-bold rounded-lg cursor-pointer">
              <Key size={13} />{generating ? 'Generate…' : 'Generate Keys'}
            </button>
          </div>

          {testResult && (
            <div className={`text-[10px] font-mono p-2.5 rounded-lg border ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-red-500/10 border-red-500/25 text-red-300'} flex items-start gap-2`}>
              {testResult.ok ? <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" /> : <XCircle size={13} className="mt-0.5 flex-shrink-0" />}
              <pre className="whitespace-pre-wrap break-words flex-1">{testResult.msg}</pre>
            </div>
          )}

          {genResult && (
            <div className="text-xs p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/25 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300"><Key size={13} /> Keypair digenerate</div>
              <p className="text-[10px] text-theme-text-secondary">Private key: <code className="text-indigo-300">{genResult.keyPath}</code></p>
              {genResult.autoInstalled ? (
                <p className="text-[10px] text-emerald-300">✅ Pubkey otomatis dipasang ke <code>/sdcard/SshDaemon/authorized_keys</code>. Aktifkan key-auth di app ssh-daemon, lalu <strong>Simpan → Tes Koneksi</strong>.</p>
              ) : (
                <p className="text-[10px] text-amber-300">⚠️ Tidak bisa auto-pasang ({genResult.autoInstallError || 'izin storage'}). Tempel pubkey ini ke authorized_keys daemon secara manual:</p>
              )}
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-lg p-2 flex items-center gap-2">
                <pre className="text-[10px] text-emerald-300 font-mono whitespace-pre-wrap break-all flex-1">{genResult.publicKey}</pre>
                <button onClick={() => { navigator.clipboard.writeText(genResult.publicKey); toast.success('Pubkey disalin'); }} className="p-1.5 text-neutral-400 hover:text-white cursor-pointer flex-shrink-0" title="Salin pubkey"><Copy size={13} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
