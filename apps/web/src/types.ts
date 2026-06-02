export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** ConversationState 的渲染子集（与 server 的完整快照结构兼容，取所需字段）。 */
export interface RecognizedState {
  stage: number;
  spark?: string;
  coreEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  theme?: string;
  world?: string;
  aesthetic?: string;
  pitch?: string;
  loop?: { thirtySec?: string; fiveMin?: string; thirtyMin?: string; longTerm?: string };
  keywordPools?: Record<string, string[]>;
  mvpScope?: { must: string[]; cut: string[] };
  engineering?: {
    dimension?: string;
    engine?: string;
    platform?: string[];
    modalities?: string[];
    genre?: string;
    mechanics?: string[];
    artStyle?: string;
  };
  constitution?: string[];
}

export interface StageInfo { stage: number; label: string; readyForSynthesis: boolean }

export interface ResolvedItem { id?: string; server?: string; layer?: string; phase?: string; load?: string; trigger?: string }
export interface ResolutionView {
  template: { primary: string; references: string[] };
  skills: ResolvedItem[];
  mcp: ResolvedItem[];
  packages: ResolvedItem[];
  warnings: string[];
}
export interface SynthesisPayload {
  gddMarkdown: string;
  dsl: unknown;
  resolution: ResolutionView;
}
