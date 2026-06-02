import type { KeywordPools } from "@cq/gdd";
import type { Constraints, Dimension, Engine, Modality, Platform } from "@cq/dsl";
import type { ChatMessage } from "./llm.js";

/** 四级核心循环（30s / 5min / 30min / 长线） */
export interface LoopState {
  thirtySec?: string;
  fiveMin?: string;
  thirtyMin?: string;
  longTerm?: string;
}

/** 供 DSL 翻译的工程信号（F6 末段） */
export interface EngineeringSignals {
  dimension?: Dimension;
  engine?: Engine;
  platform: Platform[];
  orientation?: NonNullable<Constraints["orientation"]>;
  networking?: Constraints["networking"];
  modalities: Modality[];
  genre?: string;
  mechanics: string[];
  artStyle?: string;
  intentTerms: string[];
  signatureTerms: string[];
}

/** 贯穿全程的结构化状态：GDD 与 DSL 共同的事实源（spec §6.1 / F6）。 */
export interface ConversationState {
  /** 当前阶段 0..7 */
  stage: number;

  // —— 火花 / 体验 / 四元素 ——
  spark?: string;
  references: string[];
  avoidReferences: string[];
  coreEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  theme?: string;
  world?: string;
  narrative?: string;
  playerIdentity?: string;
  aesthetic?: string;
  gameFeel?: string;
  juice: string[];

  // —— 循环 / 平衡 ——
  loop: LoopState;
  reward?: string;
  failRule?: string;
  difficultyCurve?: string;
  replayMotivation?: string;

  // —— 收敛产物 ——
  workingTitle?: string;
  pitch?: string;
  coreExperience?: string;
  keywordPools: KeywordPools;
  differentiator?: string;
  risks: string[];
  mvpScope: { must: string[]; cut: string[] };

  // —— 工程信号 + 宪法 + 历史 ——
  engineering: EngineeringSignals;
  constitution: string[];
  history: ChatMessage[];
}

export function createInitialState(): ConversationState {
  return {
    stage: 0,
    references: [],
    avoidReferences: [],
    juice: [],
    loop: {},
    keywordPools: {
      gameplay: [], emotion: [], world: [], visual: [], narrative: [], motivation: [],
    },
    risks: [],
    mvpScope: { must: [], cut: [] },
    engineering: {
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    },
    constitution: [],
    history: [],
  };
}
