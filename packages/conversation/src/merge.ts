import type { ConversationState, EngineeringSignals, LoopState } from "./state.js";
import type { KeywordPools } from "@cq/gdd";

/** 一轮 LLM 抽取的状态增量（全可选，camelCase 对齐 ConversationState）。 */
export interface StateDelta {
  spark?: string;
  references?: string[];
  avoidReferences?: string[];
  coreEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  theme?: string;
  world?: string;
  narrative?: string;
  playerIdentity?: string;
  aesthetic?: string;
  gameFeel?: string;
  juice?: string[];
  loop?: Partial<LoopState>;
  reward?: string;
  failRule?: string;
  difficultyCurve?: string;
  replayMotivation?: string;
  workingTitle?: string;
  pitch?: string;
  coreExperience?: string;
  keywordPools?: Partial<KeywordPools>;
  differentiator?: string;
  risks?: string[];
  mvpScope?: { must?: string[]; cut?: string[] };
  engineering?: Partial<EngineeringSignals>;
  constitution?: string[];
}

function uniqMerge(existing: string[], incoming?: string[]): string[] {
  if (!incoming) return existing;
  const out = [...existing];
  for (const v of incoming) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function setIf<T>(value: T | undefined, apply: (v: T) => void): void {
  if (value !== undefined && value !== null && value !== "") apply(value);
}

/** 原地把 delta 合并进 state 并返回 state。 */
export function mergeStateDelta(state: ConversationState, delta: StateDelta): ConversationState {
  setIf(delta.spark, (v) => (state.spark = v));
  setIf(delta.coreEmotion, (v) => (state.coreEmotion = v));
  setIf(delta.coreFantasy, (v) => (state.coreFantasy = v));
  setIf(delta.coreAction, (v) => (state.coreAction = v));
  setIf(delta.theme, (v) => (state.theme = v));
  setIf(delta.world, (v) => (state.world = v));
  setIf(delta.narrative, (v) => (state.narrative = v));
  setIf(delta.playerIdentity, (v) => (state.playerIdentity = v));
  setIf(delta.aesthetic, (v) => (state.aesthetic = v));
  setIf(delta.gameFeel, (v) => (state.gameFeel = v));
  setIf(delta.reward, (v) => (state.reward = v));
  setIf(delta.failRule, (v) => (state.failRule = v));
  setIf(delta.difficultyCurve, (v) => (state.difficultyCurve = v));
  setIf(delta.replayMotivation, (v) => (state.replayMotivation = v));
  setIf(delta.workingTitle, (v) => (state.workingTitle = v));
  setIf(delta.pitch, (v) => (state.pitch = v));
  setIf(delta.coreExperience, (v) => (state.coreExperience = v));
  setIf(delta.differentiator, (v) => (state.differentiator = v));

  state.references = uniqMerge(state.references, delta.references);
  state.avoidReferences = uniqMerge(state.avoidReferences, delta.avoidReferences);
  state.juice = uniqMerge(state.juice, delta.juice);
  state.risks = uniqMerge(state.risks, delta.risks);
  state.constitution = uniqMerge(state.constitution, delta.constitution);

  if (delta.loop) {
    for (const k of ["thirtySec", "fiveMin", "thirtyMin", "longTerm"] as const) {
      setIf(delta.loop[k], (v) => (state.loop[k] = v));
    }
  }

  if (delta.keywordPools) {
    for (const k of ["gameplay", "emotion", "world", "visual", "narrative", "motivation"] as const) {
      state.keywordPools[k] = uniqMerge(state.keywordPools[k], delta.keywordPools[k]);
    }
  }

  if (delta.mvpScope) {
    state.mvpScope.must = uniqMerge(state.mvpScope.must, delta.mvpScope.must);
    state.mvpScope.cut = uniqMerge(state.mvpScope.cut, delta.mvpScope.cut);
  }

  if (delta.engineering) {
    const e = delta.engineering;
    setIf(e.dimension, (v) => (state.engineering.dimension = v));
    setIf(e.engine, (v) => (state.engineering.engine = v));
    setIf(e.orientation, (v) => (state.engineering.orientation = v));
    setIf(e.networking, (v) => (state.engineering.networking = v));
    setIf(e.genre, (v) => (state.engineering.genre = v));
    setIf(e.artStyle, (v) => (state.engineering.artStyle = v));
    state.engineering.platform = uniqMerge(state.engineering.platform, e.platform) as EngineeringSignals["platform"];
    state.engineering.modalities = uniqMerge(state.engineering.modalities, e.modalities) as EngineeringSignals["modalities"];
    state.engineering.mechanics = uniqMerge(state.engineering.mechanics, e.mechanics);
    state.engineering.intentTerms = uniqMerge(state.engineering.intentTerms, e.intentTerms);
    state.engineering.signatureTerms = uniqMerge(state.engineering.signatureTerms, e.signatureTerms);
  }

  return state;
}
