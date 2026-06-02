import type { ConversationState } from "./state.js";

export const STAGE_COUNT = 8; // stage 0..7

export const STAGE_LABELS: Record<number, string> = {
  0: "破冰",
  1: "火花",
  2: "核心体验+四元素",
  3: "核心循环",
  4: "美学多巴胺",
  5: "世界与叙事",
  6: "平衡心流",
  7: "收敛",
};

const nonEmpty = (v?: string): boolean => Boolean(v && v.trim());

function hasAnyKeyword(s: ConversationState): boolean {
  return Object.values(s.keywordPools).some((pool) => pool.length > 0);
}

type Guard = (s: ConversationState) => boolean;

/** 各阶段「必填字段已齐」判据。 */
export const STAGE_READY: Record<number, Guard> = {
  0: () => true,
  1: (s) => nonEmpty(s.spark),
  2: (s) =>
    nonEmpty(s.coreEmotion) &&
    nonEmpty(s.coreAction) &&
    (nonEmpty(s.theme) || nonEmpty(s.world)) &&
    nonEmpty(s.aesthetic),
  3: (s) => nonEmpty(s.loop.thirtySec) && nonEmpty(s.reward) && nonEmpty(s.failRule),
  4: (s) => s.juice.length > 0 || nonEmpty(s.gameFeel),
  5: (s) => nonEmpty(s.world) || nonEmpty(s.narrative),
  6: (s) => nonEmpty(s.difficultyCurve) || nonEmpty(s.replayMotivation),
  7: (s) => nonEmpty(s.pitch) && hasAnyKeyword(s) && s.mvpScope.must.length > 0,
};

/** 当前阶段必填字段是否已齐。 */
export function readyToAdvance(state: ConversationState): boolean {
  const guard = STAGE_READY[state.stage];
  return guard ? guard(state) : false;
}

/** 计算下一阶段：stage_complete 且字段齐才 +1；到 7 封顶。 */
export function nextStage(state: ConversationState, stageComplete: boolean): number {
  if (state.stage >= STAGE_COUNT - 1) return state.stage;
  if (stageComplete && readyToAdvance(state)) return state.stage + 1;
  return state.stage;
}
