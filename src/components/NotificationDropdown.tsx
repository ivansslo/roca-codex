import React from 'react';
import { X, RefreshCw, Upload, GitBranch } from 'lucide-react';

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
  githubUpdates: any;
  isPullingGit: boolean;
  isPushingGit: boolean;
  onPull: () => void;
  onPush: () => void;
}

export function NotificationDropdown({
  open, onClose, githubUpdates, isPullingGit, isPushingGit, onPull, onPush
}: NotificationDropdownProps) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-10 z-50 w-72 max-w-[90vw] bg-slate-900/95 backdrop-blur-xl border border-slate-700/70 shadow-2xl rounded-2xl p-3.5 text-xs space-y-3 font-sans animate-fade-in"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="flex items-center gap-1.5 font-bold text-slate-100"><GitBranch size={13} className="text-indigo-400" /> Git</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"><X size={13} /></button>
      </div>

      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-100">
          <span className="truncate">{githubUpdates?.repo || '—'}</span>
          {githubUpdates?.hasUpdates
            ? <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25 text-[8px] font-bold">NEW</span>
            : <span className="ml-auto px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[8px] font-bold">SYNCED</span>}
        </div>
        <div className="flex items-center gap-3 mt-2 font-mono text-[10px]">
          <div><span className="text-slate-500">Local</span><br /><code className="text-indigo-300 font-bold">{githubUpdates?.localHead || '—'}</code></div>
          <span className="text-slate-600">→</span>
          <div><span className="text-slate-500">Remote</span><br /><code className="text-emerald-300 font-bold">{githubUpdates?.remoteHead || '—'}</code></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={isPullingGit} onClick={onPull} className="py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
          <RefreshCw size={13} className={isPullingGit ? 'animate-spin' : ''} />
          {isPullingGit ? 'Pulling…' : 'Pull'}
        </button>
        <button type="button" disabled={isPushingGit} onClick={onPush} className="py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
          <Upload size={13} className={isPushingGit ? 'animate-spin' : ''} />
          {isPushingGit ? 'Pushing…' : 'Push'}
        </button>
      </div>
    </div>
  );
}
