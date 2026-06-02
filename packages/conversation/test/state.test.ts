import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";

describe("createInitialState", () => {
  it("从 stage 0 开始，所有集合字段已初始化为空", () => {
    const s = createInitialState();
    expect(s.stage).toBe(0);
    expect(s.references).toEqual([]);
    expect(s.juice).toEqual([]);
    expect(s.loop).toEqual({});
    expect(s.risks).toEqual([]);
    expect(s.mvpScope).toEqual({ must: [], cut: [] });
    expect(s.constitution).toEqual([]);
    expect(s.history).toEqual([]);
  });

  it("keywordPools 六类全部初始化为空数组", () => {
    const s = createInitialState();
    expect(s.keywordPools).toEqual({
      gameplay: [], emotion: [], world: [], visual: [], narrative: [], motivation: [],
    });
  });

  it("engineering 信号容器全部初始化为空", () => {
    const s = createInitialState();
    expect(s.engineering).toEqual({
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    });
  });
});
