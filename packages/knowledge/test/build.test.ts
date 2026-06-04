import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildIndex, embedText, loadCuratedCards } from "../src/build.js";
import { CardTypeSchema, type KnowledgeCard } from "../src/card.js";
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

describe("loadCuratedCards", () => {
  it("loads both single-object and array yaml files", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "kb-"));
    writeFileSync(
      resolve(dir, "single.yaml"),
      [
        "id: single-1",
        "type: mechanic",
        "title: 单卡",
        "body: 单对象形态",
        "tags:",
        "  mechanics: [jump]",
        "stageAffinity: [1]",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(dir, "array.yaml"),
      [
        "- id: arr-1",
        "  type: juice",
        "  title: 数组卡一",
        "  body: 数组形态一",
        "  tags: {}",
        "  stageAffinity: [1]",
        "- id: arr-2",
        "  type: loop-pattern",
        "  title: 数组卡二",
        "  body: 数组形态二",
        "  tags: {}",
        "  stageAffinity: [2]",
      ].join("\n"),
      "utf8",
    );

    const loaded = loadCuratedCards(dir);
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => c.id).sort()).toEqual(["arr-1", "arr-2", "single-1"]);
  });

  it("returns [] when the directory does not exist", () => {
    expect(loadCuratedCards(resolve(tmpdir(), "kb-does-not-exist-xxxx"))).toEqual([]);
  });

  it("parses the shipped examples.yaml with valid card types", () => {
    const loaded = loadCuratedCards(resolve(__dirname, "../data"));
    expect(loaded.length).toBeGreaterThanOrEqual(2);
    for (const c of loaded) {
      expect(() => CardTypeSchema.parse(c.type)).not.toThrow();
    }
  });
});
