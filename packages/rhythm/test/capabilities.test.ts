import { describe, it, expect } from "vitest";
import {
  GAMEPLAY_CAPABILITIES,
  renderGoalOptionsForPrompt,
  RHYTHM_MANIFEST_BY_ID,
  createRhythmGame,
  neonPulse,
  neonPulseChart,
  type RhythmDef,
} from "@cq/rhythm";

describe("capabilities · 音游可落地玩法能力清单（spec §4）", () => {
  it("含 rank-goal/survival/endless-score 三档", () => {
    const goals = GAMEPLAY_CAPABILITIES.map((c) => c.goal).sort();
    expect(goals).toEqual(["endless-score", "rank-goal", "survival"]);
  });

  it("每条都有 title/summary/themeHints", () => {
    for (const c of GAMEPLAY_CAPABILITIES) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.themeHints.length).toBeGreaterThan(0);
    }
  });

  it("每档 goal 都有对应可引用的 manifest", () => {
    for (const c of GAMEPLAY_CAPABILITIES) {
      expect(RHYTHM_MANIFEST_BY_ID.has(c.goal)).toBe(true);
    }
  });

  it("renderGoalOptionsForPrompt 含三种 use 与主题提示", () => {
    const txt = renderGoalOptionsForPrompt();
    expect(txt).toContain('"use": "rank-goal"');
    expect(txt).toContain('"use": "survival"');
    expect(txt).toContain('"use": "endless-score"');
    expect(txt).toContain("段位");
    expect(txt).toContain("生存");
  });

  it("每档 jsonExample 翻译出引擎可跑的 goal", () => {
    for (const c of GAMEPLAY_CAPABILITIES) {
      const def: RhythmDef = { ...neonPulse, goal: JSON.parse(c.jsonExample) };
      const engine = createRhythmGame(def, neonPulseChart);
      expect(engine.getState().status).toBe("playing");
    }
  });
});
