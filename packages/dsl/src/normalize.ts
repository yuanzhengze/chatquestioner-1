export interface NormalizedVocab {
  /** 命中已知枚举时的规范值 */
  known?: string;
  /** 未命中枚举的自由词，回退保留（绝不丢弃，喂 intent_terms） */
  fallback: string[];
}

/**
 * 枚举 + 自由词回退（D7）。
 * 命中枚举 → known；未命中 → 原值进 fallback。
 */
export function normalizeVocabField(
  raw: string,
  vocab: readonly string[],
): NormalizedVocab {
  const trimmed = raw.trim();
  const cleaned = trimmed.toLowerCase();
  const hit = vocab.find((v) => v.toLowerCase() === cleaned);
  if (hit) return { known: hit, fallback: [] };
  if (trimmed.length === 0) return { fallback: [] };
  return { fallback: [trimmed] };
}
