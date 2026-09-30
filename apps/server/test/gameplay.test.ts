import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { GameplayStore } from "../src/gameplayStore.js";
import { createInitialState, type ConversationState } from "@cq/conversation";
import { gameplayMomentsFromModel } from "@cq/gdd";
import { toGddModel } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import type { ImageGenerator } from "../src/imageClient.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let dir: string;

function momentsOf(state: ConversationState) {
  return gameplayMomentsFromModel(toGddModel(state));
}

function seed(store: FileSessionStore, id: string, mechanics: string[], aesthetic = "黄铜机械") {
  const s = createInitialState();
  s.guidance = "accepted";
  s.world = "发条匣";
  s.aesthetic = aesthetic;
  s.playerIdentity = "学徒";
  s.mechanics = mechanics;
  return store.save(id, s);
}

function gatedImage() {
  const gates: Array<(value: void) => void> = [];
  const g = {
    calls: 0,
    failOn: new Set<number>(),
    hold: true,
    async generate() {
      g.calls += 1;
      const n = g.calls;
      if (g.hold) {
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
      }
      if (g.failOn.has(n)) throw new Error("boom");
      return { bytes: TINY_PNG, mime: "image/png" as const };
    },
    releaseNext() {
      const resolve = gates.shift();
      if (!resolve) throw new Error("nothing to release");
      resolve();
    },
  };
  return g;
}

async function until(
  read: () => Promise<{ status?: string }[]>,
  pred: (items: { status?: string }[]) => boolean,
) {
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    const items = await read();
    if (pred(items)) return items;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("gameplay did not settle");
}

describe("gameplay images", () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-gp-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("逐张生成，失败不影响后面的，重复点击不重复请求", async () => {
    const store = new FileSessionStore(dir);
    const image = gatedImage();
    image.failOn.add(2);
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      shareDir: dir,
      gameplayDir: join(dir, "gameplay"),
      imageConcurrency: 1,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    const mechanics = [
      "相邻交换：拖动零件与旁边交换，一组后消除。",
      "特殊消除：特定排列改写棋盘。",
      "连锁结算：一次消除带出下一组。",
    ];
    await seed(store, created.id, mechanics);
    const again = app.inject({ method: "POST", url: `/api/session/${created.id}/gameplay` });
    await app.inject({ method: "POST", url: `/api/session/${created.id}/gameplay` });
    await again;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(image.calls).toBe(1);
    const mid = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
      items: Array<{ status: string }>;
    };
    expect(mid.items.map((item) => item.status)).toEqual(["pending", "queued", "queued"]);
    image.releaseNext();
    await until(async () => {
      const body = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
        items: Array<{ status: string }>;
      };
      return body.items;
    }, (items) => items[1]?.status === "pending");
    image.releaseNext();
    await until(async () => {
      const body = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
        items: Array<{ status: string }>;
      };
      return body.items;
    }, (items) => items[2]?.status === "pending");
    image.releaseNext();
    const done = await until(async () => {
      const body = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
        items: Array<{ status: string; imageUrl?: string }>;
      };
      return body.items;
    }, (items) => items.every((item) => item.status === "ready" || item.status === "failed"));
    expect(done.map((item) => item.status)).toEqual(["ready", "failed", "ready"]);
    expect(done[0].imageUrl).toContain(created.id);
    expect(done[1].imageUrl).toBeUndefined();
    expect(image.calls).toBe(3);
  });

  it("两个会话、两条机制的文件互不覆盖，换序后仍跟着机制走", async () => {
    const store = new FileSessionStore(dir);
    const image: ImageGenerator & { calls: number } = {
      calls: 0,
      async generate() {
        image.calls += 1;
        return { bytes: TINY_PNG, mime: "image/png" };
      },
    };
    const gameplayDir = join(dir, "gameplay");
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      shareDir: dir,
      gameplayDir,
      image,
    });
    const a = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    const b = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    const mechanics = ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。"];
    await seed(store, a.id, mechanics);
    await seed(store, b.id, mechanics, "水彩");
    await app.inject({ method: "POST", url: `/api/session/${a.id}/gameplay` });
    await app.inject({ method: "POST", url: `/api/session/${b.id}/gameplay` });
    const files = new GameplayStore(gameplayDir);
    const stateA = await store.load(a.id);
    const ids = momentsOf(stateA!).map((item) => item.id);
    expect(files.has(a.id, ids[0])).toBe(true);
    expect(files.has(a.id, ids[1])).toBe(true);
    expect(files.has(b.id, ids[0])).toBe(true);
    expect(files.pathFor(a.id, ids[0])).not.toBe(files.pathFor(b.id, ids[0]));
    const before = (await app.inject({ method: "GET", url: `/api/session/${a.id}/gameplay` })).json() as {
      items: Array<{ mechanicId: string; status: string }>;
    };
    const saved = await store.load(a.id);
    saved!.mechanics = [mechanics[1], mechanics[0]];
    await store.save(a.id, saved!);
    const after = (await app.inject({ method: "GET", url: `/api/session/${a.id}/gameplay` })).json() as {
      items: Array<{ mechanicId: string; status: string }>;
    };
    expect(after.items.map((item) => item.mechanicId)).toEqual([before.items[1].mechanicId, before.items[0].mechanicId]);
    expect(after.items.every((item) => item.status === "ready")).toBe(true);
  });

  it("改一条机制只让对应图过期，改视觉设定则全部过期，重开仍在", async () => {
    const store = new FileSessionStore(dir);
    const image: ImageGenerator = {
      async generate() {
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
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    const mechanics = ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。"];
    await seed(store, created.id, mechanics);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/gameplay` });
    const saved = await store.load(created.id);
    saved!.mechanics = ["点选摆珠：改成拖拽摆放。", mechanics[1]];
    await store.save(created.id, saved!);
    const edited = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
      items: Array<{ status: string; imageUrl?: string }>;
    };
    expect(edited.items.map((item) => item.status)).toEqual(["stale", "ready"]);
    expect(edited.items[0].imageUrl).toBeTruthy();
    const restyle = await store.load(created.id);
    restyle!.aesthetic = "像素冷色";
    await store.save(created.id, restyle!);
    const restyled = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
      items: Array<{ status: string; imageUrl?: string }>;
    };
    expect(restyled.items.map((item) => item.status)).toEqual(["stale", "stale"]);
    expect(restyled.items.every((item) => item.imageUrl)).toBe(true);
    const reopened = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
      items: Array<{ status: string }>;
    };
    expect(reopened.items.map((item) => item.status)).toEqual(["stale", "stale"]);
  });

  it("单张重新生成只打这一张", async () => {
    const store = new FileSessionStore(dir);
    const image = gatedImage();
    image.hold = false;
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      shareDir: dir,
      gameplayDir: join(dir, "gameplay"),
      imageConcurrency: 1,
      image,
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    await seed(store, created.id, ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。"]);
    await app.inject({ method: "POST", url: `/api/session/${created.id}/gameplay` });
    expect(image.calls).toBe(2);
    const listed = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
      items: Array<{ mechanicId: string }>;
    };
    image.hold = true;
    const regen = app.inject({
      method: "POST",
      url: `/api/session/${created.id}/gameplay/${listed.items[0].mechanicId}`,
    });
    await app.inject({
      method: "POST",
      url: `/api/session/${created.id}/gameplay/${listed.items[0].mechanicId}`,
    });
    await regen;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(image.calls).toBe(3);
    image.releaseNext();
    await until(async () => {
      const body = (await app.inject({ method: "GET", url: `/api/session/${created.id}/gameplay` })).json() as {
        items: Array<{ status: string }>;
      };
      return body.items;
    }, (items) => items[0]?.status === "ready" && items[1]?.status === "ready");
  });

  it("B 的封面优先于 A 还没开始的玩法图，而且 B 不会被 A 锁死", async () => {
    const store = new FileSessionStore(dir);
    const started: string[] = [];
    const gates: Array<() => void> = [];
    const image: ImageGenerator = {
      async generate(prompt: string) {
        started.push(prompt.includes("游戏封面插画") ? "cover" : "gameplay");
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
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
    const a = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    const b = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    await seed(store, a.id, ["点选摆珠：先选颜色再点空位。", "整理桌面：先把材料摆齐。", "连击奖励：三连以上额外得分。"]);
    await seed(store, b.id, ["漂移入弯：车尾向外滑。"], "霓虹");
    await app.inject({ method: "POST", url: `/api/session/${a.id}/gameplay` });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const aMid = (await app.inject({ method: "GET", url: `/api/session/${a.id}/gameplay` })).json() as {
      items: Array<{ status: string }>;
    };
    expect(aMid.items.map((item) => item.status)).toEqual(["pending", "queued", "queued"]);
    await app.inject({ method: "POST", url: `/api/session/${b.id}/cover` });
    await app.inject({ method: "POST", url: `/api/session/${b.id}/gameplay` });
    const bQueued = (await app.inject({ method: "GET", url: `/api/session/${b.id}/gameplay` })).json() as {
      items: Array<{ status: string }>;
    };
    expect(bQueued.items[0].status).toBe("queued");
    expect(started).toEqual(["gameplay"]);
    gates.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started[1]).toBe("cover");
    const t0 = Date.now();
    let aDone: Array<{ status: string }> = [];
    let bDone = false;
    while (Date.now() - t0 < 1500 && (!bDone || aDone.length < 3 || aDone.some((item) => item.status !== "ready"))) {
      while (gates.length) gates.shift()?.();
      const bBody = (await app.inject({ method: "GET", url: `/api/session/${b.id}/gameplay` })).json() as {
        items: Array<{ status: string }>;
      };
      const aBody = (await app.inject({ method: "GET", url: `/api/session/${a.id}/gameplay` })).json() as {
        items: Array<{ status: string }>;
      };
      bDone = bBody.items[0]?.status === "ready";
      aDone = aBody.items;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(bDone).toBe(true);
    expect(aDone.map((item) => item.status)).toEqual(["ready", "ready", "ready"]);
  });
});
