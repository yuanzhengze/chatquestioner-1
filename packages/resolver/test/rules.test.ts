import { describe, it, expect } from "vitest";
import { SKILL_RULES, MCP_RULES, skillsForTrigger, mcpForModality } from "../src/index.js";

describe("curated rules", () => {
  it("classifies H_2D_LookMaster as an L0 production-eager skill", () => {
    const r = SKILL_RULES["H_2D_LookMaster"];
    expect(r).toMatchObject({ layer: "L0", phase: "production", defaultLoad: "eager" });
  });

  it("excludes pack-search from rules (resolver replaces it)", () => {
    expect(SKILL_RULES["pack-search"]).toBeUndefined();
  });

  it("maps modality:image to image-gemini + image-postprocess", () => {
    const servers = mcpForModality("image");
    expect(servers).toContain("image-gemini");
    expect(servers).toContain("image-postprocess");
  });

  it("maps dimension:3D trigger to 3D look skills", () => {
    const skills = skillsForTrigger("dimension:3D");
    expect(skills).toContain("H-3d-LookMaster");
  });

  it("classifies as-mate-tools as L0 boot", () => {
    expect(MCP_RULES["as-mate-tools"]).toMatchObject({ layer: "L0", phase: "boot" });
  });
});
