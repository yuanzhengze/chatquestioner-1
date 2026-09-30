import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const { parseGddPreview, fullDocBody, coverSlot, recordCard, listViewportHeight, resolveCoverDownload, gameplayFileName } = createRequire(import.meta.url)("../utils/gddPreview.js") as {
  parseGddPreview: (md: string) => { title: string; pitch: string };
  fullDocBody: (md: string) => string;
  coverSlot: (meta: { status?: string; imageUrl?: string } | null) => string;
  recordCard: (item: { id?: string; title?: string }, state: Record<string, unknown> | null) => { coverPath: string; action: string; id: string };
  listViewportHeight: (contentPx: number, windowPx: number) => number;
  resolveCoverDownload: (sessionId: string, requestedPath: string, result: { tempFilePath?: string } | null) => { localPath: string };
  gameplayFileName: (sessionId: string, mechanicId: string, fingerprint: string) => string;
};

describe("文档入口卡片要的标题、亮点和封面状态", () => {
  it("从正文抽出标题和一句话，空占位不当成亮点", () => {
    const parsed = parseGddPreview("# 夜班便利店\n\n> 一句话 Pitch：客人全是过期的自己。\n");
    expect(parsed).toEqual({ title: "夜班便利店", pitch: "客人全是过期的自己。" });
    expect(parseGddPreview("# 未写\n\n> 一句话 Pitch：（未写）\n").pitch).toBe("");
  });

  it("完整文档展示去掉开头的名字和 Pitch，后文章节都留着", () => {
    const md = "# 夜班便利店\n\n> 一句话 Pitch：客人全是过期的自己。\n\n## 游戏宪法\n\n- 核心幻想：灯还亮着\n\n## 8. 难度与心流\n\n越到后面越安静\n";
    const body = fullDocBody(md);
    expect(body.startsWith("## 游戏宪法")).toBe(true);
    expect(body).toContain("## 8. 难度与心流");
    expect(body).toContain("越到后面越安静");
    expect(body).not.toContain("夜班便利店");
    expect(body).not.toContain("一句话 Pitch");
    expect(fullDocBody("# 只有名字\n\n> 一句话 Pitch：就这一句。\n")).toBe("");
    expect(fullDocBody("没有标题的正文")).toBe("没有标题的正文");
  });

  it("封面位只分四种，有图才算就绪", () => {
    expect(coverSlot({ status: "ready", imageUrl: "/api/session/a/cover" })).toBe("ready");
    expect(coverSlot({ status: "ready", imageUrl: "  " })).toBe("empty");
    expect(coverSlot({ status: "pending" })).toBe("pending");
    expect(coverSlot({ status: "failed" })).toBe("failed");
    expect(coverSlot({ status: "idle" })).toBe("empty");
    expect(coverSlot(null)).toBe("empty");
  });

  it("三条记录各自带自己的封面地址，没有文档则继续", () => {
    const md = (name: string) => `# ${name}\n\n> 一句话 Pitch：${name}。\n`;
    const a = recordCard({ id: "a" }, { gddMarkdown: md("甲"), gddView: { cover: { status: "ready", imageUrl: "/api/session/a/cover" } } });
    const b = recordCard({ id: "b" }, { gddMarkdown: md("乙"), gddView: { cover: { status: "ready", imageUrl: "/api/session/b/cover" } } });
    const c = recordCard({ id: "c", title: "还在聊" }, {});
    expect(a.coverPath).toBe("/api/session/a/cover");
    expect(b.coverPath).toBe("/api/session/b/cover");
    expect(a.coverPath).not.toBe(b.coverPath);
    expect(c.coverPath).toBe("");
    expect(a.action).toBe("view");
    expect(c.action).toBe("continue");
  });

  it("记录少时跟内容高度，多了停在窗口大约一半", () => {
    expect(listViewportHeight(180, 800)).toBe(180);
    expect(listViewportHeight(2000, 800)).toBe(416);
  });

  it("玩法图缓存按会话、机制和生成修订分开，同一修订可复用", () => {
    const a = gameplayFileName("sess-a", "mech1", "1710000000000");
    const b = gameplayFileName("sess-b", "mech1", "1710000000000");
    const c = gameplayFileName("sess-a", "mech2", "1710000000000");
    const again = gameplayFileName("sess-a", "mech1", "1710000000000");
    const regen = gameplayFileName("sess-a", "mech1", "1710000009999");
    expect(a).toBe(again);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(regen);
    expect(gameplayFileName("sess-a", "mech1", "")).toBe("");
  });

  it("列表下载不能把共用临时路径当成封面 src", () => {
    const shared = "wxfile://tmp/cover.png";
    const a = resolveCoverDownload("a", "/usr/nb-cover-a.png", { tempFilePath: shared });
    const b = resolveCoverDownload("b", "/usr/nb-cover-b.png", { tempFilePath: shared });
    expect(a.localPath).toBe("/usr/nb-cover-a.png");
    expect(b.localPath).toBe("/usr/nb-cover-b.png");
    expect(a.localPath).not.toBe(shared);
  });
});
