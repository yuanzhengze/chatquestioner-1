import {
  type GddModel,
  emptyGddModel,
  emptyConstitution,
  asGddText,
  absorbLabeledConstitution,
  composeInteractionChain,
  isConcreteInteractionChain,
} from "@cq/gdd";
import type { ConversationState } from "./state.js";
import { hasGrowthSkipEvidence } from "./growthSkip.js";

const PLATFORM_ZH: Record<string, string> = { PC: "电脑", mobile: "手机", web: "网页" };
const DIM_ZH: Record<string, string> = { "2D": "平面", "3D": "能转视角的立体" };
const ORI_ZH: Record<string, string> = { Landscape: "横屏", Portrait: "竖屏" };
const NET_ZH: Record<string, string> = { singleplayer: "自己玩", multiplayer: "要和别人一起" };
const MOD_ZH: Record<string, string> = {
  image: "插画",
  audio: "音乐音效",
  ui: "UI",
  "3d": "立体模型",
  pixel: "像素",
  sidescroller: "横版卷轴",
  narrative: "叙事文本",
  video: "影像",
};

export const MAX_DISPLAY_MECHANICS = 6;
export const MAX_DISPLAY_HIGHLIGHTS = 6;
const SHORT_KEYWORD_MAX = 12;

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const t = asGddText(v);
    if (t) return t;
  }
  return "";
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asGddText).filter(Boolean);
  const t = asGddText(v);
  return t ? [t] : [];
}

function joinZh(values: unknown, map: Record<string, string>): string {
  return asList(values).map((v) => map[v] || v).filter(Boolean).join(" / ");
}

function derivedGrowthRule(state: ConversationState, existing: string): string {
  const explicit = asGddText(existing);
  if (explicit) return explicit;
  const g = state.growth || {};
  const parts = [
    asGddText(g.unlocks) ? `越玩越多：${asGddText(g.unlocks)}` : "",
    asGddText(g.nearGoal) ? `眼前目标：${asGddText(g.nearGoal)}` : "",
    asGddText(g.afterTenMin) ? `玩一阵之后：${asGddText(g.afterTenMin)}` : "",
  ].filter(Boolean);
  if (parts.length) return parts.join("；");
  if (g.none && hasGrowthSkipEvidence(state)) return "本游戏无独立成长";
  return "";
}

function compactDup(s: string): string {
  return asGddText(s)
    .replace(/\s+/g, "")
    .replace(/[。．，,、：:；;！!？?\-—（）()《》""'']/g, "")
    .toLowerCase();
}

function bigrams(s: string): string[] {
  const n = compactDup(s);
  const out: string[] = [];
  for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2));
  return out;
}

function nearDuplicate(a: string, b: string): boolean {
  const ca = compactDup(a);
  const cb = compactDup(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.length >= 2 && cb.includes(ca)) return true;
  if (cb.length >= 2 && ca.includes(cb)) return true;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length < 3 || B.length < 3) return false;
  const setB = new Set(B);
  let inter = 0;
  for (const x of A) if (setB.has(x)) inter++;
  return inter / Math.min(A.length, B.length) >= 0.55;
}

/** 给人看的清单：去掉被包含的短句和近义重复，长句优先，保序截断。 */
export function collapseNearDup(items: string[], max = MAX_DISPLAY_MECHANICS): string[] {
  const cleaned: string[] = [];
  for (const raw of items) {
    const t = asGddText(raw);
    if (t && !cleaned.includes(t)) cleaned.push(t);
  }
  const ranked = [...cleaned].sort((a, b) => b.length - a.length || cleaned.indexOf(a) - cleaned.indexOf(b));
  const kept: string[] = [];
  for (const item of ranked) {
    if (kept.some((k) => nearDuplicate(item, k))) continue;
    kept.push(item);
  }
  const keptSet = new Set(kept.slice(0, max));
  return cleaned.filter((x) => keptSet.has(x));
}

function isShortKeyword(s: string): boolean {
  const t = asGddText(s);
  if (!t) return false;
  if (/[。！？!?]/.test(t) || /[：:]/.test(t)) return false;
  return t.length <= SHORT_KEYWORD_MAX;
}

function shortKeywords(vals: unknown): string[] {
  const out: string[] = [];
  for (const v of asList(vals)) {
    if (!isShortKeyword(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 10);
}

/** 一段已包含另一段就只留长的；避免用句号硬接出。。 */
export function joinDistinctSentences(a: unknown, b: unknown): { primary: string; secondary: string } {
  const rawX = asGddText(a);
  const rawY = asGddText(b);
  const x = rawX.replace(/。+$/g, "");
  const y = rawY.replace(/。+$/g, "");
  if (!y) return { primary: rawX, secondary: "" };
  if (!x) return { primary: rawY, secondary: "" };
  if (x.includes(y) || y.includes(x)) {
    const keep = x.length >= y.length ? rawX : rawY;
    return { primary: keep.replace(/。{2,}/g, "。"), secondary: "" };
  }
  return { primary: rawX.replace(/。{2,}/g, "。"), secondary: rawY.replace(/。{2,}/g, "。") };
}

function looksMultiplayer(players: string): boolean {
  return players === "要和别人一起" || /好友|排行|偷师|联机|多人/.test(players);
}

function pickSocialCopy(state: ConversationState, players: string): string {
  const blobs = [
    state.content?.multiplayer,
    state.constitutionFields?.presentationBoundary,
    state.pitch,
    state.differentiator,
    state.constitutionFields?.coreLoop,
  ];
  for (const b of blobs) {
    const t = asGddText(b);
    if (t && /好友|排行|偷师|联机|别人|一起|社交/.test(t)) return t;
  }
  return players;
}

/** 对话里把「第一人称视角」误写进了在哪玩。那不是电脑/手机。 */
function looksLikeViewpoint(s: string): boolean {
  return /人称|视角|手电筒|第一人称|第三人称|FPS/i.test(s) && !/电脑|手机|网页|PC/i.test(s);
}

function normalizeWhere(raw: string): string {
  if (!raw || looksLikeViewpoint(raw)) return "";
  if (/键鼠|电脑|PC/i.test(raw)) return "电脑";
  if (/手机|触屏/.test(raw)) return "手机";
  if (/网页/.test(raw)) return "网页";
  return raw;
}

/** ConversationState → GddModel（人看的 GDD 渲染输入）。 */
export function toGddModel(state: ConversationState): GddModel {
  const m = emptyGddModel();
  m.title = pick(state.workingTitle, state.theme, state.spark) || "未命名游戏";
  m.pitch = pick(state.pitch, state.coreExperience, state.spark);
  m.coreExperience = pick(state.coreExperience, state.pitch, state.coreEmotion);
  m.coreEmotion = pick(state.coreEmotion);
  m.forbiddenEmotion = pick(state.forbiddenEmotion);
  const fantasy = joinDistinctSentences(
    pick(state.coreFantasy, state.playerIdentity, state.coreExperience),
    pick(state.playerIdentity),
  );
  m.coreFantasy = fantasy.primary.replace(/。{2,}/g, "。");
  m.playerIdentity = fantasy.secondary.replace(/。{2,}/g, "。");
  m.differentiator = pick(state.differentiator);
  m.references = { borrow: asList(state.references), avoid: asList(state.avoidReferences) };
  m.coreAction = pick(state.coreAction, state.interaction?.chain);
  const composedChain = composeInteractionChain(
    state.interaction?.verb,
    state.interaction?.target,
    state.interaction?.feedback,
  );
  const chain = pick(state.interaction?.chain, composedChain);
  m.interaction = {
    verb: pick(state.interaction?.verb),
    target: pick(state.interaction?.target),
    chain: isConcreteInteractionChain(chain) ? chain : "",
    feedback: pick(state.interaction?.feedback),
  };
  if (!m.coreAction) m.coreAction = m.interaction.chain;
  m.coreDelight = pick(state.coreDelight);
  m.growth = {
    none: Boolean(state.growth?.none),
    unlocks: pick(state.growth?.unlocks),
    nearGoal: pick(state.growth?.nearGoal),
    afterTenMin: pick(state.growth?.afterTenMin),
  };
  const longTerm = pick(state.loop?.longTerm);
  m.loop = {
    micro: pick(state.loop?.thirtySec),
    mid: pick(state.loop?.fiveMin, state.coreAction),
    macro: pick(state.loop?.thirtyMin, state.loop?.longTerm, state.winRule),
    longTerm,
  };
  const mechanics = asList(state.mechanics);
  const engMechs = asList(state.engineering?.mechanics);
  const rawMechs = mechanics.length ? mechanics : engMechs.length ? engMechs : (m.coreAction ? [m.coreAction] : []);
  m.mechanics = collapseNearDup(rawMechs, MAX_DISPLAY_MECHANICS);
  m.reward = pick(state.reward);
  m.winRule = pick(state.winRule);
  m.loseRule = pick(state.failRule);
  m.replayMotivation = pick(state.replayMotivation)
    || (/存档|重来|再来/.test(pick(state.failRule)) ? pick(state.failRule) : "");
  m.world = pick(state.world, state.theme);
  m.narrative = pick(state.narrative);
  m.aesthetic = pick(state.aesthetic);
  m.gameFeel = pick(state.gameFeel);
  m.highlights = collapseNearDup(asList(state.juice), MAX_DISPLAY_HIGHLIGHTS);
  m.highlight = m.highlights.length ? m.highlights.join("、") : pick(state.gameFeel);
  m.content = pick(state.content?.overview, state.world, state.theme);
  m.contentDetail = {
    levels: pick(state.content?.levels),
    boss: pick(state.content?.boss),
    progression: pick(state.content?.progression, state.loop?.longTerm, state.loop?.thirtyMin),
    multiplayer: pick(state.content?.multiplayer),
  };
  m.contentFlags = {
    ...(state.content?.flags || { levels: false, boss: false, progression: false, multiplayer: false }),
  };
  m.keywordPools = {
    gameplay: shortKeywords(state.keywordPools?.gameplay),
    emotion: shortKeywords(state.keywordPools?.emotion),
    world: shortKeywords(state.keywordPools?.world),
    visual: shortKeywords(state.keywordPools?.visual),
    narrative: shortKeywords(state.keywordPools?.narrative),
    motivation: shortKeywords(state.keywordPools?.motivation),
  };
  const cf = state.constitutionFields;
  const constitution = emptyConstitution();
  constitution.coreFantasy = pick(cf?.coreFantasy);
  constitution.coreLoop = pick(cf?.coreLoop);
  constitution.artRule = pick(cf?.artRule);
  constitution.contentBoundary = pick(cf?.contentBoundary);
  constitution.presentationBoundary = pick(cf?.presentationBoundary);
  constitution.growthRule = pick(cf?.growthRule);
  constitution.worldRule = pick(cf?.worldRule);
  constitution.uiRule = pick(cf?.uiRule);
  absorbLabeledConstitution(constitution, [...asList(cf?.extras), ...asList(state.constitution)]);
  if (!asGddText(constitution.coreFantasy)) {
    constitution.coreFantasy = pick(state.coreFantasy, state.coreExperience);
  }
  if (!asGddText(constitution.coreLoop)) {
    constitution.coreLoop = pick(state.loop?.fiveMin, state.loop?.thirtySec);
  }
  if (!asGddText(constitution.artRule)) {
    constitution.artRule = pick(state.aesthetic);
  }
  if (!asGddText(constitution.contentBoundary)) {
    constitution.contentBoundary = (asList(state.avoidReferences).length ? `避开${asList(state.avoidReferences).join("、")}` : "")
      || (state.presentation?.players === "自己玩" ? "单机体验，不做人与人的强制社交" : "");
  }
  if (!asGddText(constitution.presentationBoundary)) {
    constitution.presentationBoundary = pick(
      [state.presentation?.where, state.presentation?.orientation, state.presentation?.dimension, state.presentation?.players]
        .map((x) => asGddText(x))
        .filter(Boolean)
        .join("，"),
      state.presentation?.dimension,
    );
  }
  constitution.growthRule = derivedGrowthRule(state, constitution.growthRule);
  constitution.extras = [];
  m.constitution = constitution;
  m.presentation = {
    where: normalizeWhere(pick(state.presentation?.where)) || joinZh(state.engineering?.platform, PLATFORM_ZH),
    dimension: pick(state.presentation?.dimension)
      || (state.engineering?.dimension ? DIM_ZH[state.engineering.dimension] || String(state.engineering.dimension) : ""),
    orientation: pick(state.presentation?.orientation)
      || (state.engineering?.orientation ? ORI_ZH[state.engineering.orientation] || String(state.engineering.orientation) : ""),
    players: pick(state.presentation?.players)
      || (state.engineering?.networking ? NET_ZH[state.engineering.networking] || String(state.engineering.networking) : ""),
    assets: pick(state.presentation?.assets)
      || joinZh(state.engineering?.modalities, MOD_ZH)
      || pick(state.aesthetic),
  };
  if (looksMultiplayer(m.presentation.players) && !m.contentFlags.multiplayer) {
    m.contentFlags.multiplayer = true;
  }
  if (m.contentFlags.multiplayer && !asGddText(m.contentDetail.multiplayer)) {
    m.contentDetail.multiplayer = pickSocialCopy(state, m.presentation.players);
  }
  m.difficulty = {
    ramp: pick(state.difficulty?.ramp, state.difficultyCurve),
    firstMinutes: pick(state.difficulty?.firstMinutes),
    fatigue: pick(state.difficulty?.fatigue),
  };
  return m;
}
