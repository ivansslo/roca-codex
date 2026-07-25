import React, { useState, useEffect } from 'react';
import { 
  Folder, FileText, Search, RefreshCw, Trash2, Download, Plus, 
  ChevronRight, ChevronDown, CheckCircle2, AlertCircle, X, HardDrive, Filter, Copy
} from 'lucide-react';

interface WorkspaceTreeItem {
  name: string;
  path: string;
  isDirectory: boolean;
  filesCount: number;
  sizeBytes: number;
}

export function FileArchive({ activeSessionId }: { activeSessionId?: string | null }) {
  const [treeItems, setTreeItems] = useState<WorkspaceTreeItem[]>([]);
  const [sessionFolders, setSessionFolders] = useState<any[]>([]);
  const [archiveMode, setArchiveMode] = useState<'global' | 'sessions'>('sessions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Selected file inspector
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [inspectedContent, setInspectedContent] = useState<string>('');
  const [inspectLoading, setInspectLoading] = useState(false);

  // File Upload Form state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('src/utils/systemConfig.ts');
  const [newFileContent, setNewFileContent] = useState(`export const SYSTEM_CONFIG = {
  owner: "Ivan Ssl (ivansslo)",
  cluster: "OCI Singapore (161.118.253.28)",
  webVirtCloud: "http://161.118.253.28/wvc/",
  memoryMode: "persistent_cognitive"
};`);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Fetch workspace tree items & per-session folders from backend
  const fetchWorkspaceTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, sessRes] = await Promise.all([
        fetch(`/api/workspace/tree?showHidden=${showHiddenFiles ? 'true' : 'false'}`),
        fetch('/api/workspace/sessions')
      ]);

      if (treeRes.ok && treeRes.headers.get("content-type")?.includes("application/json")) {
        const treeData = await treeRes.json();
        setTreeItems(treeData);
      }
      if (sessRes.ok && sessRes.headers.get("content-type")?.includes("application/json")) {
        const sessData = await sessRes.json();
        setSessionFolders(sessData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to retrieve workspace items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceTree();
  }, [showHiddenFiles]);

  const toggleFolderExpand = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Utility to format sizes into MB/KB
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Delete project or file
  const handleDeleteItem = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete '${path}' from the workspace?`)) return;

    try {
      const response = await fetch(`/api/workspace/item?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setUploadSuccess(`Deleted '${path}' successfully.`);
        fetchWorkspaceTree();
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        const data = await response.json();
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Inspect file content
  const inspectFile = async (path: string) => {
    setSelectedFilePath(path);
    setInspectLoading(true);
    try {
      const response = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const text = await response.text();
        setInspectedContent(text);
      } else {
        setInspectedContent("Failed to read file content.");
      }
    } catch (err: any) {
      setInspectedContent(`Error: ${err.message}`);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath || !newFileContent) return;

    setUploadLoading(true);
    setUploadSuccess(null);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: newFilePath,
          content: newFileContent,
          isText: true
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      setUploadSuccess(`Successfully created and saved ${newFilePath}!`);
      setShowUploadModal(false);
      fetchWorkspaceTree();
      setTimeout(() => setUploadSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full">
      
      {/* Workspace Modal Sheet Container styled matching screenshot */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5">
        
        {/* Header matching screenshot */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <Folder className="text-indigo-400" size={22} />
            <h1 className="text-xl font-bold text-slate-100 font-sans tracking-tight">Workspace</h1>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/workspace/zip-dir?path="
              download="workspace-full-archive.zip"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Download Full Workspace ZIP"
            >
              <Download size={16} />
            </a>

            <button
              onClick={() => setShowUploadModal(true)}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add File</span>
            </button>

            <button
              onClick={fetchWorkspaceTree}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
              title="Refresh tree"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs: Per-Session History Workspaces vs Global Root */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 font-mono text-xs select-none">
          <button
            type="button"
            onClick={() => setArchiveMode('sessions')}
            className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              archiveMode === 'sessions'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Folder size={15} className="text-indigo-300" />
            <span>Chat Session Workspaces ({sessionFolders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setArchiveMode('global')}
            className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              archiveMode === 'global'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <HardDrive size={15} className="text-indigo-300" />
            <span>Global Root Archive</span>
          </button>
        </div>

        {/* Show hidden files toggle switch */}
        <div className="flex items-center justify-between py-1 px-1 text-xs text-slate-400 font-medium">
          <span>Show hidden files</span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHiddenFiles}
              onChange={(e) => setShowHiddenFiles(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Status Alerts */}
        {uploadSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium animate-fade-in">
            <CheckCircle2 size={16} />
            <span>{uploadSuccess}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Per-Session History Workspaces View */}
        {archiveMode === 'sessions' ? (
          <div className="space-y-4">
            {sessionFolders.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-950/60 p-6 rounded-2xl border border-dashed border-slate-800">
                No session project folders created yet. Start a new chat session to generate a dedicated workspace history directory under /sessions/.
              </div>
            ) : (
              sessionFolders.map((sess) => {
                const isExpanded = expandedFolders[sess.path] ?? true;

                return (
                  <div key={sess.id} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 font-mono text-xs shadow-lg">
                    <div 
                      onClick={() => toggleFolderExpand(sess.path)}
                      className="flex items-center justify-between cursor-pointer select-none border-b border-slate-800/80 pb-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {isExpanded ? <ChevronDown size={15} className="text-indigo-400" /> : <ChevronRight size={15} className="text-slate-500" />}
                        <Folder size={18} className="text-indigo-400 flex-shrink-0" />
                        <div className="truncate">
                          <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 truncate">
                            <span>{sess.title}</span>
                            {activeSessionId === sess.id && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">ACTIVE CHAT</span>
                            )}
                          </h3>
                          <span className="text-[10px] text-slate-500 font-mono">{sess.path}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-indigo-300 bg-indigo-950 px-2 py-1 rounded border border-indigo-800/60">
                          {sess.filesCount} file{sess.filesCount !== 1 ? 's' : ''} ({formatBytes(sess.sizeBytes)})
                        </span>
                        <a
                          href={`/api/workspace/zip-dir?path=${encodeURIComponent(sess.path)}`}
                          download={`${sess.id}-archive.zip`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold shadow-sm"
                          title={`Archive & Download '${sess.title}' Workspace as ZIP`}
                        >
                          <Download size={13} />
                          <span className="hidden sm:inline">ZIP Archive</span>
                        </a>
                      </div>
                    </div>

                    {/* Session Files inside folder */}
                    {isExpanded && (
                      <div className="space-y-1.5 pl-3 pt-1">
                        {sess.files && sess.files.length > 0 ? (
                          sess.files.map((file: any, fIdx: number) => (
                            <div key={fIdx} className="space-y-2">
                              <div
                                onClick={() => inspectFile(file.path)}
                                className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 cursor-pointer text-xs transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                  <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                                  <span className="text-slate-200 font-semibold truncate">{file.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">{formatBytes(file.sizeBytes)}</span>
                              </div>

                              {selectedFilePath === file.path && (
                                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono animate-fade-in shadow-2xl">
                                  <div className="flex items-center justify-between mb-2 text-indigo-300 font-bold border-b border-slate-800 pb-2">
                                    <span className="truncate">PREVIEW: {file.path}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(inspectedContent);
                                          alert("Copied to clipboard!");
                                        }}
                                        className="px-2 py-1 bg-slate-800 text-slate-200 rounded text-xs"
                                      >
                                        Copy
                                      </button>
                                      <button onClick={() => setSelectedFilePath(null)} className="text-slate-400 hover:text-white">
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  <pre className="p-2.5 text-slate-100 overflow-x-auto whitespace-pre-wrap leading-relaxed text-xs font-mono bg-slate-950 max-h-60 rounded border border-slate-800">
                                    {inspectedContent}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-slate-500 italic py-2">Folder empty. Uploaded or created files in this chat will be saved here.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Global Directory & Project List Tree */
          <div className="space-y-1 divide-y divide-slate-800/40">
            {treeItems.map((item) => {
              const isExpanded = expandedFolders[item.path];

              return (
                <div key={item.path} className="pt-2 pb-2">
                  <div 
                    onClick={() => item.isDirectory ? toggleFolderExpand(item.path) : inspectFile(item.path)}
                    className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer text-xs font-mono select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                      <span className="text-slate-500 flex-shrink-0">
                        {item.isDirectory ? (
                          isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />
                        ) : (
                          <FileText size={15} className="text-indigo-400" />
                        )}
                      </span>

                      <Folder size={16} className={item.isDirectory ? "text-slate-300" : "text-indigo-400"} />
                      <span className="font-semibold text-slate-100 truncate">{item.name}</span>
                    </div>

                    {/* Size, File Count Badges & Row Action Buttons */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                        {item.isDirectory && <span>{item.filesCount} files</span>}
                        {item.isDirectory && <span>·</span>}
                        <span>{formatBytes(item.sizeBytes)}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={`/api/workspace/zip-dir?path=${encodeURIComponent(item.path)}`}
                          download={`${item.name}-archive.zip`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-indigo-300 rounded-lg transition-colors"
                          title={`Archive / Download '${item.name}' as ZIP`}
                        >
                          <Download size={14} />
                        </a>

                        <button
                          onClick={(e) => handleDeleteItem(item.path, e)}
                          className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                          title={`Delete '${item.name}'`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Sub-view file content preview if open */}
                  {selectedFilePath === item.path && (
                    <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono animate-fade-in shadow-2xl">
                      <div className="flex items-center justify-between mb-2 text-indigo-300 font-bold border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                          <span className="truncate">FILE PREVIEW: {item.path}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(inspectedContent);
                              alert("File content copied to clipboard!");
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors border border-slate-700/60"
                            title="Copy Script"
                          >
                            <Copy size={12} />
                            <span>Copy</span>
                          </button>
                          <a
                            href={`data:text/plain;charset=utf-8,${encodeURIComponent(inspectedContent)}`}
                            download={item.name}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                            title="Download Script File"
                          >
                            <Download size={12} />
                            <span>Download</span>
                          </a>
                          <button onClick={() => setSelectedFilePath(null)} className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {inspectLoading ? (
                        <div className="py-6 text-center text-slate-500 animate-pulse font-mono">Reading content...</div>
                      ) : (
                        <div className="flex overflow-x-auto leading-relaxed select-text bg-slate-950 max-h-80 border border-slate-800/80 rounded-lg">
                          <div className="py-2.5 px-2 bg-slate-900/40 text-slate-600 text-[11px] font-mono select-none text-right border-r border-slate-800/80 flex flex-col min-w-[2.2rem]">
                            {inspectedContent.split('\n').map((_, i) => (
                              <span key={i} className="leading-5">{i + 1}</span>
                            ))}
                          </div>
                          <pre className="p-2.5 text-slate-100 overflow-x-auto whitespace-pre-wrap flex-1 leading-5 text-xs font-mono bg-slate-950">
                            {inspectedContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-slate-100 uppercase tracking-wider">Archive New Workspace File</span>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 font-bold mb-1">TARGET FILE PATH</label>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. src/utils/helper.ts"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">FILE CONTENT</label>
                <textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploadLoading}
                  onClick={(e) => handleUploadSubmit(e)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer transition-all"
                >
                  {uploadLoading ? "Saving..." : "Save to Workspace"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
