import { describe, it, expect } from "vitest";
import { advance } from "../src/advance.js";
import { createInitialState } from "../src/state.js";
import { STATE_SENTINEL } from "../src/turn.js";
import type { ChatMessage, LlmClient } from "../src/llm.js";

function recordingLlm(): { llm: LlmClient; lastSystem: () => string } {
  let captured = "";
  return {
    lastSystem: () => captured,
    llm: {
      async *stream(messages: ChatMessage[]) {
        captured = messages[0]?.content ?? "";
        yield `好的！${STATE_SENTINEL}\n{"state_delta":{},"stage_complete":false,"ready_for_synthesis":false}`;
      },
    },
  };
}

describe("advance with retriever", () => {
  it("injects retrieved cards into the system message", async () => {
    const { llm, lastSystem } = recordingLlm();
    const state = createInitialState();
    state.stage = 2;
    await advance(state, "我想做治愈的猫咪游戏", {
      llm,
      systemPrompt: "SYS",
      retrieve: async () => [{ title: "星露谷", body: "治愈农场。" }],
    });
    expect(lastSystem()).toContain("[F2 投喂素材]");
    expect(lastSystem()).toContain("- 《星露谷》：治愈农场。");
  });

  it("omits the knowledge block when no retriever is given (unchanged behavior)", async () => {
    const { llm, lastSystem } = recordingLlm();
    await advance(createInitialState(), "hi", { llm, systemPrompt: "SYS" });
    expect(lastSystem()).not.toContain("[F2 投喂素材]");
  });

  it("omits the block when retriever returns no cards", async () => {
    const { llm, lastSystem } = recordingLlm();
    await advance(createInitialState(), "hi", { llm, systemPrompt: "SYS", retrieve: async () => [] });
    expect(lastSystem()).not.toContain("[F2 投喂素材]");
  });
});
