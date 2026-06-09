import { describe, it, expect } from "vitest";
import { validate, RHYTHM_MANIFEST_BY_ID, neonPulse, type RhythmDef } from "@cq/rhythm";

describe("rhythm manifests + validate", () => {
  it("清单含核心模块", () => {
    for (const id of [
      "track-layout", "note-source", "input-tap", "input-hold", "input-flick",
      "timing-window", "base-score", "combo-ladder", "rank-threshold", "rank-goal", "survival",
    ]) {
      expect(RHYTHM_MANIFEST_BY_ID.has(id)).toBe(true);
    }
  });

  it("neonPulse 样本 validate 零错误", () => {
    expect(validate(neonPulse)).toEqual([]);
  });

  it("未知模块 → unknown-module", () => {
    const bad: RhythmDef = { ...neonPulse, systems: [...neonPulse.systems, { use: "nope" }] };
    const errs = validate(bad);
    expect(errs.some((e) => e.kind === "unknown-module")).toBe(true);
  });

  it("参数非法 → bad-params", () => {
    const bad: RhythmDef = {
      ...neonPulse,
      systems: neonPulse.systems.map((s) => (s.use === "timing-window" ? { use: "timing-window", perfectMs: -5 } : s)),
    };
    const errs = validate(bad);
    expect(errs.some((e) => e.kind === "bad-params")).toBe(true);
  });
});
