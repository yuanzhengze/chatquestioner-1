import { describe, it, expect } from "vitest";
import { FillSchema, clampSize, dedupeTiles } from "@cq/orchestrator";

describe("fill · GameDefFill 契约", () => {
  it("接受合法 fill（collect 目标）", () => {
    const r = FillSchema.safeParse({
      tiles: ["猫爪", "毛线", "铃铛"],
      size: [8, 8],
      goal: { kind: "collect", need: { "猫爪": 20 } },
      tuning: { minLine: 3, moves: 25, comboMult: 1.5 },
    });
    expect(r.success).toBe(true);
  });

  it("拒绝非法 goal.kind", () => {
    const r = FillSchema.safeParse({
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "clearLayer" },
    });
    expect(r.success).toBe(false);
  });

  it("clampSize 把尺寸夹到 6..10 并取整", () => {
    expect(clampSize([3, 99])).toEqual([6, 10]);
    expect(clampSize([7.4, 8.6])).toEqual([7, 9]);
  });

  it("dedupeTiles 去重、截到 7、不足 3 用默认补齐", () => {
    expect(dedupeTiles([" red ", "red", "blue"])).toEqual(["red", "blue", "green"]);
    expect(dedupeTiles(["a","b","c","d","e","f","g","h"]).length).toBe(7);
  });
});
