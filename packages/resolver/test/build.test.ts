import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildCatalog } from "../src/index.js";

const FORGEAX = process.env.FORGEAX_ROOT
  ? resolve(process.env.FORGEAX_ROOT)
  : resolve(__dirname, "../../../../forgeax-studio");
const hasForgeax = existsSync(resolve(FORGEAX, "packages/game_templates"));

describe.skipIf(!hasForgeax)("buildCatalog", () => {
  it("assembles a catalog index with gameplay + basic templates and mcp", () => {
    const cat = buildCatalog(FORGEAX);
    expect(cat.templates.some((t) => t.id === "match3-candy")).toBe(true);
    expect(cat.templates.some((t) => t.id === "basic/pixijs-2d")).toBe(true);
    expect(cat.mcp.some((s) => s.server === "as-mate-tools")).toBe(true);
    expect(cat.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
