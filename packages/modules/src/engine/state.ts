/** 棋盘：行优先，board[row][col]，row 0 在顶部。空位为 null。 */
export type Board = (string | null)[][];

export type Pos = { r: number; c: number };

export type GameStatus = "playing" | "won" | "lost";

/** 目标：收集 N 个某色，或达到分数（"endless" = 无目标，纯计分）。 */
export type Goal =
  | { kind: "collect"; need: Record<string, number> }
  | { kind: "score"; target: number | "endless" }
  | { kind: "clearLayer" };

/** 由 orchestrator 从 GameDef 翻译出来的引擎配置（GameDef → EngineConfig）。 */
export interface EngineConfig {
  width: number;
  height: number;
  tiles: string[];
  minLine: number;
  /** input-swap.requireMatch：交换不成立则弹回 */
  requireMatch: boolean;
  /** cascade 模块是否在编排里 */
  cascade: boolean;
  scoreBase: number;
  comboMult: number;
  /** move-budget：步数；null = 无限 */
  moves: number | null;
  goal: Goal;
  /** shuffle-deadlock 行为；"none" = 无该模块 */
  deadlock: "shuffle" | "end" | "none";
  seed: number;
  /** board-layer：覆盖层配置；缺省/null = 本局无层 */
  layers?: { coverage: string; layer: string } | null;
  /** clear-resolve.clearsLayer：消除时是否连带清覆盖层 */
  clearsLayer?: boolean;
}

export interface GameState {
  board: Board;
  width: number;
  height: number;
  score: number;
  movesLeft: number | null;
  status: GameStatus;
  /** 上一步连锁深度（演出/调试用） */
  lastCombo: number;
  /** 已收集（按色累计），服务 collect 目标 */
  collected: Record<string, number>;
  /** board-layer：与 board 同形，元素=该格剩余层数(≥1)，null=无层；本局无层时整体为 undefined */
  layers?: (number | null)[][];
}
