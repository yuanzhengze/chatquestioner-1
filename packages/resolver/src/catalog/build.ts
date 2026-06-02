import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogIndex } from "./types.js";
import { readGameplayTemplates, readBasicTemplates } from "./templates.js";
import { readMcpServers } from "./mcp.js";
import { readSkills } from "./skills.js";

export function buildCatalog(forgeaxRoot: string): CatalogIndex {
  const root = resolve(forgeaxRoot);
  if (!existsSync(resolve(root, "packages/game_templates"))) {
    throw new Error(`FORGEAX_ROOT invalid: ${root} (packages/game_templates not found)`);
  }
  return {
    generatedAt: new Date().toISOString(),
    forgeaxRoot: root,
    templates: [...readGameplayTemplates(root), ...readBasicTemplates(root)],
    skills: readSkills(root),
    mcp: readMcpServers(root),
  };
}
