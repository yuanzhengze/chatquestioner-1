import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  createInitialState,
  harvestIntoState,
  normalizeConversationState,
  scrubUngroundedState,
  toGddModel,
  type ConversationState,
} from "@cq/conversation";
import { gameplayMomentsFromModel, renderGdd } from "@cq/gdd";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const MP = resolve(__dirname, "..");
const clientView = createRequire(import.meta.url)("../utils/gddView.js") as {
  toGddView: (m: unknown) => { gameplayMoments: Array<{ id: string }> };
};

let app: any;
const log = { requests: [] as string[], downloads: [] as string[], storageWrites: [] as string[] };
const gen = { calls: 0 };
const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");

vi.stubGlobal("wx", {
  getDeviceInfo: () => ({ platform: "devtools" }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  setNavigationBarColor() {},
  setBackgroundColor() {},
  showShareMenu() {},
  hideShareMenu() {},
  showToast() {},
  getStorageSync: () => "",
  setStorageSync: (k: string) => { log.storageWrites.push(k); },
  removeStorageSync: (k: string) => { log.storageWrites.push(k); },
  env: { USER_DATA_PATH: "wxfile://usr" },
  getFileSystemManager: () => ({ accessSync() { throw new Error("none"); } }),
  request: (r: any) => {
    const method = r.method || "GET";
    log.requests.push(`${method} ${path(r.url)}`);
    app.inject({ method, url: path(r.url), payload: method === "GET" ? undefined : r.data || {} }).then((res: any) => {
      r.success && r.success({ statusCode: res.statusCode, data: JSON.parse(res.body) });
    });
  },
  downloadFile: (r: any) => {
    log.downloads.push(path(r.url));
    app.inject({ method: "GET", url: path(r.url) }).then((res: any) => {
      r.success && r.success({ statusCode: res.statusCode, filePath: r.filePath, tempFilePath: res.statusCode === 200 ? "wxfile://tmp/cover.png" : undefined });
    });
  },
});
let pageDef: any;
vi.stubGlobal("Page", (def: any) => { pageDef = def; });

function instance(def: any) {
  const page: any = { ...def, data: JSON.parse(JSON.stringify(def.data)) };
  page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
  return page;
}

async function flush() {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 5));
}

let dir = "";
let sessionId = "";
let shareId = "";
let sessionFile = "";
let ids: string[] = [];

beforeAll(async () => {
  const { buildServer } = await import("../../server/src/server.ts");
  const { FileSessionStore } = await import("../../server/src/sessionStore.ts");
  const { fakeLlm } = await import("../../server/test/fixtures/fakeLlm.ts");
  await import("../pages/gdd/index.ts");

  dir = mkdtempSync(join(tmpdir(), "cq-example-gp-"));
  const store = new FileSessionStore(dir);
  app = buildServer({
    llm: fakeLlm([]),
    store,
    systemPrompt: "SYS",
    shareDir: dir,
    gameplayDir: join(dir, "gameplay"),
    imageConcurrency: 1,
    image: { async generate() { gen.calls += 1; return { bytes: TINY_PNG, mime: "image/png" as const }; } },
  });

  sessionId = (await app.inject({ method: "POST", url: "/api/session" })).json().id;
  const s = createInitialState();
  s.guidance = "accepted";
  s.world = "发条匣";
  s.aesthetic = "黄铜机械";
  s.playerIdentity = "学徒";
  s.mechanics = ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。", "订单展示：盖章贴进展示页。"];
  await store.save(sessionId, s);
  await app.inject({ method: "POST", url: `/api/session/${sessionId}/gameplay` });
  for (let i = 0; i < 100; i++) {
    const body = (await app.inject({ method: "GET", url: `/api/session/${sessionId}/gameplay` })).json();
    if (body.items.every((item: { status: string }) => item.status === "ready")) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const state = (await store.load(sessionId))!;
  state.mechanics = [s.mechanics[0], "整理桌面：按颜色把材料分进小碟。", s.mechanics[2], "连击奖励：三连以上额外得分。"];
  await store.save(sessionId, state);
  await app.inject({ method: "GET", url: `/api/session/${sessionId}/gameplay` });

  const latest = normalizeConversationState(structuredClone((await store.load(sessionId)) as ConversationState));
  harvestIntoState(latest);
  scrubUngroundedState(latest);
  const model = toGddModel(latest);
  ids = gameplayMomentsFromModel(model).map((moment) => moment.id);
  shareId = (await app.inject({
    method: "POST",
    url: "/api/share",
    payload: { markdown: renderGdd(model), title: "发条匣", model, complete: false, sessionId },
  })).json().id;
  sessionFile = join(dir, "sessions", `${sessionId}.json`);
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("首页示例 → 只读游戏文档的关键瞬间图", () => {
  it("源会话已有的图（ready 与过期但文件在）都显示，缺图的只留文字；只读、不生图、不写会话和本机记录", async () => {
    const before = readFileSync(sessionFile, "utf8");
    const calls = gen.calls;
    log.requests.length = 0;
    log.downloads.length = 0;
    log.storageWrites.length = 0;

    const page = instance(pageDef);
    page.onLoad({ s: shareId, ex: "1" });
    page.onShow();
    await flush();

    const moments = page.data.gameplayMoments as Array<{ id: string; imageStatus: string; localUrl: string; remoteUrl: string }>;
    expect(moments.map((m) => m.id)).toEqual(ids);
    expect(moments.map((m) => m.imageStatus)).toEqual(["ready", "stale", "ready", "idle"]);
    for (const m of moments.slice(0, 3)) {
      expect(m.remoteUrl.startsWith(`/api/share/${shareId}/gameplay/${m.id}`)).toBe(true);
      expect(m.localUrl).toContain(`nb-gp-share-${shareId}-${m.id}-`);
    }
    expect(moments[3].localUrl).toBe("");

    expect(log.requests).toEqual([`GET /api/share/${shareId}`]);
    expect(log.downloads.every((url) => url.startsWith(`/api/share/${shareId}/`))).toBe(true);
    expect(log.downloads.filter((url) => url.includes("/gameplay/"))).toHaveLength(3);
    await new Promise((r) => setTimeout(r, 30));
    expect(gen.calls).toBe(calls);
    expect(readFileSync(sessionFile, "utf8")).toBe(before);
    expect(log.storageWrites).toEqual([]);
    page.onUnload();
  });

  it("没有 mechanicIds 时，小程序按文本算出的关键瞬间 id 与服务端一致", async () => {
    const snap = (await app.inject({ method: "GET", url: `/api/share/${shareId}` })).json();
    expect(snap.model.mechanicIds).toBeUndefined();
    expect(clientView.toGddView(snap.model).gameplayMoments.map((m) => m.id)).toEqual(ids);
    expect(snap.gameplay.map((item: { mechanicId: string }) => item.mechanicId)).toEqual(ids);
  });

  it("只读模式只隐藏作者状态和操作，图片本身照常显示", () => {
    const wxml = readFileSync(join(MP, "pages/gdd/index.wxml"), "utf8");
    for (const label of ["等待生成", "正在生成玩法画面", "没画出来", "已过期", "重新生成</view>"]) {
      const line = wxml.split("\n").find((l) => l.includes(label)) || "";
      const block = wxml.slice(Math.max(0, wxml.indexOf(label) - 300), wxml.indexOf(label));
      expect(line.includes("!fromShare") || block.lastIndexOf("!fromShare") > block.lastIndexOf("<view")).toBe(true);
    }
    const photo = wxml.slice(wxml.indexOf('class="moment-photo"') - 200, wxml.indexOf('class="moment-photo"'));
    expect(photo).toContain("item.imageStatus === 'stale'");
    expect(photo).not.toContain("fromShare");
  });
});
