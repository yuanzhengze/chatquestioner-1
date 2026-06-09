import { describe, it, expect } from "vitest";
import { RhythmEngine, type Chart, type EngineConfig, type InputEvent } from "@cq/rhythm";

const W = { perfectMs: 40, goodMs: 90, okMs: 140 };
const baseScore = { tap: 100, hold: 200, flick: 150, special: 300 };
const ladder = { n: 3, tiers: [[1, 1.1], [2, 1.2], [3, 1.5]] as [number, number][] };

function chart(): Chart {
  return {
    songId: "test", bpm: 120, durationMs: 4000, difficulty: "normal", laneCount: 2,
    notes: [
      { id: "n1", time: 1000, lane: 0, type: "tap" },
      { id: "n2", time: 1500, lane: 1, type: "tap" },
      { id: "n3", time: 2000, lane: 0, type: "flick", dir: "left" },
      { id: "n4", time: 2500, lane: 1, type: "hold", duration: 500 },
    ],
  };
}

function cfg(over: Partial<EngineConfig> = {}): EngineConfig {
  return {
    window: W, baseScore, ladder,
    goal: { kind: "endless-score" },
    tailJudge: true,
    ...over,
  };
}

/** 喂一串输入后推进到曲终。 */
function play(inputs: InputEvent[], over: Partial<EngineConfig> = {}) {
  const e = new RhythmEngine(chart(), cfg(over));
  for (const i of inputs) e.feedInput(i);
  e.tick(4000);
  return e;
}

describe("RhythmEngine · 判定/计分/combo", () => {
  it("全 perfect 命中 → 无 miss、combo 增长", () => {
    const e = play([
      { time: 1000, lane: 0, type: "tap" },
      { time: 1500, lane: 1, type: "tap" },
      { time: 2000, lane: 0, type: "flick", dir: "left" },
      { time: 2500, lane: 1, type: "hold", releaseTime: 3000 },
    ]);
    const s = e.getState();
    expect(s.counts.miss).toBe(0);
    expect(s.counts.perfect).toBe(4);
    expect(s.maxCombo).toBe(4);
    expect(s.score).toBeGreaterThan(0);
  });

  it("不输入 → 所有 note expire 为 miss、combo=0", () => {
    const e = play([]);
    const s = e.getState();
    expect(s.counts.miss).toBe(4);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(0);
  });

  it("flick 方向错 → miss、断 combo", () => {
    const e = play([
      { time: 1000, lane: 0, type: "tap" },        // perfect, combo=1
      { time: 2000, lane: 0, type: "flick", dir: "right" }, // 方向错 → 不消费 → n3 expire miss
    ]);
    const s = e.getState();
    expect(s.counts.perfect).toBe(1);
    expect(s.counts.miss).toBeGreaterThanOrEqual(1);
  });

  it("late 命中算 ok（晚于卡点）", () => {
    const e = play([
      { time: 1100, lane: 0, type: "tap" }, // 晚 100ms → ok
    ]);
    expect(e.getState().counts.ok).toBe(1);
  });

  it("确定性：同输入两次结果一致", () => {
    const inputs: InputEvent[] = [
      { time: 1000, lane: 0, type: "tap" },
      { time: 1480, lane: 1, type: "tap" },
    ];
    const a = play(inputs).getState();
    const b = play(inputs).getState();
    expect(a).toEqual(b);
  });

  it("survival：miss 扣血，血尽 failed", () => {
    const e = play([], { goal: { kind: "survival", hp: 25, missDmg: 10, okDmg: 3 } });
    const s = e.getState();
    expect(s.status).toBe("failed"); // 4 个 miss × 10 = 40 > 25
  });
});
