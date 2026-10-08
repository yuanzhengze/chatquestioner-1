import { STATE_SENTINEL } from "./turn.js";
import type { TurnOption } from "./turn.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmStreamOptions {
  /** 开发环境耗时记录用。客户端拿得到用量就回报，拿不到就不调用。 */
  onUsage?: (usage: LlmUsage) => void;
}

export interface LlmClient {
  stream(messages: ChatMessage[], opts?: LlmStreamOptions): AsyncIterable<string>;
}

export const OPENING_MESSAGE =
  "你好！我是 NewBee，你的游戏共创伙伴。做游戏就像捏泥巴，咱们今天不聊代码和规则，" +
  "就从你的一个'脑洞'开始。你脑子里现在有没有冒出一个画面、一种好玩的玩法，" +
  "或者哪怕只是一个想当主角的动物/角色？随便跟我聊聊，我们一起把它变成一个真能玩的游戏！";

export const CONSENT_OPTIONS: TurnOption[] = [
  {
    id: "A",
    label: "是，开始创意引导",
    detail: "是，开始创意引导。用大约 10 轮提问，把创意澄清成一份完整的游戏设计文档。",
  },
  {
    id: "B",
    label: "不用，先不走这个流程",
    detail: "不用，先不走这个流程。不采访，我自己说想法。",
  },
];

export const CONSENT_PROMPT =
  "接下来可以用大约 **10 轮**提问，把创意澄清成一份完整的游戏设计文档，帮你做出更好玩的游戏。要走这步吗？";

/** 用户先说出想法之后，再问要不要走引导。 */
export const CONSENT_AFTER_IDEA = `先记下了你的想法。\n\n${CONSENT_PROMPT}`;

export const DECLINED_ACK =
  "好。你直接说你的想法就行，我记下能确定的部分。";

/** 收敛节宿主写死的三选。采访轮禁止模型提前给出。 */
export const CONVERGENCE_OPTIONS: TurnOption[] = [
  {
    id: "A",
    label: "就按这个定稿，写成设计文档",
    detail: "就按这个定稿，写成设计文档。",
  },
  {
    id: "B",
    label: "核心对，但要改某一块",
    detail: "核心对，但要改某一块。指出想改的那一块。",
  },
  {
    id: "C",
    label: "还想再挖挖感觉 / 玩法",
    detail: "还想再挖挖感觉 / 玩法。",
  },
];

export function lastOptionsAreConvergence(last?: TurnOption[]): boolean {
  if (!last?.length) return false;
  const blob = last.map((o) => `${o.label}\n${o.detail}`).join("\n");
  return /定稿|写成设计文档|生成设计文档/.test(blob) && /改一|再挖/.test(blob);
}

export type ConvergenceChoice = "finalize" | "revise" | "explore";

/** 手风琴补丁三选。不是定稿三选，点应用不走出稿闸。 */
export const PATCH_OPTIONS: TurnOption[] = [
  {
    id: "A",
    label: "应用这些改动",
    detail: "应用这些改动。按上面列出的行写入文档，然后回到预览。",
  },
  {
    id: "B",
    label: "再改改说法",
    detail: "再改改说法。先不写进文档，继续改这一处。",
  },
  {
    id: "C",
    label: "取消",
    detail: "取消。不改文档，回到预览。",
  },
];

export type PatchChoice = "apply" | "tweak" | "cancel";

export function lastOptionsArePatch(last?: TurnOption[]): boolean {
  if (!last?.length) return false;
  const blob = last.map((o) => `${o.label}\n${o.detail}`).join("\n");
  return /应用这些改动/.test(blob) && /再改改说法/.test(blob) && /取消/.test(blob);
}

export function interpretPatchChoice(
  text: string,
  lastOptions?: TurnOption[],
): PatchChoice | null {
  if (!lastOptionsArePatch(lastOptions)) return null;
  const t = (text || "").trim();
  if (!t) return null;
  const list = lastOptions!.length >= 3 ? lastOptions! : PATCH_OPTIONS;
  const hit = list.find((o) => o.detail === t || o.label === t);
  if (hit) {
    if (hit.id === "A" || hit === list[0]) return "apply";
    if (hit.id === "B" || hit === list[1]) return "tweak";
    if (hit.id === "C" || hit === list[2]) return "cancel";
  }
  if (t === PATCH_OPTIONS[0].label || t === PATCH_OPTIONS[0].detail) return "apply";
  if (t === PATCH_OPTIONS[1].label || t === PATCH_OPTIONS[1].detail) return "tweak";
  if (t === PATCH_OPTIONS[2].label || t === PATCH_OPTIONS[2].detail) return "cancel";
  if (/^[Aa]$/.test(t)) return "apply";
  if (/^[Bb]$/.test(t)) return "tweak";
  if (/^[Cc]$/.test(t)) return "cancel";
  return null;
}

export function interpretConvergenceChoice(
  text: string,
  lastOptions?: TurnOption[],
): ConvergenceChoice | null {
  if (!lastOptionsAreConvergence(lastOptions)) return null;
  const t = (text || "").trim();
  if (!t) return null;
  const list = lastOptions!.length >= 3 ? lastOptions! : CONVERGENCE_OPTIONS;
  const hit = list.find((o) => o.detail === t || o.label === t);
  if (hit) {
    if (hit.id === "A" || hit === list[0]) return "finalize";
    if (hit.id === "B" || hit === list[1]) return "revise";
    if (hit.id === "C" || hit === list[2]) return "explore";
  }
  if (t === CONVERGENCE_OPTIONS[0].label || t === CONVERGENCE_OPTIONS[0].detail) return "finalize";
  if (t === CONVERGENCE_OPTIONS[1].label || t === CONVERGENCE_OPTIONS[1].detail) return "revise";
  if (t === CONVERGENCE_OPTIONS[2].label || t === CONVERGENCE_OPTIONS[2].detail) return "explore";
  if (/^[Aa]$/.test(t)) return "finalize";
  if (/^[Bb]$/.test(t)) return "revise";
  if (/^[Cc]$/.test(t)) return "explore";
  if (wantsPreview(t)) return "finalize";
  if (/改一|改某一块|改一块/.test(t)) return "revise";
  if (/再挖|再补充|再加点/.test(t)) return "explore";
  return null;
}

export function interpretGuidance(text: string): "accepted" | "declined" | null {
  const t = (text || "").trim();
  if (!t) return null;
  if (t === CONSENT_OPTIONS[0].label || t === CONSENT_OPTIONS[0].detail) return "accepted";
  if (t === CONSENT_OPTIONS[1].label || t === CONSENT_OPTIONS[1].detail) return "declined";
  if (/^[Aa]$/.test(t) || /^A\s*[:：.]/.test(t)) return "accepted";
  if (/^[Bb]$/.test(t) || /^B\s*[:：.]/.test(t)) return "declined";
  if (/开始创意引导|要走这步|走引导/.test(t) && !/不/.test(t)) return "accepted";
  if (/不用.*流程|先不走|不走这个|不要引导|别问了/.test(t)) return "declined";
  if (/^是[，,]?开始/.test(t)) return "accepted";
  return null;
}

/** 中途要求先看/生成文档（出带缺口的草稿）。同意门文案里也有「设计文档」，必须先排除。 */
export function wantsDocument(text: string): boolean {
  if (interpretGuidance(text)) return false;
  const t = (text || "").trim();
  if (!t) return false;
  return /写成.*文档|打开预览|看不到.*结果|生成结果|结果页|出稿|给我.*文档|为什么.*(结果|文档)|看不到生成|现在就生成|现在生成|先出.*草稿|出一份草稿|给我看看.*结果|生成一份|生成.*文档|最终.*文档|直接生成|出一份.*文档|输出.*GDD|输出完整|完整的 GDD|生成设计文档|设计文档/i.test(t);
}

/** 用户确认总结 / 要求定稿。未过 completeness 时仍出草稿、继续问，不锁对话。 */
export function wantsFinalize(text: string): boolean {
  if (interpretGuidance(text)) return false;
  const t = (text || "").trim();
  if (!t) return false;
  return /就按这个定稿|可以定稿了|总结得很完美|就按这个吧|就这样定|蓝图已经成型|可以去开发|就此定稿|直接定稿|确认当前|确认.*总结|完美契合|核心概念很完美|正式定稿/i.test(t);
}

/** 用户要看结果：生成、预览、或确认总结。 */
export function wantsPreview(text: string): boolean {
  return wantsDocument(text) || wantsFinalize(text);
}

function optionRequestsPreview(opt: { label?: string; detail?: string }): boolean {
  const t = `${opt.label || ""}\n${opt.detail || ""}`;
  return wantsPreview(t) || /确认总结|生成设计文档|写成设计文档|输出.*GDD|正式定稿/.test(t);
}

export function historyWantsPreview(
  history: ChatMessage[],
  extra?: string,
  lastOptions?: TurnOption[],
): boolean {
  if (extra && wantsPreview(extra)) return true;
  if (extra && lastOptions?.length) {
    const hit = lastOptions.find((o) => o.detail === extra || o.label === extra);
    if (hit && optionRequestsPreview(hit)) return true;
  }
  return history.some((m) => m.role === "user" && wantsPreview(m.content));
}

/** 合格概念总结：要有游戏名，且是总结块，不是共情里的「成型 / 骨架清晰」。 */
export function looksLikeConceptSummary(text: string): boolean {
  const t = text || "";
  if (!t.trim()) return false;
  if (t.includes(CONSENT_PROMPT) || /接下来可以用大约/.test(t)) return false;
  const hasName = /暂定(?:游戏)?名/.test(t) || /《[^》]+》/.test(t);
  const hasBlock = /概念总结|一句话亮点|一句话 Pitch|📌/.test(t);
  return hasName && hasBlock;
}

function firstSummaryIndex(text: string): number {
  const hits = [
    text.search(/📌/),
    text.search(/概念总结/),
    text.search(/暂定(?:游戏)?名/),
    text.search(/一句话亮点/),
  ].filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

/** 概念总结后若还跟着新的内容提问，裁掉，避免和定稿三选叠在一起。 */
export function stripFollowUpAsksAfterSummary(text: string): string {
  const t = String(text || "");
  if (!t.trim()) return t;
  const cutAskTail = (s: string) => s
    .replace(/(?:\r?\n[ \t]*>[ \t]*❓[\s\S]*)$/u, "")
    .replace(/(?:\r?\n[^\n？?]*[？?]\s*)+$/u, "")
    .replace(/\s+$/u, "");
  if (looksLikeConceptSummary(t)) {
    const at = firstSummaryIndex(t);
    const head = at > 0 ? t.slice(0, at) : "";
    const body = at >= 0 ? t.slice(at) : t;
    const out = (head + cutAskTail(body)).replace(/\s+$/u, "");
    return out.trim().length >= 8 ? out : t;
  }
  const out = cutAskTail(t);
  return out.trim().length >= 8 ? out : t;
}

const TURN_DIRECTIVE_HEAD = `
[机器输出协议 —— 严格遵守，用户永远看不到本段约束]

每一轮，你必须依次输出两部分：

1) 面向用户的人话回复。引导模式下遵循共情承接 → 动态投喂 2~3 个定制创意 → 单步收敛提问。定稿后改文档时以宿主硬约束为准。
   闲聊用普通文本，行内重点用 **加粗**，重点整段用首行带 💡/❓/📌 的 > 引用块。
   绝不在这部分出现任何 JSON、字段名或英文键名。

2) 另起一行，输出哨兵 ${STATE_SENTINEL}，紧接着输出**一个 JSON 对象**（可裸写或包在 \`\`\`json 代码块里）。

state_delta 允许的键（全部可选，只填有把握的）：
- 体验：spark, references[], avoidReferences[], coreEmotion, forbiddenEmotion, coreFantasy, coreAction,
  theme, world, narrative, playerIdentity, aesthetic, gameFeel, juice[],
  interaction{verb,target,feedback,chain}, coreDelight, growth{none,unlocks,nearGoal,afterTenMin}
- 循环：loop{thirtySec,fiveMin,thirtyMin,longTerm}, reward, failRule, winRule, mechanics[],
  difficultyCurve, replayMotivation, difficulty{ramp,firstMinutes,fatigue}
- 呈现：presentation{where,dimension,orientation,players,assets}
- 内容：content{overview,levels,boss,progression,multiplayer,flags{levels,boss,progression,multiplayer}}
- 收敛：workingTitle, pitch, coreExperience, differentiator,
  keywordPools{gameplay[],emotion[],world[],visual[],narrative[],motivation[]},
  constitutionFields{coreFantasy,coreLoop,artRule,contentBoundary,presentationBoundary,growthRule,worldRule,uiRule}
- 工程线索（能确定才填，不做出稿门槛）：engineering{dimension,platform[],orientation,networking,modalities[],genre,mechanics[],artStyle}

规则：
- ready_for_synthesis 由系统根据完整度计算，你可以给建议值，但不要为了凑 true 去编造字段。
- 信息不全时 stage_complete 为 false，引导模式下按缺口补问，绝不编造。能确定的字段必须写入 state_delta。
- state_delta 只写对话里已经说过的事实。没出现过的作品名、禁止情感、关键词不要编；没聊过就省略。
- 引导模式：每轮 JSON options 给 2–3 个实质设计方向（需要第四个时也可以，但必须也是可玩方向），id 依次 "A"/"B"/"C"（/"D"），各含非空 label 与 detail。禁止只在人话里写方向。
- 禁止把「我有其他更好的想法 / 我有别的想法 / 或者你有其他更有趣的 / 自己输入 / 直接告诉我你的脑洞 / Other」做成选项。用户打字框就是开放口。
- 自由输入模式（用户不走引导）不要 options。
- 当本轮给了 options 时，人话里不要再展开两个方向的描述，只保留共情与那一个收敛提问。
- 本轮只写当前节相关字段。怎么知道自己做得好 → reward；失误麻烦 → failRule；怎样算赢 → winRule；在哪玩 → presentation.where；平面还是立体 → presentation.dimension。
`.trim();

const TURN_DIRECTIVE_INTERVIEW = `
- may_write_summary 为 false。禁止写暂定名、一句话亮点、📌 概念总结。不要抄收敛模板。定稿三选由宿主弹出，不要自己给。JSON 里出现定稿项也不会当收口。大约 10 轮只是给用户的范围，不是收口条件。
- 用户点「就按这个定稿，写成设计文档」或说「现在就生成」之前，不要宣布已经写成文档。
- 用户点「就按这个定稿，写成设计文档」或说「现在就生成」：若宿主这轮出文档，不要 options、不要再问缺口。采访中途要文档时，下一轮继续当前节，不要跳到定稿。
- 用户点「改一块 / 再挖挖」或定稿后在共创页再开口：围绕他这句新想法问一轮，给 2–3 个实质方向，哪怕他已经说得很具体。问过之后宿主直接弹出定稿/改一块/再挖挖，不再问第二轮。
- 禁止对用户说「系统马上弹卡片 / 请稍等几秒会弹出结果页」。结果入口由宿主显示，你承诺也不会出现。
`.trim();

const TURN_DIRECTIVE_SUMMARY = `
- may_write_summary 为 true。本轮必须出口头概念总结（暂定名《标题》+ 一句话亮点），写完立刻停，禁止再问大结局 / 最后一个拼图 / 新的设计缺口。completeness 未齐也要写。定稿三选由宿主弹出；不要自己给。JSON 里出现定稿项也不会当收口。大约 10 轮只是给用户的范围，不是收口条件。
- 用户点「就按这个定稿，写成设计文档」或说「现在就生成」之前，不要宣布已经写成文档。
- 人话一旦出现「暂定游戏名 / 概念总结 / 一句话亮点」，同一轮 state_delta 必须写入 workingTitle、pitch、coreExperience、loop.fiveMin、differentiator、mechanics（≥2）、winRule。不要只写在人话里。口头总结这一轮宿主还不出文档。
- 用户点「就按这个定稿，写成设计文档」或说「现在就生成」：宿主出文档，本轮不要 options、不要再问缺口。采访中途要文档时，下一轮继续当前节。
- 用户点「改一块 / 再挖挖」或定稿后在共创页再开口：围绕他这句新想法问一轮，给 2–3 个实质方向，哪怕他已经说得很具体。问过之后宿主直接弹出定稿/改一块/再挖挖，不再问第二轮。
- 禁止对用户说「系统马上弹卡片 / 请稍等几秒会弹出结果页」。结果入口由宿主显示，你承诺也不会出现。
`.trim();

export function buildTurnDirective(allowSummary: boolean): string {
  return `${TURN_DIRECTIVE_HEAD}\n${allowSummary ? TURN_DIRECTIVE_SUMMARY : TURN_DIRECTIVE_INTERVIEW}`;
}

/** 兼容旧测试：默认按「允许总结」拼一份。运行时用 buildTurnDirective。 */
export const TURN_DIRECTIVE = buildTurnDirective(true);
