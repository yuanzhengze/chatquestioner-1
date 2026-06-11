import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { PgSessionStore } from "@cq/store";
import { createTestRepo } from "../../../packages/store/src/testing.js";
import { createInitialState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import { fixtureCatalog } from "./fixtures/catalog.js";
import type { Repository } from "@cq/store";

let dir: string;
let repo: Repository;
let close: () => Promise<void>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cq-cards-"));
  ({ repo, close } = await createTestRepo());
});
afterEach(async () => {
  rmSync(dir, { recursive: true, force: true });
  await close();
});

function makeApp() {
  const store = new PgSessionStore(repo);
  return buildServer({
    llm: fakeLlm([]), store, catalog: fixtureCatalog(),
    systemPrompt: "SYS", profile: "workbench", exportDir: join(dir, "exports"), repo,
  });
}

function readyState() {
  const s = createInitialState();
  s.workingTitle = "三消糖果";
  s.pitch = "三消糖果消除小游戏";
  s.engineering = {
    dimension: "2D", engine: "pixijs", platform: ["mobile"],
    modalities: ["image"], genre: "match-3", mechanics: ["swap-match"],
    artStyle: "cartoon", intentTerms: ["消除"], signatureTerms: [],
  };
  return s;
}

describe("卡片 / 后台 API", () => {
  it("export 双写入库 → /api/artifacts 出卡片", async () => {
    const app = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await repo.createSessionWithId(created.id, readyState());

    const ex = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(ex.statusCode).toBe(200);
    expect(ex.json().artifactId).toBeTruthy();

    const cards = (await app.inject({ method: "GET", url: "/api/artifacts" })).json();
    expect(cards.length).toBe(1);
    expect(cards[0].card.title).toBe("三消糖果");

    const detail = await app.inject({ method: "GET", url: `/api/artifact/${cards[0].id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().gddMarkdown).toContain("三消糖果");

    await app.close();
  });

  it("/api/admin/sessions 列出会话", async () => {
    const app = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    await repo.createSessionWithId(created.id, readyState());

    const sessions = (await app.inject({ method: "GET", url: "/api/admin/sessions" })).json();
    expect(sessions.length).toBe(1);
    expect(sessions[0].workingTitle).toBe("三消糖果");

    const detail = await app.inject({ method: "GET", url: `/api/admin/session/${created.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().session.id).toBe(created.id);

    await app.close();
  });

  it("无 repo 时卡片 API → 503", async () => {
    // 不带 repo 构建（FileSessionStore 路径外，仅测 API 守卫）
    const { FileSessionStore } = await import("../src/sessionStore.js");
    const app = buildServer({
      llm: fakeLlm([]), store: new FileSessionStore(dir), catalog: fixtureCatalog(),
      systemPrompt: "SYS", profile: "workbench", exportDir: join(dir, "exports"),
    });
    const r = await app.inject({ method: "GET", url: "/api/artifacts" });
    expect(r.statusCode).toBe(503);
    await app.close();
  });
});
