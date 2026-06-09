import { describe, it, expect } from "vitest";
import { MatchEngine, type EngineConfig, type Goal } from "@cq/modules";

function cfg(over: Partial<EngineConfig> = {}): EngineConfig {
  return {
    width: 6,
    height: 6,
    tiles: ["red", "green", "blue", "yellow"],
    minLine: 3,
    requireMatch: true,
    cascade: true,
    scoreBase: 10,
    comboMult: 1.5,
    moves: null,
    goal: { kind: "score", target: "endless" } as Goal,
    deadlock: "shuffle",
    seed: 123,
    ...over,
  };
}

describe("pipeline · 回合管线", () => {
  it("requireMatch：不成匹配的交换被弹回、board 复原、legal=false", () => {
    const engine = new MatchEngine(cfg({ requireMatch: true }));
    const before = JSON.stringify(engine.getState().board);
    // 找一个不在 legalMoves 里的相邻交换
    const legal = new Set(engine.legalMoves().map(([a, b]) => `${a.r},${a.c}-${b.r},${b.c}`));
    let tested = false;
    outer: for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        const key = `${r},${c}-${r},${c + 1}`;
        if (!legal.has(key)) {
          const res = engine.trySwap({ r, c }, { r, c: c + 1 });
          expect(res.legal).toBe(false);
          expect(JSON.stringify(engine.getState().board)).toBe(before);
          tested = true;
          break outer;
        }
      }
    }
    expect(tested).toBe(true);
  });

  it("cascade 关：一回合最多一次清除（combo<=1）", () => {
    const engine = new MatchEngine(cfg({ cascade: false }));
    let maxCombo = 0;
    for (let i = 0; i < 30; i++) {
      const moves = engine.legalMoves();
      if (!moves.length) break;
      const res = engine.trySwap(moves[0][0], moves[0][1]);
      maxCombo = Math.max(maxCombo, res.combo);
    }
    expect(maxCombo).toBeLessThanOrEqual(1);
  });

  it("cascade 开：存在 combo>1 的回合（连锁发生）", () => {
    const engine = new MatchEngine(cfg({ cascade: true, seed: 7 }));
    let sawCascade = false;
    for (let i = 0; i < 80; i++) {
      const moves = engine.legalMoves();
      if (!moves.length) break;
      const res = engine.trySwap(moves[0][0], moves[0][1]);
      if (res.combo > 1) sawCascade = true;
    }
    expect(sawCascade).toBe(true);
  });
});
