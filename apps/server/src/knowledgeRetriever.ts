import { readFileSync, existsSync } from "node:fs";
import { createLocalEmbedder, createRetriever, KnowledgeIndexSchema } from "@cq/knowledge";
import type { Retriever } from "@cq/conversation";

export interface KnowledgeRetrieverOptions {
  indexPath: string;
  embeddingModel?: string;
  topK: number;
}

/** 加载知识索引并装配检索器；缺文件/解析失败/embedder 初始化失败都优雅降级为 undefined（RAG 关闭）。 */
export async function loadRetriever(opts: KnowledgeRetrieverOptions): Promise<Retriever | undefined> {
  if (!existsSync(opts.indexPath)) {
    console.warn(`[server] no knowledge index at ${opts.indexPath}; run \`pnpm build:knowledge\` to enable RAG`);
    return undefined;
  }
  try {
    const index = KnowledgeIndexSchema.parse(JSON.parse(readFileSync(opts.indexPath, "utf8")));
    const embedder = await createLocalEmbedder(opts.embeddingModel);
    if (embedder.model !== index.model) {
      console.warn(`[server] embedding model mismatch: index built with ${index.model}, runtime uses ${embedder.model}; retrieval quality may degrade`);
    }
    // 直接赋值（不 cast）：让编译器持续校验 @cq/knowledge 与 @cq/conversation 的结构兼容
    const retrieve: Retriever = createRetriever({
      index,
      embedQuery: async (q) => (await embedder.embed([q]))[0],
      topK: opts.topK,
    });
    console.log(`[server] knowledge index loaded — ${index.cards.length} cards`);
    return retrieve;
  } catch (err) {
    console.warn("[server] knowledge index unavailable, running without RAG:", err);
    return undefined;
  }
}
