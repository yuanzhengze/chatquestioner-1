import type { CardType, KnowledgeCard, KnowledgeIndex, RetrievedCard } from "./card.js";

/** 检索器读取的 state 最小结构（避免 import @cq/conversation 形成环）。 */
export interface RetrievalState {
  stage: number;
  coreEmotion?: string;
  engineering: {
    genre?: string;
    modalities: string[];
    mechanics: string[];
    artStyle?: string;
  };
}

/** 阶段 → 该投喂的卡 type（spec §6 预筛表）。 */
export const STAGE_CARD_TYPES: Record<number, CardType[]> = {
  1: ["reference-game"],
  2: ["emotion-anchor", "reference-game"],
  3: ["loop-pattern", "mechanic"],
  4: ["juice"],
  5: ["reference-game"],
  6: ["loop-pattern", "mechanic"],
};

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 仅按 stage→type 预筛；tag 不参与预筛，只在 createRetriever 的排序里作软加权
// （spec §6 把 tag 描述为软过滤，实现中改为软排序加权，避免误把候选过早裁掉）。
export function prefilter(cards: KnowledgeCard[], state: RetrievalState): KnowledgeCard[] {
  const types = STAGE_CARD_TYPES[state.stage] ?? [];
  if (types.length === 0) return [];
  return cards.filter((c) => types.includes(c.type));
}

/** 当前 state 与卡 tag 的重叠计数，用作微弱排序加权。 */
function tagOverlap(card: KnowledgeCard, state: RetrievalState): number {
  let n = 0;
  const e = state.engineering;
  if (state.coreEmotion && card.tags.emotion.includes(state.coreEmotion)) n++;
  if (e.genre && card.tags.genre.includes(e.genre)) n++;
  if (e.artStyle && card.tags.artStyle.includes(e.artStyle)) n++;
  for (const m of e.modalities) if (card.tags.modalities.includes(m)) n++;
  for (const m of e.mechanics) if (card.tags.mechanics.includes(m)) n++;
  return n;
}

// 只纳入 coreEmotion/genre/mechanics：有意聚焦最强语义信号，
// 刻意排除 modalities/artStyle 以免稀释 query 的主题相关性。
export function buildQuery(state: RetrievalState, userInput: string): string {
  return [userInput, state.coreEmotion, state.engineering.genre, ...state.engineering.mechanics]
    .filter((s): s is string => Boolean(s))
    .join(" ");
}

export interface RetrieverDeps {
  index: KnowledgeIndex;
  embedQuery: (query: string) => Promise<number[]>;
  topK?: number;
}

export function createRetriever(
  deps: RetrieverDeps,
): (state: RetrievalState, userInput: string) => Promise<RetrievedCard[]> {
  const topK = deps.topK ?? 3;
  return async (state, userInput) => {
    const candidates = prefilter(deps.index.cards, state);
    if (candidates.length === 0) return [];
    const qVec = await deps.embedQuery(buildQuery(state, userInput));
    const scored = candidates.map((c) => ({
      card: c,
      score: cosine(qVec, c.embedding ?? []) + 0.05 * tagOverlap(c, state),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ card }) => ({ title: card.title, body: card.body }));
  };
}
