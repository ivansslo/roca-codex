import React, { useRef, useState } from 'react';
import { Paperclip, Send, X, FileText, AlertCircle, Folder, Square, Target } from 'lucide-react';
import { FilePayload } from '../types';
import { PersonaSelector } from './PersonaSelector';
import { ModelQuickSwitch } from './ModelQuickSwitch';

interface ChatInputProps {
  onSend: (text: string, file?: FilePayload) => void;
  disabled?: boolean;
  retryOnError?: boolean;
  onRetryOnErrorChange?: (value: boolean) => void;
  sendOnEnter?: boolean;
  persona?: string;
  onPersonaChange?: (id: string) => void;
  onStop?: () => void;
  availableModels?: any[];
  selectedModel?: string;
  selectedProvider?: string;
  onSelectModel?: (model: any) => void;
}

export function ChatInput({ onSend, disabled, retryOnError, onRetryOnErrorChange, sendOnEnter = true, persona = 'balanced', onPersonaChange, onStop, availableModels = [], selectedModel = '', selectedProvider = '', onSelectModel }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState<FilePayload | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveToWorkspace, setSaveToWorkspace] = useState(true);
  const [targetPath, setTargetPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    const reader = new FileReader();
    const isTextFile = file.type.startsWith('text/') || /\.(ts|tsx|js|jsx|json|css|html|md|txt|csv|yml|yaml|xml|env|example)$/i.test(file.name);

    reader.onloadend = () => {
      const result = reader.result as string;
      setAttachedFile({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        content: isTextFile ? result : result.split(',')[1] || '',
        isText: isTextFile,
        savedToWorkspace: false
      });
      setTargetPath(file.name);
      setIsProcessing(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    };

    if (isTextFile) reader.readAsText(file);
    else reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if ((!text.trim() && !attachedFile) || disabled || isProcessing) return;

    setError(null);
    let finalFile = attachedFile ? { ...attachedFile } : undefined;

    if (attachedFile && saveToWorkspace) {
      try {
        setIsProcessing(true);
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filename: targetPath || attachedFile.name, 
            content: attachedFile.content,
            isText: attachedFile.isText
          })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to save file');
        }
        finalFile!.savedToWorkspace = true;
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to upload and save file to workspace.');
        setIsProcessing(false);
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    const textToSend = text.trim();
    setText('');
    setAttachedFile(null);
    setTargetPath('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    onSend(textToSend, finalFile);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && sendOnEnter !== false) {
      e.preventDefault();
      e.stopPropagation();
      handleSendMessage(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="w-full select-none">
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-xl flex items-center justify-between text-xs text-red-400 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {attachedFile && (
        <div className="mb-4 p-3 bg-theme-sidebar border border-theme-border rounded-xl flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-lg"><FileText size={20} /></div>
              <div>
                <p className="text-sm font-semibold text-theme-text-primary">{attachedFile.name}</p>
                <p className="text-xs text-theme-text-secondary">{(attachedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button type="button" onClick={() => setAttachedFile(null)} className="text-theme-text-muted hover:text-theme-text-primary transition-colors cursor-pointer"><X size={16} /></button>
          </div>
          
          <div className="flex flex-col gap-1.5 pt-2 border-t border-theme-border">
            <label className="text-[11px] font-semibold text-theme-text-secondary uppercase tracking-wider">Save Location in Workspace</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="e.g. src/components/MyComponent.tsx"
                className="flex-1 text-xs bg-theme-input border border-theme-border rounded-lg px-2.5 py-1.5 text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <label className="flex items-center gap-1.5 text-xs text-theme-text-secondary select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToWorkspace}
                  onChange={(e) => setSaveToWorkspace(e.target.checked)}
                  className="rounded border-theme-border bg-theme-input text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Auto-Write</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Container div matching Screenshot 2 design */}
      <div className="relative flex flex-col bg-theme-input border border-theme-border shadow-2xl rounded-2xl p-3 gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to do?"
          className="w-full max-h-[120px] min-h-[40px] py-1 px-1 bg-transparent border-none focus:outline-none resize-none text-theme-text-primary placeholder-theme-text-muted text-sm font-sans"
        />

        <div className="flex items-center justify-between pt-1 border-t border-theme-border/60">
          {/* Left: persona selector + model switch + attachment */}
          <div className="flex items-center gap-2">
            {onPersonaChange && (
              <PersonaSelector value={persona} onChange={onPersonaChange} />
            )}
            {onSelectModel && availableModels.length > 0 && (
              <ModelQuickSwitch availableModels={availableModels} selectedModel={selectedModel} selectedProvider={selectedProvider} onSelectModel={onSelectModel} />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 border border-theme-border bg-theme-btn-hover text-theme-text-secondary hover:text-theme-text-primary rounded-xl transition-all cursor-pointer shadow-xs"
              title="Attach file context"
            >
              <Paperclip size={18} />
            </button>
          </div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 border border-theme-border bg-theme-btn-hover text-theme-text-secondary hover:text-theme-text-primary rounded-xl transition-all cursor-pointer shadow-xs"
              title="Browse workspace files"
            >
              <Folder size={18} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                if ((disabled || isProcessing) && onStop) { onStop(); return; }
                handleSendMessage(e);
              }}
              disabled={(!text.trim() && !attachedFile) && !(disabled || isProcessing)}
              className="p-2 border border-theme-border bg-theme-btn-active text-theme-text-primary rounded-xl disabled:opacity-40 transition-all cursor-pointer shadow-sm flex items-center justify-center"
              title={(disabled || isProcessing) ? "Stop generating" : "Submit prompt"}
            >
              {disabled || isProcessing ? (
                <Square size={16} className="text-amber-400 animate-pulse fill-amber-400" />
              ) : (
                <Target size={18} className="text-theme-text-primary" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
