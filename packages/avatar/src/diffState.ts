import { type EmoteState, emotePriority } from "./states.js";

/**
 * ConversationState 的结构化子集——只取「diff 出语义 emote」所需字段。
 * 与 web 的 RecognizedState / server 的 ConversationState 结构兼容（运行时同一对象）。
 * 全部可选，做防御式读取（resume/残缺快照也不崩）。
 */
export interface StateSnapshot {
  spark?: string;
  references?: string[];
  coreEmotion?: string;
  coreFantasy?: string;
  coreExperience?: string;
  coreAction?: string;
  juice?: string[];
  risks?: string[];
  mvpScope?: { must?: string[]; cut?: string[] };
  constitution?: string[];
  keywordPools?: Record<string, string[] | undefined>;
  engineering?: { signatureTerms?: string[] };
}

const nonEmpty = (v?: string): boolean => Boolean(v && v.trim());
/** 字段从空 → 有值（新识别）。 */
const filled = (a?: string, b?: string): boolean => !nonEmpty(a) && nonEmpty(b);
/** 数组变长（新增条目）。 */
const grew = (a?: unknown[], b?: unknown[]): boolean => (b?.length ?? 0) > (a?.length ?? 0);

/**
 * 对比前后两份快照，得出本轮应点燃的语义 emote（按优先级降序）。
 * 注意：stage-up / synthesis / warning / error / 下游构建 由各自 SSE 事件驱动，不在此 diff。
 */
export function diffState(prev: StateSnapshot, next: StateSnapshot): EmoteState[] {
  const out: EmoteState[] = [];

  if (filled(prev.spark, next.spark) || grew(prev.references, next.references)) out.push("spark-caught");
  if (filled(prev.coreEmotion, next.coreEmotion) || filled(prev.coreFantasy, next.coreFantasy))
    out.push("emotion-resonance");
  if (filled(prev.coreExperience, next.coreExperience) || grew(prev.keywordPools?.emotion, next.keywordPools?.emotion))
    out.push("deep-love");
  if (filled(prev.coreAction, next.coreAction)) out.push("confirm");
  if (grew(prev.juice, next.juice) || grew(prev.engineering?.signatureTerms, next.engineering?.signatureTerms))
    out.push("hot-signature");
  if (grew(prev.risks, next.risks)) out.push("risk-flag");
  if (grew(prev.mvpScope?.cut, next.mvpScope?.cut)) out.push("cut-scope");
  if (grew(prev.constitution, next.constitution)) out.push("constitution-lock");

  return out.sort((a, b) => emotePriority(b) - emotePriority(a));
}
