import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types.js";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
}

/** 顶部上下文流：按时间顺序的对话气泡，新消息在底部，自动滚到底。复用现有 .bubble 样式。 */
export function ContextStream({ messages, busy }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  const lastIdx = messages.length - 1;
  return (
    <div className="context-stream">
      {messages.map((m, i) => {
        const streamingPlaceholder = m.role === "assistant" && i === lastIdx && !m.content && busy;
        return (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-role">{m.role === "user" ? "你" : "NewBee"}</div>
            <div className="bubble-text">{m.content || (streamingPlaceholder ? "…" : "")}</div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
