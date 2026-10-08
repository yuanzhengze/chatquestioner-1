import type { KeywordPools, Constitution, ContentFlags } from "@cq/gdd";
import { emptyKeywordPools, emptyConstitution } from "@cq/gdd";
import type {
  Dimension, Engine, Modality, Networking, Orientation, Platform,
} from "./signals.js";
import type { ChatMessage } from "./llm.js";
import type { TurnOption } from "./turn.js";

export type Guidance = "pending" | "accepted" | "declined";

/** 引导轮选项由宿主推进：采访 → 收敛三选 → 补一块 → 再回到三选；预览点行是独立的 patch。 */
export type OptionPhase = "interview" | "convergence" | "supplement" | "awaitingEdit" | "patch";

export interface PatchContext {
  lineId: string;
  lineText: string;
  sectionId?: string;
  sectionTitle?: string;
  resumePhase: Exclude<OptionPhase, "patch">;
  resumeOptions: TurnOption[];
  /** 点的是某一条核心机制时，记下点下去那一刻的原文。写回只换这一条。 */
  targetText?: string;
  /** 用户这次说的修改要求。再改改说法时换成新的那句。 */
  request?: string;
  /** 点进来之前共创页那次修改的进度。取消或应用后，没走完的那次共创照原样接上。 */
  resumeOrigin?: "cocreation";
  resumeAsked?: boolean;
  pendingDelta?: Record<string, unknown>;
  affectedLineIds?: string[];
  awaitingConfirm?: boolean;
}

/** 四级核心循环（30s / 5min / 30min / 长线） */
export interface LoopState {
  thirtySec?: string;
  fiveMin?: string;
  thirtyMin?: string;
  longTerm?: string;
}

export interface PresentationState {
  where?: string;
  dimension?: string;
  orientation?: string;
  players?: string;
  assets?: string;
}

export interface DifficultyState {
  ramp?: string;
  firstMinutes?: string;
  fatigue?: string;
}

export interface ContentState {
  overview?: string;
  levels?: string;
  boss?: string;
  progression?: string;
  multiplayer?: string;
  flags: ContentFlags;
}

/** 对话中顺带捕获的工程线索，随 GDD 交付给 ForgeaX 参考，不做出稿门控 */
export interface EngineeringSignals {
  dimension?: Dimension;
  engine?: Engine;
  platform: Platform[];
  orientation?: Orientation;
  networking?: Networking;
  modalities: Modality[];
  genre?: string;
  mechanics: string[];
  artStyle?: string;
  intentTerms: string[];
  signatureTerms: string[];
}

/** 贯穿全程的结构化状态：GDD 的事实源。 */
export interface ConversationState {
  /** 当前阶段 0..10（9 呈现，10 收敛） */
  stage: number;
  guidance: Guidance;

  spark?: string;
  references: string[];
  avoidReferences: string[];
  coreEmotion?: string;
  forbiddenEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  /** 核心交互：怎么操作、操作谁、立刻怎样。 */
  interaction: {
    verb?: string;
    target?: string;
    feedback?: string;
    chain?: string;
  };
  /** 最舍不得删的一个好玩瞬间 */
  coreDelight?: string;
  growth: {
    none?: boolean;
    unlocks?: string;
    nearGoal?: string;
    afterTenMin?: string;
  };
  theme?: string;
  world?: string;
  narrative?: string;
  playerIdentity?: string;
  aesthetic?: string;
  gameFeel?: string;
  juice: string[];
  loop: LoopState;
  reward?: string;
  failRule?: string;
  winRule?: string;
  difficultyCurve?: string;
  replayMotivation?: string;
  mechanics: string[];
  workingTitle?: string;
  pitch?: string;
  coreExperience?: string;
  keywordPools: KeywordPools;
  differentiator?: string;
  /** 兼容旧会话与形象差分；不再写入 GDD 主模板 */
  risks: string[];
  mvpScope: { must: string[]; cut: string[] };
  engineering: EngineeringSignals;
  constitution: string[];
  constitutionFields: Constitution;
  presentation: PresentationState;
  difficulty: DifficultyState;
  content: ContentState;
  history: ChatMessage[];
  /**
   * 用户最近一次真正改了共创或文档的时间（毫秒）。
   * 只打开、点「修改」、取消、封面、玩法图、游戏类型分类都不改它。
   * 旧会话没有这个字段时不补成现在。
   */
  contentUpdatedAt?: number;
  lastOptions?: TurnOption[];
  readyForSynthesis?: boolean;
  /** 定稿（过 completeness）才为 true；中途半成品仍可以是 false */
  gddComplete?: boolean;
  /** 预览顶上的草稿条。跟有没有合格口头总结走，不跟 gddComplete。 */
  gddDraftBar?: boolean;
  /** 走过定稿出过文档。之后再开口是在现有文档上改，不再按节采访。中途要来的草稿不算。 */
  gddFinalized?: boolean;
  /**
   * 定稿后这一次修改从哪里发起。cocreation：共创页输入框；document_patch：文档页点某一条「修改」。
   * 只看入口，不看用户说得够不够具体。
   */
  iterationOrigin?: "cocreation" | "document_patch";
  /** 共创页这次修改已经出过一轮采访三选。再开口只给定稿三选，直到用户点定稿、改一块或再挖挖。 */
  revisionAsked?: boolean;
  /** 核心机制原文指纹 → 稳定 id。点改一条机制后，这一条的身份和玩法图仍跟着它。 */
  mechanicIds?: Record<string, string>;
  /** 已经在该阶段上问过至少一轮，避免字段被顺带填上就跳节 */
  askedStages: number[];
  /** 当前该弹采访选项、收敛三选，还是补一块的设计选项 */
  optionPhase?: OptionPhase;
  /** 手风琴单点修改。点应用/取消后删掉，并恢复 resumePhase。 */
  patchContext?: PatchContext;
  /** 第一次到达收敛节时的历史下标；此前的 📌 不算合格总结 */
  summaryEligibleFrom?: number;
    /** 封面生图元数据。字节在 data/covers，不进 JSON。 */
  cover?: {
    fingerprint: string;
    prompt: string;
    status: "pending" | "ready" | "failed";
    mime?: string;
    generatedAt?: number;
  };
  /** 模型从 Steam 词表里选出的类型和标签。字节只在会话 JSON。 */
  gameClassification?: {
    fingerprint: string;
    status: "pending" | "ready" | "failed";
    source: "model";
    genres: Array<{ tagId: number; label: string; category: string; evidence: string; confidence: number; evidenceFields: string[] }>;
    tags: Array<{ tagId: number; label: string; category: string; evidence: string; confidence: number; evidenceFields: string[] }>;
    debug: {
      retried: boolean;
      raw?: string;
      retryRaw?: string;
      filtered: Array<{ tagId: number; label: string; reason: string }>;
      error?: string;
    };
    generatedAt?: number;
  };
  /** 玩法图元数据。字节在 data/gameplay，按 session + mechanic 分文件，不进 JSON。 */
  gameplayImages?: {
    lineup: string[];
    items: Record<string, {
      mechanicId: string;
      fingerprint: string;
      status: "queued" | "pending" | "ready" | "failed" | "stale";
      error?: string;
      mime?: string;
      generatedAt?: number;
    }>;
  };
}

export function createInitialState(): ConversationState {
  return {
    stage: 0,
    guidance: "pending",
    references: [],
    avoidReferences: [],
    juice: [],
    loop: {},
    interaction: {},
    growth: {},
    mechanics: [],
    keywordPools: emptyKeywordPools(),
    risks: [],
    mvpScope: { must: [], cut: [] },
    engineering: {
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    },
    constitution: [],
    constitutionFields: emptyConstitution(),
    presentation: {},
    difficulty: {},
    content: {
      flags: { levels: false, boss: false, progression: false, multiplayer: false },
    },
    history: [],
    askedStages: [],
  };
}

/** 给旧会话补上新字段，原地修改后返回。 */
export function normalizeConversationState(state: ConversationState): ConversationState {
  if (!state.guidance) {
    const hadUser = (state.history || []).some((m) => m.role === "user");
    state.guidance = hadUser ? "accepted" : "pending";
  }
  if (!Array.isArray(state.mechanics)) state.mechanics = [];
  if (!Array.isArray(state.constitution)) state.constitution = [];
  if (!state.constitutionFields) {
    state.constitutionFields = emptyConstitution();
  } else {
    const base = emptyConstitution();
    state.constitutionFields = {
      ...base,
      ...state.constitutionFields,
      extras: Array.isArray(state.constitutionFields.extras)
        ? state.constitutionFields.extras
        : [],
    };
  }
  if (!state.presentation) state.presentation = {};
  if (!state.difficulty) state.difficulty = {};
  if (!state.content || typeof state.content !== "object") {
    state.content = { flags: { levels: false, boss: false, progression: false, multiplayer: false } };
  } else if (!state.content.flags) {
    state.content.flags = { levels: false, boss: false, progression: false, multiplayer: false };
  }
  if (!state.loop) state.loop = {};
  if (!state.interaction || typeof state.interaction !== "object") state.interaction = {};
  if (!state.growth || typeof state.growth !== "object") state.growth = {};
  if (!state.keywordPools) state.keywordPools = emptyKeywordPools();
  if (!Array.isArray(state.askedStages)) state.askedStages = [];
  if (
    state.optionPhase
    && state.optionPhase !== "interview"
    && state.optionPhase !== "convergence"
    && state.optionPhase !== "supplement"
    && state.optionPhase !== "awaitingEdit"
    && state.optionPhase !== "patch"
  ) {
    delete state.optionPhase;
  }
  if (state.optionPhase === "patch") {
    const ctx = state.patchContext;
    if (!ctx || typeof ctx !== "object" || !String(ctx.lineId || "").trim()) {
      delete state.optionPhase;
      delete state.patchContext;
    }
  } else if (state.patchContext) {
    delete state.patchContext;
  }
  if (!state.engineering) {
    state.engineering = {
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    };
  }
  if (state.mechanicIds && (typeof state.mechanicIds !== "object" || Array.isArray(state.mechanicIds))) {
    delete state.mechanicIds;
  }
  if (typeof state.contentUpdatedAt !== "number" || !Number.isFinite(state.contentUpdatedAt) || state.contentUpdatedAt <= 0) {
    delete state.contentUpdatedAt;
  }
  if (state.iterationOrigin !== "cocreation" && state.iterationOrigin !== "document_patch") {
    delete state.iterationOrigin;
  }
  if (state.patchContext && state.optionPhase === "patch") state.iterationOrigin = "document_patch";
  else if (state.iterationOrigin === "document_patch") delete state.iterationOrigin;
  if (state.iterationOrigin !== "cocreation") delete state.revisionAsked;
  if (state.gameClassification) {
    const bag = state.gameClassification;
    const ok = bag.status === "pending" || bag.status === "ready" || bag.status === "failed";
    if (!bag.fingerprint || !ok || bag.source !== "model") delete state.gameClassification;
    else {
      const keep = (rows: unknown) => Array.isArray(rows)
        ? rows.filter((row) => row && typeof row === "object" && Number.isFinite(Number((row as { tagId?: number }).tagId)))
        : [];
      bag.genres = keep(bag.genres) as NonNullable<ConversationState["gameClassification"]>["genres"];
      bag.tags = keep(bag.tags) as NonNullable<ConversationState["gameClassification"]>["tags"];
      if (!bag.debug || typeof bag.debug !== "object") bag.debug = { retried: false, filtered: [] };
      if (!Array.isArray(bag.debug.filtered)) bag.debug.filtered = [];
    }
  }
  if (state.cover) {
    const c = state.cover;
    const okStatus = c.status === "pending" || c.status === "ready" || c.status === "failed";
    if (!c.fingerprint || !okStatus) delete state.cover;
  }
  if (state.gameplayImages) {
    const bag = state.gameplayImages;
    const items = bag.items && typeof bag.items === "object" ? bag.items : {};
    const next: NonNullable<ConversationState["gameplayImages"]>["items"] = {};
    for (const [key, raw] of Object.entries(items)) {
      if (!raw || typeof raw !== "object") continue;
      const mechanicId = String(raw.mechanicId || key || "").trim();
      const fingerprint = String(raw.fingerprint || "").trim();
      const status = raw.status;
      const ok = status === "queued" || status === "pending" || status === "ready" || status === "failed" || status === "stale";
      if (!/^[A-Za-z0-9_-]+$/.test(mechanicId) || !fingerprint || !ok) continue;
      next[mechanicId] = {
        mechanicId,
        fingerprint,
        status,
        error: raw.error ? String(raw.error).slice(0, 200) : undefined,
        mime: raw.mime,
        generatedAt: typeof raw.generatedAt === "number" ? raw.generatedAt : undefined,
      };
    }
    state.gameplayImages = {
      lineup: Array.isArray(bag.lineup) ? bag.lineup.map((id) => String(id || "").trim()).filter((id) => /^[A-Za-z0-9_-]+$/.test(id)) : [],
      items: next,
    };
  }
  return state;
}

/** 这一轮真的改了共创或文档。打开、派生图、分类不要调用。 */
export function markContentUpdated(state: ConversationState, now = Date.now()): void {
  const prev = state.contentUpdatedAt;
  state.contentUpdatedAt = typeof prev === "number" && prev >= now ? prev + 1 : now;
}
