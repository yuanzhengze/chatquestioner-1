import type { Chart, FlickDir, Note, NoteType } from "./types.js";

/** generateChart hook 输入契约（方案 §8）。 */
export interface GenerateChartInput {
  songId: string;
  difficulty: "easy" | "normal" | "hard";
  laneCount: number; // 与 track-layout.lanes 一致
  bpm: number;
  durationMs: number;
}

interface DifficultyProfile {
  /** 每拍细分数：1=只放强拍(1/4)，2=1/8，4=1/16 */
  subdivisions: number;
  /** 保留比例：从网格点里按确定性规则筛掉一部分，控制密度 */
  keepRatio: number;
  /** 允许的 note 类型权重（确定性映射用） */
  allowFlick: boolean;
  allowHold: boolean;
  /** 实际使用的 lane 上限（≤ laneCount） */
  laneCap: number;
}

function profileFor(diff: GenerateChartInput["difficulty"], laneCount: number): DifficultyProfile {
  switch (diff) {
    case "easy":
      return { subdivisions: 1, keepRatio: 0.7, allowFlick: false, allowHold: false, laneCap: Math.min(2, laneCount) };
    case "hard":
      return { subdivisions: 4, keepRatio: 0.9, allowFlick: true, allowHold: true, laneCap: laneCount };
    case "normal":
    default:
      return { subdivisions: 2, keepRatio: 0.8, allowFlick: true, allowHold: false, laneCap: Math.min(4, laneCount) };
  }
}

const MIN_GAP_MS = 80; // 同 lane 相邻 note 最小间隔（方案 §4 限流）
const FLICK_DIRS: FlickDir[] = ["left", "right", "up", "down"];

/** 确定性整数 hash（FNV-1a 变体）：让同输入产出同谱面，无随机源（方案 §6 可复现）。 */
function hashInt(n: number): number {
  let h = 2166136261 ^ n;
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * P1 算法骨架（无音频，spec §5 / 方案 §7 P1）：BPM + 难度 → 按拍网格铺 note。
 * 纯函数、确定性、可复现；无信号处理。P2/P3 接入 onset 后替换 note.time 来源即可。
 */
export function generateChart(input: GenerateChartInput): Chart {
  const { songId, difficulty, laneCount, bpm, durationMs } = input;
  const prof = profileFor(difficulty, laneCount);
  const beatMs = 60000 / bpm;
  const stepMs = beatMs / prof.subdivisions;

  const notes: Note[] = [];
  const lastTimeByLane = new Map<number, number>();
  let stepIdx = 0;
  let serial = 0;

  for (let t = 0; t <= durationMs; t += stepMs, stepIdx++) {
    const time = Math.round(t);
    const h = hashInt(stepIdx);

    // 按 keepRatio 确定性筛点：强拍（整拍）永远保留，弱拍按 hash 抽样。
    const onBeat = stepIdx % prof.subdivisions === 0;
    if (!onBeat && (h % 100) / 100 >= prof.keepRatio) continue;

    const lane = h % prof.laneCap;
    const last = lastTimeByLane.get(lane);
    if (last !== undefined && time - last < MIN_GAP_MS) continue;

    const type = pickType(h, onBeat, prof);
    const note: Note = { id: `${songId}-${serial++}`, time, lane, type };
    if (type === "flick") note.dir = FLICK_DIRS[h % FLICK_DIRS.length]!;
    if (type === "hold") note.duration = Math.max(stepMs, Math.round(beatMs)); // 至少一拍

    notes.push(note);
    lastTimeByLane.set(lane, time);
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return { songId, bpm, durationMs, difficulty, laneCount, notes };
}

/** onset → Note 类型的确定性启发式（P1 简化版，对齐方案 §4 映射表）。 */
function pickType(h: number, onBeat: boolean, prof: DifficultyProfile): NoteType {
  const r = h % 100;
  // 强拍偶发 hold（延音）；段落感的 flick 落在弱拍走向突变处。
  if (prof.allowHold && onBeat && r < 12) return "hold";
  if (prof.allowFlick && !onBeat && r >= 85) return "flick";
  return "tap";
}
