import type { ConversationState } from "@cq/conversation";
import type { GameDef, SystemUse } from "../types.js";
import { clampSize, dedupeTiles, type GameDefFill } from "./fill.js";

const JELLY_DEFAULT_MOVES = 40;

function slug(s: string): string {
  const cleaned = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .slice(0, 40);
  return cleaned || "untitled-match3";
}

/**
 * match-3 已实现运行时子集骨架（spec §5）。systems 顺序即依赖链。
 * 不含 special-tile/board-layer 等未实现模块，保证产物一定可玩。
 */
export function buildSkeleton(state: ConversationState, fill: GameDefFill): GameDef {
  const tiles = dedupeTiles(fill.tiles);
  const size = clampSize(fill.size);
  const minLine = fill.tuning?.minLine ?? 3;
  const comboMult = fill.tuning?.comboMult ?? 1.5;

  const isJelly = fill.goal.kind === "clearLayer";

  const systems: SystemUse[] = [
    { use: "match-detect", line: minLine },
    isJelly ? { use: "clear-resolve", clearsLayer: "jelly" } : { use: "clear-resolve" },
    { use: "gravity-fall", speed: 800 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 10, comboMult },
  ];

  let goal: SystemUse;
  let needsMoves = false;
  if (fill.goal.kind === "collect") {
    const tileSet = new Set(tiles);
    const need: Record<string, number> = {};
    for (const [k, v] of Object.entries(fill.goal.need)) {
      if (tileSet.has(k)) need[k] = v;
    }
    if (Object.keys(need).length === 0) need[tiles[0]] = 20; // 过滤后空 → 兜底可达
    goal = { use: "goal-tracker", collect: need };
    needsMoves = true;
  } else if (fill.goal.kind === "clearLayer") {
    goal = { use: "goal-tracker", clearLayer: "jelly" };
    needsMoves = true;
  } else {
    goal = { use: "goal-tracker", score: fill.goal.target };
  }

  const movesVal = fill.tuning?.moves;
  if (needsMoves) {
    const fallback = isJelly ? JELLY_DEFAULT_MOVES : 25;
    systems.push({ use: "move-budget", moves: typeof movesVal === "number" ? movesVal : fallback });
  } else if (typeof movesVal === "number") {
    systems.push({ use: "move-budget", moves: movesVal });
  }

  systems.push({ use: "shuffle-deadlock", onDeadlock: "shuffle" });

  const def: GameDef = {
    id: slug(state.workingTitle ?? state.theme ?? "untitled-match3"),
    board: { size, tiles },
    input: { use: "input-swap", mode: "adjacent", requireMatch: true },
    systems,
    goal,
    rules: [],
  };
  if (isJelly) {
    def.board.layers = [{ use: "board-layer", layer: "jelly", coverage: "all" }];
  }
  return def;
}
