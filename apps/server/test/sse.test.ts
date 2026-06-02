import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { fakeLlm, throwingLlm } from "./fixtures/fakeLlm.js";
import { fixtureCatalog } from "./fixtures/catalog.js";
import type { LlmClient } from "@cq/conversation";

const STATE_SENTINEL = "<<<STATE>>>";
const turn = (reply: string, control: object) => `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-sse-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function start(llm: LlmClient) {
  const app = buildServer({ llm, store: new FileSessionStore(dir), catalog: fixtureCatalog(), systemPrompt: "SYS" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as AddressInfo).port;
  return { app, base: `http://127.0.0.1:${port}` };
}

async function readSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe("SSE /api/session/:id/message", () => {
  it("正常一轮：发 token / state / stage / done", async () => {
    const llm = fakeLlm([turn("听起来很治愈！你更想连猫还是连甜点？", { state_delta: { spark: "猫咪连连看" }, stage_complete: false })]);
    const { app, base } = await start(llm);
    const created = await (await fetch(`${base}/api/session`, { method: "POST" })).json();
    const res = await fetch(`${base}/api/session/${created.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "我想做个治愈小游戏" }),
    });
    const text = await readSse(res);
    expect(text).toContain("event: token");
    expect(text).toContain("event: state");
    expect(text).toContain("event: stage");
    expect(text).toContain("event: done");
    expect(text).not.toContain(STATE_SENTINEL); // 哨兵不外泄
    await app.close();
  });

  it("LLM 抛错：发 error 事件且仍收尾 done", async () => {
    const { app, base } = await start(throwingLlm("proxy down"));
    const created = await (await fetch(`${base}/api/session`, { method: "POST" })).json();
    const res = await fetch(`${base}/api/session/${created.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    const text = await readSse(res);
    expect(text).toContain("event: error");
    expect(text).toContain("proxy down");
    expect(text).toContain("event: done");
    await app.close();
  });
});
