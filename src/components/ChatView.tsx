import React from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { Message } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { LiveTerminal } from './LiveTerminal';

interface ChatViewProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onScrollToBottom: () => void;
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  activeExecutionLogs: any[];
  onSend: (text: string, file?: any) => void;
  onStop: () => void;
  persona: string;
  onPersonaChange: (id: string) => void;
  sendOnEnter: boolean;
  availableModels: any[];
  selectedModel: string;
  selectedProvider: string;
  onSelectModel: (model: any) => void;
}

export function ChatView({
  messages, isLoading, messagesEndRef, onScrollToBottom,
  terminalOpen, setTerminalOpen, activeExecutionLogs,
  onSend, onStop, persona, onPersonaChange, sendOnEnter,
  availableModels, selectedModel, selectedProvider, onSelectModel
}: ChatViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col justify-between min-w-0 min-h-0 relative">
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="py-24 text-center">
              <Bot size={40} className="mx-auto text-indigo-500 animate-pulse mb-3" />
              <p className="text-sm font-semibold text-theme-text-primary">Empty chat session.</p>
              <p className="text-xs text-theme-text-muted mt-1">Kirim prompt di bawah untuk memulai.</p>
            </div>
          ) : (
            messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="relative h-0 w-full z-30">
          <div className="absolute -top-11 right-6">
            <button type="button" onClick={onScrollToBottom} className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/40 rounded-full shadow-2xl transition-all cursor-pointer hover:scale-105 active:scale-95" title="Scroll ke Bawah">
              <ChevronDown size={14} className="animate-bounce" />
            </button>
          </div>
        </div>

        {terminalOpen && (
          <div className="border-t border-theme-border bg-neutral-950 p-2.5 sm:p-3 max-h-44 overflow-hidden flex flex-col justify-between">
            <div className="mb-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold font-mono text-[10px] uppercase tracking-wider">Console (Thinking & Execution Log)</span>
              </div>
              <button onClick={() => setTerminalOpen(false)} className="text-neutral-400 hover:text-white text-[10px] font-mono cursor-pointer">Hide</button>
            </div>
            <div className="max-h-28 overflow-y-auto">
              <LiveTerminal isLoading={isLoading} logs={activeExecutionLogs} />
            </div>
          </div>
        )}

        <div className="p-4 border-t border-theme-border bg-theme-sidebar/10">
          <ChatInput onSend={onSend} disabled={isLoading} sendOnEnter={sendOnEnter} persona={persona} onPersonaChange={onPersonaChange} onStop={onStop} availableModels={availableModels} selectedModel={selectedModel} selectedProvider={selectedProvider} onSelectModel={onSelectModel} />
        </div>
      </div>
    </div>
  );
}
