import type { StateDelta } from "./merge.js";

export const STATE_SENTINEL = "<<<STATE>>>";

export interface TurnControl {
  stateDelta: StateDelta;
  stageComplete: boolean;
  readyForSynthesis: boolean;
}

export interface TurnOption {
  id: string;
  label: string;
  detail: string;
}

export interface ParsedTurn {
  reply: string;
  control: TurnControl;
  warnings: string[];
  options?: TurnOption[];
}

function emptyControl(): TurnControl {
  return { stateDelta: {}, stageComplete: false, readyForSynthesis: false };
}

/** 从文本中抽出 JSON 对象并解析；失败返回 null。 */
export function parseJsonObject(tail: string): Record<string, unknown> | null {
  let text = tail.trim();
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

function textOf(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const OPTION_IDS = ["A", "B", "C", "D"] as const;

/** 把「自己输入 / Other」类选项丢掉；输入框已经能打字。 */
export function isOpenEndedOption(label: string, detail: string): boolean {
  const t = `${label}\n${detail}`;
  return /我有其他更好|我有别的想法|我有其他想法|我有其他更有趣|或者你有其他|或者其他更|自己输入|自己说吧|直接告诉我你的|直接告诉我|开放回答|开放口|选这项自己|Other/i.test(t);
}

/** 收下 2~4 项实质方向；缺 id/detail 时尽量补齐。开放口选项会被丢掉。 */
function parseOptions(raw: unknown): TurnOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TurnOption[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = textOf(o.label, o.title, o.text, o.detail);
    const detail = textOf(o.detail, o.description, o.body, label);
    if (!label || !detail) continue;
    if (isOpenEndedOption(label, detail)) continue;
    out.push({ id: OPTION_IDS[out.length], label, detail });
  }
  return out.length >= 2 ? out : undefined;
}

export function parseTurnOutput(raw: string): ParsedTurn {
  const idx = raw.indexOf(STATE_SENTINEL);
  if (idx === -1) {
    return { reply: raw.trim(), control: emptyControl(), warnings: ["缺少 STATE 哨兵，本轮不推进阶段"] };
  }
  const reply = raw.slice(0, idx).trim();
  const json = parseJsonObject(raw.slice(idx + STATE_SENTINEL.length));
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
    options: parseOptions(json.options),
  };
}
