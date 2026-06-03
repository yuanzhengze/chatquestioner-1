import type { BaselineState, EmoteState } from "./states.js";

/**
 * 状态机的输入信号。
 * - lifecycle：切换 baseline 持续态。
 * - emote：点燃一次瞬时情绪（按优先级入队）。
 * - emote-end：当前 emote 播放结束（由渲染层 video onended 派发），回落/出列。
 */
export type AvatarSignal =
  | { kind: "lifecycle"; baseline: BaselineState }
  | { kind: "emote"; emote: EmoteState }
  | { kind: "emote-end" };

export const lifecycle = (baseline: BaselineState): AvatarSignal => ({ kind: "lifecycle", baseline });
export const emote = (e: EmoteState): AvatarSignal => ({ kind: "emote", emote: e });
export const emoteEnd = (): AvatarSignal => ({ kind: "emote-end" });
