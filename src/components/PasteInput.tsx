import React, { useRef, useState } from 'react';
import { ClipboardPaste, Loader2 } from 'lucide-react';
import { toast } from './Toast';

interface PasteInputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}

export function PasteInput({ label, value, onChange, type = 'text', placeholder, mono = true }: PasteInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doPaste = async () => {
    setBusy(true);
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) { onChange(txt.trim()); toast.success('Ditempel dari clipboard'); }
      else { ref.current?.focus(); toast.info('Clipboard kosong — tempel manual (Ctrl+V)'); }
    } catch {
      ref.current?.focus();
      ref.current?.select();
      toast.info('Clipboard diblokir browser — klik kolom lalu Ctrl+V');
    } finally { setBusy(false); }
  };

  return (
    <div>
      {label && <label className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">{label}</label>}
      <div className="flex gap-1 mt-0.5">
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 min-w-0 bg-theme-input text-theme-text-primary border border-theme-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none ${mono ? 'font-mono' : ''}`}
        />
        <button
          type="button"
          onClick={doPaste}
          disabled={busy}
          title="Tempel dari clipboard"
          className="flex items-center gap-1 px-2.5 rounded-lg border border-theme-border bg-theme-btn-active hover:bg-theme-btn-hover text-theme-text-secondary hover:text-theme-text-primary text-[10px] font-bold cursor-pointer disabled:opacity-50 flex-shrink-0"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
          <span className="hidden sm:inline">Paste</span>
        </button>
      </div>
    </div>
  );
}
