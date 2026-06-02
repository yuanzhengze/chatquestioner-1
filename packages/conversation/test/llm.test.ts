import { describe, it, expect } from "vitest";
import { OPENING_MESSAGE, TURN_DIRECTIVE } from "../src/llm.js";
import { STATE_SENTINEL } from "../src/turn.js";

describe("提示词常量", () => {
  it("OPENING_MESSAGE 是 stage 0 破冰白，含 NewBee 自我介绍且不含术语", () => {
    expect(OPENING_MESSAGE).toContain("NewBee");
    expect(OPENING_MESSAGE).toContain("脑洞");
    expect(OPENING_MESSAGE).not.toContain("核心循环");
  });

  it("TURN_DIRECTIVE 明确要求 reply + 哨兵 + JSON 三段", () => {
    expect(TURN_DIRECTIVE).toContain(STATE_SENTINEL);
    expect(TURN_DIRECTIVE).toContain("state_delta");
    expect(TURN_DIRECTIVE).toContain("stage_complete");
    expect(TURN_DIRECTIVE).toContain("ready_for_synthesis");
  });
});
