import type { StateDelta } from "./merge.js";

export const STATE_SENTINEL = "<<<STATE>>>";

export interface TurnControl {
  stateDelta: StateDelta;
  stageComplete: boolean;
  readyForSynthesis: boolean;
}

export interface ParsedTurn {
  reply: string;
  control: TurnControl;
  warnings: string[];
}

function emptyControl(): TurnControl {
  return { stateDelta: {}, stageComplete: false, readyForSynthesis: false };
}

/** 从 sentinel 之后的尾段抽出 JSON 对象并解析；失败返回 null。 */
function extractJson(tail: string): Record<string, unknown> | null {
  let text = tail.trim();
  // 去掉 ```json ... ``` 代码栅栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseTurnOutput(raw: string): ParsedTurn {
  const idx = raw.indexOf(STATE_SENTINEL);
  if (idx === -1) {
    return { reply: raw.trim(), control: emptyControl(), warnings: ["缺少 STATE 哨兵，本轮不推进阶段"] };
  }
  const reply = raw.slice(0, idx).trim();
  const json = extractJson(raw.slice(idx + STATE_SENTINEL.length));
  if (!json) {
    return { reply, control: emptyControl(), warnings: ["STATE 块无法解析，本轮不推进阶段"] };
  }
  return {
    reply,
    control: {
      stateDelta: (json.state_delta ?? {}) as StateDelta,
      stageComplete: json.stage_complete === true,
      readyForSynthesis: json.ready_for_synthesis === true,
    },
    warnings: [],
  };
}
