import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillEntry } from "./types.js";

interface RawFrontmatter {
  name?: string;
  description?: string;
  tags?: string[];
}

function parseFrontmatter(md: string): RawFrontmatter | undefined {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return undefined;
  return parseYaml(m[1]) as RawFrontmatter;
}

/** 递归找 SKILL.md，抽 frontmatter。 */
export function readSkills(forgeaxRoot: string): SkillEntry[] {
  const roots = [
    resolve(forgeaxRoot, "packages/marketplace/src/skills"),
    resolve(forgeaxRoot, "packages/marketplace/src/plugins"),
  ];
  const out: SkillEntry[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "SKILL.md") {
        const fm = parseFrontmatter(readFileSync(full, "utf8"));
        if (fm?.name) {
          out.push({
            name: fm.name,
            description: fm.description ?? "",
            tags: fm.tags ?? [],
            source: relative(forgeaxRoot, full),
          });
        }
      }
    }
  };
  roots.forEach(walk);
  return out;
}
