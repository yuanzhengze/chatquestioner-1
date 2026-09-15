import { describe, it, expect } from "vitest";
import { OPENING_MESSAGE, TURN_DIRECTIVE, buildTurnDirective, interpretGuidance, interpretConvergenceChoice, wantsDocument, wantsFinalize, looksLikeConceptSummary, stripFollowUpAsksAfterSummary, CONSENT_OPTIONS, CONSENT_AFTER_IDEA, CONVERGENCE_OPTIONS } from "../src/llm.js";
import { STATE_SENTINEL } from "../src/turn.js";

describe("提示词常量", () => {
  it("OPENING_MESSAGE 是 stage 0 破冰白，含 NewBee 自我介绍且不含术语", () => {
    expect(OPENING_MESSAGE).toContain("NewBee");
    expect(OPENING_MESSAGE).toContain("脑洞");
    expect(OPENING_MESSAGE).not.toContain("核心循环");
    expect(OPENING_MESSAGE).not.toContain("10 轮");
  });

  it("TURN_DIRECTIVE 明确要求 reply + 哨兵 + JSON 三段", () => {
    expect(TURN_DIRECTIVE).toContain(STATE_SENTINEL);
    expect(TURN_DIRECTIVE).toContain("state_delta");
    expect(TURN_DIRECTIVE).toContain("stage_complete");
    expect(TURN_DIRECTIVE).toContain("ready_for_synthesis");
    expect(TURN_DIRECTIVE).toContain("实质设计方向");
    expect(TURN_DIRECTIVE).toContain("直接告诉我你的脑洞");
    expect(TURN_DIRECTIVE).not.toContain("要么整体省略");
    expect(TURN_DIRECTIVE).not.toContain("options 都必填");
    expect(TURN_DIRECTIVE).toContain("系统马上弹卡片");
    expect(TURN_DIRECTIVE).toContain("不要只写在人话里");
  });

  it("没资格时 TURN 指令禁止抄暂定名，有资格时才要求出口头总结", () => {
    expect(buildTurnDirective(false)).toContain("禁止写暂定名");
    expect(buildTurnDirective(false)).not.toContain("本轮必须出口头概念总结");
    expect(buildTurnDirective(true)).toContain("本轮必须出口头概念总结");
  });

  it("interpretGuidance 认 label、detail 和 A/B", () => {
    expect(interpretGuidance(CONSENT_OPTIONS[0].label)).toBe("accepted");
    expect(interpretGuidance(CONSENT_OPTIONS[0].detail)).toBe("accepted");
    expect(interpretGuidance(CONSENT_OPTIONS[1].label)).toBe("declined");
    expect(interpretGuidance(CONSENT_OPTIONS[1].detail)).toBe("declined");
    expect(interpretGuidance("A")).toBe("accepted");
    expect(interpretGuidance("B")).toBe("declined");
    expect(interpretGuidance("我想做猫咪游戏")).toBeNull();
  });

  it("wantsDocument 认「写成文档 / 现在就生成 / 直接生成最终文档」，不认同意门", () => {
    expect(wantsDocument(CONSENT_OPTIONS[0].detail)).toBe(false);
    expect(wantsDocument(CONSENT_OPTIONS[0].label)).toBe(false);
    expect(wantsDocument("写成完整的游戏设计文档")).toBe(true);
    expect(wantsDocument("为什么我看不到生成结果")).toBe(true);
    expect(wantsDocument("现在就生成")).toBe(true);
    expect(wantsDocument("出一份草稿")).toBe(true);
    expect(wantsDocument("直接生成最终的设计文档")).toBe(true);
    expect(wantsDocument("确认当前的总结完美契合心中构想，直接生成最终的设计文档。")).toBe(true);
    expect(wantsDocument("核心概念很完美，直接输出完整的 GDD")).toBe(true);
    expect(wantsDocument("确认总结，生成设计文档")).toBe(true);
    expect(wantsDocument("我想做猫咪游戏")).toBe(false);
    expect(wantsDocument("就按这个定稿")).toBe(false);
  });

  it("wantsFinalize 认定稿/确认总结", () => {
    expect(wantsFinalize("就按这个定稿")).toBe(true);
    expect(wantsFinalize("总结得很完美")).toBe(true);
    expect(wantsFinalize("确认当前的总结完美契合心中构想")).toBe(true);
    expect(wantsFinalize("核心概念很完美，直接输出完整的 GDD")).toBe(true);
    expect(wantsFinalize("现在就生成")).toBe(false);
  });

  it("interpretConvergenceChoice 只在上一轮是收敛三选时认 A/B/C", () => {
    expect(interpretConvergenceChoice("A", CONVERGENCE_OPTIONS)).toBe("finalize");
    expect(interpretConvergenceChoice(CONVERGENCE_OPTIONS[1].detail, CONVERGENCE_OPTIONS)).toBe("revise");
    expect(interpretConvergenceChoice("C", CONVERGENCE_OPTIONS)).toBe("explore");
    expect(interpretConvergenceChoice("A", [
      { id: "A", label: "信号找同伴", detail: "找回失联的同伴" },
      { id: "B", label: "回声拼真相", detail: "拼出真相" },
    ])).toBeNull();
  });

  it("looksLikeConceptSummary 认 📌 标题总结块，不认同意门和共情里的成型", () => {
    expect(looksLikeConceptSummary(CONSENT_AFTER_IDEA)).toBe(false);
    expect(looksLikeConceptSummary("蓝图已经基本成型！")).toBe(false);
    expect(looksLikeConceptSummary("咱们的游戏骨架已经非常清晰了！你希望玩家主要在什么设备上玩？")).toBe(false);
    expect(looksLikeConceptSummary("要不要生成设计文档吗")).toBe(false);
    expect(looksLikeConceptSummary("> 📌 **《木板与喘息》**（暂定）")).toBe(true);
    expect(looksLikeConceptSummary("> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。")).toBe(true);
  });

  it("stripFollowUpAsksAfterSummary 裁掉总结后的新提问", () => {
    const raw = "> 📌 **暂定游戏名**：《破晓求生：机械遗迹》\n> **一句话亮点**：沙盘荒岛求生。\n\n> ❓ 作为最后一个拼图，你希望大结局是什么？";
    const out = stripFollowUpAsksAfterSummary(raw);
    expect(out).toContain("破晓求生：机械遗迹");
    expect(out).toContain("一句话亮点");
    expect(out).not.toContain("大结局");
    expect(out).not.toContain("❓");
  });
});
