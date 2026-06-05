/**
 * 顶层游戏编排 DSL —— P0 形态：TS 对象字面量（docs/09 附录 A）。
 * 验证模型站得住后再上自定义文本语法。
 */

/** 引用一个 L1 模块并传参：{ use: 模块id, ...params } */
export type SystemUse = { use: string } & Record<string, unknown>;

/** 逃生舱：指向一个手写 hook 文件。 */
export type HookRef = { hook: string };

export function hook(name: string): HookRef {
  return { hook: name };
}

export function isHook(x: unknown): x is HookRef {
  return typeof x === "object" && x !== null && "hook" in x;
}

export type Rule = { when: string; then: string | HookRef };

export interface GameDef {
  id: string;
  board: {
    size: [number, number];
    tiles: string[];
    layers?: SystemUse[];
    blockers?: SystemUse[];
  };
  input: SystemUse;
  systems: SystemUse[];
  goal: SystemUse | HookRef;
  rules: Rule[];
  external?: HookRef;
  /** 可选随机种子，保证可复现；缺省用固定值。 */
  seed?: number;
}
