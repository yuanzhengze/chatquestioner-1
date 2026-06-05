import type { GameDef } from "../types.js";

/**
 * Candy Crush 核心子集（collect 目标，无果冻/特殊糖果）。
 * 附录 A.2 的可跑 S0 版本：jelly/special 模块已在 index 注册，运行时列二期。
 */
export const candyCollect: GameDef = {
  id: "candy-collect",
  board: { size: [8, 8], tiles: ["red", "orange", "yellow", "green", "blue", "purple"] },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 700 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 60, comboMult: 1.5 },
    { use: "move-budget", moves: 25 },
    { use: "shuffle-deadlock", onDeadlock: "shuffle" },
  ],
  goal: { use: "goal-tracker", collect: { red: 20 } },
  rules: [
    { when: "goal-met", then: "win" },
    { when: "moves == 0", then: "lose" },
  ],
  seed: 7,
};
