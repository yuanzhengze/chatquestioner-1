import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { capsuleInset } = createRequire(import.meta.url)("../utils/capsule.js") as {
  capsuleInset: (
    win: { statusBarHeight?: number; windowWidth?: number } | null,
    menu: { top?: number; height?: number; left?: number } | null,
  ) => { top: number; height: number; right: number };
};

describe("首页品牌行避让胶囊", () => {
  it("按胶囊实际位置：从胶囊顶部开始，右侧让出胶囊到屏幕边", () => {
    expect(capsuleInset({ statusBarHeight: 47, windowWidth: 390 }, { top: 51, height: 32, left: 296 })).toEqual({
      top: 51,
      height: 32,
      right: 94,
    });
    expect(capsuleInset({ statusBarHeight: 20, windowWidth: 320 }, { top: 24, height: 32, left: 226 })).toEqual({
      top: 24,
      height: 32,
      right: 94,
    });
  });

  it("胶囊顶部比状态栏还高时以状态栏为准", () => {
    expect(capsuleInset({ statusBarHeight: 44, windowWidth: 375 }, { top: 40, height: 32, left: 281 }).top).toBe(44);
  });

  it("取不到胶囊时按状态栏推算，并保守让出右侧", () => {
    expect(capsuleInset({ statusBarHeight: 20, windowWidth: 375 }, null)).toEqual({ top: 24, height: 32, right: 96 });
    expect(capsuleInset(null, { top: 0, height: 0, left: 0 })).toEqual({ top: 4, height: 32, right: 96 });
  });
});
