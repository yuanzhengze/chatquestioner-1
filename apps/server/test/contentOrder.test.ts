import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState, type ConversationState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import type { ImageGenerator } from "../src/imageClient.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const STAMP = 1_700_000_000_000;

let dir: string;

function image(): ImageGenerator {
  return {
    async generate() {
      return { bytes: TINY_PNG, mime: "image/png" as const };
    },
  };
}

function seed(store: FileSessionStore, id: string) {
  const s = createInitialState();
  s.guidance = "accepted";
  s.spark = "九龙城寨开火焦虑";
  s.coreEmotion = "开火焦虑";
  s.coreAction = "贴墙潜行";
  s.aesthetic = "潮湿霓虹";
  s.reward = "废弃冰室补给";
  s.failRule = "被抓惨死回冰室";
  s.interaction = { verb: "潜行", target: "城寨巷", chain: "搜刮 → 潜行 → 开枪逃跑", feedback: "警报" };
  s.loop = { thirtySec: "搜刮", fiveMin: "潜行一局", thirtyMin: "再来一把" };
  s.mechanics = ["潜行：贴墙听声，警报响了就钻进冰室。"];
  s.contentUpdatedAt = STAMP;
  s.history = [
    {
      role: "assistant",
      content: "> 📌 **暂定游戏名**：《城寨幽鸣》\n> 📌 **一句话亮点**：开火即逃亡。\n> 📌 **核心循环**：搜刮 ➔ 潜行 ➔ 开枪逃跑",
    },
    { role: "user", content: "确认当前的总结完美契合心中构想，直接生成最终的设计文档。" },
  ];
  return store.save(id, s);
}

async function until(read: () => Promise<ConversationState | null>, pred: (state: ConversationState) => boolean) {
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const state = await read();
    if (state && pred(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("session did not settle");
}

describe("派生任务不改历史排序时间", () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-order-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("封面、玩法图、游戏类型和点开修改都不改 contentUpdatedAt", async () => {
    const store = new FileSessionStore(dir);
    const app = buildServer({
      llm: fakeLlm([]),
      store,
      systemPrompt: "SYS",
      exportDir: join(dir, "exports"),
      shareDir: dir,
      image: image(),
    });
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json() as { id: string };
    try {
      await seed(store, created.id);

      const cover = await app.inject({ method: "POST", url: `/api/session/${created.id}/cover` });
      expect(cover.statusCode).toBe(200);
      await until(async () => store.load(created.id), (state) => state.cover?.status === "ready");

      const gameplay = await app.inject({ method: "POST", url: `/api/session/${created.id}/gameplay` });
      expect(gameplay.statusCode).toBe(200);
      await until(
        async () => store.load(created.id),
        (state) => Object.values(state.gameplayImages?.items || {}).some((item) => item.status === "ready"),
      );

      const opened = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
      expect(opened.statusCode).toBe(200);
      expect((opened.json() as { contentUpdatedAt?: number }).contentUpdatedAt).toBe(STAMP);
      await until(
        async () => store.load(created.id),
        (state) => state.gameClassification?.status === "ready" || state.gameClassification?.status === "failed",
      );

      const patch = await app.inject({
        method: "POST",
        url: `/api/session/${created.id}/patch`,
        payload: { lineId: "coreAction", lineText: "核心动作：贴墙潜行", sectionTitle: "怎么玩" },
      });
      expect(patch.statusCode).toBe(200);

      const saved = await store.load(created.id);
      expect(saved?.contentUpdatedAt).toBe(STAMP);
      expect(saved?.cover?.status).toBe("ready");
      expect(Object.values(saved?.gameplayImages?.items || {}).some((item) => item.status === "ready")).toBe(true);
      expect(saved?.gameClassification?.status === "ready" || saved?.gameClassification?.status === "failed").toBe(true);
      expect(saved?.optionPhase).toBe("patch");
    } finally {
      await app.close();
    }
  });
});
