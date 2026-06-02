import { describe, it, expect } from "vitest";
import { resolve as resolveDsl, ResolutionResultSchema, type GameDSL } from "../src/index.js";
import { fixtureCatalog } from "./fixtures/catalog.fixture.js";

const catMatch3: GameDSL = {
  schema_version: "0.1",
  constraints: { platform: ["PC"], dimension: "2D", engine: "pixijs", networking: "singleplayer" },
  genre: "match-3",
  mechanics: ["swap-match", "score-combo"],
  art_style: "watercolor-cozy",
  modalities: ["image", "audio", "ui"],
  intent_terms: ["candy crush", "gem puzzle"],
  signature_terms: [],
  mvp_scope: { must: ["核心三消循环"], cut: [] },
};

describe("resolve()", () => {
  it("produces a schema-valid ResolutionResult", () => {
    const r = resolveDsl(catMatch3, fixtureCatalog, { profile: "workbench" });
    expect(() => ResolutionResultSchema.parse(r)).not.toThrow();
  });

  it("picks match3-candy as primary via intent_terms match under 2D/pixijs gate", () => {
    const r = resolveDsl(catMatch3, fixtureCatalog, { profile: "workbench" });
    expect(r.template.primary).toBe("match3-candy");
    expect(r.template.basis.constraints).toEqual({ dimension: "2D", engine: "pixijs" });
  });

  it("derives install_packs projection consistent with template+packages", () => {
    const r = resolveDsl(catMatch3, fixtureCatalog, { profile: "workbench" });
    expect(r.install_packs.primary_template).toBe(r.template.primary);
    expect(r.install_packs.reference_templates).toEqual(r.template.references);
    expect(r.install_packs.package_ids).toEqual(r.packages.map((p) => p.id));
  });

  it("never emits pack-search as a skill", () => {
    const r = resolveDsl(catMatch3, fixtureCatalog, { profile: "workbench" });
    expect(r.skills.find((s) => s.id === "pack-search")).toBeUndefined();
  });

  it("gates image MCP via modality:image and audio MCP via modality:audio", () => {
    const r = resolveDsl(catMatch3, fixtureCatalog, { profile: "workbench" });
    const servers = r.mcp.map((m) => m.server);
    expect(servers).toContain("as-mate-tools"); // L0 boot 恒选
    expect(servers).toContain("image-gemini");
    expect(servers).toContain("music-search");
  });

  it("falls back to basic template + warning when no gameplay matches the 3D gate", () => {
    const odd: GameDSL = {
      ...catMatch3,
      constraints: { ...catMatch3.constraints, dimension: "3D", engine: "threejs" },
      genre: "unheard-of-genre",
      intent_terms: ["完全没有的玩法xyz"],
    };
    const r = resolveDsl(odd, fixtureCatalog, { profile: "workbench" });
    // 3D 候选里只有 tower-defense-3d；intent 不匹配 → 退 basic
    expect(r.template.primary).toBe("basic/threejs-3d");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("records unmatched free intent_terms (lossless)", () => {
    const r = resolveDsl({ ...catMatch3, intent_terms: ["candy crush", "无法匹配词zzz"] }, fixtureCatalog, { profile: "workbench" });
    expect(r.unmatched).toContain("无法匹配词zzz");
  });

  it("ignores blank/too-short free terms (no scoring poisoning, not in unmatched)", () => {
    const r = resolveDsl(
      { ...catMatch3, intent_terms: ["candy crush", "", "  ", "x"] },
      fixtureCatalog,
      { profile: "workbench" },
    );
    expect(r.template.primary).toBe("match3-candy"); // not poisoned into a wrong pick
    expect(r.unmatched).not.toContain("");
    expect(r.unmatched).not.toContain("x");
  });
});
