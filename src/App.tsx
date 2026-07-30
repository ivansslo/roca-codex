import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Message, FilePayload, ChatSession } from './types';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { SyncDashboard } from './components/SyncDashboard';
import { UpgradePanel } from './components/UpgradePanel';
import { FileArchive } from './components/FileArchive';
import { AiProviderValidator } from './components/AiProviderValidator';
import { EnvConfigModal } from './components/EnvConfigModal';
import { EnvEditor } from './components/EnvEditor';
import { SshSettings } from './components/SshSettings';
import { GitCredentials } from './components/GitCredentials';
import { LoginGate } from './components/LoginGate';
import { Toaster, toast } from './components/Toast';
import { streamChat } from './lib/chatStream';
import { DEFAULT_PERSONA } from './lib/persona';
import { MessageSquare, Palette, Moon, Sun, Settings as SettingsIcon, Sparkles, RefreshCw, HardDrive } from 'lucide-react';

// Code-split the heavy settings panel so the initial chat bundle stays small (faster load).
const SelfDevelopmentHub = React.lazy(() =>
  import('./components/SelfDevelopmentHub').then(m => ({ default: m.SelfDevelopmentHub }))
);

export default function App() {
  // ---- Layout / navigation ----
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [terminalOpen, setTerminalOpen] = useState<boolean>(() => JSON.parse(localStorage.getItem('ROC_TERMINAL_OPEN') || 'false'));
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [settingsSection, setSettingsSection] = useState<'general' | 'sync' | 'files' | 'upgrade'>('general');
  const [theme, setTheme] = useState<'dark' | 'light' | 'high-contrast'>(() => (localStorage.getItem('ROC_THEME') as any) || 'dark');
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(() => JSON.parse(localStorage.getItem('ROC_SEND_ON_ENTER') || 'true'));

  // ---- Chat / sessions ----
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Models / persona ----
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem('ROC_MODEL') || 'gemini-2.5-flash');
  const [selectedProvider, setSelectedProvider] = useState<string>(() => localStorage.getItem('ROC_PROVIDER') || 'gemini');
  const [persona, setPersona] = useState<string>(() => localStorage.getItem('ROC_PERSONA') || DEFAULT_PERSONA);
  const abortRef = useRef<AbortController | null>(null);

  // ---- User / pro ----
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem('ROC_USER_EMAIL') || '');
  const [userGithub, setUserGithub] = useState<string>(() => localStorage.getItem('ROC_USER_GITHUB') || '');
  const isPro = userEmail === 'ivansuselo@gmail.com' || userGithub.toLowerCase() === 'ivansslo';

  // ---- Auto-save toggles (shared with Header dropdown + SelfDevelopmentHub) ----
  const [autoSaveMemoryEnabled, setAutoSaveMemoryEnabled] = useState<boolean>(() => localStorage.getItem('ROC_AUTO_SAVE_MEMORY') !== 'false');
  const [autoSaveCapEnabled, setAutoSaveCapEnabled] = useState<boolean>(() => localStorage.getItem('ROC_AUTO_SAVE_CAP') !== 'false');

  // ---- GitHub ----
  const [githubUpdates, setGithubUpdates] = useState<any>(null);
  const [showNotifyDropdown, setShowNotifyDropdown] = useState(false);
  const [isPullingGit, setIsPullingGit] = useState(false);
  const [isPushingGit, setIsPushingGit] = useState(false);

  // ---- Chat auto-minimize timer ----
  const [chatMinimized, setChatMinimized] = useState<boolean>(() => localStorage.getItem('ROC_CHAT_MINIMIZED') === 'true');
  const [minimizeTimer, setMinimizeTimer] = useState<number>(() => parseInt(localStorage.getItem('ROC_MINIMIZE_TIMER') || '0', 10) || 0);
  const [idleTimer, setIdleTimer] = useState<number>(300);

  const [envModalOpen, setEnvModalOpen] = useState<boolean>(false);
  const [aiProviderHasError, setAiProviderHasError] = useState<boolean>(false);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession ? activeSession.messages : [];
  const activeModelMessage = [...messages].reverse().find(m => m.role === 'model' && m.logs);
  const activeExecutionLogs = activeModelMessage ? activeModelMessage.logs : [];

  // ---- Persistence effects ----
  useEffect(() => { localStorage.setItem('ROC_PERSONA', persona); }, [persona]);
  useEffect(() => { localStorage.setItem('ROC_SEND_ON_ENTER', JSON.stringify(sendOnEnter)); }, [sendOnEnter]);
  useEffect(() => { localStorage.setItem('ROC_TERMINAL_OPEN', JSON.stringify(terminalOpen)); }, [terminalOpen]);
  useEffect(() => { localStorage.setItem('ROC_CHAT_MINIMIZED', JSON.stringify(chatMinimized)); }, [chatMinimized]);
  useEffect(() => { localStorage.setItem('ROC_MINIMIZE_TIMER', String(minimizeTimer)); }, [minimizeTimer]);
  useEffect(() => { localStorage.setItem('ROC_AUTO_SAVE_MEMORY', JSON.stringify(autoSaveMemoryEnabled)); }, [autoSaveMemoryEnabled]);
  useEffect(() => { localStorage.setItem('ROC_AUTO_SAVE_CAP', JSON.stringify(autoSaveCapEnabled)); }, [autoSaveCapEnabled]);
  useEffect(() => { localStorage.setItem('ROC_USER_EMAIL', userEmail); }, [userEmail]);
  useEffect(() => { localStorage.setItem('ROC_USER_GITHUB', userGithub); }, [userGithub]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('ROC_THEME', theme);
  }, [theme]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'b') { e.preventDefault(); setSidebarOpen(p => !p); }
      if (cmd && e.key === '1') { e.preventDefault(); setActiveTab('chat'); }
      if (cmd && e.key === '2') { e.preventDefault(); setActiveTab('settings'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Models ----
  useEffect(() => {
    fetch('/api/models').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.models?.length) {
        setAvailableModels(data.models);

        // Hanya model yang penyedianya punya kunci API yang bisa dipilih.
        // Sebelumnya default selalu models[0] — Gemini — sehingga dengan hanya
        // kunci OpenAI terpasang, setiap pesan dikirim ke penyedia tanpa
        // kredensial dan gagal tanpa penjelasan di UI.
        const usable = data.models.filter((m: any) => m.active !== false);
        const pool = usable.length ? usable : data.models;

        const saved = localStorage.getItem('ROC_MODEL');
        const found = saved && pool.find((m: any) => m.id === saved);
        // Dahulukan model milik provider aktif, baru model apa pun yang usable.
        const preferred = pool.find((m: any) => m.provider === data.active_provider) || pool[0];
        const pick = found || preferred;
        if (pick) { setSelectedModel(pick.id); setSelectedProvider(pick.provider); }
      }
    }).catch(() => {});
  }, []);

  // ---- Chat minimize countdown ----
  useEffect(() => {
    if (!chatMinimized) return;
    const iv = setInterval(() => setMinimizeTimer(p => { if (p <= 1) { setChatMinimized(false); return 0; } return p - 1; }), 1000);
    return () => clearInterval(iv);
  }, [chatMinimized]);

  // ---- Sessions ----
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/chat-sessions');
      if (!res.ok) return;
      const data: ChatSession[] = await res.json();
      setSessions(data);
      if (data.length > 0) setActiveSessionId(data[0].id);
      else await createNewSession("First Project Chat");
    } catch (e) { console.error(e); }
  };

  const saveSessionMessages = async (id: string, updatedMsgs: Message[]) => {
    const target = sessions.find(s => s.id === id);
    if (!target) return;
    const updated = { ...target, messages: updatedMsgs };
    setSessions(prev => prev.map(s => s.id === id ? updated : s));
    try {
      await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: updated }) });
    } catch (e) { console.error(e); }
  };

  const createNewSession = async (title?: string) => {
    const ns: ChatSession = {
      id: 'session_' + Date.now(),
      title: title || `Agent Chat ${sessions.length + 1}`,
      createdAt: new Date().toISOString(),
      messages: [{ id: 'welcome_' + Date.now(), role: 'model', text: "🤖 **ROCAgents online.** Ap yang mau kita kerjakan hari ini?" }]
    };
    try {
      const res = await fetch('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: ns }) });
      if (res.ok) { setSessions(prev => [ns, ...prev]); setActiveSessionId(ns.id); setActiveTab('chat'); }
    } catch (e) { console.error(e); }
  };

  const deleteSession = async (id: string) => {
    if (!isPro && !confirm("Hapus sesi ini?")) return;
    try {
      const res = await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const rem = sessions.filter(s => s.id !== id);
        setSessions(rem);
        if (activeSessionId === id && rem.length > 0) setActiveSessionId(rem[0].id);
        else if (rem.length === 0) await createNewSession("Main Workspace");
      }
    } catch (e) { console.error(e); }
  };

  const renameSession = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/chat-sessions/${id}/rename`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (res.ok) setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchSessions(); }, []);

  // ---- Streaming chat ----
  const handleManualMaximize = () => { setChatMinimized(false); setMinimizeTimer(0); };
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  const handleSend = async (text: string, file?: FilePayload) => {
    if (!activeSessionId || !activeSession) return;
    handleManualMaximize();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text || undefined, file };
    const stage1 = [...messages, userMsg];
    await saveSessionMessages(activeSessionId, stage1);
    setIsLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    const seed: Message = { id: modelMsgId, role: 'model', isTyping: true, text: '', logs: [] };
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...stage1, seed] } : s));

    const controller = new AbortController();
    abortRef.current = controller;
    const history = stage1.map(m => ({ role: m.role, text: m.text }));
    let accText = '', accLogs: any[] = [];

    const patch = (p: Partial<Message>) => setSessions(prev => prev.map(s => s.id !== activeSessionId ? s : { ...s, messages: s.messages.map(m => m.id === modelMsgId ? { ...m, ...p } : m) }));

    const toolStartQueue: any[] = [];
    await streamChat({ messages: history, model: selectedModel, provider: selectedProvider, persona, signal: controller.signal }, {
      onStatus: (msg) => patch({ statusMessage: msg }),
      onChunk: (chunk) => { if (chunk) { accText += chunk; patch({ text: accText, isTyping: false }); } },
      onToolStart: (data) => {
        if (data) {
          toolStartQueue.push({ toolName: data.toolName, args: data.toolArgs || {} });
          patch({ statusMessage: `Menjalankan tool: ${data.toolName}...` });
        }
      },
      onToolResult: (data) => {
        if (data) {
          const idx = toolStartQueue.findIndex(t => t.toolName === data.toolName);
          const startObj = idx >= 0 ? toolStartQueue.splice(idx, 1)[0] : { toolName: data.toolName, args: {} };
          accLogs.push({ toolName: data.toolName, args: startObj.args, result: data.result });
          patch({ logs: [...accLogs] });
        }
      },
      onDone: (result) => {
        const finalText = (result?.text && String(result.text).trim()) ? String(result.text) : (accText || '⚠️ Respons kosong.');
        const finalLogs = (Array.isArray(result?.logs) && result.logs.length) ? result.logs : accLogs;
        patch({ text: finalText, logs: finalLogs, isTyping: false, statusMessage: undefined });
        saveSessionMessages(activeSessionId, [...stage1, { id: modelMsgId, role: 'model', text: finalText, logs: finalLogs }]);
      },
      onError: (err) => patch({ text: (accText ? accText + '\n\n' : '') + `⚠️ ${err}`, isTyping: false })
    });

    // Guard: if the stream ended without a done/error event, finalize so the UI isn't stuck "typing".
    setSessions(prev => prev.map(s => s.id !== activeSessionId ? s : {
      ...s, messages: s.messages.map(m => (m.id === modelMsgId && m.isTyping) ? { ...m, isTyping: false, text: m.text || '⚠️ Respons tidak lengkap (stream berakhir).' } : m)
    }));

    abortRef.current = null;
    setIsLoading(false);
    setIdleTimer(300);
  };

  const handleStop = () => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; } setIsLoading(false); };

  // ---- Navigation ----
  const selectTab = (tab: NavTab) => {
    if (tab === 'chat') setActiveTab('chat');
    else { setActiveTab('settings'); setSettingsSection(tab === 'files' ? 'files' : tab === 'sync' ? 'sync' : tab === 'upgrade' ? 'upgrade' : 'general'); }
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ---- GitHub ----
  const fetchGithubUpdates = async () => {
    try { const r = await fetch('/api/github/updates'); setGithubUpdates(r.ok ? await r.json() : { hasUpdates: false }); }
    catch { setGithubUpdates({ hasUpdates: false }); }
  };
  useEffect(() => { fetchGithubUpdates(); const iv = setInterval(fetchGithubUpdates, 30000); return () => clearInterval(iv); }, []);

  const handleGitPullLatest = async () => {
    setIsPullingGit(true);
    try { const r = await fetch('/api/github/pull', { method: 'POST' }); const d = await r.json(); toast.success('Git Pull berhasil', 4000); await fetchGithubUpdates(); }
    catch (e: any) { toast.error(`Pull error: ${e.message}`); }
    finally { setIsPullingGit(false); }
  };
  const handleGitPushLatest = async () => {
    setIsPushingGit(true);
    try {
      const pat = localStorage.getItem('ROC_GITHUB_PAT') || '';
      const r = await fetch('/api/github/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pat }) });
      const d = await r.json();
      if (r.ok && d.status === 'success') { toast.success('Git Push berhasil'); await fetchGithubUpdates(); }
      else {
        const input = prompt(`GitHub PAT untuk push (error: ${d.error || 'unauthorized'}):`, pat);
        if (input) { localStorage.setItem('ROC_GITHUB_PAT', input); const r2 = await fetch('/api/github/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: input }) }); const d2 = await r2.json(); if (r2.ok && d2.status === 'success') { toast.success('Git Push berhasil'); await fetchGithubUpdates(); } else { toast.error(`Push gagal: ${d2.error}`); } }
      }
    } catch (e: any) { toast.error(`Push error: ${e.message}`); }
    finally { setIsPushingGit(false); }
  };

  return (
    <LoginGate>
    <Toaster />
    <div className={`flex h-[100dvh] w-full min-h-[100dvh] bg-theme-bg text-theme-text-primary overflow-hidden transition-colors duration-150 theme-${theme}`}>
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onOpenSession={(id) => { setActiveSessionId(id); setActiveTab('chat'); if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false); }}
        onNewSession={() => createNewSession()}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        availableModels={availableModels}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
        onSelectModel={(m) => { setSelectedModel(m.id); setSelectedProvider(m.provider); localStorage.setItem('ROC_MODEL', m.id); localStorage.setItem('ROC_PROVIDER', m.provider); }}
        activeTab={activeTab}
        onNavigateTab={selectTab}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        chatMinimized={chatMinimized}
        minimizeTimer={minimizeTimer}
        formatTime={formatTime}
      />

      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-10 md:hidden backdrop-blur-xs cursor-pointer" />}

      <main className="flex-1 flex flex-col bg-theme-bg overflow-hidden relative">
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          availableModels={availableModels}
          selectedModel={selectedModel}
          activeTab={activeTab}
          onNavigateTab={selectTab}
          terminalOpen={terminalOpen}
          setTerminalOpen={setTerminalOpen}
          showNotifyDropdown={showNotifyDropdown}
          setShowNotifyDropdown={setShowNotifyDropdown}
          githubUpdates={githubUpdates}
          isPullingGit={isPullingGit}
          isPushingGit={isPushingGit}
          onPull={handleGitPullLatest}
          onPush={handleGitPushLatest}
          theme={theme}
          setTheme={setTheme}
        />

        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onScrollToBottom={scrollToBottom}
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
            activeExecutionLogs={activeExecutionLogs}
            onSend={handleSend}
            onStop={handleStop}
            persona={persona}
            onPersonaChange={setPersona}
            sendOnEnter={sendOnEnter}
            availableModels={availableModels}
            selectedModel={selectedModel}
            selectedProvider={selectedProvider}
            onSelectModel={(m) => { setSelectedModel(m.id); setSelectedProvider(m.provider); localStorage.setItem('ROC_MODEL', m.id); localStorage.setItem('ROC_PROVIDER', m.provider); }}
          />
        )}

        {activeTab !== 'chat' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto shadow-lg backdrop-blur-md">
              {([['general', 'Pengaturan Umum', SettingsIcon], ['sync', 'Ecosystem Sync', RefreshCw], ['files', 'File Repository', HardDrive], ['upgrade', 'Upgrade Plan', Sparkles]] as const).map(([sec, label, Icon]) => (
                <button key={sec} onClick={() => { setActiveTab('settings'); setSettingsSection(sec); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${settingsSection === sec ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'}`}><Icon size={14} /><span>{label}</span></button>
              ))}
            </div>

            {settingsSection === 'sync' && <SyncDashboard userEmail={userEmail} userGithub={userGithub} />}
            {settingsSection === 'files' && <FileArchive activeSessionId={activeSessionId} />}
            {settingsSection === 'upgrade' && <UpgradePanel currentTier={'FREE'} onUpgradeSuccess={() => setActiveTab('chat')} />}

            {settingsSection === 'general' && (
              <div className="space-y-8">
                <AiProviderValidator onStatusUpdated={setAiProviderHasError} onOpenEnvModal={() => setEnvModalOpen(true)} onOpenEnvEditor={() => setSettingsSection('general')} />
                <EnvEditor isPro={isPro} userEmail={userEmail} onSaved={() => {}} />
                <SshSettings />
                <GitCredentials />

                <div>
                  <h3 className="text-lg font-semibold mb-1 flex items-center gap-2 text-theme-text-primary"><MessageSquare size={20} className="text-indigo-500" /> Chat Settings</h3>
                  <div className="bg-theme-sidebar border border-theme-border p-5 rounded-xl space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={sendOnEnter} onChange={(e) => setSendOnEnter(e.target.checked)} className="rounded border-theme-border bg-theme-input text-indigo-600 h-4 w-4 cursor-pointer" />
                      <span className="text-sm text-theme-text-primary">Send on Enter (Shift+Enter = newline)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={terminalOpen} onChange={(e) => setTerminalOpen(e.target.checked)} className="rounded border-theme-border bg-theme-input text-indigo-600 h-4 w-4 cursor-pointer" />
                      <span className="text-sm text-theme-text-primary">Console (Thinking &amp; Execution Log)</span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-theme-border pt-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-theme-text-primary"><Palette size={20} className="text-indigo-500" /> Color Theme</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                    <button onClick={() => setTheme('dark')} className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer ${theme === 'dark' ? 'border-indigo-500 bg-indigo-500/10' : 'border-theme-border bg-theme-sidebar hover:bg-theme-btn-hover'}`}>
                      <div className={`p-2.5 rounded-xl ${theme === 'dark' ? 'bg-indigo-600 text-white' : 'bg-theme-input text-theme-text-secondary'}`}><Moon size={20} /></div>
                      <div className="text-left"><div className="text-xs font-bold text-theme-text-primary">Dark (Default)</div></div>
                    </button>
                    <button onClick={() => setTheme('light')} className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer ${theme === 'light' ? 'border-indigo-500 bg-indigo-500/10' : 'border-theme-border bg-theme-sidebar hover:bg-theme-btn-hover'}`}>
                      <div className={`p-2.5 rounded-xl ${theme === 'light' ? 'bg-indigo-600 text-white' : 'bg-theme-input text-theme-text-secondary'}`}><Sun size={20} /></div>
                      <div className="text-left"><div className="text-xs font-bold text-theme-text-primary">Light</div></div>
                    </button>
                  </div>
                </div>

                <Suspense fallback={<div className="text-xs text-theme-text-muted p-6 text-center">Memuat Self-Development Hub…</div>}>
                  <SelfDevelopmentHub
                    isPro={isPro}
                    userEmail={userEmail}
                    activeSessionId={activeSessionId}
                    autoSaveMemoryEnabled={autoSaveMemoryEnabled}
                    autoSaveCapEnabled={autoSaveCapEnabled}
                    setAutoSaveMemoryEnabled={setAutoSaveMemoryEnabled}
                    setAutoSaveCapEnabled={setAutoSaveCapEnabled}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </main>

      {envModalOpen && <EnvConfigModal onClose={() => setEnvModalOpen(false)} onOpenEditor={() => setSettingsSection('general')} />}
    </div>
    </LoginGate>
  );
}
