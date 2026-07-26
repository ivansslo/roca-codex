import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; type: ToastType; }

// Tiny pub/sub toast store — no provider needed. Call toast.success/error/info from anywhere.
let _id = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
function emit() { listeners.forEach(l => l([...items])); }

export const toast = {
  show(message: string, type: ToastType = 'info', duration = 4500) {
    const id = ++_id;
    items = [...items, { id, message, type }];
    emit();
    if (duration > 0) setTimeout(() => toast.dismiss(id), duration);
    return id;
  },
  success(m: string, d?: number) { return toast.show(m, 'success', d); },
  error(m: string, d?: number) { return toast.show(m, 'error', d ?? 6000); },
  info(m: string, d?: number) { return toast.show(m, 'info', d); },
  dismiss(id: number) { items = items.filter(t => t.id !== id); emit(); }
};

const CFG: Record<ToastType, { icon: typeof CheckCircle2; bar: string; text: string }> = {
  success: { icon: CheckCircle2, bar: 'bg-emerald-500', text: 'text-emerald-300' },
  error: { icon: XCircle, bar: 'bg-red-500', text: 'text-red-300' },
  info: { icon: Info, bar: 'bg-indigo-500', text: 'text-indigo-300' }
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => { listeners.add(setList); return () => { listeners.delete(setList); }; }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw] pointer-events-none">
      {list.map(t => {
        const c = CFG[t.type];
        const Icon = c.icon;
        return (
          <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 p-3 pr-2 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl animate-fade-in backdrop-blur-md">
            <span className={`w-1 self-stretch min-h-[16px] rounded-full ${c.bar}`} />
            <Icon size={16} className={`${c.text} mt-0.5 flex-shrink-0`} />
            <span className="flex-1 text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{t.message}</span>
            <button onClick={() => toast.dismiss(t.id)} className="text-slate-500 hover:text-white p-0.5 flex-shrink-0 cursor-pointer" title="Tutup">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
