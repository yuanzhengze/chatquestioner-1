import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-sess-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("FileSessionStore", () => {
  it("create 返回 id，load 取回同一状态", async () => {
    const store = new FileSessionStore(dir);
    const s = createInitialState();
    s.spark = "猫咪连连看";
    const id = await store.create(s);
    expect(id).toMatch(/[0-9a-f-]{36}/);
    const loaded = await store.load(id);
    expect(loaded?.spark).toBe("猫咪连连看");
  });

  it("load 未知 id 返回 null", async () => {
    const store = new FileSessionStore(dir);
    expect(await store.load("nope")).toBeNull();
  });

  it("save 覆盖后 load 反映更新", async () => {
    const store = new FileSessionStore(dir);
    const id = await store.create(createInitialState());
    const s = (await store.load(id))!;
    s.stage = 3;
    await store.save(id, s);
    expect((await store.load(id))!.stage).toBe(3);
  });
});
