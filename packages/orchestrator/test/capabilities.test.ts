import { describe, it, expect } from "vitest";
import { GAMEPLAY_CAPABILITIES, renderGoalOptionsForPrompt } from "@cq/orchestrator";

describe("capabilities · 可落地玩法能力清单", () => {
  it("含 collect/score/clearLayer 三档", () => {
    const goals = GAMEPLAY_CAPABILITIES.map((c) => c.goal).sort();
    expect(goals).toEqual(["clearLayer", "collect", "score"]);
  });

  it("每条都有 title/summary/themeHints", () => {
    for (const c of GAMEPLAY_CAPABILITIES) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.themeHints.length).toBeGreaterThan(0);
    }
  });

  it("renderGoalOptionsForPrompt 含三种 kind 与主题提示", () => {
    const txt = renderGoalOptionsForPrompt();
    expect(txt).toContain('"kind": "collect"');
    expect(txt).toContain('"kind": "score"');
    expect(txt).toContain('"kind": "clearLayer"');
    expect(txt).toContain("清理");
    expect(txt).toContain("收集");
  });
});
