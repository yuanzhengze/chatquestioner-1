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
  lastOptions?: TurnOption[];
  readyForSynthesis?: boolean;
  /** 定稿（过 completeness）才为 true；中途半成品仍可以是 false */
  gddComplete?: boolean;
  /** 预览顶上的草稿条。跟有没有合格口头总结走，不跟 gddComplete。 */
  gddDraftBar?: boolean;
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
  if (state.cover) {
    const c = state.cover;
    const okStatus = c.status === "pending" || c.status === "ready" || c.status === "failed";
    if (!c.fingerprint || !okStatus) delete state.cover;
  }
  return state;
}
