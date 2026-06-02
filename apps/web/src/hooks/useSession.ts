import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, getSession, sendMessage, exportBundle } from "../api.js";
import type { ChatMessage, RecognizedState, StageInfo, SynthesisPayload } from "../types.js";

export interface UseSession {
  messages: ChatMessage[];
  state: RecognizedState | null;
  stage: StageInfo | null;
  synthesis: SynthesisPayload | null;
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  doExport: () => Promise<void>;
}

/** fetch/abort 取消会抛 AbortError（DOMException），属预期、不应作为用户可见错误。 */
function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

export function useSession(): UseSession {
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<RecognizedState | null>(null);
  const [stage, setStage] = useState<StageInfo | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef<string>("");
  const sendAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // StrictMode（dev）会 mount→unmount→mount。用 AbortController 取消首挂的在途
    // createSession，并在 .then 前用 signal.aborted 守门，确保最终只采用一个会话。
    const controller = new AbortController();
    createSession(controller.signal)
      .then(({ id, opening }) => {
        if (controller.signal.aborted) return;
        setId(id);
        setMessages([{ role: "assistant", content: opening }]);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(String(e));
      });
    return () => {
      controller.abort();
      // 卸载时中断仍在进行的 send 流，避免悬挂的 SSE 读取。
      sendAbortRef.current?.abort();
    };
  }, []);

  const send = useCallback(async (text: string) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    streamingRef.current = "";

    const controller = new AbortController();
    sendAbortRef.current = controller;

    await sendMessage(id, text, {
      onToken: (t) => {
        streamingRef.current += t;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: streamingRef.current };
          return copy;
        });
      },
      onState: (s) => setState(s),
      onStage: (info) => setStage(info),
      onSynthesis: (p) => setSynthesis(p),
      onError: (msg) => setError(msg),
      onDone: () => setBusy(false),
    }, controller.signal).catch((e) => {
      // 主动 abort（卸载）走 AbortError，不应冒泡为用户错误。
      if (isAbortError(e)) return;
      setError(String(e));
      setBusy(false);
    });
  }, [id, busy]);

  const doExport = useCallback(async () => {
    if (!id) return;
    try {
      const res = await exportBundle(id);
      setSynthesis(res);
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  // 刷新页面后可按需补拉快照（保留 hook，UI 暂不触发）
  void getSession;

  return { messages, state, stage, synthesis, busy, error, send, doExport };
}
