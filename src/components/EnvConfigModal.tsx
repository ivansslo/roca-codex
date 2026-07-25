import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Eye, EyeOff, Copy, RefreshCw, Key, CheckCircle2, AlertTriangle, XCircle, Info, Database, Server, Cpu } from 'lucide-react';

interface EnvVarItem {
  key: string;
  label: string;
  category: string;
  value: string;
  masked: string;
  isSet: boolean;
}

interface EnvConfigModalProps {
  onClose: () => void;
  onOpenEditor?: () => void;
}

export const EnvConfigModal: React.FC<EnvConfigModalProps> = ({ onClose, onOpenEditor }) => {
  const [loading, setLoading] = useState(true);
  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [envFilePath, setEnvFilePath] = useState('');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const fetchEnvConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/env/config');
      if (res.ok) {
        const data = await res.json();
        setEnvVars(data.envVars || []);
        setEnvFilePath(data.envFilePath || '');
      }
    } catch (err) {
      console.error('Failed to fetch env config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvConfig();
  }, []);

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const categories = ['all', ...Array.from(new Set(envVars.map(item => item.category)))];

  const filteredVars = activeCategory === 'all' 
    ? envVars 
    : envVars.filter(item => item.category === activeCategory);

  const configuredCount = envVars.filter(item => item.isSet).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-theme-sidebar border border-theme-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-theme-border flex items-center justify-between bg-theme-sidebar/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Server size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                Server Environment Configuration
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  Loaded from Server
                </span>
              </h3>
              <p className="text-xs text-theme-text-muted mt-0.5">
                Displays active environment variables, API key statuses, and loaded secrets from <code className="text-indigo-400 font-mono">{envFilePath || '.env'}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-btn-hover rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Summary Strip */}
        <div className="bg-theme-input/40 px-5 py-3 border-b border-theme-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-theme-text-secondary">
              <Key size={14} className="text-indigo-400" />
              Total Monitored Keys: <strong className="text-theme-text-primary">{envVars.length}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={14} />
              Configured: <strong>{configuredCount}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle size={14} />
              Unconfigured: <strong>{envVars.length - configuredCount}</strong>
            </span>
          </div>

          <button
            onClick={fetchEnvConfig}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh Values
          </button>
        </div>

        {/* Category Tabs */}
        <div className="px-5 py-2.5 border-b border-theme-border flex items-center gap-1.5 overflow-x-auto bg-theme-sidebar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize whitespace-nowrap cursor-pointer transition-all ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-btn-hover'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Modal Body: Env Var List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-theme-text-muted space-y-2">
              <RefreshCw size={24} className="animate-spin mx-auto text-indigo-500" />
              <p>Reading loaded environment variables from node container process...</p>
            </div>
          ) : (
            filteredVars.map(item => {
              const isShown = showSecrets[item.key];
              return (
                <div
                  key={item.key}
                  className={`p-3.5 rounded-xl border transition-all ${
                    item.isSet
                      ? 'bg-theme-input/50 border-theme-border/80 hover:border-indigo-500/30'
                      : 'bg-amber-500/5 border-amber-500/20'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-theme-text-primary">{item.key}</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.isSet ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={10} /> Loaded
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                          <XCircle size={10} /> Not Configured
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-theme-text-muted mb-2">{item.label}</div>

                  {/* Value / Masked display */}
                  <div className="bg-neutral-950/80 border border-neutral-800 rounded-lg p-2.5 flex items-center justify-between gap-2 font-mono text-xs">
                    <span className={`truncate ${item.isSet ? 'text-emerald-300' : 'text-neutral-500 italic'}`}>
                      {item.isSet ? (isShown ? item.value : item.masked) : 'No value set in process environment'}
                    </span>

                    {item.isSet && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleSecret(item.key)}
                          className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          title={isShown ? 'Hide secret' : 'Reveal secret'}
                        >
                          {isShown ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.key, item.value)}
                          className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          title="Copy to clipboard"
                        >
                          {copiedKey === item.key ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-theme-border bg-theme-sidebar/90 flex items-center justify-between gap-3">
          <div className="text-[11px] text-theme-text-muted flex items-center gap-1.5">
            <Info size={13} className="text-indigo-400" />
            Secrets are loaded server-side and never logged to public browser console.
          </div>

          <div className="flex items-center gap-2">
            {onOpenEditor && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditor();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Open .env Editor
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary border border-theme-border rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Close Modal
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
