import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { STATE_SENTINEL, type ChatMessage, type LlmClient } from "@cq/conversation";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const fakeLlm: LlmClient = {
  async *stream(_messages: ChatMessage[]) {
    yield `好的${STATE_SENTINEL}\n{"state_delta":{},"stage_complete":false,"ready_for_synthesis":false}`;
  },
};
const emptyCatalog = { generatedAt: "t", forgeaxRoot: "/x", templates: [], skills: [], mcp: [] };

describe("server forwards retrieve to advance", () => {
  it("calls the injected retriever during a message turn", async () => {
    let called = false;
    const store = new FileSessionStore(mkdtempSync(resolve(tmpdir(), "cq-")));
    const app = buildServer({
      llm: fakeLlm, store, catalog: emptyCatalog as any, systemPrompt: "SYS",
      retrieve: async () => { called = true; return []; },
    });
    const created = await app.inject({ method: "POST", url: "/api/session" });
    const { id } = created.json() as { id: string };
    await app.inject({ method: "POST", url: `/api/session/${id}/message`, payload: { message: "hi" } });
    expect(called).toBe(true);
    await app.close();
  });
});
