import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Zap, ShieldAlert, Sparkles, Key, ExternalLink } from 'lucide-react';

export interface ProviderStatus {
  id: string;
  name: string;
  keyName: string;
  configured: boolean;
  status: 'valid' | 'invalid' | 'missing';
  /** Sebab kegagalan dari server: kuota habis, kunci ditolak, timeout. */
  detail?: string;
  message: string;
  latencyMs?: number;
}

interface AiProviderValidatorProps {
  onStatusUpdated?: (hasError: boolean, providers: ProviderStatus[]) => void;
  onOpenEnvModal?: () => void;
  onOpenEnvEditor?: () => void;
}

export const AiProviderValidator: React.FC<AiProviderValidatorProps> = ({
  onStatusUpdated,
  onOpenEnvModal,
  onOpenEnvEditor
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [lastCheckError, setLastCheckError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    setLastCheckError(null);
    try {
      const res = await fetch('/api/env/status');
      if (res.ok) {
        const data = await res.json();
        const list: ProviderStatus[] = data.providers || [];
        setProviders(list);
        setCheckedAt(data.checkedAt || new Date().toISOString());

        const hasAnyError = list.some(p => p.status === 'invalid' || p.status === 'missing');
        if (onStatusUpdated) {
          onStatusUpdated(hasAnyError, list);
        }
      } else {
        setLastCheckError(`HTTP ${res.status}: Failed to ping AI providers`);
      }
    } catch (err: any) {
      setLastCheckError(`Network error checking provider connectivity: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  const validCount = providers.filter(p => p.status === 'valid').length;
  const invalidCount = providers.filter(p => p.status === 'invalid').length;
  const missingCount = providers.filter(p => p.status === 'missing').length;

  return (
    <div className="bg-theme-sidebar border border-theme-border rounded-2xl p-5 space-y-4 relative overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border pb-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
              AI Provider Status Validator
              {invalidCount > 0 || missingCount > 0 ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                  <AlertTriangle size={10} /> Key Action Required
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <CheckCircle2 size={10} /> All Connections Active
                </span>
              )}
            </h3>
            <p className="text-xs text-theme-text-secondary mt-0.5">
              Live connectivity verification for Groq, OpenAI, Gemini, and Tailscale mesh nodes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenEnvModal && (
            <button
              type="button"
              onClick={onOpenEnvModal}
              className="px-3 py-1.5 bg-theme-input hover:bg-theme-btn-hover text-theme-text-primary border border-theme-border rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Env Info Modal
            </button>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={runHealthCheck}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Checking...' : 'Run Connectivity Check'}
          </button>
        </div>
      </div>

      {/* Summary Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-theme-input/50 border border-theme-border/70 p-2.5 rounded-xl flex items-center gap-2">
          <Zap size={15} className="text-indigo-400" />
          <div>
            <div className="text-[10px] text-theme-text-muted uppercase font-mono font-bold">Tested Providers</div>
            <div className="font-bold text-theme-text-primary">{providers.length} Models & Nodes</div>
          </div>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-400" />
          <div>
            <div className="text-[10px] text-emerald-400 uppercase font-mono font-bold">Valid & Active</div>
            <div className="font-bold text-emerald-300">{validCount} Connected</div>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          <div>
            <div className="text-[10px] text-amber-400 uppercase font-mono font-bold">Invalid / Auth Failed</div>
            <div className="font-bold text-amber-300">{invalidCount} Flags</div>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl flex items-center gap-2">
          <XCircle size={15} className="text-red-400" />
          <div>
            <div className="text-[10px] text-red-400 uppercase font-mono font-bold">Unconfigured</div>
            <div className="font-bold text-red-300">{missingCount} Missing Keys</div>
          </div>
        </div>
      </div>

      {/* Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {loading ? (
          <div className="col-span-full py-8 text-center text-xs text-theme-text-muted space-y-2">
            <RefreshCw size={20} className="animate-spin mx-auto text-indigo-500" />
            <p>Memanggil endpoint tiap penyedia dan mengukur latensi sebenarnya.</p>
          </div>
        ) : (
          providers.map((p) => {
            const isValid = p.status === 'valid';
            const isInvalid = p.status === 'invalid';
            const isMissing = p.status === 'missing';

            return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                  isValid
                    ? 'bg-theme-input/40 border-theme-border/80 hover:border-emerald-500/40'
                    : isInvalid
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-red-500/5 border-red-500/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-theme-text-primary">{p.name}</span>
                      <code className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        {p.keyName}
                      </code>
                    </div>

                    {isValid && (
                      <span className="px-2 py-0.5 text-[9px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} /> VALID
                      </span>
                    )}

                    {isInvalid && (
                      <span className="px-2 py-0.5 text-[9px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} /> INVALID KEY
                      </span>
                    )}

                    {isMissing && (
                      <span className="px-2 py-0.5 text-[9px] font-bold font-mono bg-red-500/15 text-red-400 border border-red-500/30 rounded-full flex items-center gap-1">
                        <XCircle size={10} /> MISSING
                      </span>
                    )}
                  </div>

                  <p className={`text-xs mt-1 font-mono leading-relaxed p-2 rounded-lg border ${
                    isValid
                      ? 'bg-neutral-950/60 text-emerald-300 border-neutral-800'
                      : isInvalid
                      ? 'bg-neutral-950/80 text-amber-300 border-amber-500/20'
                      : 'bg-neutral-950/80 text-red-300 border-red-500/20'
                  }`}>
                    {p.message}
                  </p>
                </div>

                {p.detail && (
                  <p className="text-[10px] font-mono text-amber-400/90 pb-1">
                    {p.detail}
                  </p>
                )}

                <div className="flex items-center justify-between text-[10px] font-mono text-theme-text-muted pt-1 border-t border-theme-border/50">
                  <span>
                    Latency: {p.latencyMs ? <strong className="text-emerald-400">{p.latencyMs}ms</strong> : 'N/A'}
                  </span>

                  {(isInvalid || isMissing) && onOpenEnvEditor && (
                    <button
                      type="button"
                      onClick={onOpenEnvEditor}
                      className="text-indigo-400 hover:text-indigo-300 font-bold underline flex items-center gap-1 cursor-pointer"
                    >
                      Fix in .env Editor <ExternalLink size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {checkedAt && (
        <div className="text-[10px] text-theme-text-muted font-mono flex items-center justify-between pt-1">
          <span>Last validated: {new Date(checkedAt).toLocaleTimeString()}</span>
          <span>Automatic health check active</span>
        </div>
      )}
    </div>
  );
};
