import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const KEY = "nb.sessionIndex";
const mem: Record<string, unknown> = {};

(globalThis as { wx?: { getStorageSync: (key: string) => unknown; setStorageSync: (key: string, value: unknown) => void } }).wx = {
  getStorageSync(key: string) {
    return mem[key];
  },
  setStorageSync(key: string, value: unknown) {
    mem[key] = JSON.parse(JSON.stringify(value));
  },
};

type Item = {
  id: string;
  title?: string;
  updatedAt?: number;
  contentUpdatedAt?: number;
};

type IndexApi = {
  load: () => { currentId: string; items: Item[] };
  upsert: (entry: {
    id: string;
    title?: string;
    contentUpdatedAt?: number;
    lastOptions?: unknown[];
    readyForSynthesis?: boolean;
  }) => { items: Item[] };
  setCurrent: (id: string) => { currentId: string; items: Item[] };
  current: () => Item | null;
};

const sessionIndex = createRequire(import.meta.url)("../utils/sessionIndex.js") as IndexApi;

function seed(items: Item[]) {
  mem[KEY] = { currentId: "", items };
}

function ids(): string[] {
  return sessionIndex.load().items.map((it) => it.id);
}

function item(id: string): Item {
  const found = sessionIndex.load().items.find((it) => it.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("历史索引按内容更新时间排序", () => {
  beforeEach(() => {
    delete mem[KEY];
  });

  it("旧记录没有内容时间时，沿用原来的 updatedAt，读取不写成现在", () => {
    seed([
      { id: "C", title: "丙", updatedAt: 100 },
      { id: "A", title: "甲", updatedAt: 300 },
      { id: "B", title: "乙", updatedAt: 200 },
    ]);
    const stored = JSON.parse(JSON.stringify(mem[KEY]));
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(mem[KEY]).toEqual(stored);
    expect(item("A").contentUpdatedAt).toBeUndefined();
    expect(item("C").updatedAt).toBe(100);
  });

  it("只打开、看文档、点修改后再看，都不改变顺序", () => {
    seed([
      { id: "A", title: "甲", updatedAt: 300 },
      { id: "B", title: "乙", updatedAt: 200 },
      { id: "C", title: "丙", updatedAt: 100 },
    ]);
    sessionIndex.upsert({ id: "C", title: "丙", lastOptions: [], readyForSynthesis: true });
    sessionIndex.setCurrent("C");
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(item("C").updatedAt).toBe(100);
    expect(item("C").contentUpdatedAt).toBeUndefined();
    expect(sessionIndex.current()?.id).toBe("C");
  });

  it("点修改后取消：内容时间没变，顺序也不变", () => {
    seed([
      { id: "A", title: "甲", updatedAt: 300, contentUpdatedAt: 300 },
      { id: "B", title: "乙", updatedAt: 200, contentUpdatedAt: 200 },
      { id: "C", title: "丙", updatedAt: 100, contentUpdatedAt: 100 },
    ]);
    sessionIndex.upsert({ id: "C", title: "丙", contentUpdatedAt: 100, lastOptions: [], readyForSynthesis: true });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(item("C").contentUpdatedAt).toBe(100);
  });

  it("文档补丁真正写上之后，这条排到最前", () => {
    seed([
      { id: "A", title: "甲", updatedAt: 300 },
      { id: "B", title: "乙", updatedAt: 200 },
      { id: "C", title: "丙", updatedAt: 100 },
    ]);
    sessionIndex.upsert({ id: "C", title: "丙", contentUpdatedAt: 1000, lastOptions: [], readyForSynthesis: true });
    expect(ids()).toEqual(["C", "A", "B"]);
    expect(item("C").contentUpdatedAt).toBe(1000);
  });

  it("继续共创产生新内容后，被改的那条排到最前", () => {
    seed([
      { id: "A", title: "甲", updatedAt: 300, contentUpdatedAt: 300 },
      { id: "B", title: "乙", updatedAt: 200, contentUpdatedAt: 200 },
      { id: "C", title: "丙", updatedAt: 1000, contentUpdatedAt: 1000 },
    ]);
    sessionIndex.upsert({ id: "B", title: "乙", contentUpdatedAt: 2000, lastOptions: [], readyForSynthesis: true });
    expect(ids()).toEqual(["B", "C", "A"]);
  });

  it("相同的内容时间再写一次，不会因为后写就排到前面", () => {
    seed([
      { id: "A", title: "甲", updatedAt: 300, contentUpdatedAt: 300 },
      { id: "C", title: "丙", updatedAt: 100, contentUpdatedAt: 100 },
    ]);
    sessionIndex.upsert({ id: "C", title: "封面好了", contentUpdatedAt: 100, lastOptions: [], readyForSynthesis: true });
    expect(ids()).toEqual(["A", "C"]);
    expect(item("C").title).toBe("封面好了");
    expect(item("C").contentUpdatedAt).toBe(100);
  });

  it("更早的内容时间不能把已经更近的记录压下去", () => {
    seed([
      { id: "B", title: "乙", updatedAt: 2000, contentUpdatedAt: 2000 },
      { id: "A", title: "甲", updatedAt: 300 },
    ]);
    sessionIndex.upsert({ id: "A", title: "甲", contentUpdatedAt: 50, lastOptions: [], readyForSynthesis: false });
    expect(ids()).toEqual(["B", "A"]);
    expect(item("A").contentUpdatedAt).toBeUndefined();
    expect(item("A").updatedAt).toBe(300);
  });

  it("重新读取仍按内容时间排，不靠数组里临时的位置", () => {
    seed([
      { id: "C", title: "丙", updatedAt: 100 },
      { id: "B", title: "乙", updatedAt: 2000, contentUpdatedAt: 2000 },
      { id: "A", title: "甲", updatedAt: 300 },
    ]);
    const fromMine = sessionIndex.load().items.map((it) => it.id);
    const fromStage = sessionIndex.load().items.map((it) => it.id);
    expect(fromMine).toEqual(["B", "A", "C"]);
    expect(fromStage).toEqual(fromMine);
  });
});
