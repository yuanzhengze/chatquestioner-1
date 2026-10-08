import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { resolveApiBase } = createRequire(import.meta.url)("../configBase.js") as {
  resolveApiBase: (input: {
    platform?: string;
    envVersion?: string;
    lanBase?: string;
    productionBase?: string;
    devtoolsBase?: string;
  }) => { base: string; where: string };
};

const devtools = "http://127.0.0.1:8420";
const lan = "http://192.0.2.10:8420";
const production = "https://api.example.com";

describe("API 根地址按运行环境选择", () => {
  it("开发者工具用 127.0.0.1，不用局域网地址", () => {
    expect(resolveApiBase({
      platform: "devtools",
      envVersion: "develop",
      lanBase: lan,
      productionBase: production,
    })).toEqual({ base: devtools, where: "devtools" });
  });

  it("真机开发版用局域网地址，空着时不猜成 127.0.0.1", () => {
    expect(resolveApiBase({
      platform: "ios",
      envVersion: "develop",
      lanBase: lan,
      productionBase: production,
    })).toEqual({ base: lan, where: "device" });
    expect(resolveApiBase({
      platform: "android",
      envVersion: "develop",
      lanBase: "  ",
      productionBase: production,
    })).toEqual({ base: "", where: "device" });
  });

  it("正式版和体验版只用正式地址", () => {
    expect(resolveApiBase({
      platform: "ios",
      envVersion: "release",
      lanBase: lan,
      productionBase: production,
    })).toEqual({ base: production, where: "production" });
    expect(resolveApiBase({
      platform: "devtools",
      envVersion: "trial",
      lanBase: lan,
      productionBase: production,
    })).toEqual({ base: production, where: "production" });
  });

  it("没有运行环境时按开发者工具，方便单测", () => {
    expect(resolveApiBase({ productionBase: production, lanBase: lan }).where).toBe("devtools");
  });
});
