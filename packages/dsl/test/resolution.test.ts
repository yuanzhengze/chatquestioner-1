import { describe, it, expect } from "vitest";
import { ResolutionResultSchema, type ResolutionResult } from "../src/index.js";

const sample: ResolutionResult = {
  schema_version: "0.2",
  profile: "workbench",
  template: {
    primary: "match3-candy",
    references: ["link-match"],
    basis: { matched_terms: ["match 3"], constraints: { dimension: "2D", engine: "pixijs" } },
  },
  skills: [
    { id: "H_2D_LookMaster", layer: "L0", phase: "production", load: "eager", trigger: "dimension:2D" },
  ],
  mcp: [
    { server: "as-mate-tools", layer: "L0", phase: "boot", load: "eager", tools: ["install_packs"] },
    { server: "image-gemini", layer: "L1", phase: "production", load: "eager", trigger: "modality:image" },
  ],
  packages: [{ id: "kubee-client-contract", load: "eager", trigger: "foundation" }],
  unmatched: [],
  warnings: [],
  install_packs: {
    primary_template: "match3-candy",
    reference_templates: ["link-match"],
    package_ids: ["kubee-client-contract"],
  },
};

describe("ResolutionResultSchema v0.2", () => {
  it("accepts the canonical + projection shape", () => {
    const parsed = ResolutionResultSchema.parse(sample);
    expect(parsed.install_packs.primary_template).toBe("match3-candy");
    expect(parsed.skills[0].layer).toBe("L0");
  });

  it("rejects an invalid skill layer", () => {
    const bad = { ...sample, skills: [{ ...sample.skills[0], layer: "L9" }] };
    expect(() => ResolutionResultSchema.parse(bad)).toThrow();
  });

  it("rejects an invalid load mode", () => {
    const bad = { ...sample, skills: [{ ...sample.skills[0], load: "sometimes" }] };
    expect(() => ResolutionResultSchema.parse(bad)).toThrow();
  });
});
