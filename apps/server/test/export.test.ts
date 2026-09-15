import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildServer } from "../src/server.js";
import { createInitialState, type ConversationState, type LlmClient } from "@cq/conversation";
import type { SessionStore } from "../src/sessionStore.js";

function memStore(initial: Record<string, ConversationState>): SessionStore {
  const map = new Map(Object.entries(initial));
  return {
    async create(s) { const id = "x"; map.set(id, s); return id; },
    async createWithId(id, s) { map.set(id, s); },
    async load(id) { return map.get(id) ?? null; },
    async save(id, s) { map.set(id, s); },
    async remove(id) { return map.delete(id); },
  };
}

const idleLlm: LlmClient = { async *stream() { /* export 不调用 LLM */ } };

/** 有创意内容的会话：不含任何工程信号，验证出稿不再依赖维度/引擎/平台。 */
function creativeState(): ConversationState {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.pitch = "撸猫治愈的三消小品";
  s.coreFantasy = "在猫咖里边消除边收集猫咪";
  s.history = [
    { role: "user", content: "猫咪消消乐。撸猫治愈的三消小品。在猫咖里边消除边收集猫咪。" },
  ];
  return s;
}

describe("POST /api/session/:id/export", () => {
  let exportDir: string;
  beforeEach(() => { exportDir = mkdtempSync(resolve(tmpdir(), "cq-export-")); });

  it("有创意内容即可导出 gdd.md，无需任何工程信号", async () => {
    const app = buildServer({
      llm: idleLlm,
      store: memStore({ s1: creativeState() }),
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s1/export" });
    expect(res.statusCode).toBe(200);
    expect(res.json().gddMarkdown).toContain("猫咪消消乐");

    const file = resolve(exportDir, "s1", "gdd.md");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("撸猫治愈的三消小品");
    await app.close();
  });

  it("空会话（创意维度尚无内容）→ 409", async () => {
    const app = buildServer({
      llm: idleLlm,
      store: memStore({ s2: createInitialState() }),
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s2/export" });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("非法 session id → 400", async () => {
    const app = buildServer({
      llm: idleLlm,
      store: memStore({}),
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/bad%2Fid/export" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
