import { describe, it, expect } from "vitest";
import { seedCards } from "../src/seed.js";
import type { CatalogIndex } from "@cq/resolver";

const catalog: CatalogIndex = {
  generatedAt: "t",
  forgeaxRoot: "/x",
  templates: [
    { id: "match3-candy", kind: "gameplay", desc: "三消糖果", dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: false, intentTerms: ["match 3", "消除"], signatureTerms: ["combo"] },
    { id: "pixijs-2d", kind: "basic", desc: "基础 2D 模板", dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true, intentTerms: [], signatureTerms: [] },
  ],
  skills: [],
  mcp: [],
};

describe("seedCards", () => {
  it("turns each gameplay template into a reference-game card, skipping basic templates", () => {
    const cards = seedCards(catalog);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.id).toBe("ref-tpl-match3-candy");
    expect(c.type).toBe("reference-game");
    expect(c.body).toContain("三消糖果");
    expect(c.tags.mechanics).toEqual(expect.arrayContaining(["match 3", "消除", "combo"]));
    expect(c.stageAffinity).toEqual([1, 2, 3]);
  });
});
