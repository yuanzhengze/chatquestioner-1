import {
  type GddModel,
  emptyGddModel,
  asGddText,
} from "@cq/gdd";
import type { ConversationState } from "./state.js";

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

function fillPool(target: string[], ...vals: unknown[]): void {
  for (const v of vals) {
    const t = asGddText(v);
    if (t && !target.includes(t)) target.push(t);
  }
}

function chips(...vals: unknown[]): string[] {
  const out: string[] = [];
  for (const v of vals) {
    const text = asGddText(v);
    if (!text) continue;
    for (const part of text.split(/[、，,/|➔→]/)) {
      const t = part.trim();
      if (t && t.length <= 32 && !out.includes(t)) out.push(t);
    }
  }
  return out;
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
  m.coreFantasy = pick(state.coreFantasy, state.playerIdentity, state.coreExperience);
  m.playerIdentity = pick(state.playerIdentity);
  m.differentiator = pick(state.differentiator);
  m.references = { borrow: asList(state.references), avoid: asList(state.avoidReferences) };
  m.coreAction = pick(state.coreAction);
  m.loop = {
    micro: pick(state.loop?.thirtySec),
    mid: pick(state.loop?.fiveMin, state.coreAction),
    macro: pick(state.loop?.thirtyMin, state.loop?.longTerm, state.winRule),
  };
  const mechanics = asList(state.mechanics);
  const engMechs = asList(state.engineering?.mechanics);
  m.mechanics = mechanics.length ? mechanics : engMechs.length ? engMechs : (m.coreAction ? [m.coreAction] : []);
  m.reward = pick(state.reward);
  m.winRule = pick(state.winRule);
  m.loseRule = pick(state.failRule);
  m.replayMotivation = pick(state.replayMotivation)
    || (/存档|重来|再来/.test(pick(state.failRule)) ? pick(state.failRule) : "");
  m.world = pick(state.world, state.theme);
  m.narrative = pick(state.narrative);
  m.aesthetic = pick(state.aesthetic);
  m.gameFeel = pick(state.gameFeel);
  m.highlight = pick(state.juice) || pick(state.gameFeel);
  m.content = pick(state.content?.overview)
    || [pick(state.world), pick(state.coreAction)].filter(Boolean).join("。");
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
    gameplay: asList(state.keywordPools?.gameplay),
    emotion: asList(state.keywordPools?.emotion),
    world: asList(state.keywordPools?.world),
    visual: asList(state.keywordPools?.visual),
    narrative: asList(state.keywordPools?.narrative),
    motivation: asList(state.keywordPools?.motivation),
  };
  fillPool(m.keywordPools.gameplay, state.coreAction, state.loop?.thirtySec, state.loop?.fiveMin, ...m.mechanics);
  fillPool(m.keywordPools.emotion, state.coreEmotion, state.forbiddenEmotion, ...chips(state.coreEmotion));
  fillPool(m.keywordPools.world, state.world, state.theme, ...chips(state.world, state.theme));
  fillPool(m.keywordPools.visual, state.aesthetic, state.gameFeel, ...chips(state.aesthetic));
  fillPool(m.keywordPools.narrative, state.narrative, state.playerIdentity, state.coreFantasy, state.coreExperience);
  fillPool(m.keywordPools.motivation, state.reward, state.replayMotivation, state.winRule);
  const cf = state.constitutionFields;
  m.constitution = {
    coreFantasy: pick(cf?.coreFantasy, state.coreFantasy, state.coreExperience),
    coreLoop: pick(cf?.coreLoop, state.loop?.fiveMin, state.loop?.thirtySec),
    artRule: pick(cf?.artRule, state.aesthetic),
    contentBoundary: pick(cf?.contentBoundary)
      || (asList(state.avoidReferences).length ? `避开${asList(state.avoidReferences).join("、")}` : ""),
    presentationBoundary: pick(cf?.presentationBoundary, state.presentation?.dimension),
    extras: [...asList(cf?.extras), ...asList(state.constitution)],
  };
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
  m.difficulty = {
    ramp: pick(state.difficulty?.ramp, state.difficultyCurve),
    firstMinutes: pick(state.difficulty?.firstMinutes),
    fatigue: pick(state.difficulty?.fatigue),
  };
  return m;
}
