import type { ConversationState } from "./state.js";
import { looksLikeConceptSummary } from "./llm.js";
import { absorbLabeledConstitution, composeInteractionChain, isConcreteInteractionChain } from "@cq/gdd";
import { hasGrowthSkipEvidence } from "./growthSkip.js";

const empty = (v?: string): boolean => !v || !String(v).trim();
const clean = (s: string): string => s.replace(/^\*+|\*+$/g, "").replace(/^["「]|["」]$/g, "").trim();

function setStr(cur: string | undefined, incoming: string): string {
  if (!empty(cur)) return cur || "";
  return incoming.trim();
}

function isWeakAnswer(ans: string): boolean {
  const t = ans.trim();
  if (t.length < 6) return true;
  if (/^(好|嗯|是|对|可以|继续|下一个)[。.!！]?$/.test(t)) return true;
  if (/选项|给我几个/.test(t) && t.length < 24) return true;
  return false;
}

/** 人话里已经出现概念总结 / 暂定名。 */
export function hasConceptSummary(history: { role: string; content: string }[]): boolean {
  return history.some((m) => m.role === "assistant" && looksLikeConceptSummary(m.content || ""));
}

/**
 * 预览顶上的「这是草稿」：已经出文档，且助手还没给过合格口头总结。
 * 不看 isComplete。中途「现在就生成」亮条；总结后再定稿不亮。
 */
export function showDraftBar(state: {
  history?: { role: string; content: string }[];
  readyForSynthesis?: boolean;
}): boolean {
  if (!state.readyForSynthesis) return false;
  return !hasConceptSummary(state.history || []);
}

/** 助手消息里真正在问的句子（❓ 或问号句）。不含共情段，避免「不仅是通关」这类话误伤。 */
export function questionSentences(ask: string): string[] {
  const marks = [...ask.matchAll(/> ❓\s*(.+)/g)].map((m) => m[1].trim()).filter(Boolean);
  if (marks.length) return marks;
  return [...ask.matchAll(/[^。！!？?\n]*[？?]/g)]
    .map((m) => m[0].trim())
    .filter((p) => p.length >= 4);
}

export function lastQuestion(ask: string): string {
  const qs = questionSentences(ask);
  return qs.length ? qs[qs.length - 1] : "";
}

/** 总结块上的中文标签 → 状态键。任意题材只要按「标签：内容」写就能进文档。 */
const LABEL_FIELD: Array<{ labels: string[]; apply: (state: ConversationState, value: string) => void }> = [
  {
    labels: ["暂定名", "暂定游戏名", "游戏名"],
    apply: (s, v) => {
      if (!empty(s.workingTitle)) return;
      const titled = v.match(/《([^》]+)》/);
      s.workingTitle = (titled ? titled[1] : v).replace(/（[^）]*）|\([^)]*\)/g, "").trim() || v;
    },
  },
  { labels: ["一句话亮点", "一句话 pitch", "pitch"], apply: (s, v) => { s.pitch = v; } },
  { labels: ["核心体验", "核心体验陈述"], apply: (s, v) => { s.coreExperience = setStr(s.coreExperience, v); } },
  {
    labels: ["核心循环", "核心玩法循环"],
    apply: (s, v) => {
      if (empty(s.loop.fiveMin)) s.loop.fiveMin = v;
      const parts = v.split(/\s*[➔→➡️>]\s*|／/).map(clean).filter((p) => p.length >= 2);
      if (parts.length >= 2 && s.mechanics.length < 2) {
        for (const p of parts) {
          if (!s.mechanics.includes(p)) s.mechanics.push(p);
        }
      }
    },
  },
  { labels: ["差异化", "差异化亮点", "差异化与防坑"], apply: (s, v) => { s.differentiator = setStr(s.differentiator, v); } },
  { labels: ["核心情感", "主情感"], apply: (s, v) => { s.coreEmotion = setStr(s.coreEmotion, v); } },
  { labels: ["禁止情感"], apply: (s, v) => { s.forbiddenEmotion = setStr(s.forbiddenEmotion, v); } },
  { labels: ["核心幻想"], apply: (s, v) => { s.coreFantasy = setStr(s.coreFantasy, v); } },
  { labels: ["玩家身份", "扮演"], apply: (s, v) => { s.playerIdentity = setStr(s.playerIdentity, v.replace(/^了/, "")); } },
  { labels: ["核心动作"], apply: (s, v) => { s.coreAction = setStr(s.coreAction, v); } },
  { labels: ["交互链路", "核心交互"], apply: (s, v) => {
    if (isConcreteInteractionChain(v)) s.interaction.chain = setStr(s.interaction.chain, v);
  } },
  { labels: ["主要操作"], apply: (s, v) => { s.interaction.verb = setStr(s.interaction.verb, v); } },
  { labels: ["操作对象"], apply: (s, v) => { s.interaction.target = setStr(s.interaction.target, v); } },
  { labels: ["即时反馈"], apply: (s, v) => { s.interaction.feedback = setStr(s.interaction.feedback, v); } },
  { labels: ["核心爽点", "最舍不得删"], apply: (s, v) => { s.coreDelight = setStr(s.coreDelight, v); } },
  { labels: ["越玩越多"], apply: (s, v) => { s.growth.unlocks = setStr(s.growth.unlocks, v); } },
  { labels: ["眼前目标"], apply: (s, v) => { s.growth.nearGoal = setStr(s.growth.nearGoal, v); } },
  { labels: ["玩一阵之后", "玩一阵"], apply: (s, v) => { s.growth.afterTenMin = setStr(s.growth.afterTenMin, v); } },
  { labels: ["奖励", "奖励节奏"], apply: (s, v) => { s.reward = setStr(s.reward, v); } },
  { labels: ["失败", "失败规则"], apply: (s, v) => { s.failRule = setStr(s.failRule, v); } },
  { labels: ["胜利", "通关", "怎样算赢"], apply: (s, v) => { s.winRule = setStr(s.winRule, v); } },
  { labels: ["世界", "世界观", "世界与情境"], apply: (s, v) => { s.world = setStr(s.world, v); } },
  { labels: ["叙事"], apply: (s, v) => { s.narrative = setStr(s.narrative, v); } },
  { labels: ["视听", "视听氛围", "氛围"], apply: (s, v) => { s.aesthetic = setStr(s.aesthetic, v); } },
  { labels: ["手感"], apply: (s, v) => { s.gameFeel = setStr(s.gameFeel, v); } },
  { labels: ["在哪玩", "平台"], apply: (s, v) => { s.presentation.where = setStr(s.presentation.where, normalizeWhere(v)); } },
  { labels: ["画面维度", "维度"], apply: (s, v) => { s.presentation.dimension = setStr(s.presentation.dimension, normalizeDimension(v)); } },
];

function normalizeWhere(ans: string): string {
  if (/键鼠|电脑|PC|主机|手柄/i.test(ans)) return "电脑";
  if (/手机|触屏/.test(ans)) return "手机";
  if (/网页/.test(ans)) return "网页";
  return ans.trim();
}

function normalizeDimension(ans: string): string {
  if (/第一人称|第三人称|立体|3D|能转/i.test(ans)) return "能转视角的立体";
  if (/平面|2D|卡通/.test(ans)) return "平面";
  return ans.trim();
}

function applyLabeledBlocks(state: ConversationState, text: string): void {
  const re = /(?:📌\s*)?\*\*([^*]+?)(?:\*\*[ \t]*[：:]|[：:]\*\*)[ \t]*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const label = clean(m[1]).toLowerCase();
    const value = clean(m[2]);
    if (!value) continue;
    for (const row of LABEL_FIELD) {
      if (row.labels.some((l) => label.includes(l.toLowerCase()))) {
        row.apply(state, value);
        break;
      }
    }
  }
}

function maybeIdentityFromPitch(state: ConversationState): void {
  const text = state.pitch || "";
  const identity = text.match(/扮演(?:了)?([^，。？?\n]{2,16})/);
  if (!identity) return;
  const role = clean(identity[1]);
  if (!role || /[？?]/.test(role)) return;
  if (empty(state.playerIdentity) || (role.length <= 16 && (state.playerIdentity || "").length > role.length + 4)) {
    state.playerIdentity = role;
  }
}

type Intent = {
  id: string;
  test: RegExp;
  apply: (state: ConversationState, ans: string) => void;
};

/** 问法意图（asks.md 内核），不是某一局的用词。 */
const INTENTS: Intent[] = [
  {
    id: "ramp",
    test: /上强度|增加难度|怎么变难|给玩家.*难度/,
    apply: (s, a) => { if (empty(s.difficulty.ramp)) s.difficulty.ramp = a; },
  },
  {
    id: "win",
    test: /最终目的|通关目标|怎样才?算赢|怎样才算.*通关|[「“]通关[」”]/,
    apply: (s, a) => {
      if (empty(s.winRule)) s.winRule = a;
      if (empty(s.narrative)) s.narrative = a;
    },
  },
  {
    id: "fail",
    test: /失误|麻烦或代价|失败了会|特殊情况|打断一下|起伏/,
    apply: (s, a) => { if (empty(s.failRule)) s.failRule = a; },
  },
  {
    id: "reward",
    test: /干得漂亮|实质的奖励|怎么奖励|奖励反馈|做得好/,
    apply: (s, a) => { if (empty(s.reward)) s.reward = a; },
  },
  {
    id: "micro",
    test: /头几秒|初见杀|一按|一划/,
    apply: (s, a) => { if (empty(s.loop.thirtySec)) s.loop.thirtySec = a; },
  },
  {
    id: "opening",
    test: /头两分钟|刚刚踏入|刚开始/,
    apply: (s, a) => { if (empty(s.difficulty.firstMinutes)) s.difficulty.firstMinutes = a; },
  },
  {
    id: "midLoop",
    test: /游玩循环|3\s*[~～\-至到]\s*5\s*分钟/,
    apply: (s, a) => { if (empty(s.loop.fiveMin)) s.loop.fiveMin = a; },
  },
  {
    id: "feel",
    test: /操作手感|手感|操作反馈|切豆腐|拉满弓|回弹/,
    apply: (s, a) => { if (empty(s.gameFeel)) s.gameFeel = a; },
  },
  {
    id: "juice",
    test: /夸奖|高光|屏幕怎么/,
    apply: (s, a) => { if (!s.juice.includes(a)) s.juice.push(a); },
  },
  {
    id: "aesthetic",
    test: /画面和声音|视听氛围|哪种质感/,
    apply: (s, a) => { if (empty(s.aesthetic)) s.aesthetic = a; },
  },
  {
    id: "action",
    test: /最常做的一件事|最频繁|最重要|核心动作/,
    apply: (s, a) => { if (empty(s.coreAction)) s.coreAction = a; },
  },
  {
    id: "interact",
    test: /点下去之后|拨弄谁|屏幕立刻|交互链路|操作方式|操作对象|即时反馈|怎么操作|具体是怎么/,
    apply: (s, a) => {
      if (isConcreteInteractionChain(a) && empty(s.interaction.chain)) s.interaction.chain = a;
      if (empty(s.coreAction) && !/^(探索世界|经营农场|策略战斗)$/.test(a.trim())) s.coreAction = a;
    },
  },
  {
    id: "delight",
    test: /最舍不得删|只能留下一个|核心爽点/,
    apply: (s, a) => { if (empty(s.coreDelight)) s.coreDelight = a; },
  },
  {
    id: "growth",
    test: /越玩越多|眼前目标|玩\s*10\s*分钟|玩一阵以后|能做什么新/,
    apply: (s, a) => {
      if (/无独立成长|短单局|一次性|纯叙事|没有解锁/.test(a)) s.growth.none = true;
      else if (empty(s.growth.unlocks)) s.growth.unlocks = a;
    },
  },
  {
    id: "emotion",
    test: /三个词形容|朋友刚玩完|心里是一种什么感觉|内心涌现|涌现出哪种|哪种[“「]?恐怖感|哪种感受/,
    apply: (s, a) => { if (empty(s.coreEmotion)) s.coreEmotion = a; },
  },
  {
    id: "world",
    test: /发生在什么地方|世界观|世界规则|在什么地方|怎样的地方/,
    apply: (s, a) => { if (empty(s.world)) s.world = a; },
  },
  {
    id: "identity",
    test: /扮演谁|成为了谁/,
    apply: (s, a) => { if (empty(s.playerIdentity)) s.playerIdentity = a; },
  },
  {
    id: "forbidden",
    test: /禁止|不要的情绪|不希望.*感觉/,
    apply: (s, a) => { if (empty(s.forbiddenEmotion)) s.forbiddenEmotion = a; },
  },
  {
    id: "replay",
    test: /马上再来|变强再来|重玩/,
    apply: (s, a) => { if (empty(s.replayMotivation)) s.replayMotivation = a; },
  },
  {
    id: "where",
    test: /哪个平台|哪种设备|在哪玩|电脑玩|手机玩|什么设备|用什么玩|拿着手机|手里握/,
    apply: (s, a) => {
      if (empty(s.presentation.where) && /键鼠|电脑|PC|主机|手柄|手机|网页|触屏/i.test(a)) {
        s.presentation.where = normalizeWhere(a);
      }
    },
  },
  {
    id: "dimension",
    test: /视角|平面还是|立体/,
    apply: (s, a) => {
      if (empty(s.presentation.dimension) && /第一人称|第三人称|平面|立体|3D|2D|卡通|能转/i.test(a)) {
        s.presentation.dimension = normalizeDimension(a);
      }
    },
  },
  {
    id: "orientation",
    test: /横着拿|竖着拿|横屏|竖屏/,
    apply: (s, a) => {
      if (empty(s.presentation.orientation)) {
        if (/横/.test(a)) s.presentation.orientation = "横屏";
        else if (/竖/.test(a)) s.presentation.orientation = "竖屏";
      }
    },
  },
  {
    id: "players",
    test: /一个人玩|联网|跟别人一起|有互动吗|玩家之间|社交压力/,
    apply: (s, a) => {
      if (empty(s.presentation.players)) {
        if (/别人|联网|一起/.test(a) && !/自己|一个人/.test(a)) s.presentation.players = "要和别人一起";
        else if (/自己|一个人|单人|单机/.test(a)) s.presentation.players = "自己玩";
      }
    },
  },
  {
    id: "reference",
    test: /借鉴|避开|对标/,
    apply: (s, a) => {
      if (empty(s.differentiator)) s.differentiator = a;
      const avoid = a.match(/避开([^。！\n]+)/);
      if (avoid && s.avoidReferences.length === 0) s.avoidReferences.push(clean(avoid[1]));
      const borrow = clean(a.split(/避开/)[0]).replace(/[，,。；;]+$/, "");
      if (borrow && s.references.length === 0 && borrow.length >= 4) s.references.push(borrow);
    },
  },
];

function transcriptBlob(state: ConversationState): string {
  const hist = (state.history || []).map((m) => m.content || "").join("\n");
  return `${state.spark || ""}\n${hist}`;
}

function deriveContentBoundary(state: ConversationState, blob: string): string {
  const bits: string[] = [];
  if (/完全单机|没有社交|不.*社交|社交压力|自己安安静静|一个人静静/.test(blob)
    || state.presentation.players === "自己玩") {
    bits.push("单机收集，不做人与人的强制社交");
  }
  if (/不需要复杂|操作极简|看到洞口就点|极简顺滑/.test(blob)) {
    bits.push("操作保持极简，不叠复杂操作系统");
  }
  if (state.avoidReferences.length) {
    bits.push(`避开${state.avoidReferences.join("、")}`);
  }
  if (!bits.length && (state.coreAction || state.spark || state.pitch)) {
    bits.push("内容围绕已确认的核心循环，不扩展未讨论的系统");
  }
  return bits.join("；");
}

function derivePresentationBoundary(state: ConversationState): string {
  const parts = [
    state.presentation.where,
    state.presentation.orientation,
    state.presentation.dimension,
    state.presentation.players,
  ].map((x) => (x || "").trim()).filter(Boolean);
  return parts.join("，");
}

function inferMissing(state: ConversationState): void {
  const blob = transcriptBlob(state);
  if (empty(state.world)) {
    const scene = blob.match(/场景是([^。！?\n]+)/);
    if (scene) state.world = scene[1].trim();
  }
  if (empty(state.presentation.where)) {
    if (/手机|触屏/.test(blob)) state.presentation.where = "手机";
    else if (/键鼠|电脑|PC/i.test(blob)) state.presentation.where = "电脑";
    else if (/网页/.test(blob)) state.presentation.where = "网页";
  }
  if (empty(state.presentation.orientation)) {
    if (/竖屏|竖着|单手大拇指/.test(blob)) state.presentation.orientation = "竖屏";
    else if (/横屏|横着/.test(blob)) state.presentation.orientation = "横屏";
  }
  if (empty(state.presentation.dimension)) {
    if (/第一人称|第三人称|立体|3D|能转|微缩|手办级|近景/.test(blob)) {
      state.presentation.dimension = "能转视角的立体";
    } else if (/平面|2D/.test(blob)) {
      state.presentation.dimension = "平面";
    }
  }
  if (empty(state.presentation.players)) {
    if (/要和别人|联机|多人/.test(blob) && !/完全单机|没有社交|不.*社交/.test(blob)) {
      state.presentation.players = "要和别人一起";
    } else if (/完全单机|没有社交|不.*社交|自己安安静静|一个人静静|自己玩/.test(blob)) {
      state.presentation.players = "自己玩";
    }
  }
  if (empty(state.loop.thirtySec) && state.coreAction) state.loop.thirtySec = state.coreAction;
  if (!isConcreteInteractionChain(state.interaction.chain)) {
    const composed = composeInteractionChain(
      state.interaction.verb,
      state.interaction.target,
      state.interaction.feedback,
    );
    if (composed) state.interaction.chain = composed;
  }
  if (empty(state.coreAction) && isConcreteInteractionChain(state.interaction.chain)) {
    state.coreAction = state.interaction.chain;
  }
  if (!state.growth.none && hasGrowthSkipEvidence(state)) {
    state.growth.none = true;
  }
  if (empty(state.constitutionFields.artRule)) {
    state.constitutionFields.artRule = state.aesthetic || "";
  }
  if (empty(state.constitutionFields.contentBoundary)) {
    state.constitutionFields.contentBoundary = deriveContentBoundary(state, blob);
  }
  if (empty(state.constitutionFields.presentationBoundary)) {
    state.constitutionFields.presentationBoundary = derivePresentationBoundary(state);
  }
  absorbLabeledConstitution(state.constitutionFields, [
    ...(state.constitutionFields.extras || []),
    ...(state.constitution || []),
  ]);
}

function fillFromQa(state: ConversationState): void {
  const hist = state.history || [];
  for (let i = 0; i < hist.length - 1; i++) {
    const q = hist[i];
    const a = hist[i + 1];
    if (q.role !== "assistant" || a.role !== "user") continue;
    const ans = (a.content || "").trim();
    if (!ans || ans.length > 400 || isWeakAnswer(ans)) continue;
    const asks = questionSentences(q.content || "");
    if (!asks.length) continue;
    for (const ask of asks) {
      for (const intent of INTENTS) {
        if (intent.test.test(ask)) intent.apply(state, ans);
      }
    }
  }
}

/**
 * 把对话里已经说出口的内容写进空字段，并按采访补全宪法边界。
 * 两层都跟题材无关：1）总结标签 2）问法意图 ← 用户回答。
 */
export function harvestIntoState(state: ConversationState): void {
  if (!state.interaction || typeof state.interaction !== "object") state.interaction = {};
  if (!state.growth || typeof state.growth !== "object") state.growth = {};
  for (const m of state.history || []) {
    if (m.role === "assistant") applyLabeledBlocks(state, m.content || "");
  }
  maybeIdentityFromPitch(state);
  fillFromQa(state);
  inferMissing(state);
  if (empty(state.pitch) && state.coreExperience) state.pitch = state.coreExperience;
  if (empty(state.pitch) && state.spark) state.pitch = state.spark;
  if (empty(state.coreExperience) && state.pitch) state.coreExperience = state.pitch;
  if (empty(state.constitutionFields.coreFantasy)) {
    state.constitutionFields.coreFantasy = state.coreFantasy || state.playerIdentity || state.coreExperience || "";
  }
  if (empty(state.constitutionFields.coreLoop)) {
    state.constitutionFields.coreLoop = state.loop.fiveMin || state.coreAction || state.loop.thirtySec || "";
  }
  if (empty(state.coreFantasy) && (state.playerIdentity || state.coreExperience)) {
    state.coreFantasy = state.playerIdentity || state.coreExperience || "";
  }
  if (state.mechanics.length < 2 && state.coreAction) {
    if (!state.mechanics.includes(state.coreAction)) state.mechanics.push(state.coreAction);
  }
}
