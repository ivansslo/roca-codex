// Streaming SSE client for POST /api/agents/orchestra/stream.
// Mirrors lib/chatStream.ts (same SSE framing), but dispatches per-role
// step events instead of a single flat chat stream.

export interface AgentOrchestraHandlers {
  onRunStart?: (msg: string) => void;
  onStepStart?: (data: { role: string; title: string }) => void;
  onStepChunk?: (data: { role: string; text: string }) => void;
  onStepToolStart?: (data: any) => void;
  onStepToolResult?: (data: any) => void;
  onStepDone?: (data: { role: string; output: string; logs: any[] }) => void;
  onStepFailed?: (data: { role: string; error: string }) => void;
  onDone?: (result: any) => void;
  onError?: (err: string) => void;
}

export interface AgentOrchestraOptions {
  messages: any[];
  model?: string;
  provider?: string;
  persona?: string;
  pipeline?: 'fast' | 'engineering';
  signal?: AbortSignal;
}

export async function streamAgentOrchestra(opts: AgentOrchestraOptions, handlers: AgentOrchestraHandlers): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch('/api/agents/orchestra/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: opts.messages,
        model: opts.model,
        provider: opts.provider,
        persona: opts.persona,
        pipeline: opts.pipeline
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
        if (line.startsWith(':')) {
          continue; // keepalive comment
        } else if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          let data: any = raw;
          try { data = JSON.parse(raw); } catch { /* keep raw string */ }
          switch (currentEvent) {
            case 'run_start': handlers.onRunStart?.(data?.message ?? ''); break;
            case 'step_start': handlers.onStepStart?.(data); break;
            case 'step_chunk': handlers.onStepChunk?.(data); break;
            case 'step_tool_start': handlers.onStepToolStart?.(data); break;
            case 'step_tool_result': handlers.onStepToolResult?.(data); break;
            case 'step_done': handlers.onStepDone?.(data); break;
            case 'step_failed': handlers.onStepFailed?.(data); break;
            case 'run_done': break; // 'done' carries the same final payload
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
