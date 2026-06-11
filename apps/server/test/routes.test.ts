import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import { fixtureCatalog } from "./fixtures/catalog.js";

let dir: string;
function makeApp() {
  const store = new FileSessionStore(dir);
  return {
    app: buildServer({
      llm: fakeLlm([]), store, catalog: fixtureCatalog(),
      systemPrompt: "SYS", profile: "workbench", exportDir: join(dir, "exports"),
    }),
    store,
  };
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-routes-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("routes", () => {
  it("GET /api/health → ok", async () => {
    const { app } = makeApp();
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });

  it("POST /api/session 只生成 id+开场白，不落库（空会话不记录）", async () => {
    const { app, store } = makeApp();
    const r = await app.inject({ method: "POST", url: "/api/session" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.opening).toContain("NewBee");
    // 关键：此刻不应有任何持久化（未发首句）。
    expect(await store.load(body.id)).toBeNull();
    await app.close();
  });

  it("GET /api/session/:id：未发首句 → 404；首句后 lazy 落库 → 200", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    // 尚未发言：未入库 → 404
    const before = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(before.statusCode).toBe(404);
    // 发首句后应已 lazy 落库
    await app.inject({ method: "POST", url: `/api/session/${created.id}/message`, payload: { message: "你好" } });
    expect(await store.load(created.id)).not.toBeNull();
    const after = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().stage).toBe(0);
    const miss = await app.inject({ method: "GET", url: "/api/session/nope" });
    expect(miss.statusCode).toBe(404);
    await app.close();
  });

  it("POST export：工程信号不全 → 409；齐全 → 200 含 resolution", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    // export 前会话需已存在（lazy 语义下未发言不入库）：先存个空初始状态。
    await store.save(created.id, createInitialState());

    const notReady = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(notReady.statusCode).toBe(409);

    const s = createInitialState();
    s.workingTitle = "三消糖果";
    s.pitch = "三消糖果消除小游戏";
    s.mvpScope = { must: ["核心循环"], cut: [] };
    s.engineering = {
      dimension: "2D", engine: "pixijs", platform: ["mobile"],
      modalities: ["image"], genre: "match-3", mechanics: ["swap-match"],
      artStyle: "cartoon", intentTerms: ["消除"], signatureTerms: [],
    };
    await store.save(created.id, s);

    const ok = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.dsl.constraints.dimension).toBe("2D");
    expect(body.resolution.template.primary).toBeTruthy();
    expect(body.gddMarkdown).toContain("三消糖果");
    await app.close();
  });
});
