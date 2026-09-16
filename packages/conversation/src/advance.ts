import type { ChatMessage, LlmClient } from "./llm.js";
import {
  buildTurnDirective,
  CONSENT_OPTIONS,
  CONSENT_AFTER_IDEA,
  DECLINED_ACK,
  CONVERGENCE_OPTIONS,
  interpretGuidance,
  interpretConvergenceChoice,
  historyWantsPreview,
  looksLikeConceptSummary,
} from "./llm.js";
import { parseTurnOutput, STATE_SENTINEL, designOptionsOnly, recoverOptionsFromProse, type ParsedTurn, type TurnOption } from "./turn.js";
import { mergeStateDelta } from "./merge.js";
import { nextStage, buildGuideStageHint, askStageOf, markStageAsked, CONVERGENCE_STAGE } from "./stages.js";
import { normalizeConversationState, type ConversationState, type OptionPhase } from "./state.js";
import { buildKnowledgeContext, type Retriever } from "./retrieval.js";
import { buildClarifySystemPrompt } from "./clarifySkill.js";
import { harvestIntoState, showDraftBar } from "./harvest.js";
import { extractDiscussedIntoState, groundedDeltaWithReply, scrubUngroundedState } from "./extract.js";
import { toGddModel } from "./compile.js";
import { isComplete, isSubstantive } from "@cq/gdd";
import { canShowConvergence, canWriteSummary, formatSummaryEligibility, openSummaryWindow } from "./gates.js";

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

/** 缺合法 options 时只补 JSON。已流给用户的人话不准改，纠偏不进用户可见历史。宿主不代写方向。 */
const HOST_REPAIR =
  `[宿主纠偏 —— 用户看不到]
上一轮 JSON.options 不合格。已经写给用户的人话一个字都不要改。
1) ${STATE_SENTINEL} 之前必须与上一轮人话完全相同；
2) 另起一行 ${STATE_SENTINEL} 后接一个 JSON；
3) JSON.options 必须 2–3 项彼此真正不同的实质设计方向（画面不同，不是「更可爱一点」vs「更可爱很多」）。id 为 "A"/"B"/"C"，每项含非空 label（自带画面，不写「方向 A」）与 detail。
禁止开放口（自己输入 / Other）。禁止定稿/生成文档/改一块/再挖挖。能确定的事实写入 state_delta。`;

const OPTION_REPAIR_LIMIT = 2;

function hostTurnGuard(state: ConversationState, phase: OptionPhase, generating: boolean): string {
  if (state.guidance !== "accepted") return "";
  const verdict = `\n\n${formatSummaryEligibility(state)}`;
  if (generating) {
    return `${verdict}\n\n[宿主硬约束] 用户这轮要出或更新设计文档。禁止 JSON options，禁止人话 A./B./C.。不要再问新的设计缺口。人话只确认已记下。`;
  }
  if (phase === "convergence") {
    return `${verdict}\n\n[宿主硬约束] 现在是收敛。人话对照已有概念总结做短确认。不要自己编 options；系统会给出「定稿写成文档 / 改一块 / 再挖挖」。`;
  }
  if (phase === "supplement") {
    return `${verdict}\n\n[宿主硬约束] 用户要补或改一块。JSON options 必须 2–3 个针对他这句的实质方向。禁止定稿/生成文档/改一块/再挖挖。人话不要写 A./B./C.。改了的设定写入 state_delta。`;
  }
  if (canWriteSummary(state)) {
    return `${verdict}\n\n[宿主硬约束] may_write_summary 为 true。本轮必须出口头概念总结：含暂定名（《标题》）和一句话亮点。写完立刻停，禁止再问缺口。不要自己给定稿三选。completeness 未齐也要写总结。`;
  }
  return `${verdict}\n\n[宿主硬约束] may_write_summary 为 false。JSON options 必须 2–3 项实质方向（id A/B/C）。禁止定稿/生成文档/改一块/再挖挖。禁止只写在人话里。禁止写暂定名 / 一句话亮点 / 📌 概念总结。`;
}

function storedPhase(state: ConversationState, alreadyHadDoc: boolean): OptionPhase {
  if (state.optionPhase) return state.optionPhase;
  if (canShowConvergence(state)) return alreadyHadDoc ? "awaitingEdit" : "convergence";
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
  const afterFinalize = alreadyHadDoc && canShowConvergence(current);
  if (generating) {
    return convChoice === "finalize" || canShowConvergence(current) ? "awaitingEdit" : "interview";
  }
  if (convChoice === "revise" || convChoice === "explore") return "supplement";
  if (afterFinalize) {
    if (prevPhase === "supplement") return "convergence";
    return "supplement";
  }
  if (canShowConvergence(current)) return "convergence";
  return "interview";
}

function outputNeedsRepair(
  parsed: ParsedTurn,
  requireOptions: boolean,
  _state: ConversationState,
): boolean {
  if (looksLikeConceptSummary(parsed.reply)) return false;
  if (requireOptions && (designOptionsOnly(parsed.options)?.length ?? 0) < 2) return true;
  return false;
}

function preferParsed(
  first: ParsedTurn,
  second: ParsedTurn,
  requireOptions: boolean,
  state: ConversationState,
): ParsedTurn {
  let pick = first;
  if (!outputNeedsRepair(second, requireOptions, state)) pick = second;
  else if (requireOptions && (second.options?.length ?? 0) > (first.options?.length ?? 0)) pick = second;
  else if (first.warnings.length && !second.warnings.length) pick = second;
  const reply = first.reply.trim() ? first.reply : pick.reply;
  return { ...pick, reply };
}

function isQuestionReply(reply: string): boolean {
  return /[？?❓]/.test(reply || "");
}

/** 卡片只跟本轮已流出的人话走，不拿另一段重写去盖气泡。 */
function cardsForReply(
  reply: string,
  parsedOptions: TurnOption[] | undefined,
  phase: OptionPhase,
  generating: boolean,
  declined: boolean,
): { options?: TurnOption[]; phase: OptionPhase } {
  if (declined) return { options: undefined, phase };
  if (generating) {
    return { options: undefined, phase: phase === "awaitingEdit" ? "awaitingEdit" : "interview" };
  }
  if (looksLikeConceptSummary(reply)) {
    return { options: CONVERGENCE_OPTIONS, phase: "convergence" };
  }
  const fromProse = designOptionsOnly(recoverOptionsFromProse(reply));
  if (fromProse?.length) {
    return { options: fromProse, phase: phase === "supplement" ? "supplement" : "interview" };
  }
  const fromJson = designOptionsOnly(parsedOptions);
  /** 已流出的是采访问句时，绝不以历史总结为由换成三选。 */
  if (isQuestionReply(reply)) {
    return { options: fromJson, phase: phase === "supplement" ? "supplement" : "interview" };
  }
  if (phase === "convergence") {
    return { options: CONVERGENCE_OPTIONS, phase: "convergence" };
  }
  if (phase === "supplement") {
    return { options: fromJson, phase: "supplement" };
  }
  return { options: fromJson, phase: "interview" };
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
  const writingSummary = canWriteSummary(state) && phase === "interview" && !generating;
  const prompt = buildClarifySystemPrompt({
    skillDir: deps.skillDir,
    mode,
    stage: promptStage,
    stageHint: mode === "guide" ? buildGuideStageHint(state, converging) : undefined,
    converging,
    allowSummary: writingSummary,
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
  harvestIntoState(state);
  const wantsDoc = historyWantsPreview(state.history, userInput, state.lastOptions);
  if (llm && wantsDoc && (generating || alreadyHadDoc)) {
    await extractDiscussedIntoState(state, llm, { overwrite: true });
    harvestIntoState(state);
  }
  scrubUngroundedState(state);
  state.stage = nextStage(state, stageComplete);
  if (canWriteSummary(state) && typeof state.summaryEligibleFrom !== "number") {
    openSummaryWindow(state);
  }
  const model = toGddModel(state);
  const complete = isComplete(model);
  state.gddComplete = complete;
  const readyForSynthesis = isSubstantive(model) && wantsDoc && (generating || alreadyHadDoc);
  state.gddDraftBar = readyForSynthesis && showDraftBar({ history: state.history, readyForSynthesis });
  const picked = cardsForReply(
    reply,
    options,
    phase,
    generating,
    state.guidance === "declined",
  );
  const outPhase = picked.phase;
  const outOptions = picked.options;
  const visible = reply;

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

  if (state.guidance === "accepted" || state.guidance === "declined") {
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
  if (canWriteSummary(state) && typeof state.summaryEligibleFrom !== "number" && prev.stage >= CONVERGENCE_STAGE) {
    state.summaryEligibleFrom = 0;
  }
  const generating = convChoice === "finalize" || Boolean(wantsDocNow && !alreadyHadDoc);
  let phase = resolveOptionPhase(prev, alreadyHadDoc, generating, convChoice, state);

  const promptedStage = state.guidance === "accepted" ? askStageOf(state) : state.stage;
  const writingSummary = canWriteSummary(state) && phase === "interview" && !generating;
  const systemPrompt = resolveSystem(state, deps, promptedStage, phase, generating);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${buildTurnDirective(writingSummary)}${knowledgeBlock}${hostTurnGuard(state, phase, generating)}`,
    },
    ...state.history,
  ];

  let streamed = "";
  let raw = await collectStream(deps.llm, messages, (t) => {
    streamed += t;
    deps.onToken?.(t);
  });
  let parsed = parseTurnOutput(raw);
  if (streamed.trim()) parsed = { ...parsed, reply: streamed.trim() };
  const summaryTurn = looksLikeConceptSummary(parsed.reply);
  const questionTurn = isQuestionReply(parsed.reply);
  const requireOptions = state.guidance === "accepted"
    && !generating
    && !summaryTurn
    && (
      phase === "supplement"
      || (phase === "interview" && !writingSummary)
      || (questionTurn && phase !== "awaitingEdit")
    );
  if (outputNeedsRepair(parsed, requireOptions, state)) {
    const first = parsed;
    const convo: ChatMessage[] = [...messages, { role: "assistant", content: raw }];
    for (let i = 0; i < OPTION_REPAIR_LIMIT && outputNeedsRepair(parsed, requireOptions, state); i++) {
      convo.push({ role: "user", content: HOST_REPAIR });
      const repairedRaw = await collectStream(deps.llm, convo);
      convo.push({ role: "assistant", content: repairedRaw });
      parsed = preferParsed(parsed, parseTurnOutput(repairedRaw), requireOptions, state);
    }
    parsed = { ...parsed, reply: first.reply.trim() ? first.reply : parsed.reply };
  }
  mergeStateDelta(
    state,
    groundedDeltaWithReply(
      parsed.control.stateDelta as Record<string, unknown>,
      state.history,
      parsed.reply,
    ),
  );
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
