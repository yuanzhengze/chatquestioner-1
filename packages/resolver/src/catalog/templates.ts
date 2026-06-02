import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { inferConstraints } from "../infer.js";
import type { TemplateEntry } from "./types.js";

interface RawTemplateYml {
  id?: string;
  desc?: string;
  "mobile-support"?: boolean;
  intent_terms?: string[];
  signature_terms?: string[];
  primary_constraints?: { dimension?: string; engine?: string };
}

export function readGameplayTemplates(forgeaxRoot: string): TemplateEntry[] {
  const dir = resolve(forgeaxRoot, "packages/game_templates/templates/gameplay");
  if (!existsSync(dir)) return [];
  const out: TemplateEntry[] = [];
  for (const name of readdirSync(dir)) {
    const ymlPath = join(dir, name, "template.yml");
    if (!existsSync(ymlPath) || !statSync(join(dir, name)).isDirectory()) continue;
    const raw = parseYaml(readFileSync(ymlPath, "utf8")) as RawTemplateYml;
    const desc = raw.desc ?? "";
    const pc = raw.primary_constraints;
    const inferred = inferConstraints(desc);
    out.push({
      id: raw.id ?? name,
      kind: "gameplay",
      desc,
      dimension: (pc?.dimension as TemplateEntry["dimension"]) ?? inferred.dimension,
      engine: (pc?.engine as TemplateEntry["engine"]) ?? inferred.engine,
      inferred: !pc?.dimension || !pc?.engine,
      mobileSupport: raw["mobile-support"] === true,
      // 真实 yaml 有裸数字词条（如 2048-3d 的 `- 2048` 被解析成 number）→ 强转字符串，守住 string[] 契约
      intentTerms: (raw.intent_terms ?? []).map((t) => String(t)),
      signatureTerms: (raw.signature_terms ?? []).map((t) => String(t)),
    });
  }
  return out;
}

export function readBasicTemplates(forgeaxRoot: string): TemplateEntry[] {
  const variants: Array<{ id: string; dimension: "2D" | "3D"; engine: "pixijs" | "threejs" }> = [
    { id: "basic/pixijs-2d", dimension: "2D", engine: "pixijs" },
    { id: "basic/threejs-3d", dimension: "3D", engine: "threejs" },
    { id: "basic-cn/pixijs-2d", dimension: "2D", engine: "pixijs" },
    { id: "basic-cn/threejs-3d", dimension: "3D", engine: "threejs" },
  ];
  const base = resolve(forgeaxRoot, "packages/game_templates/templates");
  return variants
    .filter((v) => existsSync(join(base, v.id)))
    .map((v) => ({
      id: v.id,
      kind: "basic" as const,
      desc: `${v.engine} ${v.dimension} basic template`,
      dimension: v.dimension,
      engine: v.engine,
      inferred: false,
      mobileSupport: true,
      intentTerms: [],
      signatureTerms: [],
    }));
}
