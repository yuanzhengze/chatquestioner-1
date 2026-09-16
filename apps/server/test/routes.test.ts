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
    expect(body.opening).not.toContain("10 轮");
    expect(body.options).toBeUndefined();
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
    s.history = [{ role: "user", content: "三消糖果消除小游戏，核心循环。" }];
    await store.save(created.id, s);

    const ok = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().gddMarkdown).toContain("三消糖果");
    await app.close();
  });

  it("GET 会话：只有口头总结、用户还没确认生成 → 不出草稿", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    const s = createInitialState();
    s.guidance = "accepted";
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "开火焦虑";
    s.readyForSynthesis = true;
    s.history = [
      {
        role: "assistant",
        content: "> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。",
      },
    ];
    await store.save(created.id, s);
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.statusCode).toBe(200);
    const body = got.json();
    expect(body.readyForSynthesis).toBe(false);
    expect(body.gddMarkdown).toBeUndefined();
    expect(body.workingTitle).toBe("城寨：风水魇");
    await app.close();
  });

  it("GET 会话：用户确认生成后出草稿，并带上对话里已有的内容", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    const s = createInitialState();
    s.guidance = "accepted";
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "开火焦虑";
    s.reward = "废弃冰室补给";
    s.failRule = "被抓惨死回冰室";
    s.history = [
      {
        role: "assistant",
        content: "> 📌 **暂定游戏名**：《城寨幽鸣》\n> 📌 **一句话亮点**：开火即逃亡。\n> 📌 **核心循环**：搜刮 ➔ 潜行 ➔ 开枪逃跑",
      },
      { role: "user", content: "确认当前的总结完美契合心中构想，直接生成最终的设计文档。" },
    ];
    await store.save(created.id, s);
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.statusCode).toBe(200);
    const body = got.json();
    expect(body.readyForSynthesis).toBe(true);
    expect(body.gddComplete).toBe(false);
    expect(body.gddDraftBar).toBe(false);
    expect(body.draftBar).toBe(false);
    expect(body.workingTitle).toBe("城寨幽鸣");
    expect(body.gddMarkdown).toContain("城寨幽鸣");
    expect(body.gddMarkdown).toContain("搜刮");
    expect(body.gddMarkdown).toContain("冰室");
    expect(body.gddModel.title).toBe("城寨幽鸣");
    await app.close();
  });

  it("GET 会话：中途现在就生成且没有口头总结时亮草稿条", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    const s = createInitialState();
    s.guidance = "accepted";
    s.spark = "猫咪帝国";
    s.pitch = "猫RTS";
    s.coreEmotion = "反差萌";
    s.history = [
      { role: "user", content: "猫咪帝国，猫RTS，反差萌" },
      { role: "assistant", content: "先看一版带缺口的草稿。" },
      { role: "user", content: "现在就生成" },
    ];
    await store.save(created.id, s);
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.statusCode).toBe(200);
    const body = got.json();
    expect(body.readyForSynthesis).toBe(true);
    expect(body.gddComplete).toBe(false);
    expect(body.gddDraftBar).toBe(true);
    expect(body.draftBar).toBe(true);
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
    expect(body).not.toHaveProperty("model");

    const got = await app.inject({ method: "GET", url: `/api/share/${body.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().markdown).toContain("便利店");
    expect(got.json()).not.toHaveProperty("history");
    await app.close();
  });

  it("POST /api/share 带 model 则为 v2，GET 仍不含 history", async () => {
    const { app } = makeApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/share",
      payload: {
        markdown: "# 夜猫\n\n> 一句话 Pitch：猫咖\n",
        title: "夜猫",
        model: { title: "夜猫", pitch: "猫咖" },
        complete: false,
        history: [{ role: "user", content: "秘密对话" }],
      },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.v).toBe(2);
    expect(body.model).toEqual({ title: "夜猫", pitch: "猫咖" });
    expect(body.complete).toBe(false);
    expect(body).not.toHaveProperty("history");
    const got = await app.inject({ method: "GET", url: `/api/share/${body.id}` });
    expect(got.json().v).toBe(2);
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
