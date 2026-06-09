import { describe, it, expect } from "vitest";
import {
  judgeTiming, timingCoef, comboMultAt, holdCoef, type TimingWindow, type ComboLadder,
} from "@cq/rhythm";

const W: TimingWindow = { perfectMs: 40, goodMs: 90, okMs: 140 };

describe("judgeTiming · 早good/晚ok 非对称（spec §2.2）", () => {
  it("|Δ|≤perfectMs → perfect（不论早晚）", () => {
    expect(judgeTiming(-20, W)).toBe("perfect");
    expect(judgeTiming(30, W)).toBe("perfect");
  });
  it("早（input<note，Δ<0）且 perfectMs<|Δ|≤goodMs → good", () => {
    expect(judgeTiming(-80, W)).toBe("good");
  });
  it("晚（input>note，Δ>0）且 perfectMs<|Δ|≤okMs → ok", () => {
    expect(judgeTiming(120, W)).toBe("ok");
  });
  it("早但超 goodMs → null（不消费）", () => {
    expect(judgeTiming(-130, W)).toBeNull();
  });
  it("晚但超 okMs → null", () => {
    expect(judgeTiming(200, W)).toBeNull();
  });
  it("晚且落在 good 区间(>perfect,≤good) → 因晚只能 ok", () => {
    expect(judgeTiming(70, W)).toBe("ok");
  });
});

describe("timingCoef", () => {
  it("perfect=1.0 good=0.8 ok=0.5 miss=0", () => {
    expect(timingCoef("perfect")).toBe(1.0);
    expect(timingCoef("good")).toBe(0.8);
    expect(timingCoef("ok")).toBe(0.5);
    expect(timingCoef("miss")).toBe(0);
  });
});

describe("holdCoef · 头尾系数平均（spec §6.2）", () => {
  it("perfect+good → 0.9", () => {
    expect(holdCoef("perfect", "good")).toBeCloseTo(0.9);
  });
  it("tail=null（tailJudge=false）→ 只取头", () => {
    expect(holdCoef("perfect", null)).toBe(1.0);
  });
});

describe("comboMultAt · 阶梯倍率（spec §4 / §3 combo-ladder）", () => {
  const ladder: ComboLadder = { n: 10, tiers: [[1, 1.1], [2, 1.2], [3, 1.5]] };
  it("combo<n → 1.0（未激活）", () => {
    expect(comboMultAt(5, ladder)).toBe(1.0);
  });
  it("combo≥n 且 <2n → tier1 1.1", () => {
    expect(comboMultAt(10, ladder)).toBe(1.1);
    expect(comboMultAt(19, ladder)).toBe(1.1);
  });
  it("combo≥2n 且 <3n → tier2 1.2", () => {
    expect(comboMultAt(20, ladder)).toBe(1.2);
  });
  it("combo≥3n → tier3 1.5（封顶）", () => {
    expect(comboMultAt(35, ladder)).toBe(1.5);
  });
});
