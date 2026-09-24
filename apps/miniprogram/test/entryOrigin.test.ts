import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const { backTarget } = createRequire(import.meta.url)("../utils/bridge.js") as {
  backTarget: (origin: string) => string;
};

describe("共创返回按进入来源", () => {
  it("从我的进来回我的，其余回首页", () => {
    expect(backTarget("mine")).toBe("/pages/mine/index");
    expect(backTarget("home")).toBe("/pages/home/index");
    expect(backTarget("")).toBe("/pages/home/index");
  });
});
