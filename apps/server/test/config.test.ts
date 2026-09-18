import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("解析必需 env，模型/端口有默认值", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1", LLM_API_KEY: "sk-x" });
    expect(cfg.LLM_MODEL).toBe("gpt-5.5");
    expect(cfg.PORT).toBe(8420);
    expect(cfg.IMAGE_MODEL).toBe("gpt-image-2");
    expect(cfg.IMAGE_SIZE).toBe("1024x1024");
    expect(cfg.IMAGE_BASE_URL).toBe("https://llm-proxy.forgeax.com/v1");
    expect(cfg.IMAGE_API_KEY).toBe("sk-x");
  });

  it("IMAGE_* 可单独覆盖，缺省跟 LLM 走同一代理", () => {
    const cfg = loadConfig({
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "sk-chat",
      IMAGE_BASE_URL: "https://img.example/v1",
      IMAGE_API_KEY: "sk-img",
      IMAGE_MODEL: "gpt-image-1",
    });
    expect(cfg.IMAGE_BASE_URL).toBe("https://img.example/v1");
    expect(cfg.IMAGE_API_KEY).toBe("sk-img");
    expect(cfg.IMAGE_MODEL).toBe("gpt-image-1");
  });

  it("IMAGE_MODEL 空字符串关闭生图", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k", IMAGE_MODEL: "" });
    expect(cfg.IMAGE_MODEL).toBe("");
  });

  it("缺 LLM_API_KEY 直接抛（启动期快速失败）", () => {
    expect(() => loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1" })).toThrow();
  });

  it("PORT 字符串被强转为数字", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k", PORT: "9000" });
    expect(cfg.PORT).toBe(9000);
  });

  it("defaults KB_TOP_K to 3 and leaves KB_EMBEDDING_MODEL optional", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k" });
    expect(cfg.KB_TOP_K).toBe(3);
    expect(cfg.KB_EMBEDDING_MODEL).toBeUndefined();
  });
});
