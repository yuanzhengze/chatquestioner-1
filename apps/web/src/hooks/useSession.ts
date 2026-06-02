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

export function useSession(): UseSession {
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<RecognizedState | null>(null);
  const [stage, setStage] = useState<StageInfo | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef<string>("");

  useEffect(() => {
    createSession()
      .then(({ id, opening }) => {
        setId(id);
        setMessages([{ role: "assistant", content: opening }]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    streamingRef.current = "";

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
    }).catch((e) => {
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
