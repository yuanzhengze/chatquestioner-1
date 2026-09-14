import type { ChatMessage, LlmClient } from "./llm.js";
import {
  TURN_DIRECTIVE,
  CONSENT_OPTIONS,
  CONSENT_AFTER_IDEA,
  DECLINED_ACK,
  interpretGuidance,
  historyWantsPreview,
} from "./llm.js";
import { parseTurnOutput, STATE_SENTINEL, type TurnOption } from "./turn.js";
import { mergeStateDelta } from "./merge.js";
import { nextStage, buildGuideStageHint, askStageOf, markStageAsked } from "./stages.js";
import { normalizeConversationState, type ConversationState } from "./state.js";
import { buildKnowledgeContext, type Retriever } from "./retrieval.js";
import { buildClarifySystemPrompt } from "./clarifySkill.js";
import { harvestIntoState } from "./harvest.js";
import { extractDiscussedIntoState } from "./extract.js";
import { toGddModel } from "./compile.js";
import { isComplete, isSubstantive } from "@cq/gdd";

export interface AdvanceDeps {
  llm: LlmClient;
  /** 测试占位。生产走 skillDir。 */
  systemPrompt?: string;
  skillDir?: string;
  onToken?: (token: string) => void;
  retrieve?: Retriever;
}

export interface AdvanceResult {
  reply: string;
  state: ConversationState;
  readyForSynthesis: boolean;
  warnings: string[];
  options?: TurnOption[];
}

async function collectStream(
  llm: LlmClient,
  messages: ChatMessage[],
  onToken?: (t: string) => void,
): Promise<string> {
  let full = "";
  let emitted = 0;
  let stopped = false;
  const hold = STATE_SENTINEL.length - 1;
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
  if (onToken && !stopped && full.length > emitted) {
    onToken(full.slice(emitted));
  }
  return full;
}

function resolveSystem(state: ConversationState, deps: AdvanceDeps, stage?: number): string {
  if (deps.systemPrompt) return deps.systemPrompt;
  if (!deps.skillDir) {
    throw new Error("advance requires systemPrompt or skillDir");
  }
  const mode = state.guidance === "declined" ? "freeform" : "guide";
  const promptStage = stage ?? (mode === "guide" ? askStageOf(state) : state.stage);
  const prompt = buildClarifySystemPrompt({
    skillDir: deps.skillDir,
    mode,
    stage: promptStage,
    stageHint: mode === "guide" ? buildGuideStageHint(state) : undefined,
  });
  if (state.guidance === "accepted") {
    return `${prompt}\n\n[宿主] 用户已同意大约 10 轮创意引导。禁止再问要不要走这个流程。下一句必须已经在聊他的创意。`;
  }
  return prompt;
}

/** 同意引导后，把用户第一条非同意回复当成 spark，避免卡在火花。 */
function seedSparkFromHistory(state: ConversationState): void {
  if (state.spark && state.spark.trim()) return;
  for (const msg of state.history) {
    if (msg.role !== "user") continue;
    if (interpretGuidance(msg.content)) continue;
    const t = msg.content.trim();
    if (t) {
      state.spark = t.slice(0, 240);
      return;
    }
  }
}

async function finish(
  state: ConversationState,
  reply: string,
  options: TurnOption[] | undefined,
  warnings: string[],
  stageComplete: boolean,
  userInput?: string,
  promptedStage?: number,
  llm?: LlmClient,
): Promise<AdvanceResult> {
  if (state.guidance === "accepted" && typeof promptedStage === "number") {
    markStageAsked(state, promptedStage);
  }
  state.history.push({ role: "assistant", content: reply });
  harvestIntoState(state);
  const wantsDoc = historyWantsPreview(state.history, userInput, state.lastOptions);
  if (llm && wantsDoc) {
    await extractDiscussedIntoState(state, llm);
    harvestIntoState(state);
  }
  state.stage = nextStage(state, stageComplete);
  const model = toGddModel(state);
  const complete = isComplete(model);
  state.gddComplete = complete;
  const readyForSynthesis = complete
    || (isSubstantive(model) && wantsDoc);
  let outOptions = options;
  if (complete) {
    outOptions = undefined;
  }
  state.lastOptions = outOptions?.length ? outOptions : [];
  state.readyForSynthesis = readyForSynthesis;
  return { reply, state, readyForSynthesis, warnings, options: outOptions };
}

export async function advance(
  prev: ConversationState,
  userInput: string,
  deps: AdvanceDeps,
): Promise<AdvanceResult> {
  const state: ConversationState = normalizeConversationState(structuredClone(prev));
  state.history.push({ role: "user", content: userInput });

  if (state.guidance === "pending") {
    const decision = interpretGuidance(userInput);
    if (!decision) {
      deps.onToken?.(CONSENT_AFTER_IDEA);
      return finish(state, CONSENT_AFTER_IDEA, CONSENT_OPTIONS, [], false, userInput);
    }
    state.guidance = decision;
    if (decision === "declined") {
      deps.onToken?.(DECLINED_ACK);
      return finish(state, DECLINED_ACK, undefined, [], false, userInput);
    }
    seedSparkFromHistory(state);
  }

  if (state.guidance === "accepted") {
    seedSparkFromHistory(state);
  }

  let knowledgeBlock = "";
  if (deps.retrieve && state.guidance === "accepted") {
    try {
      const cards = await deps.retrieve(state, userInput);
      if (cards.length > 0) knowledgeBlock = `\n\n${buildKnowledgeContext(cards)}`;
    } catch {
      // 检索失败则本轮不注入
    }
  }

  const promptedStage = state.guidance === "accepted" ? askStageOf(state) : state.stage;
  const systemPrompt = resolveSystem(state, deps, promptedStage);
  const messages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt}\n\n${TURN_DIRECTIVE}${knowledgeBlock}` },
    ...state.history,
  ];

  const raw = await collectStream(deps.llm, messages, deps.onToken);
  const parsed = parseTurnOutput(raw);
  mergeStateDelta(state, parsed.control.stateDelta);
  return finish(
    state,
    parsed.reply,
    parsed.options,
    parsed.warnings,
    parsed.control.stageComplete === true,
    userInput,
    state.guidance === "accepted" ? promptedStage : undefined,
    deps.llm,
  );
}
