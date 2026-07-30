import React, { useState, useEffect } from 'react';
import { Bot, Lock, Loader2 } from 'lucide-react';

interface LoginGateProps {
  children: React.ReactNode;
}

export function LoginGate({ children }: LoginGateProps) {
  const [checking, setChecking] = useState(true);
  const [protectedMode, setProtectedMode] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sres = await fetch('/api/auth/status');
        const sdata = await sres.json();
        if (cancelled) return;
        if (!sdata?.protected) { setProtectedMode(false); setAuthed(true); setChecking(false); return; }
        setProtectedMode(true);
        // Probe a protected route to see if we already have a valid session cookie.
        const probe = await fetch('/api/chat-sessions');
        if (probe.ok) { setAuthed(true); setChecking(false); }
        else { setAuthed(false); setChecking(false); }
      } catch {
        if (!cancelled) { setAuthed(true); setChecking(false); } // fail open if status unreachable
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) { setAuthed(true); setPassword(''); }
      else { const d = await res.json().catch(() => ({})); setError(d.error || 'Password salah'); }
    } catch (err: any) {
      setError(err?.message || 'Koneksi gagal');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (protectedMode && !authed) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex flex-col items-center mb-5">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 mb-3"><Bot size={24} className="text-white" /></div>
            <h1 className="text-lg font-bold text-slate-100">RocAgent</h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Lock size={12} /> Workspace dilindungi password</p>
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          <button type="submit" disabled={submitting || !password} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white font-bold rounded-xl py-2.5 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed">
            {submitting ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
