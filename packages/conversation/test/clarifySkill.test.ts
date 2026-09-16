import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { buildClarifySystemPrompt, stripFrontmatter } from "../src/clarifySkill.js";

const skillDir = resolve(__dirname, "../../../prompts/game-gdd-clarify");

describe("clarify skill adapter", () => {
  it("stripFrontmatter 去掉 YAML 头", () => {
    const raw = "---\nname: x\n---\n# 正文\n";
    expect(stripFrontmatter(raw)).toBe("# 正文\n");
  });

  it("guide 模式装入 SKILL 正文、问法参考与宿主说明，不含 YAML", () => {
    const prompt = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 0 });
    expect(prompt).toContain("游戏创意澄清");
    expect(prompt).toContain("小程序宿主适配");
    expect(prompt).toContain("实质设计方向放进 JSON options");
    expect(prompt).toContain("问法内核");
    expect(prompt).not.toContain("在本宿主作废");
    expect(prompt).not.toMatch(/^---/);
  });

  it("引导模式从一开始就附问法参考；完整度清单只在允许总结时附", () => {
    const early = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 0 });
    const mid = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 6 });
    const late = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 10 });
    expect(early).toContain("问法内核");
    expect(early).not.toContain("不得带病写盘");
    expect(mid).not.toContain("不得带病写盘");
    expect(late).toContain("不得带病写盘");
    expect(late).toContain("没在人话里出现过的作品名");
  });

  it("stageHint 追加在 prompt 末尾", () => {
    const prompt = buildClarifySystemPrompt({
      skillDir, mode: "guide", stage: 1, stageHint: "[内部进度] 当前该推进：核心体验",
    });
    expect(prompt.endsWith("[内部进度] 当前该推进：核心体验")).toBe(true);
  });

  it("freeform 不装入 SKILL 采访正文", () => {
    const prompt = buildClarifySystemPrompt({ skillDir, mode: "freeform", stage: 0 });
    expect(prompt).toContain("不走创意引导采访");
    expect(prompt).not.toContain("游戏创意澄清 → 完整 GDD");
    expect(prompt).not.toContain("引导模式 · 本宿主");
  });

  it("只投放当前节 asks，早期不含收敛确认模板", () => {
    const early = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 0 });
    const core = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 2 });
    expect(early).toContain("## 破冰");
    expect(early).not.toContain("## 收敛确认");
    expect(early).not.toContain("就按这个定稿，写成设计文档");
    expect(core).toContain("## 核心体验");
    expect(core).not.toContain("## 收敛确认");
  });

  it("stage<10 不附 SKILL 收敛落盘模板；允许总结时才附", () => {
    const early = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 6 });
    const late = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 10 });
    expect(early).not.toContain("先口头给一份人话版概念总结");
    expect(early).not.toContain("## 7. 收敛与落盘");
    expect(late).toContain("先口头给一份人话版概念总结");
    expect(late).toContain("## 7. 收敛与落盘");
  });

  it("已收口时附收敛节，不再塞完整度补问清单，也不再要求口头总结配方", () => {
    const prompt = buildClarifySystemPrompt({ skillDir, mode: "guide", stage: 7, converging: true });
    expect(prompt).toContain("## 收敛确认");
    expect(prompt).not.toContain("不得带病写盘");
    expect(prompt).not.toContain("先口头给一份人话版概念总结");
  });
});
