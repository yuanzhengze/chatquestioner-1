import { describe, it, expect } from "vitest";
import { MatchEngine, type EngineConfig, type Goal } from "@cq/modules";

function jellyCfg(over: Partial<EngineConfig> = {}): EngineConfig {
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
    goal: { kind: "clearLayer" } as Goal,
    deadlock: "shuffle",
    seed: 99,
    layers: { coverage: "all", layer: "jelly" },
    clearsLayer: true,
    ...over,
  };
}

describe("jelly · 果冻层运行时", () => {
  it("初始化：coverage=all → state.layers 与 board 同形且全为 1", () => {
    const engine = new MatchEngine(jellyCfg());
    const s = engine.getState();
    expect(s.layers).toBeDefined();
    expect(s.layers!.length).toBe(6);
    expect(s.layers!.every((row) => row.length === 6 && row.every((v) => v === 1))).toBe(true);
  });

  it("无 layers 配置时 state.layers 为 undefined（旧路径不受影响）", () => {
    const engine = new MatchEngine(jellyCfg({ layers: null, clearsLayer: false, goal: { kind: "score", target: "endless" } }));
    expect(engine.getState().layers).toBeUndefined();
  });

  it("消除命中格：layer 1→null、糖被消、collected 记账", () => {
    const engine = new MatchEngine(jellyCfg());
    // 走一步合法交换，命中格的层应减少
    const before = engine.getState();
    const beforeLayerCount = before.layers!.flat().filter((v) => v !== null).length;
    const moves = engine.legalMoves();
    expect(moves.length).toBeGreaterThan(0);
    const res = engine.trySwap(moves[0][0], moves[0][1]);
    expect(res.legal).toBe(true);
    expect(res.cleared).toBeGreaterThan(0);
    const after = engine.getState();
    const afterLayerCount = after.layers!.flat().filter((v) => v !== null).length;
    expect(afterLayerCount).toBeLessThan(beforeLayerCount);
  });

  it("clearLayer 目标：全盘层清空 → status=won", () => {
    const engine = new MatchEngine(jellyCfg({ moves: 200 }));
    let won = false;
    for (let i = 0; i < 400; i++) {
      const s = engine.getState();
      if (s.status !== "playing") { won = s.status === "won"; break; }
      const moves = engine.legalMoves();
      if (!moves.length) break;
      engine.trySwap(moves[0][0], moves[0][1]);
    }
    expect(won).toBe(true);
    expect(engine.getState().layers!.flat().every((v) => v === null)).toBe(true);
  });
});
