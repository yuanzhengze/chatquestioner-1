import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildModuleIndex, gateByGenre } from "@cq/module-index";

describe("buildModuleIndex", () => {
  it("索引全量 manifest 且无构建错误", () => {
    const { index, errors } = buildModuleIndex();
    expect(errors).toEqual([]);
    expect(index.modules.length).toBe(18);
  });

  it("每条带可序列化的 JSON Schema", () => {
    const { index } = buildModuleIndex();
    const board = index.modules.find((m) => m.id === "board-grid");
    expect(board).toBeDefined();
    expect(board?.paramsSchema).toBeTypeOf("object");
    expect(() => JSON.stringify(index)).not.toThrow();
  });

  it("按 genre 门控只返回该 genre + 通用", () => {
    const { index } = buildModuleIndex();
    const gated = gateByGenre(index, "match3");
    expect(gated.every((m) => m.genre.includes("*") || m.genre.includes("match3"))).toBe(true);
    expect(gated.length).toBeLessThanOrEqual(index.modules.length);
    expect(gated.some((m) => m.id === "match-detect")).toBe(true);
  });

  it("捕获重复 id / 缺依赖 / 空 examples", () => {
    const bad = buildModuleIndex([
      { id: "x", kind: "system", genre: ["*"], batch: "首发", description: "", params: z.object({}), reads: [], writes: [], deps: ["ghost"], examples: [], schema_version: "0.1" },
      { id: "x", kind: "system", genre: ["*"], batch: "首发", description: "", params: z.object({}), reads: [], writes: [], deps: [], examples: ["g"], schema_version: "0.1" },
    ]);
    const kinds = bad.errors.map((e) => e.kind);
    expect(kinds).toContain("duplicate-id");
    expect(kinds).toContain("unmet-dep");
    expect(kinds).toContain("empty-examples");
  });
});
