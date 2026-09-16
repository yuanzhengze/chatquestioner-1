import type { ConversationState } from "./state.js";
import { toGddModel } from "./compile.js";
import { isComplete, missingCompleteFieldLabels, isConcreteInteractionChain } from "@cq/gdd";
import { hasGrowthSkipEvidence } from "./growthSkip.js";

export const STAGE_COUNT = 11; // stage 0..10
/** 呈现问完后的收敛节。口头总结资格看 stage >= 这个值。 */
export const CONVERGENCE_STAGE = 10;

export const STAGE_LABELS: Record<number, string> = {
  0: "破冰",
  1: "火花",
  2: "核心体验",
  3: "核心交互",
  4: "核心循环",
  5: "成长与变化",
  6: "美学多巴胺",
  7: "世界与叙事",
  8: "平衡心流",
  9: "呈现",
  10: "收敛",
};

/** asks.md 二级标题，按 stage 投放。 */
export const STAGE_ASKS_TITLE: Record<number, string> = {
  0: "破冰",
  1: "火花",
  2: "核心体验",
  3: "核心交互",
  4: "核心循环",
  5: "成长与变化",
  6: "美学与手感",
  7: "世界与叙事",
  8: "平衡与心流",
  9: "呈现",
  10: "收敛确认",
};

const STAGE_NEED: Record<number, string> = {
  0: "接到用户开口即可",
  1: "把兴奋点写入 spark",
  2: "写入 coreEmotion、theme 或 world、aesthetic。不问点/拖。能合并就合并。",
  3: "写入一句带 → 的 interaction.chain；方式/对象/反馈能同轮写入。coreAction 写成行为不是点击。",
  4: "写入 loop.thirtySec 与 coreDelight；reward / failRule 能填则填。",
  5: "写入成长字段，或标明短局无独立成长",
  6: "写入 juice[] 或 gameFeel（高光怎么夸、手感像什么），一轮即可",
  7: "若还没有世界或叙事，补一段；已有则跳过",
  8: "写入 difficulty.ramp / difficultyCurve / replayMotivation 之一，一轮即可",
  9: "写入 presentation.where 与 presentation.dimension。不要问手指怎么点。",
  10: "口头总结暂定名和 Pitch，给定稿选项；未齐时不要宣布可以去开发",
};

const nonEmpty = (v?: string): boolean => Boolean(v && v.trim());

function growthSkipped(s: ConversationState): boolean {
  return hasGrowthSkipEvidence(s);
}

function hasPresentation(s: ConversationState): boolean {
  const where = nonEmpty(s.presentation.where) || s.engineering.platform.length > 0;
  const dim = nonEmpty(s.presentation.dimension) || Boolean(s.engineering.dimension);
  return where && dim;
}

type Guard = (s: ConversationState) => boolean;

/** 各阶段「必填字段已齐」判据。过门看字段，不看问了几轮。 */
export const STAGE_READY: Record<number, Guard> = {
  0: () => true,
  1: (s) => nonEmpty(s.spark),
  2: (s) =>
    nonEmpty(s.coreEmotion) &&
    (nonEmpty(s.theme) || nonEmpty(s.world)) &&
    nonEmpty(s.aesthetic),
  3: (s) => isConcreteInteractionChain(s.interaction?.chain),
  4: (s) => nonEmpty(s.loop.thirtySec) && nonEmpty(s.coreDelight),
  5: (s) =>
    Boolean(s.growth?.none)
    || nonEmpty(s.growth?.unlocks)
    || nonEmpty(s.growth?.nearGoal)
    || nonEmpty(s.growth?.afterTenMin)
    || growthSkipped(s),
  6: (s) => s.juice.length > 0 || nonEmpty(s.gameFeel),
  7: (s) => nonEmpty(s.world) || nonEmpty(s.narrative),
  8: (s) => nonEmpty(s.difficultyCurve) || nonEmpty(s.replayMotivation) || nonEmpty(s.difficulty.ramp),
  9: (s) => hasPresentation(s),
  10: (s) => isComplete(toGddModel(s)),
};

export function readyToAdvance(state: ConversationState): boolean {
  const guard = STAGE_READY[state.stage];
  return guard ? guard(state) : false;
}

/** 破冰、已记下的火花、已有世界的叙事节、短局成长节可以不问。 */
export function canSkipStage(state: ConversationState, stage: number): boolean {
  if (stage === 0) return true;
  if (stage === 1) return nonEmpty(state.spark);
  if (stage === 5) return growthSkipped(state);
  if (stage === 7) return nonEmpty(state.world) || nonEmpty(state.narrative);
  return false;
}

export function hasAskedStage(state: ConversationState, stage: number): boolean {
  return (state.askedStages || []).includes(stage);
}

export function markStageAsked(state: ConversationState, stage: number): void {
  if (!Array.isArray(state.askedStages)) state.askedStages = [];
  if (!state.askedStages.includes(stage)) state.askedStages.push(stage);
}

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
  for (let i = fromStage; i <= CONVERGENCE_STAGE; i++) {
    if (canSkipStage(state, i) && STAGE_READY[i]?.(state)) continue;
    names.push(STAGE_ASKS_TITLE[i] || STAGE_LABELS[i] || String(i));
  }
  return names;
}

function stageGaps(state: ConversationState, stage: number): string {
  if (stage === 2) {
    const miss: string[] = [];
    if (!nonEmpty(state.coreEmotion)) miss.push("coreEmotion 主情感");
    if (!nonEmpty(state.theme) && !nonEmpty(state.world)) miss.push("theme 或 world");
    if (!nonEmpty(state.aesthetic)) miss.push("aesthetic 视听氛围");
    return miss.length
      ? `本节还缺：${miss.join("、")}。能合并就合并，一轮可写多个键。不要问点/拖。`
      : "本节字段已齐。";
  }
  if (stage === 3) {
    if (isConcreteInteractionChain(state.interaction?.chain)) return "本节字段已齐。";
    return "本节要一句带 → 的具体操作链路，写入 interaction.chain。方式/对象/反馈能同轮写。不要写经营农场这种类型词。不要拆成三轮。";
  }
  if (stage === 4) {
    const miss: string[] = [];
    if (!nonEmpty(state.loop.thirtySec)) miss.push("loop.thirtySec 头几秒");
    if (!nonEmpty(state.coreDelight)) miss.push("coreDelight 最舍不得删的瞬间");
    return miss.length
      ? `本节还缺：${miss.join("、")}。奖励和失误能同轮写。不要拆成四轮。`
      : "本节字段已齐。";
  }
  if (stage === 5) {
    if (STAGE_READY[5](state)) return "本节字段已齐或可跳过。";
    return "一轮打包：越玩越多、眼前目标、玩一阵后能做什么新事。仅当用户或循环已标明短局/一次性/纯叙事时才可跳过；不要只写 growth.none。";
  }
  if (stage === 9) {
    const miss: string[] = [];
    if (!nonEmpty(state.presentation.where) && state.engineering.platform.length === 0) miss.push("presentation.where 在哪玩");
    if (!nonEmpty(state.presentation.dimension) && !state.engineering.dimension) miss.push("presentation.dimension 平面还是立体");
    return miss.length ? `本节还缺：${miss.join("、")}。一轮问清，不要问手指怎么点。` : "本节字段已齐。";
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
  } else if (stage < CONVERGENCE_STAGE) {
    lines.push("只问本节那一个问题。参考内核能合并就合并，一轮可写多个 state_delta 键。禁止写暂定名、一句话亮点、📌 概念总结。completeness 缺口可顺带写入字段，不要单开一轮问关键词池或禁止情感。上一轮已覆盖的不要换说法再问。");
  } else {
    lines.push("现在到收敛。先出口头概念总结（暂定名《标题》+ 一句话亮点，顺带怎么操作和最舍不得删的瞬间）。completeness 未齐也要写。还没有合格总结时不要给定稿三选；总结出现后由宿主弹出。");
  }
  if (completeMiss.length && !converging && stage < CONVERGENCE_STAGE) {
    lines.push(`completeness 还缺：${completeMiss.join("、")}。可写入字段，但本轮仍只问当前节，不要为凑齐而发明新问题，也不要提前总结。`);
  }
  return lines.join("\n");
}

/**
 * 字段齐且本阶段已经问过，才 +1。一次只进一节。
 * 破冰 / 已有火花 / 短局成长 / 已有世界的叙事节可跳过。
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
