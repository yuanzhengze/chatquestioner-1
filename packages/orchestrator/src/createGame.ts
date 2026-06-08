import { MatchEngine, type EngineConfig, type Goal } from "@cq/modules";
import { type GameDef, type SystemUse, isHook } from "./types.js";

const DEFAULT_SEED = 0x9e3779b9;

function findUse(def: GameDef, id: string): SystemUse | undefined {
  if (def.input.use === id) return def.input;
  return def.systems.find((s) => s.use === id);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function toGoal(def: GameDef): Goal {
  if (isHook(def.goal)) {
    // S0 不执行 hook 目标；退化为无目标计分，hook 由后续逃生舱实现。
    return { kind: "score", target: "endless" };
  }
  const g = def.goal;
  if (g.collect && typeof g.collect === "object") {
    return { kind: "collect", need: g.collect as Record<string, number> };
  }
  if (g.score !== undefined) {
    return { kind: "score", target: g.score as number | "endless" };
  }
  if (typeof g.clearLayer === "string") {
    return { kind: "clearLayer" };
  }
  // drop 等目标暂未实现运行时 → 退化为 endless。
  return { kind: "score", target: "endless" };
}

/** GameDef → EngineConfig（纯翻译，便于单测）。 */
export function toEngineConfig(def: GameDef): EngineConfig {
  const [width, height] = def.board.size;
  const swap = def.input.use === "input-swap" ? def.input : undefined;
  const matchDetect = findUse(def, "match-detect");
  const scoreCombo = findUse(def, "score-combo");
  const moveBudget = findUse(def, "move-budget");
  const shuffle = findUse(def, "shuffle-deadlock");

  const boardLayer = def.board.layers?.find((l) => l.use === "board-layer");
  const clearResolve = findUse(def, "clear-resolve");

  return {
    width,
    height,
    tiles: def.board.tiles,
    minLine: num(matchDetect?.line, 3),
    requireMatch: typeof swap?.requireMatch === "boolean" ? swap.requireMatch : true,
    cascade: def.systems.some((s) => s.use === "cascade"),
    scoreBase: num(scoreCombo?.base, 10),
    comboMult: num(scoreCombo?.comboMult, 1.5),
    moves: typeof moveBudget?.moves === "number" ? moveBudget.moves : null,
    goal: toGoal(def),
    deadlock: shuffle ? ((shuffle.onDeadlock as "shuffle" | "end") ?? "shuffle") : "none",
    seed: def.seed ?? DEFAULT_SEED,
    layers: boardLayer
      ? {
          coverage: typeof boardLayer.coverage === "string" ? boardLayer.coverage : "all",
          layer: typeof boardLayer.layer === "string" ? boardLayer.layer : "jelly",
        }
      : null,
    clearsLayer: typeof clearResolve?.clearsLayer === "string",
  };
}

/** GameDef → 可跑引擎实例（S0 的"运行时组装"载体）。 */
export function createGame(def: GameDef): MatchEngine {
  return new MatchEngine(toEngineConfig(def));
}
