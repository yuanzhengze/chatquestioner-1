import type { z } from "zod";

/** 模块种类（对齐 docs/09 §6.2）。 */
export type ModuleKind = "world" | "input" | "system" | "goal";

/** 落地批次：S0 首发 / 二批。 */
export type ModuleBatch = "首发" | "二批";

/**
 * 一个 L1 模块对 DSL 暴露的全部契约（docs/09 §6.4）。
 * 这是「新增模块 = 写实现 + 写一条 manifest」里的那条 manifest。
 */
export interface ModuleManifest {
  /** 全局唯一，= GameDef 里 `use` 的名字 */
  id: string;
  kind: ModuleKind;
  /** ["*"] 通用 | ["match3","merge"] */
  genre: string[];
  batch: ModuleBatch;
  /** 一行描述，进可检索目录（按需门控用） */
  description: string;
  /** 参数 schema：编译期校验 DSL 传参 */
  params: z.ZodTypeAny;
  /** 消费的组件/信号（如 "board","input"） */
  reads: string[];
  /** 修改的组件/信号（如 "board","score"） */
  writes: string[];
  /** 依赖模块 id；"?" 后缀 = 软依赖（如 "cascade?"） */
  deps: string[];
  /** 复用 resolver trigger 词汇（如 "genre:match3"） */
  triggers?: string[];
  /** golden 游戏 id，至少 1 个 */
  examples: string[];
  /** 改 params 形状必须升版 */
  schema_version: string;
}
