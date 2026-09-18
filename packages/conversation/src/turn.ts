import type { StateDelta } from "./merge.js";

export const STATE_SENTINEL = "<<<STATE>>>";

export interface TurnControl {
  stateDelta: StateDelta;
  stageComplete: boolean;
  readyForSynthesis: boolean;
  affectedLines?: string[];
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

function parseAffectedLines(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return out.length ? out : undefined;
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

/** 收敛三选：定稿 / 改一块 / 再挖挖。采访轮要从模型选项里剔掉。 */
export function isMetaForkOption(label: string, detail: string): boolean {
  const t = `${label}\n${detail}`;
  return /就按这个定稿|写成设计文档|确认总结.*生成|生成设计文档|核心对.*改|再挖挖|改某一块|改一块|应用这些改动|再改改说法/.test(t);
}

/** 只留实质设计方向，去掉定稿/再挖这类收敛选项。 */
export function designOptionsOnly(opts?: TurnOption[]): TurnOption[] | undefined {
  if (!opts?.length) return undefined;
  const out: TurnOption[] = [];
  for (const o of opts) {
    if (!o?.label || !o?.detail) continue;
    if (isOpenEndedOption(o.label, o.detail)) continue;
    if (isMetaForkOption(o.label, o.detail)) continue;
    out.push({ id: OPTION_IDS[out.length], label: o.label, detail: o.detail });
    if (out.length >= 4) break;
  }
  return out.length >= 2 ? out : undefined;
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

/** 行首 A./B./C. 选项块（模型常只写在人话里、JSON options 为空）。 */
const OPTION_START = /^[ \t>]*([A-Da-d])(?:[\.、．:：)\]、]|）)\s+(\S.*)$/;

function collectOptionBlocks(text: string): { id: string; body: string }[] {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: { id: string; body: string }[] = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(OPTION_START);
    if (m) {
      inList = true;
      blocks.push({ id: m[1].toUpperCase(), body: m[2].trim() });
      continue;
    }
    if (!inList || !blocks.length) continue;
    const t = line.trim();
    if (!t) {
      inList = false;
      continue;
    }
    if (/^[>💡❓📌]/.test(t) || (/[？?]$/.test(t) && blocks.length >= 2)) {
      inList = false;
      continue;
    }
    blocks[blocks.length - 1].body += ` ${t}`;
  }
  return blocks;
}

function optionBodyToPair(body: string): { label: string; detail: string } | null {
  const t = body.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const boldColon = t.match(/^\*{1,2}(.+?)\*{1,2}\s*[：:]\s*(.*)$/);
  if (boldColon) {
    const label = boldColon[1].replace(/^\*+|\*+$/g, "").trim().slice(0, 40);
    const detail = (boldColon[2].trim() || boldColon[1]).trim();
    return label ? { label, detail } : null;
  }
  const boldRest = t.match(/^\*{1,2}(.+?)\*{1,2}\s*(.*)$/);
  if (boldRest) {
    const label = boldRest[1].replace(/^\*+|\*+$/g, "").trim().slice(0, 40);
    const rest = boldRest[2].replace(/^[：:]\s*/, "").trim();
    if (!label) return null;
    return { label, detail: rest || label };
  }
  const colon = t.search(/[：:]/);
  if (colon > 0 && colon <= 48) {
    const label = t.slice(0, colon).replace(/\*+/g, "").trim().slice(0, 40);
    const detail = t.slice(colon + 1).replace(/^\*+|\*+$/g, "").trim() || label;
    return label ? { label, detail } : null;
  }
  const label = t.replace(/\*+/g, "").trim().slice(0, 40);
  return label ? { label, detail: t } : null;
}

/** JSON options 缺失时，从人话 A/B/C 列表收回可点卡片。 */
export function recoverOptionsFromProse(text: string): TurnOption[] | undefined {
  const out: TurnOption[] = [];
  for (const block of collectOptionBlocks(text).slice(0, 4)) {
    const pair = optionBodyToPair(block.body);
    if (!pair) continue;
    if (isOpenEndedOption(pair.label, pair.detail)) continue;
    out.push({ id: OPTION_IDS[out.length], label: pair.label, detail: pair.detail });
  }
  return out.length >= 2 ? out : undefined;
}

/** 卡片由宿主弹出后，人话里不再重复 A/B 列表。 */
export function stripOptionProse(text: string): string {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (OPTION_START.test(lines[i])) starts.push(i);
  }
  if (starts.length < 2) return raw.trim();
  const first = starts[0];
  let end = starts[starts.length - 1];
  for (let i = end + 1; i < lines.length; i++) {
    if (OPTION_START.test(lines[i])) {
      end = i;
      continue;
    }
    const t = lines[i].trim();
    if (!t) break;
    if (/^[>💡❓📌]/.test(t) || /[？?]$/.test(t)) break;
    end = i;
  }
  const before = lines.slice(0, first).join("\n").trim();
  const after = lines.slice(end + 1).join("\n").trim();
  return [before, after].filter(Boolean).join("\n\n").trim();
}

function withHostOptions(
  reply: string,
  control: TurnControl,
  warnings: string[],
  jsonOptions?: unknown,
): ParsedTurn {
  const fromJson = parseOptions(jsonOptions);
  const recovered = recoverOptionsFromProse(reply);
  /** 人话里已经写出的 A/B 优先：卡片必须对得上已流出的字。 */
  const options = recovered ?? fromJson;
  return {
    reply,
    control,
    warnings,
    options,
  };
}

export function parseTurnOutput(raw: string): ParsedTurn {
  const idx = raw.indexOf(STATE_SENTINEL);
  if (idx === -1) {
    return withHostOptions(raw.trim(), emptyControl(), ["缺少 STATE 哨兵，本轮不推进阶段"]);
  }
  const reply = raw.slice(0, idx).trim();
  const json = parseJsonObject(raw.slice(idx + STATE_SENTINEL.length));
  if (!json) {
    return withHostOptions(reply, emptyControl(), ["STATE 块无法解析，本轮不推进阶段"]);
  }
  return withHostOptions(
    reply,
    {
      stateDelta: (json.state_delta ?? {}) as StateDelta,
      stageComplete: json.stage_complete === true,
      readyForSynthesis: json.ready_for_synthesis === true,
      affectedLines: parseAffectedLines(json.affected_lines ?? json.affectedLines),
    },
    [],
    json.options,
  );
}
