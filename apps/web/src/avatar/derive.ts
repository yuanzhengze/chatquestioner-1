import { type BaselineState, type EmoteState, diffState, type StateSnapshot } from "@cq/avatar";

/** 纯函数：由对话生命周期推导 baseline 持续态（docs/06 §5.1 + listening 扩展）。 */
export function deriveBaseline(input: {
  busy: boolean;
  typing: boolean;
  lastRole?: "user" | "assistant";
  lastContentLen: number;
}): BaselineState {
  if (input.busy) {
    // 已有 token 在流 → speaking；否则 thinking（首字延迟）。
    return input.lastRole === "assistant" && input.lastContentLen > 0 ? "speaking" : "thinking";
  }
  if (input.typing) return "listening";
  return "idle";
}

/** 纯函数：阶段号上升 → stage-up。 */
export function deriveStageEmotes(prevStage: number | null, nextStage: number): EmoteState[] {
  return prevStage !== null && nextStage > prevStage ? ["stage-up"] : [];
}

export { diffState };
export type { StateSnapshot };
