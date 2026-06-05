import { describe, it, expect } from "vitest";
import { validate, bejeweled, candyCollect, type GameDef } from "@cq/orchestrator";

const clone = (d: GameDef): GameDef => structuredClone(d);

describe("validate", () => {
  it("合法编排零错误", () => {
    expect(validate(bejeweled)).toEqual([]);
    expect(validate(candyCollect)).toEqual([]);
  });

  it("捕获 unknown-module", () => {
    const def = clone(bejeweled);
    def.systems.push({ use: "teleport-magic" });
    const errs = validate(def);
    expect(errs.some((e) => e.kind === "unknown-module" && e.at === "teleport-magic")).toBe(true);
  });

  it("捕获 bad-params", () => {
    const def = clone(bejeweled);
    def.systems = def.systems.map((s) => (s.use === "match-detect" ? { use: "match-detect", line: 2 } : s));
    const errs = validate(def);
    expect(errs.some((e) => e.kind === "bad-params" && e.at === "match-detect")).toBe(true);
  });

  it("捕获 unmet-dep（用了 cascade 却漏掉 refill-spawn）", () => {
    const def = clone(bejeweled);
    def.systems = def.systems.filter((s) => s.use !== "refill-spawn");
    const errs = validate(def);
    expect(errs.some((e) => e.kind === "unmet-dep" && /refill-spawn/.test(e.message))).toBe(true);
  });
});
