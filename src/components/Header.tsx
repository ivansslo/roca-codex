import React from 'react';
import { Menu, Layout, MessageSquare, Settings, Terminal as TerminalIcon, Bell, Sun, Moon } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';
import { NavTab } from './Sidebar';

interface HeaderProps {
  onToggleSidebar: () => void;
  availableModels: any[];
  selectedModel: string;
  selectedProvider: string;
  activeTab: NavTab;
  onNavigateTab: (tab: NavTab) => void;
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  // Notification dropdown
  showNotifyDropdown: boolean;
  setShowNotifyDropdown: (v: boolean | ((p: boolean) => boolean)) => void;
  githubUpdates: any;
  isPullingGit: boolean;
  isPushingGit: boolean;
  onPull: () => void;
  onPush: () => void;
  theme: 'dark' | 'light' | 'high-contrast';
  setTheme: (v: 'dark' | 'light' | 'high-contrast') => void;
}

export function Header(p: HeaderProps) {
  // Matched on (id, provider) together, not id alone: different providers can
  // legitimately expose the SAME upstream model id (e.g. CloudFerro Sherlock's
  // "openai/gpt-oss-120b" is the identical string Groq already uses for its
  // own gpt-oss-120b catalog entry) — id-only matching would silently show/
  // pick whichever entry happens to come first in the array, which is a
  // provider mix-up, not just a cosmetic label glitch (the request actually
  // gets billed/sent to the wrong account).
  const activeModel = p.availableModels.find(m => m.id === p.selectedModel && m.provider === p.selectedProvider);
  return (
    <header className="h-16 border-b border-theme-border flex items-center justify-between px-4 bg-slate-950/60 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button onClick={p.onToggleSidebar} className="p-2 bg-theme-btn-active border border-theme-border rounded-xl text-theme-text-secondary hover:bg-theme-btn-hover transition-colors cursor-pointer"><Menu size={18} /></button>
        <div className="flex items-center gap-2">
          <h2 className="font-mono uppercase tracking-wider text-theme-text-primary text-xs font-bold flex items-center gap-2">
            <Layout size={15} className="text-indigo-400" />
            <span className="hidden sm:inline text-slate-100 font-extrabold">RocAgent</span>
          </h2>
          {activeModel && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-mono select-none">
              {activeModel.icon ? <span className="text-sm leading-none">{activeModel.icon}</span> : null}
              <span className="text-[10px] font-bold uppercase tracking-wider">{activeModel.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="bg-slate-900/90 border border-slate-800 p-1 rounded-xl flex items-center gap-1 shadow-inner">
          <button onClick={() => p.onNavigateTab('chat')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${p.activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}><MessageSquare size={14} /><span>Chat</span></button>
          <button onClick={() => p.onNavigateTab('settings')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${p.activeTab !== 'chat' ? 'bg-indigo-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}><Settings size={14} /><span>Pengaturan</span></button>
        </div>

        <div className="flex items-center gap-1.5 ml-1">
          <button onClick={() => p.setTerminalOpen(!p.terminalOpen)} className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${p.terminalOpen ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`} title="Toggle Console"><TerminalIcon size={15} /></button>

          <div className="relative">
            <button onClick={() => p.setShowNotifyDropdown(!p.showNotifyDropdown)} className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer relative ${p.githubUpdates?.hasUpdates ? 'bg-rose-600/20 border-rose-500/50 text-rose-300 font-bold animate-pulse' : 'bg-theme-btn-active border-theme-border text-theme-text-secondary hover:bg-theme-btn-hover'}`} title="GitHub Updates">
              <Bell size={15} />
              {p.githubUpdates?.hasUpdates && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-slate-900 animate-ping" />}
            </button>
            <NotificationDropdown
              open={p.showNotifyDropdown}
              onClose={() => p.setShowNotifyDropdown(false)}
              githubUpdates={p.githubUpdates}
              isPullingGit={p.isPullingGit}
              isPushingGit={p.isPushingGit}
              onPull={p.onPull}
              onPush={p.onPush}
            />
          </div>

          <button onClick={() => p.setTheme(p.theme === 'dark' ? 'light' : 'dark')} className="p-1.5 rounded-lg border border-theme-border bg-theme-btn-active text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-btn-hover transition-all cursor-pointer" title="Ganti Tema">
            {p.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </header>
  );
}
