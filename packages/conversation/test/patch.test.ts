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
import { coreMechanicId, gameplayMomentsFromModel, isComplete, renderGdd } from "@cq/gdd";
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

const SIX = [
  "点选摆珠：先选颜色再点空位。",
  "整理桌面：开局把散珠扫进小碟。",
  "材质搭配：透明珠和夜光珠混着用。",
  "错珠调整：用小镊子夹起重放。",
  "订单展示：完成后盖章贴进展示页。",
  "温和解锁：完成订单换新工具。",
];

function sixMechanics() {
  const s = createInitialState();
  s.guidance = "accepted";
  s.mechanics = [...SIX];
  s.optionPhase = "awaitingEdit";
  return s;
}

describe("核心机制按条修改", () => {
  it("点第 2 条只改第 2 条，其他五条原样，身份和关键瞬间 id 不变", () => {
    const s = sixMechanics();
    const before = gameplayMomentsFromModel(toGddModel(s));
    beginLinePatch(s, { lineId: "mechanics.1", lineText: `2. ${SIX[1]}`, sectionTitle: "怎么玩" });
    expect(s.patchContext?.targetText).toBe(SIX[1]);
    stashPatchProposal(
      s,
      { mechanic_edits: { "mechanics.1": "整理桌面：开局把散珠按颜色扫进三个小碟。", "mechanics.3": "不该动" } },
      ["mechanics.1", "mechanics.3", "mechanics"],
    );
    expect(s.patchContext?.affectedLineIds).toEqual(["mechanics.1"]);
    applyPendingPatch(s);
    expect(s.mechanics).toEqual([SIX[0], "整理桌面：开局把散珠按颜色扫进三个小碟。", ...SIX.slice(2)]);
    const after = gameplayMomentsFromModel(toGddModel(s));
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(after[1].description).toBe("开局把散珠按颜色扫进三个小碟。");
    expect(after.filter((m, i) => m.description !== before[i].description).map((m) => m.id)).toEqual([before[1].id]);
  });

  it("模型还交整表时，也只把目标那一条写回，别的润色不进文档", () => {
    const s = sixMechanics();
    beginLinePatch(s, { lineId: "mechanics.1", lineText: `2. ${SIX[1]}`, sectionTitle: "怎么玩" });
    stashPatchProposal(
      s,
      { mechanics: SIX.map((m, i) => (i === 1 ? "整理桌面：先把珠子分好色。" : `${m}（润色过）`)) },
      ["mechanics.1"],
    );
    applyPendingPatch(s);
    expect(s.mechanics).toEqual([SIX[0], "整理桌面：先把珠子分好色。", ...SIX.slice(2)]);
  });

  it("点别的行时不能借机整表重写机制", () => {
    const s = sixMechanics();
    s.coreAction = "点选摆珠";
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：点选摆珠", sectionTitle: "怎么玩" });
    stashPatchProposal(s, { coreAction: "拖拽摆珠", mechanics: ["拖拽摆珠：按住珠子拖进格子。"] }, ["coreAction", "mechanics"]);
    applyPendingPatch(s);
    expect(s.coreAction).toBe("拖拽摆珠");
    expect(s.mechanics).toEqual(SIX);
  });

  it("回执完整列出改成什么，不截断、不加省略号；写进历史的也是全文", () => {
    const s = sixMechanics();
    const long = "整理桌面：开局先把散珠按颜色扫进三个小碟，再把纸胶带和小镊子摆回右手边，桌面清爽以后才开始接下一单。";
    beginLinePatch(s, { lineId: "mechanics.1", lineText: `2. ${SIX[1]}`, sectionTitle: "怎么玩" });
    stashPatchProposal(s, { mechanic_edits: { "mechanics.1": long } }, ["mechanics.1"]);
    const reply = patchProposalReply(s);
    expect(reply.length).toBeGreaterThan(48);
    expect(reply).toContain(long);
    expect(reply).toContain("核心机制第 2 条");
    expect(reply).not.toMatch(/…|\.\.\./);
  });
});

/** 走一遍文档点改：点第 n 条，模型回 value，点应用。 */
function editMechanic(s: ReturnType<typeof sixMechanics>, n: number, value: string) {
  const shown = toGddModel(s).mechanics;
  beginLinePatch(s, { lineId: `mechanics.${n - 1}`, lineText: `${n}. ${shown[n - 1]}`, sectionTitle: "怎么玩" });
  stashPatchProposal(s, { mechanic_edits: { [`mechanics.${n - 1}`]: value } }, [`mechanics.${n - 1}`]);
  applyPendingPatch(s);
  restorePatchPhase(s);
}

function numberedLines(s: ReturnType<typeof sixMechanics>): string[] {
  const md = renderGdd(toGddModel(s));
  const block = md.split("### 核心机制")[1]?.split("\n\n")[0] || "";
  return block.split("\n").filter((line) => /^\d+\. /.test(line));
}

describe("核心机制不带展示序号", () => {
  it("原始纯文本只编号一次；问用户时只给原句，不带序号", () => {
    const s = sixMechanics();
    expect(numberedLines(s)[0]).toBe(`1. ${SIX[0]}`);
    beginLinePatch(s, { lineId: "mechanics.0", lineText: `1. ${SIX[0]}`, sectionTitle: "怎么玩" });
    const asked = s.history[s.history.length - 1].content;
    expect(asked).toContain(SIX[0]);
    expect(asked).not.toContain(`1. ${SIX[0]}`);
  });

  it("模型回「1. xxx」时写回前去掉；连改三次第 1 条仍只有一次编号，id 不变", () => {
    const s = sixMechanics();
    const id = gameplayMomentsFromModel(toGddModel(s))[0].id;
    editMechanic(s, 1, "1. 点选摆珠：先选颜色，再点空位。");
    editMechanic(s, 1, "1、点选摆珠：选好颜色后点空位。");
    editMechanic(s, 1, "1) 点选摆珠：选色以后点空位放珠。");
    expect(s.mechanics[0]).toBe("点选摆珠：选色以后点空位放珠。");
    expect(numberedLines(s)[0]).toBe("1. 点选摆珠：选色以后点空位放珠。");
    expect(gameplayMomentsFromModel(toGddModel(s))[0].id).toBe(id);
    expect(s.mechanics.slice(1)).toEqual(SIX.slice(1));
  });

  it("改第 2 条和第 6 条，模型带回「2. / 6．」也写成纯正文，编号按位置", () => {
    const s = sixMechanics();
    editMechanic(s, 2, "2. 整理桌面：按颜色扫进三个小碟。");
    editMechanic(s, 6, "6．温和解锁：每完成三单换一件新工具。");
    expect(s.mechanics[1]).toBe("整理桌面：按颜色扫进三个小碟。");
    expect(s.mechanics[5]).toBe("温和解锁：每完成三单换一件新工具。");
    const lines = numberedLines(s);
    expect(lines[1]).toBe("2. 整理桌面：按颜色扫进三个小碟。");
    expect(lines[5]).toBe("6. 温和解锁：每完成三单换一件新工具。");
  });

  it("「3 秒时间冻结」这样的数字不动", () => {
    const s = sixMechanics();
    editMechanic(s, 3, "3 秒时间冻结：玩家按住时全场静止三秒。");
    expect(s.mechanics[2]).toBe("3 秒时间冻结：玩家按住时全场静止三秒。");
    expect(numberedLines(s)[2]).toBe("3. 3 秒时间冻结：玩家按住时全场静止三秒。");
  });

  it("旧会话已经存成「6. xxx」：页面不双编号，身份照旧，再改一次也只有一次编号", () => {
    const s = sixMechanics();
    const polluted = `6. ${SIX[5]}`;
    s.mechanics[5] = polluted;
    s.mechanicIds = { [coreMechanicId(polluted)]: "stable6" };
    const model = toGddModel(s);
    expect(model.mechanics[5]).toBe(SIX[5]);
    expect(numberedLines(s)[5]).toBe(`6. ${SIX[5]}`);
    const before = gameplayMomentsFromModel(model);
    expect(before[5].id).toBe("stable6");
    editMechanic(s, 6, "6. 温和解锁：完成订单换吸珠笔。");
    expect(s.mechanics[5]).toBe("温和解锁：完成订单换吸珠笔。");
    const after = gameplayMomentsFromModel(toGddModel(s));
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(numberedLines(s)[5]).toBe("6. 温和解锁：完成订单换吸珠笔。");
  });

  it("旧会话带序号但没有身份记录时，按存下来的原文算 id，去掉序号不换身份", () => {
    const s = sixMechanics();
    const polluted = `2. ${SIX[1]}`;
    s.mechanics[1] = polluted;
    const moments = gameplayMomentsFromModel(toGddModel(s));
    expect(moments[1].id).toBe(coreMechanicId(polluted));
    expect(moments[1].title).toBe("整理桌面");
    expect(moments[0].id).toBe(coreMechanicId(SIX[0]));
  });
});
