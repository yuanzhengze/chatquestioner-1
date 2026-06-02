import { parseSseEvents, type SseEvent } from "./sse.js";
import type { RecognizedState, SynthesisPayload } from "./types.js";

const BASE = "/api";

export async function createSession(signal?: AbortSignal): Promise<{ id: string; opening: string }> {
  const r = await fetch(`${BASE}/session`, { method: "POST", signal });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  return r.json();
}

export async function getSession(id: string): Promise<RecognizedState> {
  const r = await fetch(`${BASE}/session/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

export interface SseHandlers {
  onToken?: (text: string) => void;
  onState?: (state: RecognizedState) => void;
  onStage?: (info: { stage: number; label: string; readyForSynthesis: boolean }) => void;
  onSynthesis?: (payload: SynthesisPayload) => void;
  onWarning?: (messages: string[]) => void;
  onError?: (message: string) => void;
  onDone?: (readyForSynthesis: boolean) => void;
}

function dispatch(ev: SseEvent, h: SseHandlers): void {
  switch (ev.event) {
    case "token": h.onToken?.((ev.data as { text: string }).text); break;
    case "state": h.onState?.(ev.data as RecognizedState); break;
    case "stage": h.onStage?.(ev.data as { stage: number; label: string; readyForSynthesis: boolean }); break;
    case "synthesis": h.onSynthesis?.(ev.data as SynthesisPayload); break;
    case "warning": h.onWarning?.((ev.data as { messages: string[] }).messages); break;
    case "error": h.onError?.((ev.data as { message: string }).message); break;
    case "done": h.onDone?.((ev.data as { readyForSynthesis: boolean }).readyForSynthesis); break;
  }
}

/** POST 一条消息并消费 SSE 流。signal 可中断在途请求与读流。 */
export async function sendMessage(
  id: string,
  message: string,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`sendMessage failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseEvents(buffer);
      buffer = rest;
      for (const ev of events) dispatch(ev, handlers);
    }
  } finally {
    // 无论正常结束、handler 抛错还是 abort，都释放锁，避免流挂死。
    reader.releaseLock();
  }
}

export async function exportBundle(id: string): Promise<SynthesisPayload & { dir: string }> {
  const r = await fetch(`${BASE}/session/${id}/export`, { method: "POST" });
  if (!r.ok) throw new Error(`export failed: ${r.status}`);
  return r.json();
}
