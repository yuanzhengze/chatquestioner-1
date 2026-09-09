import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { toGddModel } from "../src/compile.js";

function readyState() {
  const s = createInitialState();
  s.stage = 7;
  s.workingTitle = "猫咪连连看";
  s.pitch = "一个关于治愈系猫咪连连看的解压小游戏";
  s.coreFantasy = "成为照顾猫咪的人";
  s.coreExperience = "解压治愈";
  s.loop = { thirtySec: "划线连接同色猫", fiveMin: "凑连击", thirtyMin: "解锁新猫", longTerm: "图鉴收集" };
  s.keywordPools.gameplay = ["连接", "消除"];
  s.differentiator = "踩奶节奏 + 呼噜治愈音效";
  s.references = ["开心消消乐"];
  s.avoidReferences = ["重度肝氪卡牌"];
  s.risks = ["关卡产能"];
  s.mvpScope = { must: ["核心连接循环", "计分"], cut: ["关卡编辑器"] };
  s.constitution = ["核心循环：连同色猫消除"];
  return s;
}

describe("toGddModel", () => {
  it("把 state 映射成可渲染的 GddModel", () => {
    const m = toGddModel(readyState());
    expect(m.title).toBe("猫咪连连看");
    expect(m.coreLoop).toEqual(["划线连接同色猫", "凑连击", "解锁新猫", "图鉴收集"]);
    expect(m.references).toEqual({ borrow: ["开心消消乐"], avoid: ["重度肝氪卡牌"] });
    expect(m.mvp.must).toContain("计分");
    expect(m.constitution.length).toBeGreaterThan(0);
  });

  it("缺字段时给安全默认，不抛异常", () => {
    const m = toGddModel(createInitialState());
    expect(m.title).toBe("未命名游戏");
    expect(m.coreLoop).toEqual([]);
    expect(m.pitch).toBe("");
  });

  it("工程信号缺失不影响 GDD 产出（灵感引导不依赖维度/引擎/平台）", () => {
    const s = readyState();
    s.engineering = {
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    };
    const m = toGddModel(s);
    expect(m.title).toBe("猫咪连连看");
    expect(m.pitch).not.toBe("");
  });
});
