import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { canWriteSummary, canShowConvergence, openSummaryWindow, hasQualifiedSummaryInWindow, formatSummaryEligibility } from "../src/gates.js";

const SUMMARY = "> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。";

describe("口头总结闸", () => {
  it("未到第 10 节不能写总结，哪怕历史里已有 📌", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 3;
    s.history = [{ role: "assistant", content: SUMMARY }];
    expect(canWriteSummary(s)).toBe(false);
    openSummaryWindow(s);
    expect(s.summaryEligibleFrom).toBeUndefined();
    expect(canShowConvergence(s)).toBe(false);
    expect(formatSummaryEligibility(s)).toContain("may_write_summary: false");
  });

  it("第 10 节可以写总结，不要求 completeness 全绿", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 10;
    expect(canWriteSummary(s)).toBe(true);
    expect(formatSummaryEligibility(s)).toContain("may_write_summary: true");
    expect(formatSummaryEligibility(s)).toContain("completeness: false");
    expect(formatSummaryEligibility(s)).toContain("口头总结后的定稿预览不亮条");
  });

  it("到达第 10 节之后才打开窗口，窗口前的 📌 不算三选", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 10;
    s.history = [
      { role: "assistant", content: SUMMARY },
      { role: "user", content: "在手机玩" },
      { role: "assistant", content: "立体还是平面？" },
    ];
    openSummaryWindow(s);
    expect(s.summaryEligibleFrom).toBe(s.history.length - 1);
    expect(hasQualifiedSummaryInWindow(s)).toBe(false);
    expect(canShowConvergence(s)).toBe(false);

    s.history.push({ role: "assistant", content: SUMMARY });
    expect(hasQualifiedSummaryInWindow(s)).toBe(true);
    expect(canShowConvergence(s)).toBe(true);
  });
});
