import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { PERSONAS, getPersona } from '../lib/persona';

interface PersonaSelectorProps {
  value: string;
  onChange: (id: string) => void;
}

export function PersonaSelector({ value, onChange }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getPersona(value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-theme-border bg-theme-btn-hover text-theme-text-secondary hover:text-theme-text-primary text-xs font-medium transition-all cursor-pointer"
        title={`Persona: ${current.label} — ${current.description}`}
      >
        <span className="text-sm leading-none">{current.icon}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <Sparkles size={12} className="text-indigo-400" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-64 bg-theme-sidebar border border-theme-border rounded-2xl shadow-2xl p-1.5 animate-fade-in">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">
            Persona AI
          </div>
          {PERSONAS.map(p => {
            const active = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); }}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                  active ? 'bg-indigo-600/15' : 'hover:bg-theme-btn-hover'
                }`}
              >
                <span className="text-base leading-none mt-0.5">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${active ? 'text-indigo-300' : 'text-theme-text-primary'}`}>{p.label}</span>
                    {active && <Check size={12} className="text-indigo-400" />}
                  </div>
                  <div className="text-[10px] text-theme-text-secondary leading-snug mt-0.5">{p.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
