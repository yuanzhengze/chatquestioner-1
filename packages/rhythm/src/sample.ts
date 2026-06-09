import type { Chart, RhythmDef } from "./types.js";

/**
 * 样本谱面 neon-pulse-normal（spec §7 S0 手写 chart）。
 * 覆盖 tap/hold/flick/special 四类按钮，4 轨，normal 难度。
 */
export const neonPulseChart: Chart = {
  songId: "neon-pulse",
  bpm: 120,
  durationMs: 8000,
  difficulty: "normal",
  laneCount: 4,
  notes: [
    { id: "n1", time: 500, lane: 0, type: "tap" },
    { id: "n2", time: 1000, lane: 1, type: "tap" },
    { id: "n3", time: 1500, lane: 2, type: "tap" },
    { id: "n4", time: 2000, lane: 3, type: "flick", dir: "right" },
    { id: "n5", time: 2500, lane: 0, type: "hold", duration: 500 },
    { id: "n6", time: 3500, lane: 1, type: "tap" },
    { id: "n7", time: 4000, lane: 2, type: "flick", dir: "up" },
    { id: "n8", time: 4500, lane: 3, type: "tap" },
    { id: "n9", time: 5000, lane: 0, type: "special" },
    { id: "n10", time: 5500, lane: 1, type: "tap" },
    { id: "n11", time: 6000, lane: 2, type: "hold", duration: 600 },
    { id: "n12", time: 7000, lane: 3, type: "tap" },
  ],
};

/**
 * 样本编排 neonPulse（spec §3.1）：评分闯关玩法，达 A 即过关。
 * 与 match-3 GameDef 同范式：TS 对象字面量，validate 零错误。
 */
export const neonPulse: RhythmDef = {
  id: "neon-pulse-normal",
  track: { use: "track-layout", lanes: 4 },
  notes: { use: "note-source" },
  inputs: [
    { use: "input-tap" },
    { use: "input-hold", tailJudge: true },
    { use: "input-flick", dirs: ["left", "right", "up", "down"] },
    { use: "input-special", kinds: ["burst"] },
  ],
  systems: [
    { use: "timing-window", perfectMs: 40, goodMs: 90, okMs: 140 },
    { use: "base-score", tap: 100, hold: 200, flick: 150, special: 300 },
    { use: "combo-ladder", n: 10, tiers: [[1, 1.1], [2, 1.2], [3, 1.5]] },
    { use: "rank-threshold", sss: 98, ss: 90, s: 85, a: 75, b: 70, c: 60 },
  ],
  goal: { use: "rank-goal", minRank: "A" },
  rules: [],
};
