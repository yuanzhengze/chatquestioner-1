import { isComplete } from "@cq/gdd";
import { toGddModel } from "./compile.js";
import { looksLikeConceptSummary } from "./llm.js";
import type { ConversationState } from "./state.js";

/**
 * 口头概念总结资格：核心体验到呈现已经按节问过并推进到第 8 节。
 * 不等于 completeness.md 全绿（那只决定 gddComplete）。
 * 预览草稿条跟有没有合格口头总结走，见 showDraftBar。
 */
export function canWriteSummary(state: ConversationState): boolean {
  return state.guidance === "accepted" && state.stage >= 8;
}

/**
 * 每轮塞进系统提示。模型不读 TypeScript，只读这里的 true/false。
 * 禁止对用户念出本段。
 */
export function formatSummaryEligibility(state: ConversationState): string {
  const allowed = canWriteSummary(state);
  const complete = isComplete(toGddModel(state));
  const lines = [
    "[宿主判定，禁止对用户说出本段]",
    `may_write_summary: ${allowed ? "true" : "false"}`,
    `core_to_presentation_done: ${state.stage >= 8 ? "true" : "false"}`,
    `completeness: ${complete ? "true" : "false"}`,
    `stage: ${state.stage}`,
  ];
  if (allowed) {
    lines.push("以上由代码算出。may_write_summary 为 true：本轮必须写暂定名和一句话亮点。completeness 未齐也要写，不要再问关键词池或禁止情感来拖延。中途要文档才亮草稿条；口头总结后的定稿预览不亮条。");
  } else {
    lines.push("以上由代码算出。may_write_summary 为 false：本轮禁止写暂定名、一句话亮点、📌 概念总结。只问当前节。不要自己判断齐没齐。");
  }
  return lines.join("\n");
}

/** 第一次到达第 8 节时钉住历史窗口，此前的 📌 不算。 */
export function openSummaryWindow(state: ConversationState): void {
  if (!canWriteSummary(state)) return;
  if (typeof state.summaryEligibleFrom === "number") return;
  state.summaryEligibleFrom = Math.max(0, (state.history || []).length - 1);
}

export function hasQualifiedSummaryInWindow(state: ConversationState): boolean {
  if (!canWriteSummary(state)) return false;
  if (typeof state.summaryEligibleFrom !== "number") return false;
  const from = state.summaryEligibleFrom;
  return (state.history || []).slice(from).some(
    (m) => m.role === "assistant" && looksLikeConceptSummary(m.content || ""),
  );
}

/**
 * 提示词侧：到了第 8 节且窗口里有总结，按收敛短确认来问。
 * 屏幕上出不出三选，看这一轮实际流出的人话，见 advance 的 cardsForReply。
 */
export function canShowConvergence(state: ConversationState): boolean {
  return hasQualifiedSummaryInWindow(state);
}
