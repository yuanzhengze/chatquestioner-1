import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

type Card = { id: string; shareId: string; title: string; pitch: string; coverRemote: string; cover: string; tall: boolean };

const showcase = createRequire(import.meta.url)("../utils/exampleShowcase.js") as {
  EXAMPLE_SOURCE: Array<{ id: string; shareId: string }>;
  exampleCard: (source: { id: string; shareId: string }, snap: unknown) => Card | null;
  exampleColumns: (cards: Card[]) => Array<{ key: string; items: Card[] }>;
  examplePath: (shareId: string) => string;
};

const source = { id: "demo", shareId: "abc-123" };

describe("首页示例成果", () => {
  it("映射表只记示例 id 和分享快照 id", () => {
    expect(showcase.EXAMPLE_SOURCE.length).toBeGreaterThan(0);
    for (const item of showcase.EXAMPLE_SOURCE) {
      expect(Object.keys(item).sort()).toEqual(["id", "shareId"]);
      expect(item.shareId).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(new Set(showcase.EXAMPLE_SOURCE.map((item) => item.id)).size).toBe(showcase.EXAMPLE_SOURCE.length);
  });

  it("游戏名、一句话、封面都从快照读，模型优先", () => {
    const card = showcase.exampleCard(source, {
      markdown: "# 文档里的名字\n\n> 一句话 Pitch：文档里的一句话",
      model: { title: "模型里的名字", pitch: "模型里的一句话" },
      coverImageUrl: "/api/share/abc-123/cover",
    });
    expect(card).toMatchObject({
      id: "demo",
      shareId: "abc-123",
      title: "模型里的名字",
      pitch: "模型里的一句话",
      coverRemote: "/api/share/abc-123/cover",
      cover: "",
    });
  });

  it("旧快照没有模型时回落到文档标题和 Pitch 行", () => {
    const card = showcase.exampleCard(source, { markdown: "# 夜航\n\n> 一句话 Pitch：在夜里开船" });
    expect(card && card.title).toBe("夜航");
    expect(card && card.pitch).toBe("在夜里开船");
    expect(card && card.coverRemote).toBe("");
  });

  it("没有正文的快照不展示", () => {
    expect(showcase.exampleCard(source, { markdown: "  " })).toBeNull();
    expect(showcase.exampleCard(source, null)).toBeNull();
  });

  it("双列左右交替，同一行一高一方、下一行对调", () => {
    const cards = Array.from({ length: 5 }, (_, i) => showcase.exampleCard({ id: `e${i}`, shareId: `s${i}` }, { markdown: `# 游戏${i}` }) as Card);
    const cols = showcase.exampleColumns(cards);
    expect(cols.map((c) => c.key)).toEqual(["left", "right"]);
    const [left, right] = cols.map((c) => c.items);
    expect(left.map((c) => c.id)).toEqual(["e0", "e2", "e4"]);
    expect(right.map((c) => c.id)).toEqual(["e1", "e3"]);
    expect(left.map((c) => c.tall)).toEqual([true, false, true]);
    expect(right.map((c) => c.tall)).toEqual([false, true]);
  });

  it("点开走只读分享预览，并标记为示例", () => {
    expect(showcase.examplePath("abc-123")).toBe("/pages/gdd/index?s=abc-123&ex=1");
  });
});
