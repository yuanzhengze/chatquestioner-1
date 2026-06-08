import { describe, it, expect } from "vitest";
import {
  createRhythmGame,
  createRhythmGameAsync,
  defaultHooks,
  hook,
  neonPulse,
  neonPulseChart,
  RhythmEngine,
  type RhythmDef,
} from "@cq/rhythm";

describe("note-source hook 接线（spec §3.1 / §5）", () => {
  it("notes 为静态 chart 时，createRhythmGameAsync 直接消费传入 chart", async () => {
    const engine = await createRhythmGameAsync(neonPulse, { chart: neonPulseChart });
    expect(engine).toBeInstanceOf(RhythmEngine);
    expect(engine.getState().status).toBe("playing");
  });

  it("notes.chart 为 {hook:'generateChart'} 时，加载期调用注册 hook 拿 Chart", async () => {
    const def: RhythmDef = {
      ...neonPulse,
      notes: { use: "note-source", chart: hook("generateChart") },
    };
    const engine = await createRhythmGameAsync(def, {
      hooks: defaultHooks,
      input: { songId: "neon", difficulty: "normal", laneCount: 4, bpm: 120, durationMs: 12000 },
    });
    expect(engine.chart.notes.length).toBeGreaterThan(0);
    expect(engine.chart.songId).toBe("neon");
  });

  it("未注册的 hook 名 → 抛错", async () => {
    const def: RhythmDef = {
      ...neonPulse,
      notes: { use: "note-source", chart: hook("nope") },
    };
    await expect(
      createRhythmGameAsync(def, {
        hooks: defaultHooks,
        input: { songId: "x", difficulty: "easy", laneCount: 2, bpm: 100, durationMs: 8000 },
      }),
    ).rejects.toThrow(/nope/);
  });

  it("同步 createRhythmGame 仍可用（静态 chart 路径）", () => {
    const engine = createRhythmGame(neonPulse, neonPulseChart);
    expect(engine).toBeInstanceOf(RhythmEngine);
  });
});
