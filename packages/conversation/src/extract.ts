import type { ChatMessage, LlmClient } from "./llm.js";
import type { ConversationState } from "./state.js";
import type { StateDelta } from "./merge.js";
import { mergeFillEmpty, mergeStateDelta } from "./merge.js";
import { parseJsonObject } from "./turn.js";
import { asGddText } from "@cq/gdd";

/** 测试和脚本 LLM 用这段识别「这是抽取，不是对话轮」。 */
export const EXTRACT_PROMPT_TAG = "[GDD_EXTRACT_V1]";

const EXTRACT_SYSTEM = `${EXTRACT_PROMPT_TAG}
你是抽取器，不是设计师。根据共创对话填写一个 JSON 对象。

规则：
- 只填对话里已经明确说过的设计事实。
- 没说过的键一律省略。禁止猜测、禁止补全、禁止润色成新设定。
- 字符串尽量用对话原句，不要改题材。
- 只输出 JSON，不要解释，不要 markdown。
- 键名必须用 camelCase，与下面一致。

允许的键（全部可选）：
workingTitle, pitch, coreExperience, coreEmotion, forbiddenEmotion, coreFantasy,
coreAction, theme, world, narrative, playerIdentity, aesthetic, gameFeel,
reward, failRule, winRule, replayMotivation, differentiator, spark,
mechanics[], juice[], references[], avoidReferences[],
loop{thirtySec,fiveMin,thirtyMin,longTerm},
presentation{where,dimension,orientation,players,assets},
difficulty{ramp,firstMinutes,fatigue},
constitutionFields{coreFantasy,coreLoop,artRule,contentBoundary,presentationBoundary}

where 只能是「电脑」「手机」「网页」之一（键鼠/PC→电脑，触屏→手机）。
dimension 只能是「平面」或「能转视角的立体」。
orientation 只能是「横屏」或「竖屏」。
players 只能是「自己玩」或「要和别人一起」。
未问过的 where/dimension/orientation/players/forbiddenEmotion/fatigue 不要填。
`.trim();

function transcriptOf(history: ChatMessage[]): string {
  return (history || [])
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content || ""}`)
    .join("\n\n");
}

function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

function grounded(blob: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const needle = compact(v);
  if (needle.length < 2) return false;
  if (blob.includes(needle)) return true;
  if (v === "电脑" && /键鼠|电脑|PC/i.test(blob)) return true;
  if (v === "手机" && /手机|触屏/.test(blob)) return true;
  if (v === "网页" && /网页/.test(blob)) return true;
  if (v === "平面" && /平面|2D|卡通/i.test(blob)) return true;
  if (v === "能转视角的立体" && /第一人称|第三人称|立体|3D|能转/i.test(blob)) return true;
  if (v === "横屏" && /横屏|横着/.test(blob)) return true;
  if (v === "竖屏" && /竖屏|竖着/.test(blob)) return true;
  if (v === "自己玩" && /自己玩|一个人|单人/.test(blob)) return true;
  if (v === "要和别人一起" && /别人|联网|一起/.test(blob)) return true;
  if (needle.length >= 8) {
    for (let i = 0; i <= needle.length - 8; i++) {
      if (blob.includes(needle.slice(i, i + 8))) return true;
    }
  }
  return false;
}

function keepStr(blob: string, v: unknown): string | undefined {
  const t = asGddText(v);
  return t && grounded(blob, t) ? t : undefined;
}

function keepList(blob: string, v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x && grounded(blob, x));
  return out.length ? out : undefined;
}

function pickObj<T extends Record<string, unknown>>(
  raw: unknown,
  keys: (keyof T)[],
  blob: string,
): Partial<T> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const kept = keepStr(blob, src[k as string]);
    if (kept) out[k as string] = kept;
  }
  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

/** 丢掉对话里找不到出处的值，防止抽取模型编造。 */
export function groundedDelta(raw: Record<string, unknown>, history: ChatMessage[]): StateDelta {
  const blob = compact(transcriptOf(history));
  const delta: StateDelta = {};
  const strKeys = [
    "spark", "coreEmotion", "forbiddenEmotion", "coreFantasy", "coreAction",
    "theme", "world", "narrative", "playerIdentity", "aesthetic", "gameFeel",
    "reward", "failRule", "winRule", "difficultyCurve", "replayMotivation",
    "workingTitle", "pitch", "coreExperience", "differentiator",
  ] as const;
  for (const k of strKeys) {
    const kept = keepStr(blob, raw[k]);
    if (kept) (delta as Record<string, string>)[k] = kept;
  }
  const refs = keepList(blob, raw.references);
  if (refs) delta.references = refs;
  const avoid = keepList(blob, raw.avoidReferences);
  if (avoid) delta.avoidReferences = avoid;
  const juice = keepList(blob, raw.juice);
  if (juice) delta.juice = juice;
  const mechanics = keepList(blob, raw.mechanics);
  if (mechanics) delta.mechanics = mechanics;

  const loop = pickObj(raw.loop, ["thirtySec", "fiveMin", "thirtyMin", "longTerm"], blob);
  if (loop) delta.loop = loop;
  const presentation = pickObj(
    raw.presentation,
    ["where", "dimension", "orientation", "players", "assets"],
    blob,
  );
  if (presentation) delta.presentation = presentation;
  const difficulty = pickObj(raw.difficulty, ["ramp", "firstMinutes", "fatigue"], blob);
  if (difficulty) delta.difficulty = difficulty;
  const constitutionFields = pickObj(
    raw.constitutionFields,
    ["coreFantasy", "coreLoop", "artRule", "contentBoundary", "presentationBoundary"],
    blob,
  );
  if (constitutionFields) delta.constitutionFields = constitutionFields;
  return delta;
}

async function collect(llm: LlmClient, messages: ChatMessage[]): Promise<string> {
  let full = "";
  for await (const chunk of llm.stream(messages)) full += chunk;
  return full;
}

/**
 * 用户要文档时调用。默认只填空；文档已出、用户继续改时 overwrite 覆盖旧值。
 * GET 不要走这里（微信 20s）；结果会随 advance 落盘。
 */
export async function extractDiscussedIntoState(
  state: ConversationState,
  llm: LlmClient,
  opts?: { overwrite?: boolean },
): Promise<void> {
  const history = state.history || [];
  if (history.length < 2) return;
  const transcript = transcriptOf(history);
  const clipped = transcript.length > 24000 ? transcript.slice(-24000) : transcript;
  const hint = opts?.overwrite
    ? "若同一字段前后说法不同，以用户最后一次明确说法为准。\n\n"
    : "";
  let raw = "";
  try {
    raw = await collect(llm, [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: `${hint}从下面共创对话抽取已确认的设计事实。没出现的键不要写。\n\n${clipped}` },
    ]);
  } catch {
    return;
  }
  const json = parseJsonObject(raw);
  if (!json) return;
  const delta = groundedDelta(json, history);
  if (opts?.overwrite) mergeStateDelta(state, delta);
  else mergeFillEmpty(state, delta);
}
