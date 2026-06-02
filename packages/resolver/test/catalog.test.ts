import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readGameplayTemplates, readMcpServers } from "../src/index.js";

const FORGEAX = process.env.FORGEAX_ROOT
  ? resolve(process.env.FORGEAX_ROOT)
  : resolve(__dirname, "../../../../forgeax-studio");

const hasForgeax = existsSync(resolve(FORGEAX, "packages/game_templates"));

describe.skipIf(!hasForgeax)("catalog readers (real forgeax dirs)", () => {
  it("reads gameplay templates including match3-candy with terms", () => {
    const templates = readGameplayTemplates(FORGEAX);
    const m3 = templates.find((t) => t.id === "match3-candy");
    expect(m3).toBeDefined();
    expect(m3!.dimension).toBe("2D");
    expect(m3!.engine).toBe("pixijs");
    expect(m3!.intentTerms).toContain("match 3");
    expect(m3!.mobileSupport).toBe(false);
  });

  it("reads mcp servers including image-gemini with its port", () => {
    const mcp = readMcpServers(FORGEAX);
    const gemini = mcp.find((s) => s.server === "image-gemini");
    expect(gemini).toBeDefined();
    expect(gemini!.port).toBe("3100");
  });
});
