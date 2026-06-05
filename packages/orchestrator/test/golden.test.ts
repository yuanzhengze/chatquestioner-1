import { describe, it, expect } from "vitest";
import { createGame, bejeweled, candyCollect } from "@cq/orchestrator";
import type { MatchEngine } from "@cq/modules";

/** 自动对局：每回合走第一个合法交换，直到结束或步数耗尽。沿途断言不变量。 */
function autoPlay(engine: MatchEngine, maxTurns: number): { turns: number; finalScore: number } {
  let turns = 0;
  let prevScore = 0;
  for (let i = 0; i < maxTurns; i++) {
    const s = engine.getState();
    if (s.status !== "playing") break;

    // 不变量：棋盘永远填满、颜色在调色板内
    for (const row of s.board) {
      for (const cell of row) {
        expect(cell).not.toBeNull();
        expect(engine.config.tiles).toContain(cell);
      }
    }

    const moves = engine.legalMoves();
    if (moves.length === 0) break;
    const [a, b] = moves[0];
    const res = engine.trySwap(a, b);
    expect(res.legal).toBe(true);

    const after = engine.getState();
    expect(after.score).toBeGreaterThanOrEqual(prevScore); // 分数单调不减
    prevScore = after.score;
    turns++;
  }
  return { turns, finalScore: prevScore };
}

describe("golden · headless 跑通", () => {
  it("bejeweled 连续合法对局不崩、能得分", () => {
    const engine = createGame(bejeweled);
    const { turns, finalScore } = autoPlay(engine, 60);
    expect(turns).toBeGreaterThan(0);
    expect(finalScore).toBeGreaterThan(0);
  });

  it("candy-collect 在步数内分出胜负", () => {
    const engine = createGame(candyCollect);
    autoPlay(engine, 200);
    const s = engine.getState();
    expect(["won", "lost"]).toContain(s.status);
    expect(s.movesLeft).not.toBeNull();
  });

  it("同种子结果可复现（确定性）", () => {
    const run = () => {
      const e = createGame(candyCollect);
      autoPlay(e, 200);
      const s = e.getState();
      return { status: s.status, score: s.score };
    };
    expect(run()).toEqual(run());
  });
});
