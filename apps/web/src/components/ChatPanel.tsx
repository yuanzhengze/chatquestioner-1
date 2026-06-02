import { useState } from "react";
import type { ChatMessage } from "../types.js";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft("");
  };
  return (
    <div className="chat">
      <div className="chat-stream">
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
