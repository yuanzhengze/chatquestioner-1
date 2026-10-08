import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const copy = createRequire(import.meta.url)("../utils/brandCopy.js") as {
  SLOGAN: string;
  SLOGAN_LINE_1: string;
  SLOGAN_LINE_2: string;
  SLOGAN_HIGHLIGHT: string;
};

describe("首页主句", () => {
  it("首页两行拼起来就是关于页用的那一句", () => {
    expect(copy.SLOGAN_LINE_1 + copy.SLOGAN_LINE_2 + copy.SLOGAN_HIGHLIGHT).toBe(copy.SLOGAN);
    expect(copy.SLOGAN).toBe("把一句脑洞，聊成一份能做的游戏");
  });
});
