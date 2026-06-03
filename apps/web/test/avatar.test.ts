import { describe, expect, it } from "vitest";
import { deriveBaseline, deriveStageEmotes, diffState } from "../src/avatar/derive.js";

describe("deriveBaseline · 生命周期 → baseline", () => {
  it("空闲：idle", () => {
    expect(deriveBaseline({ busy: false, typing: false, lastContentLen: 0 })).toBe("idle");
  });
  it("用户正在输入：listening", () => {
    expect(deriveBaseline({ busy: false, typing: true, lastContentLen: 0 })).toBe("listening");
  });
  it("busy 但还没 token：thinking", () => {
    expect(deriveBaseline({ busy: true, typing: false, lastRole: "assistant", lastContentLen: 0 })).toBe("thinking");
  });
  it("busy 且 token 在流：speaking", () => {
    expect(deriveBaseline({ busy: true, typing: false, lastRole: "assistant", lastContentLen: 12 })).toBe("speaking");
  });
});

describe("deriveStageEmotes · 阶段上升 → stage-up", () => {
  it("首帧（prev=null）不触发", () => {
    expect(deriveStageEmotes(null, 0)).toEqual([]);
  });
  it("阶段 +1 触发 stage-up", () => {
    expect(deriveStageEmotes(1, 2)).toEqual(["stage-up"]);
  });
  it("阶段不变不触发", () => {
    expect(deriveStageEmotes(2, 2)).toEqual([]);
  });
});

describe("剧本回放 · state 序列 → emote 序列", () => {
  it("逐轮 diff 还原一段对话的情绪节拍", () => {
    const snaps = [
      {},                                                   // 初始
      { spark: "猫咪解压" },                                 // → spark-caught
      { spark: "猫咪解压", coreEmotion: "治愈", coreAction: "连接" }, // → emotion-resonance, confirm
      { spark: "猫咪解压", coreEmotion: "治愈", coreAction: "连接", constitution: ["核心循环不可改"] }, // → constitution-lock
    ];
    const emotes = snaps.slice(1).map((s, i) => diffState(snaps[i], s));
    expect(emotes[0]).toEqual(["spark-caught"]);
    expect(emotes[1]).toEqual(["emotion-resonance", "confirm"]); // 优先级降序
    expect(emotes[2]).toEqual(["constitution-lock"]);
  });
});
