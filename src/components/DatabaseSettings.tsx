import React, { useState, useEffect } from 'react';
import { Database, Save, Activity, CheckCircle2, XCircle, Loader2, Server, Cloud } from 'lucide-react';
import { toast } from './Toast';
import { PasteInput } from './PasteInput';

export function DatabaseSettings() {
  const [snowflakeActive, setSnowflakeActive] = useState(false);
  const [neonActive, setNeonActive] = useState(false);

  const [snowflakeAccount, setSnowflakeAccount] = useState('');
  const [snowflakeUser, setSnowflakeUser] = useState('');
  const [snowflakePat, setSnowflakePat] = useState('');
  const [snowflakeDb, setSnowflakeDb] = useState('ROCAGENTINSIGHT_DB');
  const [snowflakeSchema, setSnowflakeSchema] = useState('GOVERNANCE');
  const [snowflakeAgent, setSnowflakeAgent] = useState('ROCAGENTINSIGHT');

  const [neonUri, setNeonUri] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/db/config');
      if (r.ok) {
        const d = await r.json();
        setSnowflakeActive(Boolean(d.snowflake?.active));
        setNeonActive(Boolean(d.neon?.active));

        setSnowflakeAccount(d.snowflake?.account || '');
        setSnowflakeUser(d.snowflake?.user || '');
        setSnowflakePat(d.snowflake?.pat || '');
        setSnowflakeDb(d.snowflake?.database || 'ROCAGENTINSIGHT_DB');
        setSnowflakeSchema(d.snowflake?.schema || 'GOVERNANCE');
        setSnowflakeAgent(d.snowflake?.agent || 'ROCAGENTINSIGHT');

        setNeonUri(d.neon?.uri || '');
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/db/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snowflakeAccount,
          snowflakeUser,
          snowflakePat,
          snowflakeDb,
          snowflakeSchema,
          snowflakeAgent,
          neonUri
        })
      });
      const d = await r.json();
      if (r.ok) {
        toast.success(d.message || 'Konfigurasi database tersimpan');
      } else {
        toast.error(d.error || 'Gagal menyimpan konfigurasi');
      }
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const testStatus = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setSnowflakeActive(Boolean(d.snowflakeActive));
        setNeonActive(Boolean(d.neonActive));
        setTestResult({ ok: true, msg: d.report || 'Koneksi database dicek' });
        toast.success('Pemeriksaan status database selesai');
      } else {
        setTestResult({ ok: false, msg: d.error || 'Gagal memeriksa status' });
        toast.error(d.error || 'Pemeriksaan status gagal');
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
      toast.error(e.message);
    }
    setTesting(false);
  };

  const Field = ({ label, value, set, type = 'text', placeholder }: any) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-mono mt-0.5"
      />
    </div>
  );

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Database size={16} className="text-indigo-400" />
        <h3 className="text-sm font-bold text-theme-text-primary">Database &amp; Analytics — Snowflake &amp; Neon DB</h3>
        <span className="ml-auto text-[9px] text-theme-text-muted font-mono">analytics / sql</span>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
            snowflakeActive
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-neutral-800/80 border-neutral-700 text-neutral-400'
          }`}
        >
          <Cloud size={12} />
          {snowflakeActive ? 'AKTIF — Snowflake Cortex Agent' : 'TIDAK AKTIF — Snowflake Cortex'}
        </span>
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
            neonActive
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-neutral-800/80 border-neutral-700 text-neutral-400'
          }`}
        >
          <Server size={12} />
          {neonActive ? 'AKTIF — Neon Postgres DB' : 'TIDAK AKTIF — Neon Postgres DB'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-theme-text-muted">
          <Loader2 size={14} className="animate-spin" /> Memuat status database…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Section 1: Snowflake */}
          <div className="border border-theme-border/70 rounded-xl p-3.5 bg-theme-input/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5">
                <Cloud size={14} className="text-sky-400" />
                Snowflake Cortex Agent (<code className="text-[11px] text-indigo-300">query_snowflake_insight</code>)
              </span>
            </div>
            <p className="text-[10px] text-theme-text-muted leading-relaxed">
              Analytics agent (semantic view) untuk membaca tren operasional &amp; metrik eksekusi tool.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Snowflake Account" value={snowflakeAccount} set={setSnowflakeAccount} placeholder="xy12345.us-east-1" />
              <Field label="Snowflake User" value={snowflakeUser} set={setSnowflakeUser} placeholder="ROC_USER" />
            </div>
            <PasteInput
              label="Snowflake PAT / Key"
              value={snowflakePat}
              onChange={setSnowflakePat}
              type="password"
              placeholder="Masukkan Personal Access Token (SNOWFLAKE_PAT)"
            />

            <details className="text-[10px] text-theme-text-muted border border-theme-border/60 rounded-lg p-2.5 bg-theme-input/40">
              <summary className="cursor-pointer font-semibold text-theme-text-secondary">
                Konfigurasi Lanjutan (Database, Schema &amp; Agent Override)
              </summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Field label="Database" value={snowflakeDb} set={setSnowflakeDb} placeholder="ROCAGENTINSIGHT_DB" />
                <Field label="Schema" value={snowflakeSchema} set={setSnowflakeSchema} placeholder="GOVERNANCE" />
                <Field label="Agent Name" value={snowflakeAgent} set={setSnowflakeAgent} placeholder="ROCAGENTINSIGHT" />
              </div>
            </details>
          </div>

          {/* Section 2: Neon Postgres DB */}
          <div className="border border-theme-border/70 rounded-xl p-3.5 bg-theme-input/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5">
                <Server size={14} className="text-emerald-400" />
                Neon Postgres Database (<code className="text-[11px] text-indigo-300">query_neon_db</code>)
              </span>
            </div>
            <p className="text-[10px] text-theme-text-muted leading-relaxed">
              Eksekusi kueri SQL nyata pada database lokal/cloud. Kueri destruktif (DROP/ALTER/DELETE/UPDATE) dilindungi oleh konfirmasi otomatis.
            </p>
            <PasteInput
              label="Neon Connection URI"
              value={neonUri}
              onChange={setNeonUri}
              type="password"
              placeholder="postgres://user:password@ep-xxxx.neon.tech/neondb?sslmode=require"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white text-xs font-bold rounded-lg cursor-pointer transition-all"
            >
              <Save size={13} />
              {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
            </button>
            <button
              onClick={testStatus}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-primary border border-theme-border text-xs font-bold rounded-lg cursor-pointer transition-all"
            >
              <Activity size={13} />
              {testing ? 'Memeriksa…' : 'Cek Status & Koneksi'}
            </button>
          </div>

          {/* Test Result Display */}
          {testResult && (
            <div
              className={`text-[10px] font-mono p-3 rounded-lg border ${
                testResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/25 text-red-300'
              } flex items-start gap-2`}
            >
              {testResult.ok ? (
                <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-400" />
              ) : (
                <XCircle size={13} className="mt-0.5 flex-shrink-0 text-red-400" />
              )}
              <pre className="whitespace-pre-wrap break-words flex-1 leading-relaxed font-sans">{testResult.msg}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
