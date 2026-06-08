import type { GameDef } from "../types.js";

/**
 * Candy Crush 清果冻关（docs/09 §A.2 candy-crush-jelly-23 的可跑子集）。
 * 全盘 1 层果冻；消除命中处同时清层；清空全盘层即胜。special candy 留下一轮。
 */
export const candyCrushJelly: GameDef = {
  id: "candy-crush-jelly",
  board: {
    size: [8, 8],
    tiles: ["red", "orange", "yellow", "green", "blue", "purple"],
    layers: [{ use: "board-layer", layer: "jelly", coverage: "all" }],
  },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve", clearsLayer: "jelly" },
    { use: "gravity-fall", speed: 700 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 60, comboMult: 1.5 },
    { use: "move-budget", moves: 40 },
    { use: "shuffle-deadlock", onDeadlock: "shuffle" },
  ],
  goal: { use: "goal-tracker", clearLayer: "jelly" },
  rules: [
    { when: "goal-met", then: "win" },
    { when: "moves == 0", then: "lose" },
  ],
  seed: 11,
};
