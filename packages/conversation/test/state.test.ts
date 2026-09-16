import { describe, it, expect } from "vitest";
import { createInitialState, normalizeConversationState } from "../src/state.js";

describe("createInitialState", () => {
  it("从 stage 0 开始，所有集合字段已初始化为空", () => {
    const s = createInitialState();
    expect(s.stage).toBe(0);
    expect(s.guidance).toBe("pending");
    expect(s.references).toEqual([]);
    expect(s.juice).toEqual([]);
    expect(s.loop).toEqual({});
    expect(s.interaction).toEqual({});
    expect(s.growth).toEqual({});
    expect(s.mechanics).toEqual([]);
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

  it("normalizeConversationState 给旧会话补新字段", () => {
    const s = createInitialState();
    delete (s as { guidance?: string }).guidance;
    delete (s as { mechanics?: string[] }).mechanics;
    delete (s as { presentation?: object }).presentation;
    s.history.push({ role: "user", content: "以前说过" });
    const n = normalizeConversationState(s);
    expect(n.guidance).toBe("accepted");
    expect(n.mechanics).toEqual([]);
    expect(n.presentation).toEqual({});
    expect(n.content.flags.levels).toBe(false);
    expect(n.interaction).toEqual({});
    expect(n.growth).toEqual({});
  });
});
