import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Dimension, Engine } from "@cq/dsl";
import { inferConstraints } from "../infer.js";
import type { TemplateEntry } from "./types.js";

interface RawTemplateYml {
  id?: string;
  desc?: string;
  "mobile-support"?: boolean;
  intent_terms?: unknown;
  signature_terms?: unknown;
  primary_constraints?: { dimension?: string; engine?: string };
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

export function readGameplayTemplates(forgeaxRoot: string): TemplateEntry[] {
  const dir = resolve(forgeaxRoot, "packages/game_templates/templates/gameplay");
  if (!existsSync(dir)) return [];
  const out: TemplateEntry[] = [];
  for (const name of readdirSync(dir)) {
    const tplDir = join(dir, name);
    const ymlPath = join(tplDir, "template.yml");
    try {
      if (!existsSync(ymlPath) || !statSync(tplDir).isDirectory()) continue;
      const raw = parseYaml(readFileSync(ymlPath, "utf8")) as RawTemplateYml;
      const desc = raw.desc ?? "";
      const pc = raw.primary_constraints;
      const inferred = inferConstraints(desc);
      // 目录后缀 -2d/-3d 是权威信号，优先于 desc 全文扫描
      // （desc 常提及 sibling 模板的维度/引擎，全文推断易误判，如 clash-royale-2d）。
      const suffixDim: Dimension | undefined =
        name.endsWith("-3d") ? "3D" : name.endsWith("-2d") ? "2D" : undefined;
      const dimension =
        (pc?.dimension as Dimension | undefined) ?? suffixDim ?? inferred.dimension;
      let engine = (pc?.engine as Engine | undefined) ?? inferred.engine;
      // 维度已知但 desc 引擎歧义（pixijs+threejs 同现）时，按 forgeax 引擎映射兜底。
      if (!engine && dimension) engine = dimension === "3D" ? "threejs" : "pixijs";
      out.push({
        id: raw.id ?? name,
        kind: "gameplay",
        desc,
        dimension,
        engine,
        inferred: !pc?.dimension || !pc?.engine,
        mobileSupport: raw["mobile-support"] === true,
        // 真实 yaml 有裸数字词条（如 2048-3d 的 `- 2048`）→ 强转字符串，守住 string[] 契约；
        // 非数组（标量/缺失）→ 空数组，避免 .map 抛错。
        intentTerms: toStringArray(raw.intent_terms),
        signatureTerms: toStringArray(raw.signature_terms),
      });
    } catch {
      // 单个坏 template.yml 不应让整个 catalog 构建崩溃；跳过该条。
      continue;
    }
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
