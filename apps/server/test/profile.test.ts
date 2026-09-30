import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState } from "@cq/conversation";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { fakeLlm } from "./fixtures/fakeLlm.js";

let dir: string;

function seed(store: FileSessionStore, id: string) {
  const state = createInitialState();
  state.guidance = "accepted";
  state.history = [
    { role: "user", content: "生成设计文档" },
    { role: "assistant", content: "📌 概念总结\n就按这个。" },
  ];
  state.summaryEligibleFrom = 0;
  state.workingTitle = "影子谜城";
  state.pitch = "和影子一起解谜";
  state.coreAction = "切换真人和影子解谜";
  state.mechanics = ["观察机关，和影子配合打开路"];
  state.constitutionFields.contentBoundary = "不做恐怖惊吓";
  state.world = "空城";
  return store.save(id, state);
}

describe("profile classification", () => {
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("GET 不等模型，否定句里的恐怖会被校验去掉", async () => {
    dir = mkdtempSync(join(tmpdir(), "cq-profile-"));
    const store = new FileSessionStore(dir);
    const id = "profile-session";
    await seed(store, id);
    let calls = 0;
    const llm = {
      async *stream() {
        calls += 1;
        yield JSON.stringify({
          genres: [
            { tagId: 1667, evidence: "文中出现不恐怖", confidence: 0.92, fields: ["内容边界"] },
            { tagId: 1664, evidence: "玩家反复和影子一起解谜", confidence: 0.9, fields: ["核心机制"] },
          ],
          tags: [{ tagId: 1687, evidence: "影子穿过栏杆是反复操作", confidence: 0.8, fields: ["核心动作"] }],
        });
      },
    };
    const app = buildServer({ llm, store, systemPrompt: "SYS", exportDir: join(dir, "exports"), shareDir: dir });
    const started = Date.now();
    const got = await app.inject({ method: "GET", url: `/api/session/${id}` });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(got.statusCode).toBe(200);
    const first = got.json();
    expect(first.gddModel.title).toBe("影子谜城");
    const t0 = Date.now();
    let ready: { genres?: Array<{ label: string }>; tags?: Array<{ label: string }>; debug?: { filtered?: Array<{ label: string }> } } | undefined;
    while (Date.now() - t0 < 2000) {
      const state = await store.load(id);
      if (state?.gameClassification?.status === "ready") {
        ready = state.gameClassification;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(ready?.genres?.map((row) => row.label)).toEqual(["解谜"]);
    expect(ready?.genres?.map((row) => row.label)).not.toContain("恐怖");
    expect(ready?.debug?.filtered?.some((row) => row.label === "恐怖")).toBe(true);
    expect(calls).toBe(1);
    await app.close();
  });

  it("模型没给出类型时会再问一次，仍然没有也不贴休闲", async () => {
    dir = mkdtempSync(join(tmpdir(), "cq-profile-"));
    const store = new FileSessionStore(dir);
    const id = "profile-retry";
    await seed(store, id);
    const llm = fakeLlm(["{}", "{}"]);
    const app = buildServer({ llm, store, systemPrompt: "SYS", exportDir: join(dir, "exports"), shareDir: dir });
    const got = await app.inject({ method: "GET", url: `/api/session/${id}` });
    expect(got.statusCode).toBe(200);
    const t0 = Date.now();
    let status = "";
    let genres: string[] = [];
    while (Date.now() - t0 < 2000) {
      const state = await store.load(id);
      status = state?.gameClassification?.status || "";
      if (status === "ready" || status === "failed") {
        genres = (state?.gameClassification?.genres || []).map((row) => row.label);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(status).toBe("ready");
    expect(genres).toEqual([]);
    expect(genres).not.toContain("休闲");
    await app.close();
  });
});
