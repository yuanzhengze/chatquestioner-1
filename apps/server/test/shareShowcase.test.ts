import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import {
  createInitialState,
  harvestIntoState,
  normalizeConversationState,
  scrubUngroundedState,
  toGddModel,
  type ConversationState,
} from "@cq/conversation";
import { gameplayMomentsFromModel, renderGdd } from "@cq/gdd";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import type { ImageGenerator } from "../src/imageClient.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const MECHANICS = ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。", "订单展示：盖章贴进展示页。"];

let dir: string;

/** 和玩法图管线同一套取模型的方式；和真实快照一样不带 mechanicIds。 */
function modelOf(state: ConversationState) {
  const copy = normalizeConversationState(structuredClone(state));
  harvestIntoState(copy);
  scrubUngroundedState(copy);
  return toGddModel(copy);
}

function setup() {
  const store = new FileSessionStore(dir);
  const image: ImageGenerator & { calls: number } = {
    calls: 0,
    async generate() {
      image.calls += 1;
      return { bytes: TINY_PNG, mime: "image/png" };
    },
  };
  const app = buildServer({
    llm: fakeLlm([]),
    store,
    systemPrompt: "SYS",
    shareDir: dir,
    gameplayDir: join(dir, "gameplay"),
    imageConcurrency: 1,
    image,
  });
  return { store, image, app };
}

/**
 * 三条机制都出图后：改第 2 条（旧图过期但文件在），再加第 4 条（从没出过图）。
 * 改完由作者视图读一次玩法图，把旧图对账到新 id 下——真实流程里出文档后服务端会自动做这一步。
 */
async function seeded() {
  const { store, image, app } = setup();
  const sessionId = (await app.inject({ method: "POST", url: "/api/session" })).json().id as string;
  const s = createInitialState();
  s.guidance = "accepted";
  s.world = "发条匣";
  s.aesthetic = "黄铜机械";
  s.playerIdentity = "学徒";
  s.mechanics = [...MECHANICS];
  await store.save(sessionId, s);
  await app.inject({ method: "POST", url: `/api/session/${sessionId}/gameplay` });
  for (let i = 0; i < 100; i++) {
    const body = (await app.inject({ method: "GET", url: `/api/session/${sessionId}/gameplay` })).json() as { items: Array<{ status: string }> };
    if (body.items.every((item) => item.status === "ready")) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const state = (await store.load(sessionId))!;
  state.mechanics = [MECHANICS[0], "整理桌面：按颜色把材料分进小碟。", MECHANICS[2], "连击奖励：三连以上额外得分。"];
  await store.save(sessionId, state);
  await app.inject({ method: "GET", url: `/api/session/${sessionId}/gameplay` });
  return { store, image, app, sessionId };
}

describe("分享快照复用正式玩法图规则（只读）", () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-share-media-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("ready 和过期但文件在的图都给地址，没出过图的给 idle；身份与会话一致；读取不写会话、不生图", async () => {
    const { store, image, app, sessionId } = await seeded();
    const state = (await store.load(sessionId))!;
    state.gameClassification = {
      fingerprint: "fp",
      status: "ready",
      source: "model",
      genres: [{ tagId: 1, label: "解谜", category: "genre", evidence: "", confidence: 1, evidenceFields: [] }],
      tags: [{ tagId: 2, label: "治愈", category: "tag", evidence: "", confidence: 1, evidenceFields: [] }],
      debug: { retried: false, filtered: [] },
    } as unknown as ConversationState["gameClassification"];
    await store.save(sessionId, state);

    const model = modelOf(state);
    expect(model.mechanicIds).toBeUndefined();
    const shareId = (await app.inject({
      method: "POST",
      url: "/api/share",
      payload: { markdown: renderGdd(model), title: "发条匣", model, complete: false, sessionId },
    })).json().id as string;

    const sessionFile = join(dir, "sessions", `${sessionId}.json`);
    const before = readFileSync(sessionFile, "utf8");
    const calls = image.calls;

    const snap = (await app.inject({ method: "GET", url: `/api/share/${shareId}` })).json() as {
      gameplay: Array<{ mechanicId: string; status: string; imageUrl?: string; revision?: string; error?: string }>;
      profile?: { genres: string[]; tags: string[] };
    };
    const ids = gameplayMomentsFromModel(model).map((moment) => moment.id);
    const recorded = Object.keys(state.gameplayImages?.items || {});
    expect(snap.gameplay.map((item) => item.mechanicId)).toEqual(ids);
    expect(recorded).toEqual(expect.arrayContaining([ids[0], ids[1], ids[2]]));
    expect(snap.gameplay.map((item) => item.status)).toEqual(["ready", "stale", "ready", "idle"]);
    for (const item of snap.gameplay.slice(0, 3)) {
      expect(item.imageUrl).toBe(`/api/share/${shareId}/gameplay/${item.mechanicId}?f=${item.revision}`);
      expect(item.imageUrl).not.toContain(sessionId);
    }
    expect(snap.gameplay[3].imageUrl).toBeUndefined();
    expect(snap.gameplay.some((item) => "error" in item)).toBe(false);
    expect(snap.profile).toEqual({ genres: ["解谜"], tags: ["治愈"] });

    for (const item of snap.gameplay.slice(0, 3)) {
      const res = await app.inject({ method: "GET", url: item.imageUrl! });
      expect(res.statusCode).toBe(200);
      expect(Buffer.from(res.rawPayload).equals(TINY_PNG)).toBe(true);
    }
    expect((await app.inject({ method: "GET", url: `/api/share/${shareId}/gameplay/${ids[3]}` })).statusCode).toBe(404);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(readFileSync(sessionFile, "utf8")).toBe(before);
    expect(image.calls).toBe(calls);
    await app.close();
  });

  it("没有关联会话的旧快照照常打开，不带媒体字段", async () => {
    const { app } = setup();
    const created = (await app.inject({
      method: "POST",
      url: "/api/share",
      payload: { markdown: "# 旧快照\n\n> 一句话 Pitch：只有文字" },
    })).json() as { id: string };
    const snap = (await app.inject({ method: "GET", url: `/api/share/${created.id}` })).json() as Record<string, unknown>;
    expect(snap.markdown).toContain("旧快照");
    expect(snap.gameplay).toBeUndefined();
    expect(snap.profile).toBeUndefined();
    await app.close();
  });
});
