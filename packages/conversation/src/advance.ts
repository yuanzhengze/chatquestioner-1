import type { ChatMessage, LlmClient } from "./llm.js";
import {
  buildTurnDirective,
  CONSENT_OPTIONS,
  CONSENT_AFTER_IDEA,
  DECLINED_ACK,
  CONVERGENCE_OPTIONS,
  PATCH_OPTIONS,
  interpretGuidance,
  interpretConvergenceChoice,
  interpretPatchChoice,
  historyWantsPreview,
  looksLikeConceptSummary,
} from "./llm.js";
import { parseTurnOutput, STATE_SENTINEL, designOptionsOnly, recoverOptionsFromProse, type ParsedTurn, type TurnOption } from "./turn.js";
import { mergeStateDelta } from "./merge.js";
import { nextStage, buildGuideStageHint, askStageOf, markStageAsked, CONVERGENCE_STAGE } from "./stages.js";
import { markContentUpdated, normalizeConversationState, type ConversationState, type OptionPhase } from "./state.js";
import { buildKnowledgeContext, type Retriever } from "./retrieval.js";
import { buildClarifySystemPrompt } from "./clarifySkill.js";
import { harvestIntoState, showDraftBar } from "./harvest.js";
import { extractDiscussedIntoState, groundedDeltaWithReply, scrubUngroundedState } from "./extract.js";
import { toGddModel } from "./compile.js";
import { isComplete, isSubstantive } from "@cq/gdd";
import { canShowConvergence, canWriteSummary, formatSummaryEligibility, hasFinalDoc, openSummaryWindow } from "./gates.js";
import {
  applyPendingPatch,
  clearPatchProposal,
  patchApplyReply,
  patchCancelReply,
  patchHostGuard,
  patchProposalReply,
  patchTweakReply,
  restorePatchPhase,
  stashPatchProposal,
} from "./patch.js";
import { finishTurnTrace, newTurnTrace, tracedLlm, type TurnOutputType, type TurnTrace } from "./trace.js";

export interface AdvanceDeps {
  llm: LlmClient;
  /** 测试占位。生产走 skillDir。 */
  systemPrompt?: string;
  skillDir?: string;
  onToken?: (token: string) => void;
  /**
   * 模型说完、开始写文档那一刻。
   * 真正耗时的是接下来的字段抽取，编译本身只有几毫秒 ——
   * 所以状态要在这里报，报到编译前就没有可见的时间窗了。
   */
  onWritingGdd?: () => void;
  retrieve?: Retriever;
}

export interface AdvanceResult {
  reply: string;
  state: ConversationState;
  readyForSynthesis: boolean;
  warnings: string[];
  options?: TurnOption[];
  /** 补丁应用/取消后，客户端回预览。 */
  openPreview?: boolean;
  /** 点「应用这些改动」并已写入清单字段。 */
  patchCommitted?: boolean;
  /** 开发环境耗时记录：这一轮调了几次模型、各自多久、生成了哪种卡、显示了哪种。 */
  trace?: TurnTrace;
}

type Trace = ReturnType<typeof newTurnTrace>;

function sameOptions(a: TurnOption[] | undefined, b: TurnOption[]): boolean {
  return Boolean(a?.length) && a!.length === b.length && a!.every((o, i) => o.label === b[i].label);
}

function renderedOutputOf(res: AdvanceResult, expected: TurnOutputType): TurnOutputType {
  if (sameOptions(res.options, PATCH_OPTIONS)) return "patch";
  if (sameOptions(res.options, CONVERGENCE_OPTIONS)) return "draft";
  if (sameOptions(res.options, CONSENT_OPTIONS)) return "none";
  if ((res.options?.length ?? 0) >= 2) return "interview";
  if (expected === "document" && res.readyForSynthesis) return "document";
  return "none";
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

/**
 * 共创页上对已定稿文档的一次修改，固定一轮采访、一轮定稿。
 * open：这次修改的采访轮，必须出采访三选。close：已经采访过，这一轮只给定稿三选。
 * 文档页点行修改走 patch，不进这里。
 */
type IterateStep = "open" | "close";

const ITERATE_HINT = `[内部进度，禁止对用户说出本段]
文档已经定稿。用户在共创页提了一个新想法，现在是在现有文档上改，不再按节采访，也不追问完整度缺口。`;

function iterateGuard(step: IterateStep): string {
  if (step === "close") {
    return `\n\n[宿主硬约束] 这次修改已经问过了，现在必须收口。人话用一两句确认会怎么改，不要再提问，不要给 JSON options，宿主会弹出定稿三选。不要写暂定名、一句话亮点或概念总结。改了的设定写入 state_delta。`;
  }
  return `\n\n[宿主硬约束] 文档已经定稿，用户在共创页提了一个新想法。这一轮必须围绕他刚说的这个想法，问一个最值得他决定的设计方向，并在 JSON options 给 2–3 个彼此真正不同的实质方向（id A/B/C）。即使他已经说得很具体，也要问这一次。
不要补问整份文档的缺口，不要按节采访，不要写暂定名、一句话亮点或概念总结。禁止定稿/生成文档/改一块/再挖挖。他已经说出的设定写入 state_delta。`;
}

/** 真的点了某个选项（或只打了它的字母）。打字里碰巧有「再加点」不算点了「再挖挖」。 */
function tappedOption(text: string, options: TurnOption[] | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/^[A-Ca-c]$/.test(t)) return true;
  return Boolean(options?.some((o) => o.label === t || o.detail === t));
}

/** 采访轮只出方向卡；模型补卡也补不出来时，宁可这轮没有卡，也不提前给定稿三选。 */
function iterateCards(step: IterateStep, reply: string, parsedOptions: TurnOption[] | undefined): { options?: TurnOption[]; phase: OptionPhase } {
  if (step === "open") {
    const asked = designOptionsOnly(recoverOptionsFromProse(reply)) ?? designOptionsOnly(parsedOptions);
    return { options: asked && asked.length >= 2 ? asked : undefined, phase: "supplement" };
  }
  return { options: CONVERGENCE_OPTIONS, phase: "convergence" };
}

function hostTurnGuard(state: ConversationState, phase: OptionPhase, generating: boolean, iterate?: IterateStep): string {
  if (state.guidance !== "accepted") return "";
  if (phase === "patch") return patchHostGuard(state);
  if (iterate) return iterateGuard(iterate);
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

/** 首次创作这一轮该处于哪一档选项。定稿后的修改走 IterateStep。 */
function resolveOptionPhase(
  prev: ConversationState,
  generating: boolean,
  convChoice: ReturnType<typeof interpretConvergenceChoice>,
  current: ConversationState,
): OptionPhase {
  if (prev.optionPhase === "patch" || current.optionPhase === "patch") return "patch";
  if (generating) {
    return convChoice === "finalize" || canShowConvergence(current) ? "awaitingEdit" : "interview";
  }
  if (convChoice === "revise" || convChoice === "explore") return "supplement";
  if (canShowConvergence(current)) return "convergence";
  return "interview";
}

/** strict：共创页定稿后的采访轮，模型写成总结也要补出方向卡。 */
function outputNeedsRepair(
  parsed: ParsedTurn,
  requireOptions: boolean,
  _state: ConversationState,
  strict = false,
): boolean {
  if (!strict && looksLikeConceptSummary(parsed.reply)) return false;
  if (requireOptions && (designOptionsOnly(parsed.options)?.length ?? 0) < 2) return true;
  return false;
}

function preferParsed(
  first: ParsedTurn,
  second: ParsedTurn,
  requireOptions: boolean,
  state: ConversationState,
  strict = false,
): ParsedTurn {
  let pick = first;
  if (!outputNeedsRepair(second, requireOptions, state, strict)) pick = second;
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
  if (phase === "patch") {
    return { options: PATCH_OPTIONS, phase: "patch" };
  }
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

/**
 * onReplyEnd：人话刚说完那一刻。
 * 哨兵之后模型还要吐一段用户看不见的 JSON，等整条流结束才报状态就会晚上好几秒。
 */
async function collectStream(
  llm: LlmClient,
  messages: ChatMessage[],
  onToken?: (t: string) => void,
  onReplyEnd?: () => void,
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
      onReplyEnd?.();
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
  /** 没出哨兵的话，流结束就是人话结束。 */
  if (!stopped) onReplyEnd?.();
  return full;
}

function resolveSystem(
  state: ConversationState,
  deps: AdvanceDeps,
  stage?: number,
  phase: OptionPhase = "interview",
  generating = false,
  iterate?: IterateStep,
): string {
  if (deps.systemPrompt) return deps.systemPrompt;
  if (!deps.skillDir) {
    throw new Error("advance requires systemPrompt or skillDir");
  }
  const mode = state.guidance === "declined" ? "freeform" : "guide";
  const promptStage = stage ?? (mode === "guide" ? askStageOf(state) : state.stage);
  const converging = phase === "convergence" || generating || Boolean(iterate);
  const writingSummary = canWriteSummary(state) && phase === "interview" && !generating;
  if (phase === "patch") {
    const prompt = deps.systemPrompt
      ?? `你是 ForgeaX。用户要点改文档里的一处。只问怎么改；他说明之后由系统列出将改的地方。不要说手风琴，不要定稿三选，不要采访下一节。`;
    return `${prompt}\n\n[宿主] 正在改文档里的一处。禁止再问要不要走引导。禁止对照旧稿写「不再需要 / 而是」。`;
  }
  const prompt = buildClarifySystemPrompt({
    skillDir: deps.skillDir,
    mode,
    stage: promptStage,
    stageHint: mode === "guide" ? (iterate ? ITERATE_HINT : buildGuideStageHint(state, converging)) : undefined,
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
  iterate?: IterateStep,
  trace?: Trace,
): Promise<AdvanceResult> {
  if (state.guidance === "accepted" && typeof promptedStage === "number") {
    markStageAsked(state, promptedStage);
  }
  state.history.push({ role: "assistant", content: reply });
  harvestIntoState(state);
  const wantsDoc = historyWantsPreview(state.history, userInput, state.lastOptions);
  /**
   * 整份文档重抽只在出文档那一轮做。共创页的采访轮和定稿三选那一轮不重抽：
   * 这两轮只出卡，文档等用户点定稿才更新；重抽一次要多等二三十秒。
   */
  if (llm && wantsDoc && (generating || (alreadyHadDoc && !iterate))) {
    if (trace) trace.generatedDocument = true;
    await extractDiscussedIntoState(state, trace ? tracedLlm(llm, "extract", trace) : llm, { overwrite: true });
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
  const picked = iterate
    ? iterateCards(iterate, reply, options)
    : cardsForReply(
      reply,
      options,
      phase,
      generating,
      state.guidance === "declined",
    );
  const outPhase = picked.phase;
  const outOptions = picked.options;
  const visible = reply;

  if (iterate) {
    state.iterationOrigin = "cocreation";
    state.revisionAsked = true;
  }
  if (generating && readyForSynthesis) {
    delete state.iterationOrigin;
    delete state.revisionAsked;
    if (outPhase === "awaitingEdit") state.gddFinalized = true;
  }
  state.optionPhase = outPhase;
  state.lastOptions = outOptions?.length ? outOptions : [];
  state.readyForSynthesis = readyForSynthesis;
  markContentUpdated(state);
  return { reply: visible, state, readyForSynthesis, warnings, options: outOptions };
}

async function advancePatch(
  prev: ConversationState,
  state: ConversationState,
  userInput: string,
  deps: AdvanceDeps,
  trace: Trace,
): Promise<AdvanceResult> {
  const choice = interpretPatchChoice(userInput, prev.lastOptions);
  const hadDoc = Boolean(prev.readyForSynthesis);
  trace.currentPhase = "patch";
  trace.expectedOutputType = choice ? "none" : "patch";

  if (choice === "apply") {
    const beforeDoc = JSON.stringify(toGddModel(state));
    applyPendingPatch(state);
    if (JSON.stringify(toGddModel(state)) !== beforeDoc) markContentUpdated(state);
    const reply = patchApplyReply(state);
    restorePatchPhase(state);
    deps.onToken?.(reply);
    state.history.push({ role: "assistant", content: reply });
    const model = toGddModel(state);
    state.gddComplete = isComplete(model);
    state.readyForSynthesis = isSubstantive(model) || hadDoc;
    if (isSubstantive(model)) state.readyForSynthesis = true;
    state.gddDraftBar = showDraftBar(state);
    return {
      reply,
      state,
      readyForSynthesis: state.readyForSynthesis === true,
      warnings: [],
      options: state.lastOptions,
      openPreview: true,
      patchCommitted: true,
    };
  }

  if (choice === "cancel") {
    restorePatchPhase(state);
    const reply = patchCancelReply();
    deps.onToken?.(reply);
    state.history.push({ role: "assistant", content: reply });
    state.readyForSynthesis = hadDoc;
    state.gddDraftBar = showDraftBar(state);
    return {
      reply,
      state,
      readyForSynthesis: hadDoc,
      warnings: [],
      options: state.lastOptions,
      openPreview: true,
    };
  }

  if (choice === "tweak") {
    clearPatchProposal(state);
    const reply = patchTweakReply();
    deps.onToken?.(reply);
    state.history.push({ role: "assistant", content: reply });
    state.readyForSynthesis = hadDoc;
    state.gddDraftBar = showDraftBar(state);
    return {
      reply,
      state,
      readyForSynthesis: hadDoc,
      warnings: [],
      options: [],
    };
  }

  const promptedStage = state.guidance === "accepted" ? askStageOf(state) : state.stage;
  const systemPrompt = resolveSystem(state, deps, promptedStage, "patch", false);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${buildTurnDirective(false)}${hostTurnGuard(state, "patch", false)}`,
    },
    ...state.history,
  ];
  let streamed = "";
  const raw = await collectStream(tracedLlm(deps.llm, "patch", trace), messages, (t) => {
    streamed += t;
  });
  let parsed = parseTurnOutput(raw);
  if (streamed.trim()) parsed = { ...parsed, reply: streamed.trim() };
  trace.generatedInterview = Boolean(designOptionsOnly(parsed.options)?.length);
  if (state.patchContext) state.patchContext.request = userInput;
  stashPatchProposal(
    state,
    parsed.control.stateDelta as Record<string, unknown>,
    parsed.control.affectedLines,
  );
  trace.generatedPatch = true;
  const reply = patchProposalReply(state);
  deps.onToken?.(reply);
  state.history.push({ role: "assistant", content: reply });
  state.readyForSynthesis = hadDoc;
  state.gddDraftBar = showDraftBar(state);
  return {
    reply,
    state,
    readyForSynthesis: hadDoc,
    warnings: parsed.warnings,
    options: PATCH_OPTIONS,
  };
}

/** 一轮只该出一种卡。先按状态机定好，再去调模型。 */
function expectedOutputOf(
  state: ConversationState,
  phase: OptionPhase,
  generating: boolean,
  writingSummary: boolean,
  iterate?: IterateStep,
): TurnOutputType {
  if (state.guidance === "declined") return "none";
  if (generating) return "document";
  if (iterate) return iterate === "open" ? "interview" : "draft";
  if (phase === "convergence" || writingSummary) return "draft";
  return "interview";
}

export async function advance(
  prev: ConversationState,
  userInput: string,
  deps: AdvanceDeps,
): Promise<AdvanceResult> {
  const trace = newTurnTrace();
  trace.iterationOrigin = prev.iterationOrigin;
  const res = await advanceTurn(prev, userInput, deps, trace);
  trace.renderedOutputType = renderedOutputOf(res, trace.expectedOutputType);
  if (trace.renderedOutputType === "draft" || looksLikeConceptSummary(res.reply)) trace.generatedDraft = true;
  const generated: Array<[TurnOutputType, boolean]> = [
    ["interview", trace.generatedInterview],
    ["draft", trace.generatedDraft],
    ["patch", trace.generatedPatch],
  ];
  trace.discardedOutputTypes = generated
    .filter(([type, made]) => made && type !== trace.renderedOutputType)
    .map(([type]) => type);
  return { ...res, trace: finishTurnTrace(trace) };
}

async function advanceTurn(
  prev: ConversationState,
  userInput: string,
  deps: AdvanceDeps,
  trace: Trace,
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

  if (prev.optionPhase === "patch" || state.optionPhase === "patch") {
    return advancePatch(prev, state, userInput, deps, trace);
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
  /**
   * 定稿后从共创页开口：按入口分流，不看这句说得够不够具体。
   * 这次共创已经采访过就只给定稿三选；点「改一块 / 再挖挖」算新的一次修改，重新采访一轮。
   */
  const asked = prev.iterationOrigin === "cocreation" && prev.revisionAsked === true;
  const reopen = (convChoice === "revise" || convChoice === "explore") && tappedOption(userInput, prev.lastOptions);
  const iterate: IterateStep | undefined = !generating && state.guidance === "accepted" && hasFinalDoc(state)
    ? (asked && !reopen ? "close" : "open")
    : undefined;
  const phase: OptionPhase = iterate
    ? (iterate === "close" ? "convergence" : "supplement")
    : resolveOptionPhase(prev, generating, convChoice, state);

  const promptedStage = state.guidance === "accepted" ? askStageOf(state) : state.stage;
  const writingSummary = canWriteSummary(state) && phase === "interview" && !generating;
  trace.currentPhase = phase;
  trace.expectedOutputType = expectedOutputOf(state, phase, generating, writingSummary, iterate);
  const systemPrompt = resolveSystem(state, deps, promptedStage, phase, generating, iterate);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${buildTurnDirective(writingSummary)}${knowledgeBlock}${hostTurnGuard(state, phase, generating, iterate)}`,
    },
    ...state.history,
  ];

  let streamed = "";
  let told = false;
  const tellWritingGdd = () => {
    if (told || !generating) return;
    told = true;
    deps.onWritingGdd?.();
  };
  let raw = await collectStream(
    tracedLlm(deps.llm, "reply", trace),
    messages,
    (t) => {
      streamed += t;
      deps.onToken?.(t);
    },
    tellWritingGdd,
  );
  let parsed = parseTurnOutput(raw);
  if (streamed.trim()) parsed = { ...parsed, reply: streamed.trim() };
  const summaryTurn = looksLikeConceptSummary(parsed.reply);
  const questionTurn = isQuestionReply(parsed.reply);
  /** 共创页的采访轮必须有方向卡，缺了就补；收口轮不补。 */
  const strict = iterate === "open";
  const requireOptions = iterate
    ? strict
    : state.guidance === "accepted"
      && !generating
      && !summaryTurn
      && phase !== "patch"
      && (
        phase === "supplement"
        || (phase === "interview" && !writingSummary)
        || (questionTurn && phase !== "awaitingEdit")
      );
  if (outputNeedsRepair(parsed, requireOptions, state, strict)) {
    const first = parsed;
    const convo: ChatMessage[] = [...messages, { role: "assistant", content: raw }];
    for (let i = 0; i < OPTION_REPAIR_LIMIT && outputNeedsRepair(parsed, requireOptions, state, strict); i++) {
      convo.push({ role: "user", content: HOST_REPAIR });
      const repairedRaw = await collectStream(tracedLlm(deps.llm, "repair", trace), convo);
      convo.push({ role: "assistant", content: repairedRaw });
      parsed = preferParsed(parsed, parseTurnOutput(repairedRaw), requireOptions, state, strict);
    }
    parsed = { ...parsed, reply: first.reply.trim() ? first.reply : parsed.reply };
  }
  trace.generatedInterview = Boolean(designOptionsOnly(parsed.options)?.length);
  mergeStateDelta(
    state,
    groundedDeltaWithReply(
      parsed.control.stateDelta as Record<string, unknown>,
      state.history,
      parsed.reply,
    ),
  );
  tellWritingGdd();
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
    iterate,
    trace,
  );
}
