import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { KnowledgeCardSchema, type KnowledgeCard, type KnowledgeIndex } from "./card.js";
import type { Embedder } from "./embed.js";

function flattenTags(card: KnowledgeCard): string {
  const t = card.tags;
  return [...t.genre, ...t.mechanics, ...t.modalities, ...t.emotion, ...t.artStyle].join(" ");
}

/** 卡 → 送进 embedding 的文本。 */
export function embedText(card: KnowledgeCard): string {
  return `${card.title}\n${card.body}\n${flattenTags(card)}`;
}

/** 读 data/*.yaml 的精修卡（每个文件可含单卡对象或卡数组），逐张 zod 校验。 */
export function loadCuratedCards(dataDir: string): KnowledgeCard[] {
  if (!existsSync(dataDir)) return [];
  const out: KnowledgeCard[] = [];
  for (const f of readdirSync(dataDir)) {
    if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
    let arr: unknown[];
    try {
      const doc = parse(readFileSync(resolve(dataDir, f), "utf8"));
      arr = Array.isArray(doc) ? doc : [doc];
    } catch (err) {
      throw new Error(`知识卡 YAML 解析失败 (${f}): ${err instanceof Error ? err.message : String(err)}`);
    }
    arr.forEach((raw, i) => {
      try {
        out.push(KnowledgeCardSchema.parse(raw));
      } catch (err) {
        throw new Error(`知识卡校验失败 (${f}#${i}): ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
  return out;
}

/** 给所有卡烘向量，组装成索引。 */
export async function buildIndex(cards: KnowledgeCard[], embedder: Embedder): Promise<KnowledgeIndex> {
  const vectors = await embedder.embed(cards.map(embedText));
  const embedded = cards.map((c, i) => ({ ...c, embedding: vectors[i] }));
  return {
    generatedAt: new Date().toISOString(),
    model: embedder.model,
    dim: vectors[0]?.length ?? 0,
    cards: embedded,
  };
}
