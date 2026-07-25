export interface ImagePayload {
  data: string; // base64 without prefix
  mimeType: string;
  url: string; // full data URI for preview
}

export interface FilePayload {
  name: string;
  size: number;
  type: string;
  content: string; // content (text or base64)
  isText: boolean;
  savedToWorkspace: boolean;
}

export interface ToolLog {
  toolName: string;
  args: any;
  result: any;
}

export interface Message {
  id: string;
  role: "user" | "model";
  text?: string;
  image?: ImagePayload;
  file?: FilePayload;
  isTyping?: boolean;
  statusMessage?: string;
  logs?: ToolLog[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

export interface FileMeta {
  name: string;
  path: string;
  size: number;
  updatedAt: string;
  isText: boolean;
}

export interface AppSyncInfo {
  id: string;
  name: string;
  status: 'unsynced' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  url: string;
  componentsCount: number;
  filesCount: number;
  apiEndpointsCount: number;
  description: string;
  syncLogs: string[];
}
