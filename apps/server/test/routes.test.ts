import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";

let dir: string;
function makeApp() {
  const store = new FileSessionStore(dir);
  return {
    app: buildServer({
      llm: fakeLlm([]), store,
      systemPrompt: "SYS", exportDir: join(dir, "exports"),
      shareDir: dir,
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

  it("POST /api/session 允许 application/json 空 body（微信小程序默认）", async () => {
    const { app } = makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/session",
      headers: { "content-type": "application/json" },
      payload: "",
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toMatch(/[0-9a-f-]{36}/);
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

  it("DELETE /api/session/:id 删会话后 GET 404", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await app.inject({ method: "POST", url: `/api/session/${created.id}/message`, payload: { message: "你好" } });
    expect(await store.load(created.id)).not.toBeNull();

    const del = await app.inject({ method: "DELETE", url: `/api/session/${created.id}` });
    expect(del.statusCode).toBe(204);
    expect(await store.load(created.id)).toBeNull();
    const after = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(after.statusCode).toBe(404);

    const missing = await app.inject({ method: "DELETE", url: "/api/session/nope" });
    expect(missing.statusCode).toBe(204);
    const bad = await app.inject({ method: "DELETE", url: "/api/session/bad.id" });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("POST export：创意维度为空 → 409；有内容 → 200 含 GDD", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    // export 前会话需已存在（lazy 语义下未发言不入库）：先存个空初始状态。
    await store.save(created.id, createInitialState());

    const notReady = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(notReady.statusCode).toBe(409);

    // 刻意不填 engineering：出稿只看创意内容，不看维度/引擎/平台。
    const s = createInitialState();
    s.workingTitle = "三消糖果";
    s.pitch = "三消糖果消除小游戏";
    s.mvpScope = { must: ["核心循环"], cut: [] };
    await store.save(created.id, s);

    const ok = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().gddMarkdown).toContain("三消糖果");
    await app.close();
  });

  it("POST /api/share 只存文档快照；GET 不含 history", async () => {
    const { app } = makeApp();
    const missing = await app.inject({ method: "GET", url: "/api/share/nope" });
    expect(missing.statusCode).toBe(404);
    const badId = await app.inject({ method: "GET", url: "/api/share/bad.id" });
    expect(badId.statusCode).toBe(400);

    const empty = await app.inject({
      method: "POST",
      url: "/api/share",
      payload: { markdown: "  ", history: [{ role: "user", content: "秘密" }] },
    });
    expect(empty.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/share",
      payload: {
        markdown: "# 梦境便利店\n\n> 一句话 Pitch：便利店\n",
        history: [{ role: "user", content: "秘密对话" }],
      },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.v).toBe(1);
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.title).toBe("梦境便利店");
    expect(body.markdown).toContain("梦境便利店");
    expect(body).not.toHaveProperty("history");

    const got = await app.inject({ method: "GET", url: `/api/share/${body.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().markdown).toContain("便利店");
    expect(got.json()).not.toHaveProperty("history");
    await app.close();
  });

  it("GET /avatar/:file 在配置 avatarDir 时返回海报", async () => {
    const store = new FileSessionStore(dir);
    const avatarDir = join(process.cwd(), "apps/web/public/avatar");
    const app = buildServer({
      llm: fakeLlm([]), store,
      systemPrompt: "SYS", exportDir: join(dir, "exports"),
      shareDir: dir,
      avatarDir,
    });
    const r = await app.inject({ method: "GET", url: "/avatar/calm.png" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/image\/png/);
    expect(r.rawPayload.length).toBeGreaterThan(1000);
    await app.close();
  });
});
