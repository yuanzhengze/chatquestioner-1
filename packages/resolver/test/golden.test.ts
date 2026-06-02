import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildCatalog, resolve as resolveDsl, ResolutionResultSchema, type GameDSL } from "../src/index.js";

const FORGEAX = process.env.FORGEAX_ROOT
  ? resolve(process.env.FORGEAX_ROOT)
  : resolve(__dirname, "../../../../forgeax-studio");
const hasForgeax = existsSync(resolve(FORGEAX, "packages/game_templates"));

const catCatGame: GameDSL = {
  schema_version: "0.1",
  constraints: { platform: ["PC"], dimension: "2D", engine: "pixijs", networking: "singleplayer" },
  genre: "puzzle",
  mechanics: ["swap-match"],
  art_style: "watercolor-cozy",
  modalities: ["image", "audio", "ui"],
  intent_terms: ["candy crush", "gem puzzle", "match 3", "match-3", "bejeweled", "tile match", "swap match"],
  signature_terms: ["swap-match-cascade game", "cascade gem puzzle", "timed combo match-3"],
  mvp_scope: { must: [], cut: [] },
};

const tdGame: GameDSL = {
  schema_version: "0.1",
  constraints: { platform: ["PC"], dimension: "3D", engine: "threejs", networking: "singleplayer" },
  genre: "tower-defense",
  mechanics: ["build-and-upgrade", "wave-survival"],
  art_style: "fantasy",
  modalities: ["image", "3d", "audio"],
  intent_terms: ["tower defense", "wave defense"],
  signature_terms: ["wave-based tower defense"],
  mvp_scope: { must: [], cut: [] },
};

describe.skipIf(!hasForgeax)("golden: resolve against real forgeax catalog", () => {
  const catalog = hasForgeax ? buildCatalog(FORGEAX) : null;

  it("match-3 style DSL resolves to match3-candy (2D/pixijs)", () => {
    const r = resolveDsl(catCatGame, catalog!, { profile: "workbench" });
    expect(() => ResolutionResultSchema.parse(r)).not.toThrow();
    expect(r.template.primary).toBe("match3-candy");
    expect(r.template.basis.constraints).toEqual({ dimension: "2D", engine: "pixijs" });
    expect(r.skills.map((s) => s.id)).toContain("H_2D_LookMaster");
    expect(r.mcp.map((m) => m.server)).toContain("image-gemini");
    expect(r.install_packs.primary_template).toBe("match3-candy");
    expect(r.skills.find((s) => s.id === "pack-search")).toBeUndefined();
  });

  it("tower-defense 3D DSL resolves to a 3D TD template with 3D look skills", () => {
    const r = resolveDsl(tdGame, catalog!, { profile: "workbench" });
    expect(r.template.basis.constraints.dimension).toBe("3D");
    expect(["tower-defense-3d", "goblin-archer"]).toContain(r.template.primary);
    expect(r.skills.map((s) => s.id)).toContain("H-3d-LookMaster");
  });

  it("3D DSL never selects a 2D-only template (hard gate)", () => {
    const r = resolveDsl(tdGame, catalog!, { profile: "workbench" });
    const picked = catalog!.templates.find((t) => t.id === r.template.primary);
    expect(picked?.dimension === "3D" || r.template.primary.startsWith("basic/threejs")).toBe(true);
  });
});
