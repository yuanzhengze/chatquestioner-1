import { describe, it, expect } from "vitest";
import { renderGdd, type GddModel } from "../src/index.js";

const model: GddModel = {
  title: "猫咪连连看",
  pitch: "一个关于把同色猫咪连起来解压的游戏。",
  coreFantasy: "成为治愈系撸猫大师",
  coreExperience: "极度解压、被治愈",
  coreLoop: ["看猫", "连同色猫", "得分", "更多猫涌入"],
  keywordPools: {
    gameplay: ["连连看", "消除"],
    emotion: ["治愈", "解压"],
    world: ["猫咖"],
    visual: ["水彩"],
    narrative: ["撸猫日常"],
    motivation: ["放松"],
  },
  differentiator: "踩奶节奏的呼噜反馈",
  references: { borrow: ["Onet"], avoid: ["硬核计时压力"] },
  mvp: { must: ["核心连接循环", "计分"], cut: ["关卡系统"] },
  risks: ["题材同质化"],
  constitution: ["核心幻想：治愈撸猫", "美术规则：水彩暖色"],
};

describe("renderGdd", () => {
  it("renders a markdown doc containing the pitch and constitution", () => {
    const md = renderGdd(model);
    expect(md).toContain("# 猫咪连连看");
    expect(md).toContain("一个关于把同色猫咪连起来解压的游戏。");
    expect(md).toContain("## 游戏宪法");
    expect(md).toContain("核心幻想：治愈撸猫");
  });

  it("renders all six keyword pools", () => {
    const md = renderGdd(model);
    for (const label of ["玩法", "情绪", "世界观", "视觉", "叙事", "玩家动机"]) {
      expect(md).toContain(label);
    }
  });
});
