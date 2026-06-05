import type { GameDef } from "../types.js";

/** docs/09 附录 A.1 —— 最纯粹 match-3，红色 0%。 */
export const bejeweled: GameDef = {
  id: "bejeweled-classic",
  board: { size: [8, 8], tiles: ["white", "red", "yellow", "green", "blue", "purple", "orange"] },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 800 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 10, comboMult: 1.5 },
    { use: "shuffle-deadlock", onDeadlock: "end" },
  ],
  goal: { use: "goal-tracker", score: "endless" },
  rules: [{ when: "no-moves", then: "lose" }],
  seed: 42,
};
