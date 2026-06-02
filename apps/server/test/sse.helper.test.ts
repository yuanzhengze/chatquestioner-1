import { describe, it, expect } from "vitest";
import { sendEvent } from "../src/sse.js";

function fakeReply() {
  const chunks: string[] = [];
  return { chunks, raw: { write: (s: string) => { chunks.push(s); return true; } } } as any;
}

describe("sendEvent", () => {
  it("写出标准 SSE 帧 event:/data:/空行", () => {
    const reply = fakeReply();
    sendEvent(reply, "token", { text: "你好" });
    expect(reply.chunks.join("")).toBe(`event: token\ndata: ${JSON.stringify({ text: "你好" })}\n\n`);
  });
});
