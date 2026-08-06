import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface ModelQuickSwitchProps {
  availableModels: any[];
  selectedModel: string;
  selectedProvider: string;
  onSelectModel: (model: any) => void;
}

export function ModelQuickSwitch({ availableModels, selectedModel, selectedProvider, onSelectModel }: ModelQuickSwitchProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Matched on (id, provider) together, not id alone — see the identical note
  // in Header.tsx: different providers can expose the same upstream model id
  // (e.g. CloudFerro Sherlock's "openai/gpt-oss-120b" vs Groq's own catalog
  // entry of the same id), and id-only matching would silently display/select
  // the wrong provider's entry.
  const current = availableModels.find(m => m.id === selectedModel && m.provider === selectedProvider);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Group models by provider for the dropdown.
  const grouped = availableModels.reduce<Record<string, any[]>>((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-theme-border bg-theme-btn-hover text-theme-text-secondary hover:text-theme-text-primary text-xs font-medium transition-all cursor-pointer max-w-[180px]"
        title={`Model aktif: ${current?.name || selectedModel} (${selectedProvider}) — klik untuk ganti`}
      >
        {current?.icon ? <span className="text-sm leading-none flex-shrink-0">{current.icon}</span> : null}
        <span className="truncate">{current?.name || selectedModel}</span>
        <ChevronDown size={12} className="text-theme-text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-72 max-h-80 overflow-y-auto bg-theme-sidebar border border-theme-border rounded-2xl shadow-2xl p-1.5 animate-fade-in">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">
            Pilih Model / Provider
          </div>
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider} className="mb-1">
              <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-indigo-400/70">{provider}</div>
              {models.map(m => {
                // Within this provider's own group, m.provider === provider already,
                // so checking id here is equivalent to checking (id, provider) — but
                // selectedProvider is still needed to decide THIS is the active group
                // rather than a same-id entry belonging to a different provider group.
                const active = m.id === selectedModel && provider === selectedProvider;
                return (
                  <button
                    key={`${provider}:${m.id}`}
                    type="button"
                    onClick={() => { onSelectModel(m); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${active ? 'bg-indigo-600/15' : 'hover:bg-theme-btn-hover'}`}
                  >
                    {m.icon ? <span className="text-sm">{m.icon}</span> : null}
                    <span className={`flex-1 truncate text-xs ${active ? 'text-indigo-300 font-bold' : 'text-theme-text-primary'}`}>{m.name}</span>
                    {active && <Check size={12} className="text-indigo-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
