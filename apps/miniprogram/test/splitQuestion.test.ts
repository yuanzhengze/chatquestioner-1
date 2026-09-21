import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const { hasQuestionMark, splitQuestion } = createRequire(import.meta.url)("../utils/splitQuestion.js") as {
  hasQuestionMark: (s: unknown) => boolean;
  splitQuestion: (md: unknown) => { lead: string; question: string; tail: string };
};

describe("splitQuestion", () => {
  it("认全角和半角问号", () => {
    expect(hasQuestionMark("要哪个？")).toBe(true);
    expect(hasQuestionMark("which one?")).toBe(true);
    expect(hasQuestionMark("就这样。")).toBe(false);
    expect(hasQuestionMark("")).toBe(false);
  });

  it("没有问号就不切", () => {
    expect(splitQuestion("这段没有问题。")).toEqual({ lead: "", question: "", tail: "" });
  });

  it("问句从上一个句末切开，铺垫留在前面", () => {
    const hit = splitQuestion("这个点子挺有画面。你更想守摊还是赶集？");
    expect(hit.lead).toBe("这个点子挺有画面。");
    expect(hit.question).toBe("你更想守摊还是赶集？");
    expect(hit.tail).toBe("");
  });

  it("问号后面还有话就归到收尾", () => {
    const hit = splitQuestion("先说一句。想往哪走？随便说说就行。");
    expect(hit.lead).toBe("先说一句。");
    expect(hit.question).toBe("想往哪走？");
    expect(hit.tail).toBe("随便说说就行。");
  });

  it("多个问号时切最后一句", () => {
    const hit = splitQuestion("要做吃的吗？还是做别的？");
    expect(hit.lead).toBe("要做吃的吗？");
    expect(hit.question).toBe("还是做别的？");
  });

  it("换行也算句末，问句上的加粗和引号符号被剥掉", () => {
    const hit = splitQuestion("铺垫一段。\n> **你更想守摊还是赶集？**");
    expect(hit.lead).toBe("铺垫一段。");
    expect(hit.question).toBe("你更想守摊还是赶集？");
    expect(hit.tail).toBe("");
  });

  it("整段就是一个问句时没有铺垫", () => {
    const hit = splitQuestion("想做个什么样的游戏？");
    expect(hit.lead).toBe("");
    expect(hit.question).toBe("想做个什么样的游戏？");
    expect(hit.tail).toBe("");
  });
});
