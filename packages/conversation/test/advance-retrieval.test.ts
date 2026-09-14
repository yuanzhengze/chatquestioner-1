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
        const sys = messages[0]?.content ?? "";
        if (sys.includes("[GDD_EXTRACT_V1]")) {
          yield "{}";
          return;
        }
        captured = sys;
        yield `好的！${STATE_SENTINEL}\n{"state_delta":{},"stage_complete":false,"ready_for_synthesis":false}`;
      },
    },
  };
}

function accepted() {
  const s = createInitialState();
  s.guidance = "accepted" as const;
  return s;
}

describe("advance with retriever", () => {
  it("injects retrieved cards into the system message", async () => {
    const { llm, lastSystem } = recordingLlm();
    const state = createInitialState();
    state.guidance = "accepted";
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
    await advance(accepted(), "hi", { llm, systemPrompt: "SYS" });
    expect(lastSystem()).not.toContain("[F2 投喂素材]");
  });

  it("omits the block when retriever returns no cards", async () => {
    const { llm, lastSystem } = recordingLlm();
    await advance(accepted(), "hi", { llm, systemPrompt: "SYS", retrieve: async () => [] });
    expect(lastSystem()).not.toContain("[F2 投喂素材]");
  });

  it("degrades gracefully when the retriever rejects (no knowledge block, turn still completes)", async () => {
    const { llm, lastSystem } = recordingLlm();
    const res = await advance(accepted(), "hi", {
      llm,
      systemPrompt: "SYS",
      retrieve: async () => { throw new Error("embedding timeout"); },
    });
    expect(lastSystem()).not.toContain("[F2 投喂素材]");
    expect(res.reply).toBe("好的！");
  });
});
