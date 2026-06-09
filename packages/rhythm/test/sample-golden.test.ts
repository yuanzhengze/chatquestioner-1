import { describe, it, expect } from "vitest";
import { RhythmEngine, createRhythmGame, neonPulse, neonPulseChart, type InputEvent } from "@cq/rhythm";

describe("sample golden · neonPulse 可玩", () => {
  it("全 perfect 演奏 → 高百分比、达成 rank-goal cleared", () => {
    const engine: RhythmEngine = createRhythmGame(neonPulse, neonPulseChart);
    for (const n of neonPulseChart.notes) {
      const ev: InputEvent = { time: n.time, lane: n.lane, type: n.type, dir: n.dir, releaseTime: n.duration ? n.time + n.duration : undefined };
      engine.feedInput(ev);
    }
    engine.tick(neonPulseChart.durationMs + 500);
    const s = engine.getState();
    expect(s.counts.miss).toBe(0);
    expect(s.status).toBe("cleared");
    expect(engine.rank()).toBe("SSS");
  });

  it("不演奏 → 0 分、未达 rank-goal（playing 或 failed，非 cleared）", () => {
    const engine = createRhythmGame(neonPulse, neonPulseChart);
    engine.tick(neonPulseChart.durationMs + 500);
    expect(engine.getState().status).not.toBe("cleared");
  });
});
