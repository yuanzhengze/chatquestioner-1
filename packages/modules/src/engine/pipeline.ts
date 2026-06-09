import type { Board, EngineConfig, GameState, Pos } from "./state.js";
import {
  adjacent,
  applyGravity,
  clearTiles,
  clearTilesWithLayer,
  findMatches,
  hasLegalMove,
  refill,
  shuffleBoard,
  swap,
} from "./stages.js";

/** 在各 phase 之间流转的回合上下文。board/layers/state 为引擎实际引用（可变）。 */
export interface TurnContext {
  board: Board;
  layers: (number | null)[][] | null;
  state: GameState;
  config: EngineConfig;
  rng: () => number;
  a: Pos;
  b: Pos;
  matches: Pos[];
  clearedThisStep: number;
  combo: number;
  legal: boolean;
}

export type Phase = (ctx: TurnContext) => void;

/** onSwap：执行交换 a,b。 */
function onSwap(ctx: TurnContext): void {
  swap(ctx.board, ctx.a, ctx.b);
}

/** detect：写入当前匹配。 */
function detect(ctx: TurnContext): void {
  ctx.matches = findMatches(ctx.board, ctx.config.minLine);
}

/** resolveClear：消除匹配（可连带清层），按色累计 collected，写 clearedThisStep。 */
function resolveClear(ctx: TurnContext): void {
  const byColor =
    ctx.config.clearsLayer && ctx.layers
      ? clearTilesWithLayer(ctx.board, ctx.layers, ctx.matches)
      : clearTiles(ctx.board, ctx.matches);
  let stepCleared = 0;
  for (const [color, n] of Object.entries(byColor)) {
    stepCleared += n;
    ctx.state.collected[color] = (ctx.state.collected[color] ?? 0) + n;
  }
  ctx.clearedThisStep = stepCleared;
}

/** scoring：按本步清除数 + 连击倍率加分。 */
function scoring(ctx: TurnContext): void {
  const mult = ctx.config.cascade ? Math.pow(ctx.config.comboMult, ctx.combo - 1) : 1;
  ctx.state.score += Math.round(ctx.config.scoreBase * ctx.clearedThisStep * mult);
}

function gravity(ctx: TurnContext): void {
  applyGravity(ctx.board);
}

function refillTop(ctx: TurnContext): void {
  refill(ctx.board, ctx.config.tiles, ctx.rng);
}

/** postTurn：步数 -1。 */
function postTurn(ctx: TurnContext): void {
  if (ctx.state.movesLeft !== null) ctx.state.movesLeft -= 1;
}

function layersAllClear(layers: (number | null)[][] | null): boolean {
  if (!layers) return false;
  for (const row of layers) for (const cell of row) if (cell !== null) return false;
  return true;
}

/** evaluateGoal：判胜负（collect / score / clearLayer）。 */
function evaluateGoal(ctx: TurnContext): void {
  const s = ctx.state;
  const goal = ctx.config.goal;
  let met = false;
  if (goal.kind === "collect") {
    met = Object.entries(goal.need).every(([color, n]) => (s.collected[color] ?? 0) >= n);
  } else if (goal.kind === "score") {
    met = goal.target !== "endless" && s.score >= goal.target;
  } else if (goal.kind === "clearLayer") {
    met = layersAllClear(ctx.layers);
  }
  if (met) {
    s.status = "won";
    return;
  }
  if (s.movesLeft !== null && s.movesLeft <= 0) s.status = "lost";
}

/** ensurePlayable：无合法步时按 deadlock 策略处理。 */
function ensurePlayable(ctx: TurnContext): void {
  const s = ctx.state;
  if (hasLegalMove(ctx.board, ctx.config.minLine)) return;
  if (ctx.config.deadlock === "shuffle") {
    shuffleBoard(ctx.board, ctx.config.tiles, ctx.config.minLine, ctx.rng);
  } else if (ctx.config.deadlock === "end") {
    s.status = s.status === "playing" ? "lost" : s.status;
  }
}

/**
 * 把 EngineConfig 编译成一个回合执行器。systems 的存在/参数决定装哪些 phase 与是否成环。
 * 等价性：对无 layers 的 def，runTurn 与旧 MatchEngine.trySwap 瀑布逐步一致。
 */
export function compilePipeline(config: EngineConfig): { runTurn: (ctx: TurnContext) => void } {
  function runTurn(ctx: TurnContext): void {
    const s = ctx.state;

    onSwap(ctx);
    detect(ctx);

    if (ctx.matches.length === 0 && config.requireMatch) {
      swap(ctx.board, ctx.a, ctx.b); // 弹回
      ctx.legal = false;
      return;
    }
    ctx.legal = true;

    ctx.combo = 0;
    while (ctx.matches.length > 0) {
      ctx.combo++;
      resolveClear(ctx);
      scoring(ctx);
      gravity(ctx);
      refillTop(ctx);
      if (config.cascade) detect(ctx);
      else ctx.matches = [];
    }

    s.lastCombo = ctx.combo;
    postTurn(ctx);
    evaluateGoal(ctx);
    if (s.status === "playing") ensurePlayable(ctx);
  }

  return { runTurn };
}

export { adjacent };
