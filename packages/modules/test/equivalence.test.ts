import { describe, it, expect } from "vitest";
import { createGame, bejeweled, candyCollect, type GameDef } from "@cq/orchestrator";
import type { MatchEngine } from "@cq/modules";

/**
 * 等价性锁：在管线重构前采集 bejeweled/candyCollect 的确定性逐步轨迹。
 * 重构后这两份快照必须保持不变，作为"行为零变化"的硬证据。
 */
function boardHash(board: (string | null)[][]): string {
  return board.map((row) => row.map((c) => c ?? ".").join("")).join("|");
}

function trajectory(def: GameDef, maxTurns: number): string[] {
  const engine: MatchEngine = createGame(def);
  const steps: string[] = [];
  for (let i = 0; i < maxTurns; i++) {
    const s = engine.getState();
    steps.push(
      `score=${s.score} moves=${s.movesLeft} status=${s.status} combo=${s.lastCombo} board=${boardHash(s.board)}`,
    );
    if (s.status !== "playing") break;
    const moves = engine.legalMoves();
    if (moves.length === 0) break;
    engine.trySwap(moves[0][0], moves[0][1]);
  }
  return steps;
}

describe("equivalence · 管线重构前轨迹快照", () => {
  it("bejeweled 轨迹（seed 固定）", () => {
    expect(trajectory(bejeweled, 30)).toMatchSnapshot();
  });

  it("candyCollect 轨迹（seed 固定）", () => {
    expect(trajectory(candyCollect, 60)).toMatchSnapshot();
  });
});
