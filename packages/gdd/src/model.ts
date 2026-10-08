import { isConcreteInteractionChain } from "./interaction.js";

export interface KeywordPools {
  gameplay: string[];
  emotion: string[];
  world: string[];
  visual: string[];
  narrative: string[];
  motivation: string[];
}

export interface Constitution {
  coreFantasy: string;
  coreLoop: string;
  artRule: string;
  contentBoundary: string;
  presentationBoundary: string;
  growthRule: string;
  worldRule: string;
  uiRule: string;
  /** 旧会话兼容；渲染宪法时不打印。 */
  extras: string[];
}

export type ConstitutionScalarKey =
  | "coreFantasy"
  | "coreLoop"
  | "artRule"
  | "contentBoundary"
  | "presentationBoundary"
  | "growthRule"
  | "worldRule"
  | "uiRule";

const CONSTITUTION_LABEL_KEYS: Array<{ names: string[]; key: ConstitutionScalarKey }> = [
  { names: ["核心幻想"], key: "coreFantasy" },
  { names: ["核心循环"], key: "coreLoop" },
  { names: ["美术规则"], key: "artRule" },
  { names: ["内容边界"], key: "contentBoundary" },
  { names: ["呈现边界", "技术/呈现边界", "技术边界"], key: "presentationBoundary" },
  { names: ["数值/成长规则", "数值成长规则", "成长规则"], key: "growthRule" },
  { names: ["世界观规则"], key: "worldRule" },
  { names: ["UI 规则", "UI规则"], key: "uiRule" },
];

export interface ContentFlags {
  levels: boolean;
  boss: boolean;
  progression: boolean;
  multiplayer: boolean;
}

export interface GddModel {
  title: string;
  pitch: string;
  constitution: Constitution;
  coreExperience: string;
  coreEmotion: string;
  forbiddenEmotion: string;
  coreFantasy: string;
  playerIdentity: string;
  differentiator: string;
  references: { borrow: string[]; avoid: string[] };
  coreAction: string;
  interaction: { verb: string; target: string; chain: string; feedback: string };
  coreDelight: string;
  growth: { none: boolean; unlocks: string; nearGoal: string; afterTenMin: string };
  loop: { micro: string; mid: string; macro: string; longTerm: string };
  mechanics: string[];
  /** 与 mechanics 一一对应的稳定 id。单条改写后身份不变；缺省时按原文算。 */
  mechanicIds?: string[];
  reward: string;
  winRule: string;
  loseRule: string;
  replayMotivation: string;
  world: string;
  narrative: string;
  aesthetic: string;
  gameFeel: string;
  highlight: string;
  /** 折叠后的高光条目；渲染用列表，highlight 仍给完整度门用。 */
  highlights: string[];
  content: string;
  contentDetail: {
    levels: string;
    boss: string;
    progression: string;
    multiplayer: string;
  };
  contentFlags: ContentFlags;
  keywordPools: KeywordPools;
  presentation: {
    where: string;
    dimension: string;
    orientation: string;
    players: string;
    assets: string;
  };
  difficulty: {
    ramp: string;
    firstMinutes: string;
    fatigue: string;
  };
}

export function emptyKeywordPools(): KeywordPools {
  return { gameplay: [], emotion: [], world: [], visual: [], narrative: [], motivation: [] };
}

export function emptyConstitution(): Constitution {
  return {
    coreFantasy: "",
    coreLoop: "",
    artRule: "",
    contentBoundary: "",
    presentationBoundary: "",
    growthRule: "",
    worldRule: "",
    uiRule: "",
    extras: [],
  };
}

export function emptyGddModel(): GddModel {
  return {
    title: "未命名游戏",
    pitch: "",
    constitution: emptyConstitution(),
    coreExperience: "",
    coreEmotion: "",
    forbiddenEmotion: "",
    coreFantasy: "",
    playerIdentity: "",
    differentiator: "",
    references: { borrow: [], avoid: [] },
    coreAction: "",
    interaction: { verb: "", target: "", chain: "", feedback: "" },
    coreDelight: "",
    growth: { none: false, unlocks: "", nearGoal: "", afterTenMin: "" },
    loop: { micro: "", mid: "", macro: "", longTerm: "" },
    mechanics: [],
    reward: "",
    winRule: "",
    loseRule: "",
    replayMotivation: "",
    world: "",
    narrative: "",
    aesthetic: "",
    gameFeel: "",
    highlight: "",
    highlights: [],
    content: "",
    contentDetail: { levels: "", boss: "", progression: "", multiplayer: "" },
    contentFlags: { levels: false, boss: false, progression: false, multiplayer: false },
    keywordPools: emptyKeywordPools(),
    presentation: { where: "", dimension: "", orientation: "", players: "", assets: "" },
    difficulty: { ramp: "", firstMinutes: "", fatigue: "" },
  };
}

/** LLM 常把本该是一句话的栏写成字符串数组；统一收成可 trim 的文本。 */
export function asGddText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asGddText).filter(Boolean).join("、");
  return "";
}

const LIST_NUMBER = /^\s*(?:\d{1,2}\s*[.．、)）](?!\d)|[（(]\d{1,2}[)）])\s*/;

/**
 * 去掉开头的展示序号「1. / 1、/ 1) / 1．/ （1）」，叠了几层就去几层。
 * 序号由展示层按位置生成，不进机制正文。「3 秒冻结」「1.5 倍速」这类数字不动。
 */
export function stripListNumber(value: unknown): string {
  let out = asGddText(value);
  while (LIST_NUMBER.test(out)) {
    const next = out.replace(LIST_NUMBER, "");
    if (!next || next === out) break;
    out = next;
  }
  return out;
}

/** 把「核心幻想：…」这类已确认行写入对应宪法栏；对不上的（失败/爽点/难度）返回 false。 */
export function applyLabeledConstitutionLine(cf: Constitution, line: string): boolean {
  const t = asGddText(line);
  if (!t) return false;
  for (const row of CONSTITUTION_LABEL_KEYS) {
    for (const name of row.names) {
      if (t.startsWith(`${name}：`) || t.startsWith(`${name}:`)) {
        const val = t.slice(name.length + 1).trim();
        if (val && !asGddText(cf[row.key])) cf[row.key] = val;
        return true;
      }
    }
  }
  return false;
}

export function absorbLabeledConstitution(cf: Constitution, lines: unknown): void {
  if (!Array.isArray(lines)) return;
  for (const item of lines) applyLabeledConstitutionLine(cf, asGddText(item));
}

function filled(s: unknown): boolean {
  return Boolean(asGddText(s));
}

/** 对话中能否展示草稿（任一创意字段有内容）。 */
export function isSubstantive(m: GddModel): boolean {
  return filled(m.pitch)
    || filled(m.coreFantasy)
    || filled(m.coreExperience)
    || filled(m.coreEmotion)
    || filled(m.differentiator)
    || filled(m.loop.micro)
    || m.mechanics.length > 0
    || m.constitution.extras.length > 0
    || filled(m.constitution.coreFantasy)
    || filled(m.constitution.growthRule)
    || filled(m.constitution.worldRule)
    || filled(m.constitution.uiRule)
    || Object.values(m.keywordPools).some((pool) => pool.length > 0);
}

const POOL_KEYS = ["gameplay", "emotion", "world", "visual", "narrative", "motivation"] as const;

export const COMPLETE_FIELD_ZH: Record<string, string> = {
  pitch: "一句话 Pitch / 核心体验",
  coreEmotion: "主情感",
  forbiddenEmotion: "禁止情感",
  coreFantasy: "核心幻想或玩家身份",
  interaction: "核心交互",
  coreDelight: "核心爽点",
  growth: "成长与变化",
  "loop.micro": "头几秒玩家在做什么",
  mechanics: "至少两件反复做的事",
  winLose: "怎样算赢、失误有什么麻烦",
  reward: "玩家怎么知道自己做得好",
  feel: "画面声音感觉，或高光/手感",
  "pool.gameplay": "玩法关键词至少 5 个",
  "pool.emotion": "情绪关键词至少 5 个",
  "pool.world": "世界观关键词至少 5 个",
  "pool.visual": "视觉关键词至少 5 个",
  "pool.narrative": "叙事关键词至少 5 个",
  "pool.motivation": "玩家动机关键词至少 5 个",
  differentiator: "和同类最大的不同",
  references: "借鉴或刻意避开的作品",
  constitution: "游戏宪法（核心幻想 + 核心循环）",
  presentation: "在哪玩、平面还是立体",
  "content.levels": "关卡怎么排",
  "content.boss": "Boss 怎么打",
  "content.progression": "养成 / 长线",
  "content.multiplayer": "怎么和别人一起玩",
};

/**
 * 定稿门对齐 completeness.md 必填项。
 * 中途「现在就生成」可以出草稿，但 complete 仍为 false。
 */
export function missingCompleteFields(m: GddModel): string[] {
  const miss: string[] = [];
  if (!filled(m.pitch) && !filled(m.coreExperience)) miss.push("pitch");
  if (!filled(m.coreEmotion)) miss.push("coreEmotion");
  if (!filled(m.forbiddenEmotion)) miss.push("forbiddenEmotion");
  if (!filled(m.coreFantasy) && !filled(m.playerIdentity)) miss.push("coreFantasy");
  if (!isConcreteInteractionChain(m.interaction?.chain)) miss.push("interaction");
  if (!filled(m.coreDelight)) miss.push("coreDelight");
  if (!filled(m.loop.micro)) miss.push("loop.micro");
  const mechs = m.mechanics.map(asGddText).filter(Boolean);
  const action = asGddText(m.coreAction);
  const actionAsMech = Boolean(action) && !mechs.includes(action);
  if (mechs.length + (actionAsMech ? 1 : 0) < 2) miss.push("mechanics");
  if (!filled(m.winRule) || !filled(m.loseRule)) miss.push("winLose");
  if (!filled(m.reward)) miss.push("reward");
  if (!filled(m.aesthetic) && !filled(m.gameFeel) && !filled(m.highlight)) miss.push("feel");
  for (const k of POOL_KEYS) {
    if (m.keywordPools[k].length < 5) miss.push(`pool.${k}`);
  }
  if (!filled(m.differentiator)) miss.push("differentiator");
  if (m.references.borrow.length + m.references.avoid.length === 0) miss.push("references");
  if (!filled(m.constitution.coreFantasy) || !filled(m.constitution.coreLoop)) miss.push("constitution");
  if (!filled(m.presentation.where) || !filled(m.presentation.dimension)) miss.push("presentation");
  if (m.contentFlags.levels && !filled(m.contentDetail.levels)) miss.push("content.levels");
  if (m.contentFlags.boss && !filled(m.contentDetail.boss)) miss.push("content.boss");
  if (m.contentFlags.progression && !m.growth?.none && !filled(m.contentDetail.progression)) {
    miss.push("content.progression");
  }
  const talkedGrowth = Boolean(
    m.contentFlags.progression
    || filled(m.growth?.unlocks)
    || filled(m.growth?.nearGoal)
    || filled(m.growth?.afterTenMin),
  );
  if (talkedGrowth && !m.growth?.none) {
    const hasGrowth = filled(m.growth?.unlocks)
      || filled(m.growth?.nearGoal)
      || filled(m.growth?.afterTenMin)
      || filled(m.contentDetail.progression);
    if (!hasGrowth) miss.push("growth");
  }
  if (m.contentFlags.multiplayer && !filled(m.contentDetail.multiplayer)) miss.push("content.multiplayer");
  return miss;
}

export function missingCompleteFieldLabels(m: GddModel): string[] {
  return missingCompleteFields(m).map((k) => COMPLETE_FIELD_ZH[k] || k);
}

export function isComplete(m: GddModel): boolean {
  return missingCompleteFields(m).length === 0;
}
