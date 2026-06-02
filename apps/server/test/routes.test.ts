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

  it("POST /api/session 创建并返回开场白", async () => {
    const { app } = makeApp();
    const r = await app.inject({ method: "POST", url: "/api/session" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.opening).toContain("NewBee");
    await app.close();
  });

  it("GET /api/session/:id 取快照；未知 id → 404", async () => {
    const { app } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    const ok = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stage).toBe(0);
    const miss = await app.inject({ method: "GET", url: "/api/session/nope" });
    expect(miss.statusCode).toBe(404);
    await app.close();
  });

  it("POST export：工程信号不全 → 409；齐全 → 200 含 resolution", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();

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
