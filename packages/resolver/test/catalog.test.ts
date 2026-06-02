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

  it("uses the -2d/-3d directory suffix as the authoritative dimension (overrides desc)", () => {
    const templates = readGameplayTemplates(FORGEAX);
    const cr2d = templates.find((t) => t.id === "clash-royale-2d");
    expect(cr2d).toBeDefined();
    expect(cr2d!.dimension).toBe("2D");   // desc mentions a 3D sibling — suffix must win
    expect(cr2d!.engine).toBe("pixijs");
    // every -2d/-3d suffixed template must infer the matching dimension
    for (const t of templates) {
      if (t.id.endsWith("-3d")) expect(t.dimension).toBe("3D");
      if (t.id.endsWith("-2d")) expect(t.dimension).toBe("2D");
    }
  });
});
