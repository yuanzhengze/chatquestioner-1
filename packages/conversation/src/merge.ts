import type { ConversationState, EngineeringSignals, LoopState, PresentationState, DifficultyState, ContentState } from "./state.js";
import type { KeywordPools, Constitution, ContentFlags } from "@cq/gdd";
import { asGddText, composeInteractionChain, isConcreteInteractionChain } from "@cq/gdd";

/** 一轮 LLM 抽取的状态增量（全可选，camelCase 对齐 ConversationState）。 */
export interface StateDelta {
  spark?: string;
  references?: string[];
  avoidReferences?: string[];
  coreEmotion?: string;
  forbiddenEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  interaction?: { verb?: string; target?: string; feedback?: string; chain?: string };
  coreDelight?: string;
  growth?: { none?: boolean; unlocks?: string; nearGoal?: string; afterTenMin?: string };
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
  winRule?: string;
  difficultyCurve?: string;
  replayMotivation?: string;
  mechanics?: string[];
  workingTitle?: string;
  pitch?: string;
  coreExperience?: string;
  keywordPools?: Partial<KeywordPools>;
  differentiator?: string;
  risks?: string[];
  mvpScope?: { must?: string[]; cut?: string[] };
  engineering?: Partial<EngineeringSignals>;
  constitution?: string[] | Partial<Constitution>;
  constitutionFields?: Partial<Constitution>;
  presentation?: Partial<PresentationState>;
  difficulty?: Partial<DifficultyState>;
  content?: Partial<Omit<ContentState, "flags">> & { flags?: Partial<ContentFlags> };
}

function uniqMerge(existing: string[], incoming?: string[]): string[] {
  if (!Array.isArray(incoming)) return existing;
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

function setText(value: unknown, apply: (v: string) => void): void {
  const t = asGddText(value);
  if (t) apply(t);
}

function setIfEmpty(cur: unknown, incoming: unknown, apply: (v: string) => void): void {
  const t = asGddText(incoming);
  if (!t) return;
  if (asGddText(cur)) return;
  apply(t);
}

export interface MergeDeltaOptions {
  /** 出稿抽取：mechanics / juice 整表替换，不再往历史上叠。采访轮不要开。 */
  replaceLists?: boolean;
}

/** 原地把 delta 合并进 state 并返回 state。已有字符串会被覆盖。 */
export function mergeStateDelta(
  state: ConversationState,
  delta: StateDelta,
  opts?: MergeDeltaOptions,
): ConversationState {
  setText(delta.spark, (v) => (state.spark = v));
  setText(delta.coreEmotion, (v) => (state.coreEmotion = v));
  setText(delta.forbiddenEmotion, (v) => (state.forbiddenEmotion = v));
  setText(delta.coreFantasy, (v) => (state.coreFantasy = v));
  setText(delta.coreAction, (v) => (state.coreAction = v));
  setText(delta.coreDelight, (v) => (state.coreDelight = v));
  applyInteraction(state, delta.interaction, false);
  applyGrowth(state, delta.growth, false);
  setText(delta.theme, (v) => (state.theme = v));
  setText(delta.world, (v) => (state.world = v));
  setText(delta.narrative, (v) => (state.narrative = v));
  setText(delta.playerIdentity, (v) => (state.playerIdentity = v));
  setText(delta.aesthetic, (v) => (state.aesthetic = v));
  setText(delta.gameFeel, (v) => (state.gameFeel = v));
  setText(delta.reward, (v) => (state.reward = v));
  setText(delta.failRule, (v) => (state.failRule = v));
  setText(delta.winRule, (v) => (state.winRule = v));
  setText(delta.difficultyCurve, (v) => (state.difficultyCurve = v));
  setText(delta.replayMotivation, (v) => (state.replayMotivation = v));
  setText(delta.workingTitle, (v) => (state.workingTitle = v));
  setText(delta.pitch, (v) => (state.pitch = v));
  setText(delta.coreExperience, (v) => (state.coreExperience = v));
  setText(delta.differentiator, (v) => (state.differentiator = v));

  state.references = uniqMerge(state.references, delta.references);
  state.avoidReferences = uniqMerge(state.avoidReferences, delta.avoidReferences);
  state.risks = uniqMerge(state.risks, delta.risks);
  if (opts?.replaceLists) {
    if (Array.isArray(delta.juice)) state.juice = uniqMerge([], delta.juice);
    if (Array.isArray(delta.mechanics)) state.mechanics = uniqMerge([], delta.mechanics);
  } else {
    state.juice = uniqMerge(state.juice, delta.juice);
    state.mechanics = uniqMerge(state.mechanics, delta.mechanics);
  }

  if (Array.isArray(delta.constitution)) {
    state.constitution = uniqMerge(state.constitution, delta.constitution);
  } else if (delta.constitution && typeof delta.constitution === "object") {
    mergeConstitution(state, delta.constitution);
  }
  if (delta.constitutionFields) mergeConstitution(state, delta.constitutionFields);

  if (delta.loop) {
    for (const k of ["thirtySec", "fiveMin", "thirtyMin", "longTerm"] as const) {
      setText(delta.loop[k], (v) => (state.loop[k] = v));
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

  if (delta.presentation) {
    const p = delta.presentation;
    setText(p.where, (v) => (state.presentation.where = v));
    setText(p.dimension, (v) => (state.presentation.dimension = v));
    setText(p.orientation, (v) => (state.presentation.orientation = v));
    setText(p.players, (v) => (state.presentation.players = v));
    setText(p.assets, (v) => (state.presentation.assets = v));
  }

  if (delta.difficulty) {
    const d = delta.difficulty;
    setText(d.ramp, (v) => (state.difficulty.ramp = v));
    setText(d.firstMinutes, (v) => (state.difficulty.firstMinutes = v));
    setText(d.fatigue, (v) => (state.difficulty.fatigue = v));
  }

  if (delta.content) {
    const c = delta.content;
    setText(c.overview, (v) => (state.content.overview = v));
    setText(c.levels, (v) => (state.content.levels = v));
    setText(c.boss, (v) => (state.content.boss = v));
    setText(c.progression, (v) => (state.content.progression = v));
    setText(c.multiplayer, (v) => (state.content.multiplayer = v));
    if (c.flags) {
      if (c.flags.levels === true) state.content.flags.levels = true;
      if (c.flags.boss === true) state.content.flags.boss = true;
      if (c.flags.progression === true) state.content.flags.progression = true;
      if (c.flags.multiplayer === true) state.content.flags.multiplayer = true;
    }
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
    if (e.mechanics?.length && !opts?.replaceLists) state.mechanics = uniqMerge(state.mechanics, e.mechanics);
  }

  finalizeInteraction(state);
  return state;
}

function applyInteraction(
  state: ConversationState,
  incoming: StateDelta["interaction"] | undefined,
  fillEmpty: boolean,
): void {
  if (!incoming) return;
  if (!state.interaction || typeof state.interaction !== "object") state.interaction = {};
  const put = fillEmpty
    ? (cur: unknown, next: unknown, apply: (v: string) => void) => setIfEmpty(cur, next, apply)
    : (_cur: unknown, next: unknown, apply: (v: string) => void) => setText(next, apply);
  put(state.interaction.verb, incoming.verb, (v) => (state.interaction.verb = v));
  put(state.interaction.target, incoming.target, (v) => (state.interaction.target = v));
  put(state.interaction.feedback, incoming.feedback, (v) => (state.interaction.feedback = v));
  const chain = asGddText(incoming.chain);
  if (chain && isConcreteInteractionChain(chain)) {
    put(state.interaction.chain, chain, (v) => (state.interaction.chain = v));
  }
}

function applyGrowth(
  state: ConversationState,
  incoming: StateDelta["growth"] | undefined,
  fillEmpty: boolean,
): void {
  if (!incoming) return;
  if (!state.growth || typeof state.growth !== "object") state.growth = {};
  if (incoming.none === true) state.growth.none = true;
  const put = fillEmpty
    ? (cur: unknown, next: unknown, apply: (v: string) => void) => setIfEmpty(cur, next, apply)
    : (_cur: unknown, next: unknown, apply: (v: string) => void) => setText(next, apply);
  put(state.growth.unlocks, incoming.unlocks, (v) => (state.growth.unlocks = v));
  put(state.growth.nearGoal, incoming.nearGoal, (v) => (state.growth.nearGoal = v));
  put(state.growth.afterTenMin, incoming.afterTenMin, (v) => (state.growth.afterTenMin = v));
}

function finalizeInteraction(state: ConversationState): void {
  if (!state.interaction || typeof state.interaction !== "object") state.interaction = {};
  if (!isConcreteInteractionChain(state.interaction.chain)) {
    const composed = composeInteractionChain(
      state.interaction.verb,
      state.interaction.target,
      state.interaction.feedback,
    );
    if (composed) state.interaction.chain = composed;
  }
}

function mergeConstitution(state: ConversationState, c: Partial<Constitution>, fillEmptyOnly = false): void {
  const put = fillEmptyOnly ? setIfEmpty : (_cur: unknown, incoming: unknown, apply: (v: string) => void) => {
    setText(incoming, apply);
  };
  put(state.constitutionFields.coreFantasy, c.coreFantasy, (v) => (state.constitutionFields.coreFantasy = v));
  put(state.constitutionFields.coreLoop, c.coreLoop, (v) => (state.constitutionFields.coreLoop = v));
  put(state.constitutionFields.artRule, c.artRule, (v) => (state.constitutionFields.artRule = v));
  put(state.constitutionFields.contentBoundary, c.contentBoundary, (v) => (state.constitutionFields.contentBoundary = v));
  put(state.constitutionFields.presentationBoundary, c.presentationBoundary, (v) => {
    state.constitutionFields.presentationBoundary = v;
  });
  put(state.constitutionFields.growthRule, c.growthRule, (v) => (state.constitutionFields.growthRule = v));
  put(state.constitutionFields.worldRule, c.worldRule, (v) => (state.constitutionFields.worldRule = v));
  put(state.constitutionFields.uiRule, c.uiRule, (v) => (state.constitutionFields.uiRule = v));
  if (Array.isArray(c.extras)) {
    state.constitutionFields.extras = uniqMerge(state.constitutionFields.extras, c.extras);
  }
}

/**
 * 只填空，不覆盖已有事实。抽取层用这个，避免把对话里已经钉住的值改写掉。
 */
export function mergeFillEmpty(state: ConversationState, delta: StateDelta): ConversationState {
  setIfEmpty(state.spark, delta.spark, (v) => (state.spark = v));
  setIfEmpty(state.coreEmotion, delta.coreEmotion, (v) => (state.coreEmotion = v));
  setIfEmpty(state.forbiddenEmotion, delta.forbiddenEmotion, (v) => (state.forbiddenEmotion = v));
  setIfEmpty(state.coreFantasy, delta.coreFantasy, (v) => (state.coreFantasy = v));
  setIfEmpty(state.coreAction, delta.coreAction, (v) => (state.coreAction = v));
  setIfEmpty(state.coreDelight, delta.coreDelight, (v) => (state.coreDelight = v));
  applyInteraction(state, delta.interaction, true);
  applyGrowth(state, delta.growth, true);
  setIfEmpty(state.theme, delta.theme, (v) => (state.theme = v));
  setIfEmpty(state.world, delta.world, (v) => (state.world = v));
  setIfEmpty(state.narrative, delta.narrative, (v) => (state.narrative = v));
  setIfEmpty(state.playerIdentity, delta.playerIdentity, (v) => (state.playerIdentity = v));
  setIfEmpty(state.aesthetic, delta.aesthetic, (v) => (state.aesthetic = v));
  setIfEmpty(state.gameFeel, delta.gameFeel, (v) => (state.gameFeel = v));
  setIfEmpty(state.reward, delta.reward, (v) => (state.reward = v));
  setIfEmpty(state.failRule, delta.failRule, (v) => (state.failRule = v));
  setIfEmpty(state.winRule, delta.winRule, (v) => (state.winRule = v));
  setIfEmpty(state.difficultyCurve, delta.difficultyCurve, (v) => (state.difficultyCurve = v));
  setIfEmpty(state.replayMotivation, delta.replayMotivation, (v) => (state.replayMotivation = v));
  setIfEmpty(state.workingTitle, delta.workingTitle, (v) => (state.workingTitle = v));
  setIfEmpty(state.pitch, delta.pitch, (v) => (state.pitch = v));
  setIfEmpty(state.coreExperience, delta.coreExperience, (v) => (state.coreExperience = v));
  setIfEmpty(state.differentiator, delta.differentiator, (v) => (state.differentiator = v));

  state.references = uniqMerge(state.references, delta.references);
  state.avoidReferences = uniqMerge(state.avoidReferences, delta.avoidReferences);
  state.juice = uniqMerge(state.juice, delta.juice);
  state.risks = uniqMerge(state.risks, delta.risks);
  state.mechanics = uniqMerge(state.mechanics, delta.mechanics);

  if (Array.isArray(delta.constitution)) {
    state.constitution = uniqMerge(state.constitution, delta.constitution);
  } else if (delta.constitution && typeof delta.constitution === "object") {
    mergeConstitution(state, delta.constitution, true);
  }
  if (delta.constitutionFields) mergeConstitution(state, delta.constitutionFields, true);

  if (delta.loop) {
    for (const k of ["thirtySec", "fiveMin", "thirtyMin", "longTerm"] as const) {
      setIfEmpty(state.loop[k], delta.loop[k], (v) => (state.loop[k] = v));
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

  if (delta.presentation) {
    const p = delta.presentation;
    setIfEmpty(state.presentation.where, p.where, (v) => (state.presentation.where = v));
    setIfEmpty(state.presentation.dimension, p.dimension, (v) => (state.presentation.dimension = v));
    setIfEmpty(state.presentation.orientation, p.orientation, (v) => (state.presentation.orientation = v));
    setIfEmpty(state.presentation.players, p.players, (v) => (state.presentation.players = v));
    setIfEmpty(state.presentation.assets, p.assets, (v) => (state.presentation.assets = v));
  }

  if (delta.difficulty) {
    const d = delta.difficulty;
    setIfEmpty(state.difficulty.ramp, d.ramp, (v) => (state.difficulty.ramp = v));
    setIfEmpty(state.difficulty.firstMinutes, d.firstMinutes, (v) => (state.difficulty.firstMinutes = v));
    setIfEmpty(state.difficulty.fatigue, d.fatigue, (v) => (state.difficulty.fatigue = v));
  }

  if (delta.content) {
    const c = delta.content;
    setIfEmpty(state.content.overview, c.overview, (v) => (state.content.overview = v));
    setIfEmpty(state.content.levels, c.levels, (v) => (state.content.levels = v));
    setIfEmpty(state.content.boss, c.boss, (v) => (state.content.boss = v));
    setIfEmpty(state.content.progression, c.progression, (v) => (state.content.progression = v));
    setIfEmpty(state.content.multiplayer, c.multiplayer, (v) => (state.content.multiplayer = v));
    if (c.flags) {
      if (c.flags.levels === true) state.content.flags.levels = true;
      if (c.flags.boss === true) state.content.flags.boss = true;
      if (c.flags.progression === true) state.content.flags.progression = true;
      if (c.flags.multiplayer === true) state.content.flags.multiplayer = true;
    }
  }

  finalizeInteraction(state);
  return state;
}
