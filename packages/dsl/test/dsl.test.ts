import { describe, it, expect } from "vitest";
import { GameDslSchema, type GameDSL } from "../src/index.js";

const valid: GameDSL = {
  schema_version: "0.1",
  constraints: {
    platform: ["PC"],
    dimension: "2D",
    engine: "pixijs",
    networking: "singleplayer",
    orientation: "Portrait",
  },
  genre: "merge-puzzle",
  mechanics: ["drag-connect", "score-combo"],
  art_style: "watercolor-cozy",
  modalities: ["image", "audio", "ui"],
  intent_terms: ["猫咪", "解压", "连连看"],
  signature_terms: ["踩奶节奏"],
  mvp_scope: { must: ["核心连接循环"], cut: ["关卡系统"] },
  constitution_ref: "gdd.md#游戏宪法",
};

describe("GameDslSchema", () => {
  it("accepts a fully valid DSL", () => {
    const parsed = GameDslSchema.parse(valid);
    expect(parsed.constraints.dimension).toBe("2D");
  });

  it("rejects an invalid dimension", () => {
    const bad = { ...valid, constraints: { ...valid.constraints, dimension: "4D" } };
    expect(() => GameDslSchema.parse(bad)).toThrow();
  });

  it("requires at least one platform", () => {
    const bad = { ...valid, constraints: { ...valid.constraints, platform: [] } };
    expect(() => GameDslSchema.parse(bad)).toThrow();
  });
});
