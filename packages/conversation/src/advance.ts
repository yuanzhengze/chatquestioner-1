import type { ChatMessage, LlmClient } from "./llm.js";
import {
  TURN_DIRECTIVE,
  CONSENT_OPTIONS,
  CONSENT_AFTER_IDEA,
  DECLINED_ACK,
  CONVERGENCE_OPTIONS,
  interpretGuidance,
  interpretConvergenceChoice,
  historyWantsPreview,
  looksLikeConceptSummary,
  stripFollowUpAsksAfterSummary,
} from "./llm.js";
import { parseTurnOutput, STATE_SENTINEL, designOptionsOnly, type ParsedTurn, type TurnOption } from "./turn.js";
import { mergeStateDelta } from "./merge.js";
import { nextStage, buildGuideStageHint, askStageOf, markStageAsked } from "./stages.js";
import { normalizeConversationState, type ConversationState, type OptionPhase } from "./state.js";
import { buildKnowledgeContext, type Retriever } from "./retrieval.js";
import { buildClarifySystemPrompt } from "./clarifySkill.js";
import { harvestIntoState, hasConceptSummary } from "./harvest.js";
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

/** 缺哨兵 / 缺合法 options 时整轮重输。不进用户可见历史。方向必须由模型按选项纪律重写，宿主不代写。 */
const HOST_REPAIR =
  `[宿主纠偏 —— 用户看不到]
上一轮输出不合格。请整轮重输，不要省略 JSON.options：
1) 人话只保留共情和一个提问，禁止出现 A. B. C. 列表；
2) 另起一行 ${STATE_SENTINEL} 后接一个 JSON；
3) JSON.options 必须 2–3 项彼此真正不同的实质设计方向（画面不同，不是「更可爱一点」vs「更可爱很多」）。id 为 "A"/"B"/"C"，每项含非空 label（自带画面，不写「方向 A」）与 detail。
禁止开放口（自己输入 / Other）。禁止定稿/生成文档/改一块/再挖挖。能确定的事实写入 state_delta。`;

const OPTION_REPAIR_LIMIT = 2;

function hostTurnGuard(guide: boolean, phase: OptionPhase, generating: boolean, stage = 0): string {
  if (!guide) return "";
  if (generating) {
    return "\n\n[宿主硬约束] 用户这轮要出或更新设计文档。禁止 JSON options，禁止人话 A./B./C.。不要再问新的设计缺口。人话只确认已记下。";
  }
  if (phase === "convergence") {
    return "\n\n[宿主硬约束] 现在是收敛。人话对照已有概念总结做短确认。不要自己编 options；系统会给出「定稿写成文档 / 改一块 / 再挖挖」。";
  }
  if (phase === "supplement") {
    return "\n\n[宿主硬约束] 用户要补或改一块。JSON options 必须 2–3 个针对他这句的实质方向。禁止定稿/生成文档/改一块/再挖挖。人话不要写 A./B./C.。改了的设定写入 state_delta。";
  }
  if (stage >= 8) {
    return "\n\n[宿主硬约束] 已到收敛节。本轮必须出口头概念总结：含暂定名（《标题》）和一句话亮点。写完立刻停，禁止再问大结局、最后一个拼图或任何新缺口。不要自己给定稿/改一块/再挖挖。若你仍然在提问而不是总结，JSON options 必须 2–3 项实质方向。";
  }
  return "\n\n[宿主硬约束] JSON options 必须 2–3 项实质方向（id A/B/C）。禁止定稿/生成文档/改一块/再挖挖。禁止只写在人话里。不要提前抄暂定名 / 概念总结模板。";
}

function hasQualifiedSummary(state: ConversationState): boolean {
  return hasConceptSummary(state.history || []);
}

/** 定稿三选：人话已有合格概念总结即可；呈现字段不齐也不能再发明新策划方向。 */
function canShowConvergence(state: ConversationState): boolean {
  return state.guidance === "accepted" && hasQualifiedSummary(state);
}

/** 合格总结出现后内部进入收敛节，提示词不再继续塞呈现采访。 */
function promoteToConvergenceStage(state: ConversationState): void {
  if (canShowConvergence(state) && state.stage < 8) state.stage = 8;
}

function storedPhase(state: ConversationState, alreadyHadDoc: boolean): OptionPhase {
  if (alreadyHadDoc) return state.optionPhase || "awaitingEdit";
  if (state.optionPhase === "supplement") return "supplement";
  if (state.optionPhase === "awaitingEdit") return "awaitingEdit";
  if (canShowConvergence(state)) return "convergence";
  return "interview";
}

/** 本轮助手该处于哪一档选项。 */
function resolveOptionPhase(
  prev: ConversationState,
  alreadyHadDoc: boolean,
  generating: boolean,
  convChoice: ReturnType<typeof interpretConvergenceChoice>,
  current: ConversationState,
): OptionPhase {
  const prevPhase = storedPhase(prev, alreadyHadDoc);
  if (generating) return "awaitingEdit";
  if (convChoice === "revise" || convChoice === "explore") return "supplement";
  if (prevPhase === "supplement") return "convergence";
  if (alreadyHadDoc) return "supplement";
  if (canShowConvergence(current)) return "convergence";
  return "interview";
}

function outputNeedsRepair(parsed: ParsedTurn, requireOptions: boolean): boolean {
  if (parsed.warnings.length > 0) return true;
  if (looksLikeConceptSummary(parsed.reply)) return false;
  if (requireOptions && !(designOptionsOnly(parsed.options)?.length >= 2)) return true;
  return false;
}

function preferParsed(first: ParsedTurn, second: ParsedTurn, requireOptions: boolean): ParsedTurn {
  if (!outputNeedsRepair(second, requireOptions)) return second;
  if (requireOptions && (second.options?.length ?? 0) > (first.options?.length ?? 0)) return second;
  if (first.warnings.length && !second.warnings.length) return second;
  return first;
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

function resolveSystem(
  state: ConversationState,
  deps: AdvanceDeps,
  stage?: number,
  phase: OptionPhase = "interview",
  generating = false,
): string {
  if (deps.systemPrompt) return deps.systemPrompt;
  if (!deps.skillDir) {
    throw new Error("advance requires systemPrompt or skillDir");
  }
  const mode = state.guidance === "declined" ? "freeform" : "guide";
  const promptStage = stage ?? (mode === "guide" ? askStageOf(state) : state.stage);
  const converging = phase === "convergence" || generating;
  const prompt = buildClarifySystemPrompt({
    skillDir: deps.skillDir,
    mode,
    stage: promptStage,
    stageHint: mode === "guide" ? buildGuideStageHint(state, converging) : undefined,
    converging,
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
  alreadyHadDoc = false,
  phase: OptionPhase = "interview",
  generating = false,
): Promise<AdvanceResult> {
  if (state.guidance === "accepted" && typeof promptedStage === "number") {
    markStageAsked(state, promptedStage);
  }
  state.history.push({ role: "assistant", content: reply });
  promoteToConvergenceStage(state);
  harvestIntoState(state);
  const wantsDoc = historyWantsPreview(state.history, userInput, state.lastOptions);
  if (llm && wantsDoc) {
    await extractDiscussedIntoState(state, llm, { overwrite: alreadyHadDoc });
    harvestIntoState(state);
  }
  state.stage = nextStage(state, stageComplete);
  const model = toGddModel(state);
  const complete = isComplete(model);
  state.gddComplete = complete;
  const readyForSynthesis = isSubstantive(model) && wantsDoc;
  const justGenerated = generating;

  let outPhase: OptionPhase = justGenerated ? "awaitingEdit" : phase;
  let outOptions = options;
  let visible = reply;
  if (justGenerated || state.guidance === "declined") {
    outOptions = undefined;
  } else if (outPhase === "supplement") {
    outOptions = designOptionsOnly(options);
  } else if (outPhase === "convergence" || canShowConvergence(state)) {
    visible = stripFollowUpAsksAfterSummary(reply);
    if (visible !== reply) {
      state.history[state.history.length - 1] = { role: "assistant", content: visible };
    }
    outOptions = CONVERGENCE_OPTIONS;
    outPhase = "convergence";
    promoteToConvergenceStage(state);
  } else if (state.guidance === "accepted") {
    outOptions = designOptionsOnly(options);
    if (outPhase === "convergence") outPhase = "interview";
  } else {
    outOptions = options;
  }

  state.optionPhase = outPhase;
  state.lastOptions = outOptions?.length ? outOptions : [];
  state.readyForSynthesis = readyForSynthesis;
  return { reply: visible, state, readyForSynthesis, warnings, options: outOptions };
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

  const alreadyHadDoc = Boolean(prev.readyForSynthesis);
  const convChoice = interpretConvergenceChoice(userInput, prev.lastOptions);
  const wantsDocNow = historyWantsPreview(state.history, userInput, prev.lastOptions);
  const generating = convChoice === "finalize" || Boolean(wantsDocNow && !alreadyHadDoc);
  promoteToConvergenceStage(state);
  let phase = resolveOptionPhase(prev, alreadyHadDoc, generating, convChoice, state);

  const promptedStage = state.guidance === "accepted" ? askStageOf(state) : state.stage;
  const systemPrompt = resolveSystem(state, deps, promptedStage, phase, generating);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${TURN_DIRECTIVE}${knowledgeBlock}${hostTurnGuard(
        state.guidance === "accepted",
        phase,
        generating,
        state.stage,
      )}`,
    },
    ...state.history,
  ];

  let raw = await collectStream(deps.llm, messages, deps.onToken);
  let parsed = parseTurnOutput(raw);
  const requireOptions = state.guidance === "accepted"
    && !generating
    && phase !== "convergence"
    && (phase === "supplement" || phase === "interview");
  if (outputNeedsRepair(parsed, requireOptions)) {
    const convo: ChatMessage[] = [...messages, { role: "assistant", content: raw }];
    for (let i = 0; i < OPTION_REPAIR_LIMIT && outputNeedsRepair(parsed, requireOptions); i++) {
      convo.push({ role: "user", content: HOST_REPAIR });
      const repairedRaw = await collectStream(deps.llm, convo);
      convo.push({ role: "assistant", content: repairedRaw });
      parsed = preferParsed(parsed, parseTurnOutput(repairedRaw), requireOptions);
    }
  }
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
    alreadyHadDoc,
    phase,
    generating,
  );
}
