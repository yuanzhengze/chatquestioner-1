import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readNewbeeSystemPrompt } from "../src/prompt.js";

describe("newbee system prompt", () => {
  it("contains the [F2.5] grounding fragment", () => {
    const prompt = readNewbeeSystemPrompt(resolve(__dirname, "../../../prompts"));
    expect(prompt).toContain("[F2.5]");
    expect(prompt).toContain("投喂素材");
  });
});
