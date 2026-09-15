import type { ConversationState } from "./state.js";
import { toGddModel } from "./compile.js";
import { isComplete, missingCompleteFieldLabels } from "@cq/gdd";

export const STAGE_COUNT = 9; // stage 0..8

export const STAGE_LABELS: Record<number, string> = {
  0: "破冰",
  1: "火花",
  2: "核心体验+四元素",
  3: "核心循环",
  4: "美学多巴胺",
  5: "世界与叙事",
  6: "平衡心流",
  7: "呈现",
  8: "收敛",
};

/** asks.md 二级标题，按 stage 投放。 */
export const STAGE_ASKS_TITLE: Record<number, string> = {
  0: "破冰",
  1: "火花",
  2: "核心体验",
  3: "核心循环",
  4: "美学与手感",
  5: "世界与叙事",
  6: "平衡与心流",
  7: "呈现",
  8: "收敛确认",
};

const STAGE_NEED: Record<number, string> = {
  0: "接到用户开口即可",
  1: "把兴奋点写入 spark",
  2: "按缺口各问一轮并写入 coreEmotion、coreAction、theme 或 world、aesthetic",
  3: "分别写入 loop.thirtySec、reward、failRule（可顺带 winRule）",
  4: "写入 juice[] 或 gameFeel（高光怎么夸、手感像什么）",
  5: "若还没有世界或叙事，补一段；已有则跳过",
  6: "写入 difficulty.ramp / difficultyCurve / replayMotivation 之一",
  7: "写入 presentation.where 与 presentation.dimension（以及 orientation / players / assets）",
  8: "补 completeness 缺口，口头总结暂定名和 Pitch，给定稿选项；未齐时不要宣布可以去开发",
};

const nonEmpty = (v?: string): boolean => Boolean(v && v.trim());

type Guard = (s: ConversationState) => boolean;

function hasPresentation(s: ConversationState): boolean {
  const where = nonEmpty(s.presentation.where) || s.engineering.platform.length > 0;
  const dim = nonEmpty(s.presentation.dimension) || Boolean(s.engineering.dimension);
  return where && dim;
}

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
  6: (s) => nonEmpty(s.difficultyCurve) || nonEmpty(s.replayMotivation) || nonEmpty(s.difficulty.ramp),
  7: (s) => hasPresentation(s),
  8: (s) => isComplete(toGddModel(s)),
};

export function readyToAdvance(state: ConversationState): boolean {
  const guard = STAGE_READY[state.stage];
  return guard ? guard(state) : false;
}

/** 破冰、已记下的火花、已有世界的「世界与叙事」可以不问。2–4 / 6–7 必须问。 */
export function canSkipStage(state: ConversationState, stage: number): boolean {
  if (stage === 0) return true;
  if (stage === 1) return nonEmpty(state.spark);
  if (stage === 5) return nonEmpty(state.world) || nonEmpty(state.narrative);
  return false;
}

export function hasAskedStage(state: ConversationState, stage: number): boolean {
  return (state.askedStages || []).includes(stage);
}

export function markStageAsked(state: ConversationState, stage: number): void {
  if (!Array.isArray(state.askedStages)) state.askedStages = [];
  if (!state.askedStages.includes(stage)) state.askedStages.push(stage);
}

/** 本轮该问的节：从当前 stage 跳过可跳过的节。 */
export function askStageOf(state: ConversationState): number {
  if (state.guidance === "pending") return state.stage;
  let stage = state.stage;
  while (stage < STAGE_COUNT - 1 && canSkipStage(state, stage) && STAGE_READY[stage](state)) {
    stage += 1;
  }
  return stage;
}

export function firstIncompleteStage(state: ConversationState): number {
  return askStageOf(state);
}

function remainingAsks(fromStage: number, state: ConversationState): string[] {
  const names: string[] = [];
  for (let i = fromStage; i <= 8; i++) {
    if (i === 5 && canSkipStage(state, 5)) continue;
    names.push(STAGE_ASKS_TITLE[i] || STAGE_LABELS[i] || String(i));
  }
  return names;
}

function stageGaps(state: ConversationState, stage: number): string {
  if (stage === 2) {
    const miss: string[] = [];
    if (!nonEmpty(state.coreEmotion)) miss.push("coreEmotion 主情感");
    if (!nonEmpty(state.coreAction)) miss.push("coreAction 最常做的动作");
    if (!nonEmpty(state.theme) && !nonEmpty(state.world)) miss.push("theme 或 world");
    if (!nonEmpty(state.aesthetic)) miss.push("aesthetic 视听氛围");
    return miss.length ? `本节还缺：${miss.join("、")}。只问缺的那一项。` : "本节字段已齐。";
  }
  if (stage === 3) {
    const miss: string[] = [];
    if (!nonEmpty(state.loop.thirtySec)) miss.push("loop.thirtySec 头几秒");
    if (!nonEmpty(state.reward)) miss.push("reward 怎么知道自己做得好");
    if (!nonEmpty(state.failRule)) miss.push("failRule 失误有什么麻烦");
    return miss.length ? `本节还缺：${miss.join("、")}。只问缺的那一项。` : "本节字段已齐。";
  }
  if (stage === 7) {
    const miss: string[] = [];
    if (!nonEmpty(state.presentation.where) && state.engineering.platform.length === 0) miss.push("presentation.where 在哪玩");
    if (!nonEmpty(state.presentation.dimension) && !state.engineering.dimension) miss.push("presentation.dimension 平面还是立体");
    return miss.length ? `本节还缺：${miss.join("、")}。` : "本节字段已齐。";
  }
  return STAGE_NEED[stage] || "";
}

/** 给模型看的内部进度。禁止对用户说出本段。 */
export function buildGuideStageHint(state: ConversationState, converging = false): string {
  const stage = askStageOf(state);
  const leftover = remainingAsks(stage, state).join(" → ");
  const completeMiss = missingCompleteFieldLabels(toGddModel(state));
  const lines = [
    "[内部进度，禁止对用户说出本段]",
    `当前只问 asks.md「${STAGE_ASKS_TITLE[stage] || STAGE_LABELS[stage]}」。`,
    `后面还要走：${leftover || "收敛"}。`,
    stageGaps(state, stage),
  ];
  if (converging) {
    lines.push("本轮已经收口。不要再问新的设计缺口。定稿/改一块/再挖挖由宿主弹出。");
    } else if (stage < 8) {
    lines.push("只问本节那一个问题。不要提前抄暂定名模板。人话一旦出现合格概念总结（暂定名+一句话亮点），宿主会进入收敛并弹出定稿三选，不要再问新缺口。");
  } else {
    lines.push("现在到收敛节。先出口头概念总结（暂定名《标题》+ 一句话亮点）。还没有合格总结时不要给定稿三选；总结出现后由宿主弹出。");
  }
  if (completeMiss.length && !converging && stage < 8) {
    lines.push(`completeness 还缺：${completeMiss.join("、")}。缺口可写入字段。不要为凑齐或凑轮次而继续发明新问题。`);
  }
  return lines.join("\n");
}

/**
 * 字段齐且本阶段已经问过，才 +1。一次只进一节。
 * 破冰 / 已有火花 / 已有世界的叙事节可跳过。
 */
export function nextStage(state: ConversationState, _stageComplete?: boolean): number {
  if (state.guidance === "pending") return state.stage;
  if (state.stage >= STAGE_COUNT - 1) return state.stage;
  let stage = askStageOf(state);
  if (stage < STAGE_COUNT - 1 && STAGE_READY[stage](state) && hasAskedStage(state, stage)) {
    stage += 1;
    while (stage < STAGE_COUNT - 1 && canSkipStage(state, stage) && STAGE_READY[stage](state)) {
      stage += 1;
    }
  }
  return stage;
}
