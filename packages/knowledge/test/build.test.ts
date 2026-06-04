import { describe, it, expect } from "vitest";
import { buildIndex, embedText } from "../src/build.js";
import type { KnowledgeCard } from "../src/card.js";
import type { Embedder } from "../src/embed.js";

const fakeEmbedder: Embedder = {
  model: "fake",
  async embed(texts) {
    // 维度=2 的确定性向量：[文本长度, 1]
    return texts.map((t) => [t.length, 1]);
  },
};

const cards: KnowledgeCard[] = [
  { id: "a", type: "reference-game", title: "甲", body: "短", tags: { genre: [], mechanics: ["x"], modalities: [], emotion: [], artStyle: [] }, stageAffinity: [1] },
];

describe("embedText", () => {
  it("concatenates title, body and flattened tags", () => {
    expect(embedText(cards[0])).toContain("甲");
    expect(embedText(cards[0])).toContain("短");
    expect(embedText(cards[0])).toContain("x");
  });
});

describe("buildIndex", () => {
  it("embeds every card and records model + dim", async () => {
    const idx = await buildIndex(cards, fakeEmbedder);
    expect(idx.model).toBe("fake");
    expect(idx.dim).toBe(2);
    expect(idx.cards[0].embedding).toHaveLength(2);
    expect(typeof idx.generatedAt).toBe("string");
  });
});
