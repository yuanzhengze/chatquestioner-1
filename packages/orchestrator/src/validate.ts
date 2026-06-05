import { MANIFEST_BY_ID, type ModuleManifest } from "@cq/modules";
import { type GameDef, type SystemUse, isHook } from "./types.js";

export interface CompileError {
  kind: "unknown-module" | "bad-params" | "unmet-dep" | "syntax";
  message: string;
  at?: string;
}

/** board 字段隐含使用 board-grid。 */
const IMPLICIT_USED = ["board-grid"];

function collectUses(def: GameDef): SystemUse[] {
  const uses: SystemUse[] = [def.input, ...def.systems];
  if (def.board.layers) uses.push(...def.board.layers);
  if (def.board.blockers) uses.push(...def.board.blockers);
  if (!isHook(def.goal)) uses.push(def.goal);
  return uses;
}

function paramsOf(use: SystemUse): Record<string, unknown> {
  const { use: _omit, ...rest } = use;
  return rest;
}

/**
 * 校验 GameDef（docs/09 §6.4/§6.6 的"阻碍二"机制）：
 * unknown-module / bad-params / unmet-dep —— 全在编译期暴露，不到运行时才炸。
 */
export function validate(def: GameDef, manifests: Map<string, ModuleManifest> = MANIFEST_BY_ID): CompileError[] {
  const errors: CompileError[] = [];
  const uses = collectUses(def);

  const usedIds = new Set<string>([...IMPLICIT_USED, ...uses.map((u) => u.use)]);

  for (const u of uses) {
    const m = manifests.get(u.use);
    if (!m) {
      errors.push({ kind: "unknown-module", message: `未知模块：${u.use}`, at: u.use });
      continue;
    }
    const parsed = m.params.safeParse(paramsOf(u));
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "_"}: ${i.message}`).join("; ");
      errors.push({ kind: "bad-params", message: `${u.use} 参数非法：${detail}`, at: u.use });
    }
  }

  // 硬依赖必须也被引用（软依赖 "?" 跳过）
  for (const id of usedIds) {
    const m = manifests.get(id);
    if (!m) continue;
    for (const dep of m.deps) {
      if (dep.endsWith("?")) continue;
      if (!usedIds.has(dep)) {
        errors.push({ kind: "unmet-dep", message: `${id} 需要 ${dep}，但编排里没有引用它`, at: id });
      }
    }
  }

  if (isHook(def.goal) && !def.goal.hook) {
    errors.push({ kind: "syntax", message: "goal hook 缺名字" });
  }

  return errors;
}
