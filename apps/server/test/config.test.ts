import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("解析必需 env，模型/根目录/端口有默认值", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1", LLM_API_KEY: "sk-x" });
    expect(cfg.LLM_MODEL).toBe("gemini-3.1-pro");
    expect(cfg.FORGEAX_ROOT).toBe("../forgeax-studio");
    expect(cfg.PORT).toBe(8420);
  });

  it("缺 LLM_API_KEY 直接抛（启动期快速失败）", () => {
    expect(() => loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1" })).toThrow();
  });

  it("PORT 字符串被强转为数字", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k", PORT: "9000" });
    expect(cfg.PORT).toBe(9000);
  });
});
