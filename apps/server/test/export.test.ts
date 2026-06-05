import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildServer } from "../src/server.js";
import { createInitialState, type ConversationState, type LlmClient } from "@cq/conversation";
import type { SessionStore } from "../src/sessionStore.js";
import { fixtureCatalog } from "../../../packages/resolver/test/fixtures/catalog.fixture.js";

function memStore(initial: Record<string, ConversationState>): SessionStore {
  const map = new Map(Object.entries(initial));
  return {
    async create(s) { const id = "x"; map.set(id, s); return id; },
    async load(id) { return map.get(id) ?? null; },
    async save(id, s) { map.set(id, s); },
  };
}

function scriptedFill(json: string): LlmClient {
  return { async *stream() { yield json; } };
}

function throwingFill(): LlmClient {
  return { async *stream() { throw new Error("llm down"); } };
}

function fullDslState(genre: string): ConversationState {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.engineering.genre = genre;
  s.engineering.dimension = "2D";
  s.engineering.engine = "pixijs";
  s.engineering.platform = ["PC"];
  return s;
}

const goodFill = JSON.stringify({
  tiles: ["猫爪", "毛线", "铃铛"], size: [8, 8], goal: { kind: "score", target: 5000 },
});

describe("POST /api/session/:id/export · S1", () => {
  let exportDir: string;
  beforeEach(() => { exportDir = mkdtempSync(resolve(tmpdir(), "cq-export-")); });

  it("match-3 session → 产出 gamedef.json 且响应含 gamedef", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s1: fullDslState("match-3") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s1/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gamedef).not.toBeNull();
    expect(body.diagnostics).toEqual([]);
    expect(existsSync(resolve(exportDir, "s1", "gamedef.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(resolve(exportDir, "s1", "gamedef.json"), "utf8"));
    expect(onDisk.input.use).toBe("input-swap");
    await app.close();
  });

  it("非 match-3 session → gamedef=null + unsupported-genre，但 gdd/dsl 仍导出", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s2: fullDslState("tower-defense") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s2/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gamedef).toBeNull();
    expect(body.diagnostics[0].kind).toBe("unsupported-genre");
    expect(body.dsl).toBeTruthy();
    expect(existsSync(resolve(exportDir, "s2", "gamedef.json"))).toBe(false);
    await app.close();
  });

  it("GET /api/session/:id/gamedef 取回已导出的 def", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s3: fullDslState("match-3") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    await app.inject({ method: "POST", url: "/api/session/s3/export" });
    const res = await app.inject({ method: "GET", url: "/api/session/s3/gamedef" });
    expect(res.statusCode).toBe(200);
    expect(res.json().input.use).toBe("input-swap");
    await app.close();
  });

  it("LLM 抛错 → 降级为 fill-parse-error 诊断，export 仍 200 且 bundle 已写", async () => {
    const app = buildServer({
      llm: throwingFill(),
      store: memStore({ s4: fullDslState("match-3") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s4/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gamedef).toBeNull();
    expect(body.diagnostics[0].kind).toBe("fill-parse-error");
    expect(body.dsl).toBeTruthy();
    expect(existsSync(resolve(exportDir, "s4", "gdd.md"))).toBe(true);
    expect(existsSync(resolve(exportDir, "s4", "gamedef.json"))).toBe(false);
    await app.close();
  });

  it("非法 session id → 400", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({}),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const get = await app.inject({ method: "GET", url: "/api/session/bad%2Fid/gamedef" });
    expect(get.statusCode).toBe(400);
    const post = await app.inject({ method: "POST", url: "/api/session/bad%2Fid/export" });
    expect(post.statusCode).toBe(400);
    await app.close();
  });
});
