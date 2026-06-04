import { describe, it, expect } from "vitest";
import { cosine, prefilter, buildQuery, createRetriever, STAGE_CARD_TYPES } from "../src/retrieve.js";
import type { KnowledgeCard, KnowledgeIndex } from "../src/card.js";
import type { RetrievalState } from "../src/retrieve.js";

function card(p: Partial<KnowledgeCard> & Pick<KnowledgeCard, "id" | "type" | "embedding">): KnowledgeCard {
  return {
    title: p.title ?? p.id,
    body: p.body ?? `body-${p.id}`,
    stageAffinity: p.stageAffinity ?? [],
    ...p,
    // tags 放在 ...p 之后，确保用完整默认 + p.tags 局部覆盖，而非被 p 的 partial tags 整段顶掉
    tags: { genre: [], mechanics: [], modalities: [], emotion: [], artStyle: [], ...(p.tags ?? {}) },
  };
}

const state2: RetrievalState = {
  stage: 2,
  coreEmotion: "治愈",
  engineering: { genre: undefined, modalities: [], mechanics: [], artStyle: undefined },
};

describe("cosine", () => {
  it("returns 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 (not NaN) when dimensions differ", () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe("prefilter", () => {
  it("keeps only cards whose type matches the stage", () => {
    const cards = [
      card({ id: "a", type: "emotion-anchor", embedding: [1, 0] }),
      card({ id: "b", type: "mechanic", embedding: [0, 1] }),
      card({ id: "c", type: "reference-game", embedding: [1, 0] }),
    ];
    const kept = prefilter(cards, state2).map((c) => c.id);
    expect(kept.sort()).toEqual(["a", "c"]);
  });

  it("returns empty when the stage has no mapping (e.g. stage 0)", () => {
    expect(prefilter([card({ id: "a", type: "reference-game", embedding: [1, 0] })], { ...state2, stage: 0 })).toEqual([]);
  });
});

describe("createRetriever", () => {
  it("ranks by cosine to the query vector and returns top-k title/body only", async () => {
    const index: KnowledgeIndex = {
      generatedAt: "t", model: "m", dim: 2,
      cards: [
        card({ id: "near", type: "reference-game", embedding: [1, 0] }),
        card({ id: "far", type: "reference-game", embedding: [0, 1] }),
      ],
    };
    const retrieve = createRetriever({ index, embedQuery: async () => [1, 0], topK: 1 });
    const out = await retrieve(state2, "我想做治愈的游戏");
    expect(out).toEqual([{ title: "near", body: "body-near" }]);
  });

  it("returns [] when prefilter yields nothing", async () => {
    const index: KnowledgeIndex = { generatedAt: "t", model: "m", dim: 2, cards: [card({ id: "x", type: "reference-game", embedding: [1, 0] })] };
    const retrieve = createRetriever({ index, embedQuery: async () => [1, 0] });
    expect(await retrieve({ ...state2, stage: 0 }, "hi")).toEqual([]);
  });

  it("breaks cosine ties via tag overlap (coreEmotion match wins)", async () => {
    const index: KnowledgeIndex = {
      generatedAt: "t", model: "m", dim: 2,
      cards: [
        card({ id: "plain", type: "reference-game", embedding: [1, 0] }),
        card({ id: "tagged", type: "reference-game", embedding: [1, 0], tags: { emotion: ["治愈"] } }),
      ],
    };
    const retrieve = createRetriever({ index, embedQuery: async () => [1, 0], topK: 1 });
    const out = await retrieve(state2, "治愈");
    expect(out).toEqual([{ title: "tagged", body: "body-tagged" }]);
  });
});

describe("buildQuery", () => {
  it("blends user input with core emotion and genre", () => {
    const q = buildQuery({ stage: 2, coreEmotion: "治愈", engineering: { genre: "farming-sim", modalities: [], mechanics: [], artStyle: undefined } }, "想做猫咪游戏");
    expect(q).toContain("想做猫咪游戏");
    expect(q).toContain("治愈");
    expect(q).toContain("farming-sim");
  });
});

it("maps stage 3 to loop/mechanic", () => {
  expect(STAGE_CARD_TYPES[3]).toEqual(["loop-pattern", "mechanic"]);
});
