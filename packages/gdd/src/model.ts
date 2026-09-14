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
  extras: string[];
}

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
  loop: { micro: string; mid: string; macro: string };
  mechanics: string[];
  reward: string;
  winRule: string;
  loseRule: string;
  replayMotivation: string;
  world: string;
  narrative: string;
  aesthetic: string;
  gameFeel: string;
  highlight: string;
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
    loop: { micro: "", mid: "", macro: "" },
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
    || Object.values(m.keywordPools).some((pool) => pool.length > 0);
}

const POOL_KEYS = ["gameplay", "emotion", "world", "visual", "narrative", "motivation"] as const;

export const COMPLETE_FIELD_ZH: Record<string, string> = {
  pitch: "一句话 Pitch / 核心体验",
  coreEmotion: "主情感",
  forbiddenEmotion: "禁止情感",
  coreFantasy: "核心幻想或玩家身份",
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
  if (m.contentFlags.progression && !filled(m.contentDetail.progression)) miss.push("content.progression");
  if (m.contentFlags.multiplayer && !filled(m.contentDetail.multiplayer)) miss.push("content.multiplayer");
  return miss;
}

export function missingCompleteFieldLabels(m: GddModel): string[] {
  return missingCompleteFields(m).map((k) => COMPLETE_FIELD_ZH[k] || k);
}

export function isComplete(m: GddModel): boolean {
  return missingCompleteFields(m).length === 0;
}
