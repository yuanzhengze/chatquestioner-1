import { describe, it, expect } from "vitest";
import { FillSchema, clampSize, dedupeTiles, buildSkeleton, validate } from "@cq/orchestrator";
import { createInitialState } from "@cq/conversation";

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

describe("skeleton · 骨架组装", () => {
  const state = (genre = "match-3") => {
    const s = createInitialState();
    s.workingTitle = "猫咪消消乐";
    s.engineering.genre = genre;
    return s;
  };

  it("collect 目标：含 move-budget(默认25) 与 goal-tracker.collect，且 need 键被过滤进 tiles", () => {
    const def = buildSkeleton(state(), {
      tiles: ["猫爪", "毛线", "铃铛"],
      size: [8, 8],
      goal: { kind: "collect", need: { "猫爪": 20, "不存在的tile": 5 } },
    });
    const move = def.systems.find((s) => s.use === "move-budget");
    expect(move).toEqual({ use: "move-budget", moves: 25 });
    expect(def.goal).toEqual({ use: "goal-tracker", collect: { "猫爪": 20 } });
  });

  it("score 目标：默认无 move-budget，goal-tracker.score 透传", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "score", target: 5000 },
    });
    expect(def.systems.some((s) => s.use === "move-budget")).toBe(false);
    expect(def.goal).toEqual({ use: "goal-tracker", score: 5000 });
  });

  it("骨架对 validate 零错误（依赖链/参数都合法）", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "score", target: 1000 },
    });
    expect(validate(def)).toEqual([]);
  });

  it("size/tiles 越界被 clamp（尺寸夹到 10，tiles 截到 7）", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a","b","c","d","e","f","g","h","i"], size: [99, 99],
      goal: { kind: "score", target: 1000 },
    });
    expect(def.board.size).toEqual([10, 10]);
    expect(def.board.tiles.length).toBe(7);
  });
});
