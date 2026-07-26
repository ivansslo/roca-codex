// Streaming SSE client for POST /api/chat/stream.
// Parses `event: X\ndata: {...}` frames and dispatches typed callbacks.
// This gives first-token-fast perceived speed instead of waiting for the whole reply.

export interface ChatStreamHandlers {
  onStatus?: (msg: string) => void;
  onChunk?: (text: string) => void;
  onToolStart?: (data: any) => void;
  onToolResult?: (data: any) => void;
  onToolOutput?: (data: any) => void;
  onDone?: (result: any) => void;
  onError?: (err: string) => void;
}

export interface ChatStreamOptions {
  messages: any[];
  model?: string;
  provider?: string;
  persona?: string;
  signal?: AbortSignal;
}

export async function streamChat(opts: ChatStreamOptions, handlers: ChatStreamHandlers): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: opts.messages,
        model: opts.model,
        provider: opts.provider,
        persona: opts.persona
      }),
      signal: opts.signal
    });
  } catch (e: any) {
    if (e?.name !== 'AbortError') handlers.onError?.(e?.message || 'Koneksi gagal');
    return;
  }

  if (!resp.ok || !resp.body) {
    handlers.onError?.(`HTTP ${resp.status}`);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          let data: any = raw;
          try { data = JSON.parse(raw); } catch { /* keep raw string */ }
          switch (currentEvent) {
            case 'status': handlers.onStatus?.(data?.message ?? ''); break;
            case 'chunk': handlers.onChunk?.(typeof data === 'string' ? data : data?.text ?? ''); break;
            case 'tool_start': handlers.onToolStart?.(data); break;
            case 'tool_result': handlers.onToolResult?.(data); break;
            case 'tool_output': handlers.onToolOutput?.(data); break;
            case 'done': handlers.onDone?.(data); break;
            case 'error': handlers.onError?.(typeof data === 'string' ? data : data?.error ?? 'Stream error'); break;
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') handlers.onError?.(e?.message || 'Stream terputus');
  }
}
