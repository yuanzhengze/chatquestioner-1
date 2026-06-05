import { zodToJsonSchema } from "zod-to-json-schema";
import { ALL_MANIFESTS, type ModuleManifest } from "@cq/modules";

/** 索引条目：manifest 去掉 zod、附上 JSON Schema（跨语言/可序列化）。 */
export interface ModuleIndexEntry {
  id: string;
  kind: ModuleManifest["kind"];
  genre: string[];
  batch: ModuleManifest["batch"];
  description: string;
  paramsSchema: object;
  reads: string[];
  writes: string[];
  deps: string[];
  triggers?: string[];
  examples: string[];
  schema_version: string;
}

export interface ModuleIndex {
  generatedAt: string;
  modules: ModuleIndexEntry[];
}

export interface IndexBuildError {
  kind: "duplicate-id" | "unmet-dep" | "empty-examples";
  message: string;
}

export interface BuildModuleIndexResult {
  index: ModuleIndex;
  errors: IndexBuildError[];
}

/**
 * 构建期索引器（仿 resolver/catalog 的 buildCatalog）。
 * 校验：id 唯一、硬依赖可达、examples 非空。
 * S0 从内存里的 ALL_MANIFESTS 聚合；fs 扫描 module.manifest.ts 是后续等价替换。
 */
export function buildModuleIndex(manifests: ModuleManifest[] = ALL_MANIFESTS): BuildModuleIndexResult {
  const errors: IndexBuildError[] = [];
  const ids = new Set<string>();
  for (const m of manifests) {
    if (ids.has(m.id)) errors.push({ kind: "duplicate-id", message: `重复模块 id：${m.id}` });
    ids.add(m.id);
  }
  for (const m of manifests) {
    if (m.examples.length === 0) errors.push({ kind: "empty-examples", message: `${m.id} 缺 examples` });
    for (const dep of m.deps) {
      const hard = !dep.endsWith("?");
      const depId = dep.replace(/\?$/, "");
      if (hard && !ids.has(depId)) {
        errors.push({ kind: "unmet-dep", message: `${m.id} 依赖未注册模块：${depId}` });
      }
    }
  }

  const index: ModuleIndex = {
    generatedAt: new Date().toISOString(),
    modules: manifests.map((m) => ({
      id: m.id,
      kind: m.kind,
      genre: m.genre,
      batch: m.batch,
      description: m.description,
      paramsSchema: zodToJsonSchema(m.params, m.id) as object,
      reads: m.reads,
      writes: m.writes,
      deps: m.deps,
      triggers: m.triggers,
      examples: m.examples,
      schema_version: m.schema_version,
    })),
  };
  return { index, errors };
}

/** 按 genre 门控：只返回该 genre（或通用）模块——服务「按需进上下文」。 */
export function gateByGenre(index: ModuleIndex, genre: string): ModuleIndexEntry[] {
  return index.modules.filter((m) => m.genre.includes("*") || m.genre.includes(genre));
}
