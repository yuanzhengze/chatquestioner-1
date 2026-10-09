import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const copy = createRequire(import.meta.url)("../utils/brandCopy.js") as {
  SLOGAN: string;
  SLOGAN_LINES: string[];
};

describe("首页主句", () => {
  it("首页固定三行，拼起来就是关于页用的那一句", () => {
    expect(copy.SLOGAN_LINES).toEqual(["把一句脑洞，", "聊成一份", "能做的游戏"]);
    expect(copy.SLOGAN_LINES.join("")).toBe(copy.SLOGAN);
    expect(copy.SLOGAN).toBe("把一句脑洞，聊成一份能做的游戏");
  });
});
