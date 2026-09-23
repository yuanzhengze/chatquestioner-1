import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const { parseGddPreview, coverSlot } = createRequire(import.meta.url)("../utils/gddPreview.js") as {
  parseGddPreview: (md: string) => { title: string; pitch: string };
  coverSlot: (meta: { status?: string; imageUrl?: string } | null) => string;
};

describe("文档入口卡片要的标题、亮点和封面状态", () => {
  it("从正文抽出标题和一句话，空占位不当成亮点", () => {
    const parsed = parseGddPreview("# 夜班便利店\n\n> 一句话 Pitch：客人全是过期的自己。\n");
    expect(parsed).toEqual({ title: "夜班便利店", pitch: "客人全是过期的自己。" });
    expect(parseGddPreview("# 未写\n\n> 一句话 Pitch：（未写）\n").pitch).toBe("");
  });

  it("封面位只分四种，有图才算就绪", () => {
    expect(coverSlot({ status: "ready", imageUrl: "/api/session/a/cover" })).toBe("ready");
    expect(coverSlot({ status: "ready", imageUrl: "  " })).toBe("empty");
    expect(coverSlot({ status: "pending" })).toBe("pending");
    expect(coverSlot({ status: "failed" })).toBe("failed");
    expect(coverSlot({ status: "idle" })).toBe("empty");
    expect(coverSlot(null)).toBe("empty");
  });
});
