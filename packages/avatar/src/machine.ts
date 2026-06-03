import type { AvatarSignal } from "./signals.js";
import { type BaselineState, type EmoteState, emotePriority, isMajorEmote } from "./states.js";

/**
 * 形象当前呈现：1 个 baseline（循环）+ 可选叠加的 1 个 emote（one-shot）。
 * queue 暂存被当前 emote 挡住、待播的次高优先级 emote（最多 1 个 → 一波最多连播 2 个）。
 */
export interface AvatarView {
  baseline: BaselineState;
  emote: EmoteState | null;
  queue: EmoteState[];
}

export function initialView(baseline: BaselineState = "idle"): AvatarView {
  return { baseline, emote: null, queue: [] };
}

/** 队列容量：当前 emote(1) + 候补(1)；溢出时丢最低优先级，避免「表情抽搐」。 */
const MAX_QUEUE = 1;

function enqueue(view: AvatarView, e: EmoteState): AvatarView {
  // 终结性 emote：抢占当前、清空队列、独占当轮。
  if (isMajorEmote(e)) return { ...view, emote: e, queue: [] };
  // 空闲：直接上。
  if (view.emote === null) return { ...view, emote: e };
  // 已有 emote 在播：不打断，按优先级排候补（去重），截到容量。
  const merged = [...view.queue, e]
    .filter((x, i, arr) => arr.indexOf(x) === i && x !== view.emote)
    .sort((a, b) => emotePriority(b) - emotePriority(a))
    .slice(0, MAX_QUEUE);
  return { ...view, queue: merged };
}

function advanceQueue(view: AvatarView): AvatarView {
  const [next, ...rest] = view.queue;
  return { ...view, emote: next ?? null, queue: rest };
}

/** 纯函数 FSM：给定当前呈现与一个信号，算出下一呈现。 */
export function reduce(view: AvatarView, signal: AvatarSignal): AvatarView {
  switch (signal.kind) {
    case "lifecycle":
      // 仅切 baseline，不打断正在播的 emote（emote 播完会自然回落到新 baseline）。
      return { ...view, baseline: signal.baseline };
    case "emote":
      return enqueue(view, signal.emote);
    case "emote-end":
      return advanceQueue(view);
  }
}

/** 便利：依次喂入多个信号。 */
export function reduceAll(view: AvatarView, signals: AvatarSignal[]): AvatarView {
  return signals.reduce(reduce, view);
}
