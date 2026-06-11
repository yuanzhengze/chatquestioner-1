import { describe, it, expect } from "vitest";
import { createInitialState } from "@cq/conversation";
import { buildCardSummary } from "../src/cardSummary.js";

describe("buildCardSummary", () => {
  it("空状态回退占位标题，无可运行 def", () => {
    const card = buildCardSummary({
      state: createInitialState(),
      dsl: null,
      resolution: null,
      gamedef: null,
    });
    expect(card.title).toBe("未命名设计");
    expect(card.hasRunnableDef).toBe(false);
    expect(card.platforms).toEqual([]);
    expect(card.coreLoop).toEqual([]);
    expect(card.tags).toEqual([]);
  });

  it("从 state 抽取标题/品类/循环/标签", () => {
    const s = createInitialState();
    s.workingTitle = "三消糖果";
    s.pitch = "一句话陈述";
    s.coreExperience = "爽快消除";
    s.engineering.genre = "match-3";
    s.engineering.dimension = "2D";
    s.engineering.engine = "pixijs";
    s.engineering.platform = ["mobile"];
    s.loop = { thirtySec: "交换", fiveMin: "过关", thirtyMin: "解锁", longTerm: "收集" };
    s.keywordPools.gameplay = ["消除", "连击"];
    s.keywordPools.emotion = ["治愈"];
    s.mvpScope.must = ["核心循环", "关卡"];
    s.risks = ["平衡难"];

    const card = buildCardSummary({ state: s, dsl: null, resolution: null, gamedef: null });
    expect(card.title).toBe("三消糖果");
    expect(card.pitch).toBe("一句话陈述");
    expect(card.coreExperience).toBe("爽快消除");
    expect(card.genre).toBe("match-3");
    expect(card.dimension).toBe("2D");
    expect(card.engine).toBe("pixijs");
    expect(card.platforms).toEqual(["mobile"]);
    expect(card.coreLoop).toEqual(["交换", "过关", "解锁", "收集"]);
    expect(card.tags).toContain("消除");
    expect(card.tags).toContain("治愈");
    expect(card.mvpMustCount).toBe(2);
    expect(card.riskCount).toBe(1);
  });
});
