import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import type { ImageGenerator } from "../src/imageClient.js";
import { shouldAutoEnsureCover } from "../src/coverPipeline.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let dir: string;

function countingImage(fail = false): ImageGenerator & { calls: number } {
  const g = {
    calls: 0,
    async generate() {
      g.calls += 1;
      if (fail) throw new Error("boom");
      return { bytes: TINY_PNG, mime: "image/png" as const };
    },
  };
  return g;
}

function seedReady(store: FileSessionStore, id: string) {
  const s = createInitialState();
  s.guidance = "accepted";
  s.spark = "九龙城寨开火焦虑";
  s.coreEmotion = "开火焦虑";
  s.reward = "废弃冰室补给";
  s.failRule = "被抓惨死回冰室";
  s.interaction = { verb: "潜行", target: "城寨巷", chain: "搜刮 → 潜行 → 开枪逃跑", feedback: "警报" };
  s.loop = { thirtySec: "搜刮", fiveMin: "潜行一局", thirtyMin: "再来一把" };
  s.history = [
    {
      role: "assistant",
      content: "> 📌 **暂定游戏名**：《城寨幽鸣》\n> 📌 **一句话亮点**：开火即逃亡。\n> 📌 **核心循环**：搜刮 ➔ 潜行 ➔ 开枪逃跑",
    },
    { role: "user", content: "确认当前的总结完美契合心中构想，直接生成最终的设计文档。" },
  ];
  return store.save(id, s);
}

async function waitCover(app: { inject: Function }, id: string) {
  const t0 = Date.now();
  while (Date.now() - t0 < 800) {
    const r = await app.inject({ method: "GET", url: `/api/session/${id}/cover?meta=1` });
    const j = r.json() as { status?: string };
    if (j.status === "ready" || j.status === "failed") return j;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("cover did not settle");
}

describe("cover pipeline", () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-cover-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("GET 会话带 gddView，但不 extract、不生图", async () => {
    const store = new FileSessionStore(dir);
    const image = countingImage();
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.statusCode).toBe(200);
    const body = got.json();
    expect(body.gddModel.title).toBe("城寨幽鸣");
    expect(body.gddView.title).toBe("城寨幽鸣");
    expect(body.gddView.storyboard.map((f: { text: string }) => f.text)).toEqual(["搜刮", "潜行", "开枪逃跑"]);
    expect(body.gddView.cover.status).toBe("idle");
    expect(body.gddView.cover.imageUrl).toBeUndefined();
    expect(image.calls).toBe(0);
    await app.close();
  });

  it("synthesis 之后 POST cover 落盘，失败则 failed", async () => {
    const store = new FileSessionStore(dir);
    const image = countingImage();
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);

    const kicked = await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    expect(kicked.statusCode).toBe(200);
    expect(kicked.json().status).toBe("pending");

    const settled = await waitCover(app, created.id);
    expect(settled.status).toBe("ready");
    expect(image.calls).toBe(1);

    const img = await app.inject({ method: "GET", url: `/api/session/${created.id}/cover` });
    expect(img.statusCode).toBe(200);
    expect(String(img.headers["content-type"])).toMatch(/image\/png/);
    expect(img.rawPayload.length).toBeGreaterThan(20);

    const again = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(again.json().gddView.cover.status).toBe("ready");
    expect(again.json().gddView.cover.imageUrl).toContain(`/api/session/${created.id}/cover`);
    expect(image.calls).toBe(1);

    await app.close();
  });

  it("生图失败降级，GET 仍能出文档", async () => {
    const store = new FileSessionStore(dir);
    const image = countingImage(true);
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    const settled = await waitCover(app, created.id);
    expect(settled.status).toBe("failed");
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.json().gddMarkdown).toContain("城寨幽鸣");
    expect(got.json().gddView.cover.status).toBe("failed");
    const img = await app.inject({ method: "GET", url: `/api/session/${created.id}/cover` });
    expect(img.statusCode).toBe(404);
    await app.close();
  });

  it("无图引擎时 POST cover 立刻 failed，不挡文档", async () => {
    const store = new FileSessionStore(dir);
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);
    const kicked = await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    expect(kicked.json().status).toBe("failed");
    const got = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(got.json().gddView.storyboard.length).toBeGreaterThan(0);
    await app.close();
  });

  it("已有封面后 POST cover 仍可强制再生成", async () => {
    const store = new FileSessionStore(dir);
    const image = countingImage();
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    await waitCover(app, created.id);
    expect(image.calls).toBe(1);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    await waitCover(app, created.id);
    expect(image.calls).toBe(2);
    await app.close();
  });

  it("分享快照可带上封面图", async () => {
    const store = new FileSessionStore(dir);
    const image = countingImage();
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await seedReady(store, created.id);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
    await waitCover(app, created.id);

    const share = await app.inject({
      method: "POST",
      url: "/api/share",
      payload: {
        markdown: "# 城寨幽鸣\n\n> 一句话 Pitch：开火即逃亡\n",
        title: "城寨幽鸣",
        model: { title: "城寨幽鸣", pitch: "开火即逃亡" },
        sessionId: created.id,
      },
    });
    expect(share.statusCode).toBe(200);
    expect(share.json().coverImageUrl).toContain(`/api/share/${share.json().id}/cover`);
    const cover = await app.inject({ method: "GET", url: `/api/share/${share.json().id}/cover` });
    expect(cover.statusCode).toBe(200);
    expect(cover.rawPayload.length).toBeGreaterThan(20);
    await app.close();
  });

  it("shouldAutoEnsureCover：有过封面后不再自动生图", () => {
    const s = createInitialState();
    expect(shouldAutoEnsureCover(s, false)).toBe(true);
    s.cover = { fingerprint: "x", prompt: "p", status: "ready" };
    expect(shouldAutoEnsureCover(s, false)).toBe(false);
    const failed = createInitialState();
    failed.cover = { fingerprint: "x", prompt: "p", status: "failed" };
    expect(shouldAutoEnsureCover(failed, false)).toBe(false);
    expect(shouldAutoEnsureCover(createInitialState(), true)).toBe(false);
  });
});
