import type { GddModel } from "@cq/gdd";
import type { ConversationState } from "./state.js";

/** ConversationState → GddModel（人看的 GDD 渲染输入）。 */
export function toGddModel(state: ConversationState): GddModel {
  const coreLoop = [state.loop.thirtySec, state.loop.fiveMin, state.loop.thirtyMin, state.loop.longTerm]
    .filter((x): x is string => Boolean(x && x.trim()));
  return {
    title: state.workingTitle ?? state.theme ?? state.spark ?? "未命名游戏",
    pitch: state.pitch ?? "",
    coreFantasy: state.coreFantasy ?? "",
    coreExperience: state.coreExperience ?? state.coreEmotion ?? "",
    coreLoop,
    keywordPools: state.keywordPools,
    differentiator: state.differentiator ?? "",
    references: { borrow: state.references, avoid: state.avoidReferences },
    mvp: { must: state.mvpScope.must, cut: state.mvpScope.cut },
    risks: state.risks,
    constitution: state.constitution,
  };
}
