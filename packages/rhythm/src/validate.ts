import { RHYTHM_MANIFEST_BY_ID } from "./manifests.js";
import { isHook, type RhythmDef, type SystemUse } from "./types.js";

/** 校验问题（与 match-3 编译期校验同范式）。 */
export type ValidationError =
  | { kind: "unknown-module"; use: string; where: string }
  | { kind: "bad-params"; use: string; where: string; message: string }
  | { kind: "missing-dep"; use: string; where: string; dep: string };

/**
 * 静态校验一个 RhythmDef：每个 `use` 必须命中清单、参数符合 manifest schema、
 * 依赖模块齐备（spec §3）。返回错误列表，空数组 = 合法。
 */
export function validate(def: RhythmDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const present = new Set<string>();

  const slots: Array<{ where: string; uses: SystemUse[] }> = [
    { where: "track", uses: [def.track] },
    { where: "notes", uses: isHook(def.notes) ? [] : [def.notes] },
    { where: "inputs", uses: def.inputs },
    { where: "systems", uses: def.systems },
    { where: "goal", uses: [def.goal] },
  ];

  for (const { where, uses } of slots) {
    for (const su of uses) {
      const manifest = RHYTHM_MANIFEST_BY_ID.get(su.use);
      if (!manifest) {
        errors.push({ kind: "unknown-module", use: su.use, where });
        continue;
      }
      present.add(su.use);
      const { use: _use, ...params } = su;
      const parsed = manifest.params.safeParse(params);
      if (!parsed.success) {
        errors.push({
          kind: "bad-params",
          use: su.use,
          where,
          message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
        });
      }
    }
  }

  // 依赖检查：所有出现的模块，其 deps 必须也在场（note-source 可由 hook 形式满足）。
  for (const { where, uses } of slots) {
    for (const su of uses) {
      const manifest = RHYTHM_MANIFEST_BY_ID.get(su.use);
      if (!manifest) continue;
      for (const dep of manifest.deps) {
        const satisfied = present.has(dep) || (dep === "note-source" && isHook(def.notes));
        if (!satisfied) {
          errors.push({ kind: "missing-dep", use: su.use, where, dep });
        }
      }
    }
  }

  return errors;
}
