import { describe, it, expect } from "vitest";
import { charsForElapsed } from "../src/hooks/useTypewriter.js";

describe("charsForElapsed", () => {
  it("按速度推进字数，封顶为文本长度", () => {
    expect(charsForElapsed(0, 30, 10)).toBe(0);
    expect(charsForElapsed(90, 30, 10)).toBe(3);
    expect(charsForElapsed(99999, 30, 10)).toBe(10);
  });
  it("speed<=0 视为瞬时全显", () => {
    expect(charsForElapsed(0, 0, 5)).toBe(5);
  });
});
