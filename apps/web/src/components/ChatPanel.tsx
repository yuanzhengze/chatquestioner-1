import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types.js";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  // 跟随最新消息：消息数变化（新气泡）或最后一条内容增长（流式 token）时滚到底。
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.content]);
  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft("");
  };
  return (
    <div className="chat">
      <div className="chat-stream" ref={streamRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-role">{m.role === "user" ? "你" : "NewBee"}</div>
            <div className="bubble-text">{m.content || (busy ? "…" : "")}</div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={draft}
          placeholder="说说你的脑洞…（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button disabled={busy} onClick={submit}>{busy ? "思考中…" : "发送"}</button>
      </div>
    </div>
  );
}
