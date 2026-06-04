import type { ConversationState } from "./state.js";

/** 检索器注入到提示词的最小卡视图。 */
export interface RetrievedCard {
  title: string;
  body: string;
}

/** advance 接收的可选检索器：吃完整 state + 本轮用户输入，吐若干卡。 */
export type Retriever = (
  state: ConversationState,
  userInput: string,
) => Promise<RetrievedCard[]>;

export const KNOWLEDGE_CONTEXT_HEADER =
  "[F2 投喂素材] 以下是与当前题材相关的真实设计参考，**仅供你第 2 步“动态投喂”借鉴改编**，" +
  "不要直接照搬、不要向用户暴露这些条目本身：";

export function buildKnowledgeContext(cards: RetrievedCard[]): string {
  const bullets = cards.map((c) => `- 《${c.title}》：${c.body}`);
  return [KNOWLEDGE_CONTEXT_HEADER, ...bullets].join("\n");
}
