import { describe, it, expect } from "vitest";
import { synthesize, createGame } from "@cq/orchestrator";
import { createInitialState } from "@cq/conversation";
import type { MatchEngine } from "@cq/modules";

function autoPlay(engine: MatchEngine, maxTurns: number): { turns: number; finalScore: number } {
  let turns = 0;
  let prevScore = 0;
  for (let i = 0; i < maxTurns; i++) {
    const s = engine.getState();
    if (s.status !== "playing") break;
    for (const row of s.board) for (const cell of row) {
      expect(cell).not.toBeNull();
      expect(engine.config.tiles).toContain(cell);
    }
    const moves = engine.legalMoves();
    if (moves.length === 0) break;
    const res = engine.trySwap(moves[0][0], moves[0][1]);
    expect(res.legal).toBe(true);
    const after = engine.getState();
    expect(after.score).toBeGreaterThanOrEqual(prevScore);
    prevScore = after.score;
    turns++;
  }
  return { turns, finalScore: prevScore };
}

function match3State(): ReturnType<typeof createInitialState> {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.theme = "治愈猫咪";
  s.engineering.genre = "match-3";
  return s;
}

describe("synthesize-golden · 对话 → GameDef → 真能玩", () => {
  it("score 目标：自动对局可推进且得分", () => {
    const r = synthesize(match3State(), {
      tiles: ["猫爪", "毛线", "铃铛", "鱼干"], size: [8, 8],
      goal: { kind: "score", target: 99999 }, // 高到当回合内不会赢，纯验证推进
    });
    expect(r.def).not.toBeNull();
    const { turns, finalScore } = autoPlay(createGame({ ...r.def!, seed: 42 }), 60);
    expect(turns).toBeGreaterThan(0);
    expect(finalScore).toBeGreaterThan(0);
  });

  it("collect 目标：步数内分出胜负、可复现", () => {
    const r = synthesize(match3State(), {
      tiles: ["红", "绿", "蓝", "黄"], size: [8, 8],
      goal: { kind: "collect", need: { "红": 20 } }, tuning: { moves: 30 },
    });
    const run = () => {
      const e = createGame({ ...r.def!, seed: 7 });
      autoPlay(e, 200);
      const s = e.getState();
      return { status: s.status, score: s.score };
    };
    const first = run();
    expect(["won", "lost"]).toContain(first.status);
    expect(run()).toEqual(first); // 确定性
  });
});
