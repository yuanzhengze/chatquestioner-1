import { describe, it, expect } from "vitest";
import { gameDefFromJson } from "../src/loadSession.js";
import { bejeweled } from "@cq/orchestrator";

describe("gameDefFromJson", () => {
  it("合法 GameDef JSON → def 非空、无 error", () => {
    const r = gameDefFromJson(JSON.parse(JSON.stringify(bejeweled)));
    expect(r.error).toBeUndefined();
    expect(r.def?.input.use).toBe("input-swap");
  });

  it("缺字段/非法 → def=null + error", () => {
    const r = gameDefFromJson({ id: "x", board: { size: [8, 8], tiles: ["a"] }, systems: [{ use: "不存在模块" }] });
    expect(r.def).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
