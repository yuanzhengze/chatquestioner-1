import { describe, it, expect } from "vitest";
import {
  generateChart,
  type GenerateChartInput,
  type Chart,
  type Note,
} from "@cq/rhythm";

function isSorted(notes: Note[]): boolean {
  return notes.every((n, i) => i === 0 || notes[i - 1]!.time <= n.time);
}

function minGapByLane(notes: Note[]): number {
  const byLane = new Map<number, number[]>();
  for (const n of notes) {
    const arr = byLane.get(n.lane) ?? [];
    arr.push(n.time);
    byLane.set(n.lane, arr);
  }
  let min = Infinity;
  for (const times of byLane.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) min = Math.min(min, times[i]! - times[i - 1]!);
  }
  return min;
}

const base: GenerateChartInput = {
  songId: "test-song",
  difficulty: "normal",
  laneCount: 4,
  bpm: 120,
  durationMs: 16000,
};

describe("generateChart · P1 算法骨架（无音频，spec §5 / 方案 §7 P1）", () => {
  it("产出符合 Chart 契约：字段完整、notes 按 time 升序", () => {
    const chart: Chart = generateChart(base);
    expect(chart.songId).toBe("test-song");
    expect(chart.bpm).toBe(120);
    expect(chart.durationMs).toBe(16000);
    expect(chart.difficulty).toBe("normal");
    expect(chart.laneCount).toBe(4);
    expect(chart.notes.length).toBeGreaterThan(0);
    expect(isSorted(chart.notes)).toBe(true);
  });

  it("note 全部落在曲目时长内、lane 在 [0,laneCount)", () => {
    const chart = generateChart(base);
    for (const n of chart.notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThanOrEqual(base.durationMs);
      expect(n.lane).toBeGreaterThanOrEqual(0);
      expect(n.lane).toBeLessThan(base.laneCount);
    }
  });

  it("同 lane 相邻 note 最小间隔 ≥ 80ms（可玩性限流，方案 §4）", () => {
    const chart = generateChart(base);
    expect(minGapByLane(chart.notes)).toBeGreaterThanOrEqual(80);
  });

  it("flick 必带 dir、hold 必带 duration（方案 §8 脏数据约束）", () => {
    const chart = generateChart({ ...base, difficulty: "hard" });
    for (const n of chart.notes) {
      if (n.type === "flick") expect(n.dir).toBeDefined();
      if (n.type === "hold") expect(n.duration).toBeGreaterThan(0);
    }
  });

  it("可复现：同输入两次产出完全相同（spec §7 golden、方案 §6）", () => {
    expect(generateChart(base)).toEqual(generateChart(base));
  });

  it("难度分层：hard 比 normal 比 easy 更密（方案 §5）", () => {
    const easy = generateChart({ ...base, difficulty: "easy" }).notes.length;
    const normal = generateChart({ ...base, difficulty: "normal" }).notes.length;
    const hard = generateChart({ ...base, difficulty: "hard" }).notes.length;
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
  });

  it("note id 唯一", () => {
    const chart = generateChart({ ...base, difficulty: "hard" });
    const ids = new Set(chart.notes.map((n) => n.id));
    expect(ids.size).toBe(chart.notes.length);
  });
});
