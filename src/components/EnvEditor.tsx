import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Key, FileCode, CheckCircle2, AlertTriangle, Eye, EyeOff, Shield, Plus, Trash2, Edit3, Lock } from 'lucide-react';

interface EnvEditorProps {
  isPro: boolean;
  userEmail: string;
  onSaved?: () => void;
}

export const EnvEditor: React.FC<EnvEditorProps> = ({ isPro, userEmail, onSaved }) => {
  const [editorMode, setEditorMode] = useState<'form' | 'raw'>('form');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Key-value form state
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [tailscaleKey, setTailscaleKey] = useState('');
  const [tailscaleIp, setTailscaleIp] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [clerkPk, setClerkPk] = useState('');
  const [clerkSk, setClerkSk] = useState('');

  // Visibility toggles
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Raw .env editor state
  const [rawEnvText, setRawEnvText] = useState('');

  const fetchEnv = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/env/config');
      if (res.ok) {
        const data = await res.json();
        setRawEnvText(data.rawEnv || '');

        const varsMap: Record<string, string> = {};
        if (Array.isArray(data.envVars)) {
          data.envVars.forEach((v: any) => {
            varsMap[v.key] = v.value || '';
          });
        }

        setGeminiKey(varsMap['GEMINI_API_KEY'] || '');
        setGroqKey(varsMap['GROQ_KEY'] || '');
        setOpenAiKey(varsMap['OPENAI_API_KEY'] || '');
        setTailscaleKey(varsMap['TAILSCALE_KEY'] || varsMap['TAILSCALE_AUTH_KEY'] || '');
        setTailscaleIp(varsMap['TAILSCALE_IP'] || '');
        setGithubPat(varsMap['GITHUB_PAT'] || '');
        setClerkPk(varsMap['CLERK_PK'] || '');
        setClerkSk(varsMap['CLERK_SK'] || '');
      }
    } catch (err: any) {
      setErrorNotice(`Failed to load environment variables: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnv();
  }, []);

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    setErrorNotice(null);

    try {
      const updatedEnvs = {
        GEMINI_API_KEY: geminiKey,
        GROQ_KEY: groqKey,
        OPENAI_API_KEY: openAiKey,
        TAILSCALE_KEY: tailscaleKey,
        TAILSCALE_IP: tailscaleIp,
        GITHUB_PAT: githubPat,
        CLERK_PK: clerkPk,
        CLERK_SK: clerkSk
      };

      const res = await fetch('/api/env/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envs: updatedEnvs })
      });

      if (res.ok) {
        const data = await res.json();
        setSaveNotice('Kunci API & file .env berhasil diperbarui dan dimuat ke memori server!');
        fetchEnv();
        if (onSaved) onSaved();
      } else {
        const err = await res.json();
        setErrorNotice(err.error || 'Gagal menyimpan perubahan .env');
      }
    } catch (err: any) {
      setErrorNotice(`Terjadi kesalahan jaringan: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRaw = async () => {
    setSaving(true);
    setSaveNotice(null);
    setErrorNotice(null);

    try {
      const res = await fetch('/api/env/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawEnv: rawEnvText })
      });

      if (res.ok) {
        setSaveNotice('File .env berhasil diperbarui secara langsung!');
        fetchEnv();
        if (onSaved) onSaved();
      } else {
        const err = await res.json();
        setErrorNotice(err.error || 'Gagal menyunting file .env');
      }
    } catch (err: any) {
      setErrorNotice(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-5 space-y-5 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-theme-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
              <Key size={18} className="text-indigo-500" />
              .env Editor Komponen Pengaturan
            </h3>
            {isPro ? (
              <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
                <Shield size={10} /> Pro Verified Owner
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center gap-1">
                <Lock size={10} /> View Mode Only
              </span>
            )}
          </div>
          <p className="text-xs text-theme-text-secondary mt-1">
            Sunting variabel lingkungan langsung di server internal. Perubahan langsung diperbarui pada <code className="text-indigo-400 font-mono">.env</code> dan memori runtime <code className="text-indigo-400 font-mono">process.env</code>.
          </p>
        </div>

        {/* Editor Mode Selector */}
        <div className="flex items-center gap-1 bg-theme-input p-1 rounded-xl border border-theme-border self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setEditorMode('form')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              editorMode === 'form'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-theme-text-muted hover:text-theme-text-primary'
            }`}
          >
            <Edit3 size={13} /> Form Visual
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('raw')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              editorMode === 'raw'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-theme-text-muted hover:text-theme-text-primary'
            }`}
          >
            <FileCode size={13} /> Raw .env Text
          </button>
        </div>
      </div>

      {/* Notice Alerts */}
      {saveNotice && (
        <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between animate-fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            {saveNotice}
          </span>
          <button onClick={() => setSaveNotice(null)} className="text-emerald-400 hover:text-white text-xs">OK</button>
        </div>
      )}

      {errorNotice && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between animate-fade-in">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            {errorNotice}
          </span>
          <button onClick={() => setErrorNotice(null)} className="text-red-400 hover:text-white text-xs">OK</button>
        </div>
      )}

      {/* FORM MODE */}
      {editorMode === 'form' && (
        <form onSubmit={handleSaveForm} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Gemini API Key */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                  <span>GEMINI_API_KEY</span>
                  <span className="text-[10px] text-indigo-400 font-sans font-normal">(Google Gemini)</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleShowKey('gemini')}
                  className="text-theme-text-muted hover:text-theme-text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {showKeys['gemini'] ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showKeys['gemini'] ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showKeys['gemini'] ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-emerald-400 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            {/* Groq Cloud Key */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                  <span>GROQ_KEY</span>
                  <span className="text-[10px] text-indigo-400 font-sans font-normal">(Groq Llama 3/Mixtral)</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleShowKey('groq')}
                  className="text-theme-text-muted hover:text-theme-text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {showKeys['groq'] ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showKeys['groq'] ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showKeys['groq'] ? 'text' : 'password'}
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-emerald-400 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            {/* OpenAI Key */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                  <span>OPENAI_API_KEY</span>
                  <span className="text-[10px] text-indigo-400 font-sans font-normal">(OpenAI GPT-4o)</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleShowKey('openai')}
                  className="text-theme-text-muted hover:text-theme-text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {showKeys['openai'] ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showKeys['openai'] ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showKeys['openai'] ? 'text' : 'password'}
                placeholder="sk-proj-..."
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-emerald-400 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            {/* Tailscale Key */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                  <span>TAILSCALE_KEY</span>
                  <span className="text-[10px] text-indigo-400 font-sans font-normal">(Tailscale Auth Key)</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleShowKey('tailscale')}
                  className="text-theme-text-muted hover:text-theme-text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {showKeys['tailscale'] ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showKeys['tailscale'] ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showKeys['tailscale'] ? 'text' : 'password'}
                placeholder="tskey-auth-..."
                value={tailscaleKey}
                onChange={(e) => setTailscaleKey(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-emerald-400 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            {/* Tailscale IP */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                <span>TAILSCALE_IP</span>
                <span className="text-[10px] text-indigo-400 font-sans font-normal">(Node Mesh Address)</span>
              </label>
              <input
                type="text"
                placeholder="100.x.y.z"
                value={tailscaleIp}
                onChange={(e) => setTailscaleIp(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-indigo-300 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            {/* GitHub PAT */}
            <div className="space-y-1.5 bg-theme-input/40 p-3.5 rounded-xl border border-theme-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5 font-mono">
                  <span>GITHUB_PAT</span>
                  <span className="text-[10px] text-indigo-400 font-sans font-normal">(Personal Access Token)</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleShowKey('github')}
                  className="text-theme-text-muted hover:text-theme-text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {showKeys['github'] ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showKeys['github'] ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showKeys['github'] ? 'text' : 'password'}
                placeholder="ghp_..."
                value={githubPat}
                onChange={(e) => setGithubPat(e.target.value)}
                disabled={!isPro}
                className="w-full bg-neutral-950 font-mono text-xs text-emerald-400 border border-theme-border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={fetchEnv}
              className="px-3.5 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary border border-theme-border rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reset Form
            </button>

            <button
              type="submit"
              disabled={saving || !isPro}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md transition-colors"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Menyimpan Perubahan...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Simpan & Update .env Server
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* RAW TEXT MODE */}
      {editorMode === 'raw' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-theme-text-muted">
            <span>Direct .env syntax editor:</span>
            <span className="font-mono text-[10px] bg-theme-input px-2 py-0.5 rounded border border-theme-border">
              FILE: process.cwd() + /.env
            </span>
          </div>

          <textarea
            value={rawEnvText}
            onChange={(e) => setRawEnvText(e.target.value)}
            disabled={!isPro}
            placeholder="# Environment Variables Configuration\nGEMINI_API_KEY=your_key\nGROQ_KEY=your_key"
            className="w-full h-64 bg-neutral-950 font-mono text-xs text-emerald-300 p-4 border border-theme-border rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={fetchEnv}
              className="px-3.5 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary border border-theme-border rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reload Text
            </button>

            <button
              type="button"
              disabled={saving || !isPro}
              onClick={handleSaveRaw}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md transition-colors"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Menyimpan File .env...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Simpan Raw .env Text
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
