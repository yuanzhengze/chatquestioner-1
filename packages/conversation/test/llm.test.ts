import { describe, it, expect } from "vitest";
import { OPENING_MESSAGE, TURN_DIRECTIVE, interpretGuidance, wantsDocument, wantsFinalize, CONSENT_OPTIONS } from "../src/llm.js";
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
});
