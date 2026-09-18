import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { CONVERGENCE_OPTIONS, PATCH_OPTIONS } from "../src/llm.js";
import {
  applyPendingPatch,
  beginLinePatch,
  filterPatchDelta,
  isKnownLineId,
  patchProposalReply,
  restorePatchPhase,
  scrubContrastCopy,
  stashPatchProposal,
} from "../src/patch.js";
import { isComplete } from "@cq/gdd";
import { toGddModel } from "../src/compile.js";

describe("patch fields", () => {
  it("isKnownLineId 认手风琴行，不认发明的章节", () => {
    expect(isKnownLineId("coreAction")).toBe(true);
    expect(isKnownLineId("mechanics.2")).toBe(true);
    expect(isKnownLineId("constitution.coreFantasy")).toBe(true);
    expect(isKnownLineId("loop.micro")).toBe(true);
    expect(isKnownLineId("invented.chapter")).toBe(false);
  });

  it("filterPatchDelta 丢掉未知键，只留清单字段", () => {
    const filtered = filterPatchDelta(
      {
        coreAction: "点击空田种菜",
        workingTitle: "不该写",
        coreEmotion: "不该动",
        interaction: { chain: "点田 → 下种 → 破土" },
      },
      ["coreAction", "interaction.chain"],
    );
    expect(filtered.coreAction).toBe("点击空田种菜");
    expect(filtered.interaction?.chain).toContain("下种");
    expect(filtered.workingTitle).toBeUndefined();
    expect(filtered.coreEmotion).toBeUndefined();
  });

  it("对照旧稿的说法只留下新正文", () => {
    expect(scrubContrastCopy("不再需要体力条，而是通过节奏判定。")).toBe("节奏判定。");
    const filtered = filterPatchDelta(
      { coreAction: "不再是点击空田播种，而是点击空田种菜。" },
      ["coreAction"],
    );
    expect(filtered.coreAction).toBe("点击空田种菜。");
  });

  it("点应用才写；取消不写；恢复原 optionPhase", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.coreAction = "点击空田播种";
    s.coreEmotion = "开火焦虑";
    s.optionPhase = "convergence";
    s.lastOptions = CONVERGENCE_OPTIONS.map((o) => ({ ...o }));
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：点击空田播种", sectionTitle: "怎么玩" });
    expect(s.optionPhase).toBe("patch");
    expect(s.lastOptions).toEqual([]);
    expect(s.patchContext?.resumePhase).toBe("convergence");

    stashPatchProposal(s, { coreAction: "点击空田种菜", workingTitle: "偷改名" }, ["coreAction"]);
    expect(s.coreAction).toBe("点击空田播种");
    expect(s.workingTitle).toBeUndefined();

    const cancelled = structuredClone(s);
    restorePatchPhase(cancelled);
    expect(cancelled.optionPhase).toBe("awaitingEdit");
    expect(cancelled.lastOptions).toEqual([]);
    expect(cancelled.coreAction).toBe("点击空田播种");
    expect(cancelled.patchContext).toBeUndefined();

    applyPendingPatch(s);
    restorePatchPhase(s);
    expect(s.coreAction).toBe("点击空田种菜");
    expect(s.workingTitle).toBeUndefined();
    expect(s.coreEmotion).toBe("开火焦虑");
    expect(s.optionPhase).toBe("awaitingEdit");
    expect(s.lastOptions).toEqual([]);
  });

  it("补丁清单用人话，不说手风琴", () => {
    const s = createInitialState();
    s.optionPhase = "awaitingEdit";
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：播种", sectionTitle: "怎么玩" });
    stashPatchProposal(s, { coreAction: "种菜" }, ["coreAction"]);
    const reply = patchProposalReply(s);
    expect(reply).toContain("文档里会改这些地方");
    expect(reply).toContain("核心动作");
    expect(reply).toContain("种菜");
    expect(reply).not.toMatch(/手风琴/);
  });

  it("半成品点行后还采访方向卡", () => {
    const s = createInitialState();
    const cards = [
      { id: "A", label: "暖光猫咖", detail: "夜里店里只剩呼噜声" },
      { id: "B", label: "雨巷躲猫", detail: "撑伞穿过湿漉漉的巷子" },
    ];
    s.optionPhase = "interview";
    s.lastOptions = cards;
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：（未写）", sectionTitle: "怎么玩" });
    restorePatchPhase(s);
    expect(s.optionPhase).toBe("interview");
    expect(s.lastOptions).toEqual(cards);
  });

  it("补「（未写）」不放宽完整度门", () => {
    const s = createInitialState();
    s.coreAction = "";
    s.patchContext = {
      lineId: "coreAction",
      lineText: "核心动作：（未写）",
      resumePhase: "interview",
      resumeOptions: [],
      pendingDelta: { coreAction: "点击空田" },
      affectedLineIds: ["coreAction"],
    };
    const before = isComplete(toGddModel(s));
    applyPendingPatch(s);
    const after = isComplete(toGddModel(s));
    expect(s.coreAction).toBe("点击空田");
    expect(before).toBe(false);
    expect(after).toBe(false);
  });

  it("PATCH_OPTIONS 文案不是定稿三选", () => {
    expect(PATCH_OPTIONS[0].label).toBe("应用这些改动");
    expect(PATCH_OPTIONS.map((o) => o.label).join()).not.toContain("定稿");
  });
});
