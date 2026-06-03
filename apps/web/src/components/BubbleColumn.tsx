import type { ChatMessage } from "../types.js";

interface Props {
  side: "left" | "right";
  role: "assistant" | "user";
  messages: ChatMessage[];
  busy: boolean;
  /** 每侧最多展示的气泡数，更旧的淡出隐藏。 */
  max?: number;
}

/** 形象一侧的气泡列：新消息靠近中央/底部，旧消息向上淡出。 */
export function BubbleColumn({ side, role, messages, busy, max = 6 }: Props) {
  const mine = messages.filter((m) => m.role === role);
  const shown = mine.slice(-max);
  const lastIdx = shown.length - 1;
  return (
    <div className={`bubble-col bubble-col-${side}`}>
      {shown.map((m, i) => {
        const fromNewest = lastIdx - i;
        const opacity = Math.max(0.28, 1 - fromNewest * 0.18);
        const isStreamingPlaceholder = role === "assistant" && i === lastIdx && !m.content && busy;
        return (
          <div key={i} className={`bubble bubble-${side}`} style={{ opacity }}>
            <div className="bubble-role">{role === "user" ? "你" : "NewBee"}</div>
            <div className="bubble-text">{m.content || (isStreamingPlaceholder ? "…" : "")}</div>
          </div>
        );
      })}
    </div>
  );
}
