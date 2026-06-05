import type { EngineConfig, GameState, Pos } from "./state.js";
import { makeRng } from "./rng.js";
import {
  adjacent,
  applyGravity,
  clearTiles,
  findMatches,
  generateBoard,
  hasLegalMove,
  refill,
  shuffleBoard,
  swap,
} from "./stages.js";

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
    this.ensurePlayable();
  }

  getState(): GameState {
    return {
      ...this.state,
      board: this.state.board.map((row) => [...row]),
      collected: { ...this.state.collected },
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

    swap(s.board, a, b);
    let matches = findMatches(s.board, this.config.minLine);
    if (matches.length === 0 && this.config.requireMatch) {
      swap(s.board, a, b); // 弹回
      return { legal: false, cleared: 0, combo: 0, status: s.status };
    }

    let combo = 0;
    let totalCleared = 0;
    while (matches.length > 0) {
      combo++;
      const byColor = clearTiles(s.board, matches);
      let stepCleared = 0;
      for (const [color, n] of Object.entries(byColor)) {
        stepCleared += n;
        s.collected[color] = (s.collected[color] ?? 0) + n;
      }
      totalCleared += stepCleared;
      const mult = this.config.cascade ? Math.pow(this.config.comboMult, combo - 1) : 1;
      s.score += Math.round(this.config.scoreBase * stepCleared * mult);
      applyGravity(s.board);
      refill(s.board, this.config.tiles, this.rng);
      matches = this.config.cascade ? findMatches(s.board, this.config.minLine) : [];
    }

    s.lastCombo = combo;
    if (s.movesLeft !== null) s.movesLeft -= 1;

    this.evaluateOutcome();
    if (s.status === "playing") this.ensurePlayable();

    return { legal: true, cleared: totalCleared, combo, status: s.status };
  }

  private evaluateOutcome(): void {
    const s = this.state;
    const goal = this.config.goal;
    let met = false;
    if (goal.kind === "collect") {
      met = Object.entries(goal.need).every(([color, n]) => (s.collected[color] ?? 0) >= n);
    } else if (goal.kind === "score") {
      met = goal.target !== "endless" && s.score >= goal.target;
    }
    if (met) {
      s.status = "won";
      return;
    }
    if (s.movesLeft !== null && s.movesLeft <= 0) s.status = "lost";
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
