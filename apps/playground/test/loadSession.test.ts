import { describe, it, expect } from "vitest";
import { gameDefFromJson } from "../src/loadSession.js";
import { bejeweled } from "@cq/orchestrator";

describe("gameDefFromJson", () => {
  it("合法 GameDef JSON → def 非空、无 error", () => {
    const r = gameDefFromJson(JSON.parse(JSON.stringify(bejeweled)));
    expect(r.error).toBeUndefined();
    expect(r.def?.input.use).toBe("input-swap");
  });

  it("缺字段/非法 → def=null + error", () => {
    const r = gameDefFromJson({ id: "x", board: { size: [8, 8], tiles: ["a"] }, systems: [{ use: "不存在模块" }] });
    expect(r.def).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it("字段齐全但含非法模块 → 走 validate 兜底、def=null + error 含模块信息", () => {
    const r = gameDefFromJson({
      id: "x",
      board: { size: [8, 8], tiles: ["a", "b", "c"] },
      input: { use: "input-swap" },
      systems: [{ use: "不存在模块" }],
      goal: { use: "goal-tracker", score: 100 },
      rules: [],
    });
    expect(r.def).toBeNull();
    expect(r.error).toMatch(/不存在模块/);
  });
});
