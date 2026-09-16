import type { ConversationState } from "./state.js";

/** 用户或循环里出现这些说法，才算确认过「短局 / 无独立成长」。 */
export const GROWTH_SKIP_RE = /短单局|无长线|一次性|纯叙事|无独立成长|没有解锁|三分钟一局/;

export function hasGrowthSkipEvidence(state: ConversationState): boolean {
  const userText = (state.history || [])
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join(" ");
  const blob = [
    userText,
    state.growth?.unlocks,
    state.loop?.fiveMin,
    state.loop?.thirtyMin,
    state.loop?.longTerm,
  ].filter(Boolean).join(" ");
  return GROWTH_SKIP_RE.test(blob);
}
