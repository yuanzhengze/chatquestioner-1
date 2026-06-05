import { describe, it, expect } from "vitest";
import { buildKnowledgeContext, KNOWLEDGE_CONTEXT_HEADER } from "../src/retrieval.js";

describe("buildKnowledgeContext", () => {
  it("renders the header plus one bullet per card", () => {
    const out = buildKnowledgeContext([
      { title: "星露谷", body: "治愈农场。" },
      { title: "连连看", body: "同色连接。" },
    ]);
    expect(out.startsWith(KNOWLEDGE_CONTEXT_HEADER)).toBe(true);
    expect(out).toContain("- 《星露谷》：治愈农场。");
    expect(out).toContain("- 《连连看》：同色连接。");
  });
});
