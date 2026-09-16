import type { ChatMessage, LlmClient } from "./llm.js";
import type { ConversationState } from "./state.js";
import type { StateDelta } from "./merge.js";
import { mergeFillEmpty, mergeStateDelta } from "./merge.js";
import { parseJsonObject } from "./turn.js";
import { asGddText } from "@cq/gdd";

/** 测试和脚本 LLM 用这段识别「这是抽取，不是对话轮」。 */
export const EXTRACT_PROMPT_TAG = "[GDD_EXTRACT_V1]";

const EXTRACT_SYSTEM = `${EXTRACT_PROMPT_TAG}
你是文档撰写助手。根据共创采访填写一个 JSON 对象，写成能进设计文档的条目。

规则：
- 可以润色、归纳，并按采访合理延申（宪法、循环、内容边界、呈现边界必须尽量写出）。
- 不要改题材，不要编造采访里没出现过的作品名。
- 只输出 JSON，不要解释，不要 markdown。
- 键名必须用 camelCase，与下面一致。

允许的键（全部可选）：
workingTitle, pitch, coreExperience, coreEmotion, forbiddenEmotion, coreFantasy,
coreAction, coreDelight, theme, world, narrative, playerIdentity, aesthetic, gameFeel,
reward, failRule, winRule, replayMotivation, differentiator, spark,
mechanics[], juice[], references[], avoidReferences[],
loop{thirtySec,fiveMin,thirtyMin,longTerm},
interaction{verb,target,feedback,chain},
growth{none,unlocks,nearGoal,afterTenMin},
presentation{where,dimension,orientation,players,assets},
difficulty{ramp,firstMinutes,fatigue},
constitutionFields{coreFantasy,coreLoop,artRule,contentBoundary,presentationBoundary,growthRule,worldRule,uiRule}

mechanics 只写 3–6 条按优先级、互不相同的机制，不要把物件名和同一玩法各写一遍。
juice 只写 3–5 个互不重复的高光瞬间，不要把同一画面拆成多句。
where 只能是「电脑」「手机」「网页」之一（键鼠/PC→电脑，触屏→手机）。
dimension 只能是「平面」或「能转视角的立体」。
orientation 只能是「横屏」或「竖屏」。
players 只能是「自己玩」或「要和别人一起」。
constitutionFields.contentBoundary：这款游戏明确不做的内容（如不做多人社交、不叠复杂操作系统）。
constitutionFields.presentationBoundary：在哪玩、横竖屏、平面或立体、单人还是一起，写成一句。
constitutionFields 只写这八项。没确认的项省略。失败规则、爽点、难度不要写进宪法。
growth.none 仅当用户明确说短局、一次性、纯叙事或没有解锁时才为 true。
对话里没出现过的作品名不要写进 references / avoidReferences。
`.trim();

const POOL_KEYS = ["gameplay", "emotion", "world", "visual", "narrative", "motivation"] as const;

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

function keepStr(v: unknown): string | undefined {
  const t = asGddText(v);
  return t || undefined;
}

function keepList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

function keepNamedList(blob: string, v: unknown): string[] | undefined {
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
): Partial<T> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const kept = keepStr(src[k as string]);
    if (kept) out[k as string] = kept;
  }
  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

/** 采访可以润色进文档；只有没出现过的作品名会被丢掉。 */
export function groundedDelta(raw: Record<string, unknown>, history: ChatMessage[]): StateDelta {
  const blob = compact(transcriptOf(history));
  const delta: StateDelta = {};
  const strKeys = [
    "spark", "coreEmotion", "forbiddenEmotion", "coreFantasy", "coreAction", "coreDelight",
    "theme", "world", "narrative", "playerIdentity", "aesthetic", "gameFeel",
    "reward", "failRule", "winRule", "difficultyCurve", "replayMotivation",
    "workingTitle", "pitch", "coreExperience", "differentiator",
  ] as const;
  for (const k of strKeys) {
    const t = keepStr(raw[k]);
    if (!t) continue;
    if ((k === "spark" || k === "forbiddenEmotion") && !grounded(blob, t)) continue;
    (delta as Record<string, string>)[k] = t;
  }
  const refs = keepNamedList(blob, raw.references);
  if (refs) delta.references = refs;
  const avoid = keepNamedList(blob, raw.avoidReferences);
  if (avoid) delta.avoidReferences = avoid;
  const juice = keepList(raw.juice);
  if (juice) delta.juice = juice;
  const mechanics = keepList(raw.mechanics);
  if (mechanics) delta.mechanics = mechanics;
  const risks = keepList(raw.risks);
  if (risks) delta.risks = risks;
  const constitution = keepList(raw.constitution);
  if (constitution) delta.constitution = constitution;

  const loop = pickObj(raw.loop, ["thirtySec", "fiveMin", "thirtyMin", "longTerm"]);
  if (loop) delta.loop = loop;
  const interaction = pickObj(raw.interaction, ["verb", "target", "feedback", "chain"]);
  if (interaction) delta.interaction = interaction;
  const growthRaw = asRecord(raw.growth);
  if (growthRaw) {
    const growth: NonNullable<StateDelta["growth"]> = {};
    for (const k of ["unlocks", "nearGoal", "afterTenMin"] as const) {
      const kept = keepStr(growthRaw[k]);
      if (kept) growth[k] = kept;
    }
    if (growthRaw.none === true) growth.none = true;
    if (Object.keys(growth).length) delta.growth = growth;
  }
  const presentation = pickObj(
    raw.presentation,
    ["where", "dimension", "orientation", "players", "assets"],
  );
  if (presentation) delta.presentation = presentation;
  const difficulty = pickObj(raw.difficulty, ["ramp", "firstMinutes", "fatigue"]);
  if (difficulty) delta.difficulty = difficulty;
  const constitutionFields = pickObj(
    raw.constitutionFields,
    ["coreFantasy", "coreLoop", "artRule", "contentBoundary", "presentationBoundary", "growthRule", "worldRule", "uiRule"],
  );
  const cfRaw = asRecord(raw.constitutionFields);
  const extras = cfRaw ? keepList(cfRaw.extras) : undefined;
  if (constitutionFields || extras) {
    delta.constitutionFields = { ...(constitutionFields || {}) };
    if (extras) delta.constitutionFields.extras = extras;
  }

  const poolsRaw = asRecord(raw.keywordPools);
  if (poolsRaw) {
    const pools: StateDelta["keywordPools"] = {};
    for (const k of POOL_KEYS) {
      const list = keepList(poolsRaw[k]);
      if (list) pools[k] = list;
    }
    if (Object.keys(pools).length) delta.keywordPools = pools;
  }

  const contentRaw = asRecord(raw.content);
  if (contentRaw) {
    const content: NonNullable<StateDelta["content"]> = {};
    for (const k of ["overview", "levels", "boss", "progression", "multiplayer"] as const) {
      const kept = keepStr(contentRaw[k]);
      if (kept) content[k] = kept;
    }
    const flagsRaw = asRecord(contentRaw.flags);
    if (flagsRaw) {
      content.flags = {
        levels: flagsRaw.levels === true && Boolean(content.levels),
        boss: flagsRaw.boss === true && Boolean(content.boss),
        progression: flagsRaw.progression === true && Boolean(content.progression),
        multiplayer: flagsRaw.multiplayer === true && Boolean(content.multiplayer),
      };
    }
    if (Object.keys(content).length) delta.content = content;
  }

  const engRaw = asRecord(raw.engineering);
  if (engRaw) {
    const artStyle = keepStr(engRaw.artStyle);
    const genre = keepStr(engRaw.genre);
    const engMechs = keepList(engRaw.mechanics);
    const intentTerms = keepList(engRaw.intentTerms);
    const signatureTerms = keepList(engRaw.signatureTerms);
    if (artStyle || genre || engMechs || intentTerms || signatureTerms) {
      delta.engineering = {};
      if (artStyle) delta.engineering.artStyle = artStyle;
      if (genre) delta.engineering.genre = genre;
      if (engMechs) delta.engineering.mechanics = engMechs;
      if (intentTerms) delta.engineering.intentTerms = intentTerms;
      if (signatureTerms) delta.engineering.signatureTerms = signatureTerms;
    }
  }

  const mvpRaw = asRecord(raw.mvpScope);
  if (mvpRaw) {
    const must = keepList(mvpRaw.must);
    const cut = keepList(mvpRaw.cut);
    if (must || cut) delta.mvpScope = { ...(must ? { must } : {}), ...(cut ? { cut } : {}) };
  }

  return delta;
}

/** 本轮人话也算出处：JSON 里的暂定名只要写在气泡里就能留下。 */
export function groundedDeltaWithReply(
  raw: Record<string, unknown>,
  history: ChatMessage[],
  reply: string,
): StateDelta {
  return groundedDelta(raw, [...history, { role: "assistant", content: reply || "" }]);
}

/**
 * 只拿掉对话里完全没出现过的作品名。其余字段允许按采访润色，不再整表清空。
 */
export function scrubUngroundedState(state: ConversationState): void {
  const blob = compact(transcriptOf(state.history || []));
  state.references = (state.references || []).filter((r) => grounded(blob, r));
  state.avoidReferences = (state.avoidReferences || []).filter((r) => grounded(blob, r));
}

async function collect(llm: LlmClient, messages: ChatMessage[]): Promise<string> {
  let full = "";
  for await (const chunk of llm.stream(messages)) full += chunk;
  return full;
}

/**
 * 用户要文档时调用。advance 出稿（首次定稿和之后刷新）一律 overwrite，
 * 避免 spark / 罐头占位挡住撰写。直接调用默认仍只填空。
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
      { role: "user", content: `${hint}根据下面共创采访填写设计事实。可以润色和合理延申。必须尽量写出 constitutionFields.contentBoundary 与 constitutionFields.presentationBoundary。没出现过的作品名不要写。\n\n${clipped}` },
    ]);
  } catch {
    return;
  }
  const json = parseJsonObject(raw);
  if (!json) return;
  const delta = groundedDelta(json, history);
  if (opts?.overwrite) mergeStateDelta(state, delta, { replaceLists: true });
  else mergeFillEmpty(state, delta);
}
