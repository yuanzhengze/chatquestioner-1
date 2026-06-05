import { describe, it, expect } from "vitest";
import { KnowledgeCardSchema, KnowledgeIndexSchema } from "../src/card.js";

describe("KnowledgeCardSchema", () => {
  it("parses a valid card and defaults empty tag arrays", () => {
    const card = KnowledgeCardSchema.parse({
      id: "ref-stardew",
      type: "reference-game",
      title: "星露谷物语",
      body: "缓慢积累 + 自由节奏的治愈感。",
      tags: { emotion: ["治愈"] },
      stageAffinity: [1, 2],
    });
    expect(card.tags.genre).toEqual([]);
    expect(card.tags.emotion).toEqual(["治愈"]);
    expect(card.embedding).toBeUndefined();
  });

  it("rejects an unknown card type", () => {
    expect(() =>
      KnowledgeCardSchema.parse({ id: "x", type: "nope", title: "t", body: "b", tags: {}, stageAffinity: [] }),
    ).toThrow();
  });

  it("parses an index envelope", () => {
    const idx = KnowledgeIndexSchema.parse({
      generatedAt: "2026-06-04T00:00:00.000Z",
      model: "Xenova/bge-small-zh-v1.5",
      dim: 3,
      cards: [],
    });
    expect(idx.cards).toEqual([]);
  });
});
