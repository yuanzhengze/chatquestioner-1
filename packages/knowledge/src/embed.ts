import { pipeline } from "@huggingface/transformers";

/** 文本 → 向量。embed 接受批量，逐条 mean-pool + normalize。 */
export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export async function createLocalEmbedder(
  modelId = "Xenova/bge-small-zh-v1.5",
): Promise<Embedder> {
  const pipe = await pipeline("feature-extraction", modelId);
  return {
    model: modelId,
    async embed(texts: string[]): Promise<number[][]> {
      const out: number[][] = [];
      for (const t of texts) {
        const res = await pipe(t, { pooling: "mean", normalize: true });
        out.push(Array.from(res.data as Float32Array));
      }
      return out;
    },
  };
}
