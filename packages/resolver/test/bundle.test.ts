import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { writeBundle, type ResolutionResult } from "../src/index.js";

let dir: string;
afterEach(() => { if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const resolution: ResolutionResult = {
  schema_version: "0.2",
  profile: "workbench",
  template: { primary: "match3-candy", references: [], basis: { matched_terms: [], constraints: { dimension: "2D", engine: "pixijs" } } },
  skills: [], mcp: [], packages: [], unmatched: [], warnings: [],
  install_packs: { primary_template: "match3-candy", reference_templates: [], package_ids: [] },
};

describe("writeBundle", () => {
  it("writes gdd.md, dsl.json, resolution.json", () => {
    dir = mkdtempSync(join(tmpdir(), "cq-bundle-"));
    writeBundle(dir, {
      gddMarkdown: "# 猫咪连连看\n",
      dsl: { schema_version: "0.1" } as never,
      resolution,
    });
    expect(readFileSync(resolve(dir, "gdd.md"), "utf8")).toContain("# 猫咪连连看");
    expect(JSON.parse(readFileSync(resolve(dir, "resolution.json"), "utf8")).template.primary).toBe("match3-candy");
    expect(existsSync(resolve(dir, "dsl.json"))).toBe(true);
  });
});
