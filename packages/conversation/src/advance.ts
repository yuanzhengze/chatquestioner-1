import type { ChatMessage, LlmClient } from "./llm.js";
import { TURN_DIRECTIVE } from "./llm.js";
import { parseTurnOutput, STATE_SENTINEL } from "./turn.js";
import { mergeStateDelta } from "./merge.js";
import { nextStage } from "./stages.js";
import { toGameDsl } from "./compile.js";
import type { ConversationState } from "./state.js";
import { buildKnowledgeContext, type Retriever } from "./retrieval.js";

export interface AdvanceDeps {
  llm: LlmClient;
  systemPrompt: string;
  /** 流式回调：仅转发 sentinel 之前的人话分片。 */
  onToken?: (token: string) => void;
  /** 可选：每轮检索设计知识注入提示词。缺省则行为与现状一致。 */
  retrieve?: Retriever;
}

export interface AdvanceResult {
  reply: string;
  state: ConversationState;
  readyForSynthesis: boolean;
  warnings: string[];
}

/** 消费流：累积全文；onToken 只转发 sentinel 之前、且不会泄露半截哨兵的安全前缀。 */
async function collectStream(
  llm: LlmClient,
  messages: ChatMessage[],
  onToken?: (t: string) => void,
): Promise<string> {
  let full = "";
  let emitted = 0;
  let stopped = false;
  const hold = STATE_SENTINEL.length - 1; // 回扣，避免泄露半截哨兵
  for await (const chunk of llm.stream(messages)) {
    full += chunk;
    if (!onToken || stopped) continue;
    const sIdx = full.indexOf(STATE_SENTINEL);
    if (sIdx !== -1) {
      if (sIdx > emitted) onToken(full.slice(emitted, sIdx));
      emitted = sIdx;
      stopped = true;
    } else {
      const safeEnd = Math.max(emitted, full.length - hold);
      if (safeEnd > emitted) {
        onToken(full.slice(emitted, safeEnd));
        emitted = safeEnd;
      }
    }
  }
  // 流结束仍未见哨兵：把被回扣的结尾补发（此时全文皆属 reply，补发安全）。
  if (onToken && !stopped && full.length > emitted) {
    onToken(full.slice(emitted));
  }
  return full;
}

export async function advance(
  prev: ConversationState,
  userInput: string,
  deps: AdvanceDeps,
): Promise<AdvanceResult> {
  const state: ConversationState = structuredClone(prev);
  state.history.push({ role: "user", content: userInput });

  let knowledgeBlock = "";
  if (deps.retrieve) {
    try {
      const cards = await deps.retrieve(state, userInput);
      if (cards.length > 0) knowledgeBlock = `\n\n${buildKnowledgeContext(cards)}`;
    } catch {
      // 检索是 best-effort：失败则本轮不注入知识、照常投喂（spec §9）
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${deps.systemPrompt}\n\n${TURN_DIRECTIVE}${knowledgeBlock}` },
    ...state.history,
  ];

  const raw = await collectStream(deps.llm, messages, deps.onToken);
  const parsed = parseTurnOutput(raw);
  state.history.push({ role: "assistant", content: parsed.reply });

  mergeStateDelta(state, parsed.control.stateDelta);
  state.stage = nextStage(state, parsed.control.stageComplete);

  const dslReady = toGameDsl(state).missing.length === 0;
  const readyForSynthesis = parsed.control.readyForSynthesis && dslReady;

  return { reply: parsed.reply, state, readyForSynthesis, warnings: parsed.warnings };
}
