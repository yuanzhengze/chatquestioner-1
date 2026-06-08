import type { EngineConfig, GameState, Pos } from "./state.js";
import { makeRng } from "./rng.js";
import {
  adjacent,
  findMatches,
  generateBoard,
  hasLegalMove,
  shuffleBoard,
  swap,
} from "./stages.js";
import { compilePipeline, type TurnContext } from "./pipeline.js";

export interface SwapResult {
  legal: boolean;
  cleared: number;
  combo: number;
  status: GameState["status"];
}

/**
 * match-3 运行时引擎：把 stages 按 EngineConfig 组装成一个回合循环。
 * 这是 S0 的「运行时组装」载体（codegen 把同一套接线 emit 成文件是后续步骤）。
 */
export class MatchEngine {
  readonly config: EngineConfig;
  private rng: () => number;
  private state: GameState;
  private pipeline: { runTurn: (ctx: TurnContext) => void };

  constructor(config: EngineConfig) {
    this.config = config;
    this.rng = makeRng(config.seed);
    const board = generateBoard(config.width, config.height, config.tiles, this.rng);
    this.state = {
      board,
      width: config.width,
      height: config.height,
      score: 0,
      movesLeft: config.moves,
      status: "playing",
      lastCombo: 0,
      collected: {},
    };
    if (config.layers) {
      this.state.layers = Array.from({ length: config.height }, () =>
        Array.from({ length: config.width }, () => 1 as number | null),
      );
    }
    this.pipeline = compilePipeline(config);
    this.ensurePlayable();
  }

  getState(): GameState {
    return {
      ...this.state,
      board: this.state.board.map((row) => [...row]),
      collected: { ...this.state.collected },
      layers: this.state.layers ? this.state.layers.map((row) => [...row]) : undefined,
    };
  }

  /** 枚举当前所有合法交换（供 AI/测试自动对局）。 */
  legalMoves(): [Pos, Pos][] {
    const { board } = this.state;
    const { minLine } = this.config;
    const out: [Pos, Pos][] = [];
    for (let r = 0; r < this.state.height; r++) {
      for (let c = 0; c < this.state.width; c++) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= this.state.height || nc >= this.state.width) continue;
          const a = { r, c };
          const b = { r: nr, c: nc };
          swap(board, a, b);
          if (findMatches(board, minLine).length > 0) out.push([a, b]);
          swap(board, a, b);
        }
      }
    }
    return out;
  }

  /** 一个回合：交换 a,b → 解算（含连锁）→ 计分 → 更新目标/胜负。 */
  trySwap(a: Pos, b: Pos): SwapResult {
    const s = this.state;
    if (s.status !== "playing") return { legal: false, cleared: 0, combo: 0, status: s.status };
    if (!adjacent(a, b)) return { legal: false, cleared: 0, combo: 0, status: s.status };

    const ctx: TurnContext = {
      board: s.board,
      layers: s.layers ?? null,
      state: s,
      config: this.config,
      rng: this.rng,
      a,
      b,
      matches: [],
      clearedThisStep: 0,
      combo: 0,
      legal: false,
    };

    const clearedBefore = totalCollected(s.collected);
    this.pipeline.runTurn(ctx);
    if (!ctx.legal) return { legal: false, cleared: 0, combo: 0, status: s.status };

    const totalCleared = totalCollected(s.collected) - clearedBefore;
    return { legal: true, cleared: totalCleared, combo: ctx.combo, status: s.status };
  }

  /** 无合法步时按 deadlock 策略处理。 */
  private ensurePlayable(): void {
    const s = this.state;
    if (hasLegalMove(s.board, this.config.minLine)) return;
    if (this.config.deadlock === "shuffle") {
      shuffleBoard(s.board, this.config.tiles, this.config.minLine, this.rng);
    } else if (this.config.deadlock === "end") {
      s.status = s.status === "playing" ? "lost" : s.status;
    }
  }
}

function totalCollected(collected: Record<string, number>): number {
  let sum = 0;
  for (const n of Object.values(collected)) sum += n;
  return sum;
}
