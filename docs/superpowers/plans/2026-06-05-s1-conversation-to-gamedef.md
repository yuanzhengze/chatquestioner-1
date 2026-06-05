# S1 闭环：对话产物 → 编排 DSL → 可玩游戏 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通"一段 match-3 对话 → 合法 `GameDef` → playground 真能玩"的端到端管道。

**Architecture:** 混合翻译——`orchestrator` 内新增纯函数 `synthesize(state, fill)`（规则定 match-3 已实现子集骨架 + 用窄结构 `GameDefFill` 填细节 + 复用 `validate` 兜底）；LLM 在 `server` 产 `GameDefFill`（解析容错 + 一次重试）。`/api/session/:id/export` 多产 `gamedef.json`，playground 按 session 拉取运行。

**Tech Stack:** TypeScript / zod / Fastify / Vite / vitest（pnpm monorepo）。

**Spec:** [`../specs/2026-06-05-s1-conversation-to-gamedef-design.md`](../specs/2026-06-05-s1-conversation-to-gamedef-design.md)

---

## 文件结构

```
新增 packages/orchestrator/src/synthesize/fill.ts        # GameDefFill + FillSchema + clamp/dedupe + 诊断类型
新增 packages/orchestrator/src/synthesize/skeleton.ts    # buildSkeleton(state, fill) → GameDef（纯组装）
新增 packages/orchestrator/src/synthesize/synthesize.ts  # supportedMatch3Genre + synthesize（判 genre + validate 兜底）
修改 packages/orchestrator/package.json                  # 加 @cq/conversation、@cq/dsl 依赖
修改 packages/orchestrator/src/index.ts                  # 导出 synthesize 子模块
新增 packages/orchestrator/test/synthesize.test.ts       # fill/skeleton/synthesize 单测
新增 packages/orchestrator/test/synthesize-golden.test.ts# state+fill → createGame autoPlay 端到端
新增 apps/server/src/gameDefFill.ts                      # buildFillPrompt + produceGameDef（LLM + 重试）
修改 apps/server/package.json                            # 加 @cq/orchestrator 依赖
修改 apps/server/src/wire.ts                             # ExportResponse 加 gamedef + diagnostics
修改 apps/server/src/server.ts                           # export handler 接 S1 + GET /gamedef 端点
新增 apps/server/test/gameDefFill.test.ts                # 解析容错 + 重试
新增 apps/server/test/export.test.ts                     # export 含 gamedef.json / 非 match-3 诊断
新增 apps/playground/src/loadSession.ts                  # gameDefFromJson 纯函数
修改 apps/playground/vite.config.ts                      # /api 代理到 server
修改 apps/playground/src/main.ts + index.html           # 按 session 加载 UI
新增 apps/playground/test/loadSession.test.ts            # gameDefFromJson 单测
```

**约定（避免歧义）：**
- `gamedef.json` 由 **server 侧单写**（`writeFileSync`），不改 `@cq/resolver/writeBundle`（避免 resolver 反向依赖 orchestrator）。
- playground 取产物用 **`GET /api/session/:id/gamedef` 端点** + vite 代理。
- `synthesize` 接收完整 `ConversationState`（type-only），仅读 `engineering.genre` / `workingTitle` / `theme`。

---

## Task 1: orchestrator 加依赖 + 建 synthesize 目录

**Files:**
- Modify: `packages/orchestrator/package.json`

- [ ] **Step 1: 加 workspace 依赖**

把 `packages/orchestrator/package.json` 的 `dependencies` 改为：

```json
  "dependencies": {
    "@cq/modules": "workspace:*",
    "@cq/module-index": "workspace:*",
    "@cq/conversation": "workspace:*",
    "@cq/dsl": "workspace:*",
    "zod": "^3.23.0"
  }
```

- [ ] **Step 2: 安装链接**

Run: `pnpm install`
Expected: 成功，新增 `@cq/conversation`、`@cq/dsl` 到 orchestrator 的链接，无报错。

- [ ] **Step 3: 确认无环依赖**

Run: `pnpm --filter @cq/orchestrator exec node -e "console.log('ok')"`
Expected: 打印 `ok`（`conversation` 不依赖 `orchestrator`，无循环）。

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/package.json pnpm-lock.yaml
git commit -m "build(orchestrator): add @cq/conversation + @cq/dsl deps for synthesize"
```

---

## Task 2: fill.ts —— GameDefFill 契约 + clamp/dedupe + 诊断类型

**Files:**
- Create: `packages/orchestrator/src/synthesize/fill.ts`
- Test: `packages/orchestrator/test/synthesize.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/orchestrator/test/synthesize.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { FillSchema, clampSize, dedupeTiles } from "@cq/orchestrator";

describe("fill · GameDefFill 契约", () => {
  it("接受合法 fill（collect 目标）", () => {
    const r = FillSchema.safeParse({
      tiles: ["猫爪", "毛线", "铃铛"],
      size: [8, 8],
      goal: { kind: "collect", need: { "猫爪": 20 } },
      tuning: { minLine: 3, moves: 25, comboMult: 1.5 },
    });
    expect(r.success).toBe(true);
  });

  it("拒绝非法 goal.kind", () => {
    const r = FillSchema.safeParse({
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "clearLayer" },
    });
    expect(r.success).toBe(false);
  });

  it("clampSize 把尺寸夹到 6..10 并取整", () => {
    expect(clampSize([3, 99])).toEqual([6, 10]);
    expect(clampSize([7.4, 8.6])).toEqual([7, 9]);
  });

  it("dedupeTiles 去重、截到 7、不足 3 用默认补齐", () => {
    expect(dedupeTiles([" red ", "red", "blue"])).toEqual(["red", "blue", "green"]);
    expect(dedupeTiles(["a","b","c","d","e","f","g","h"]).length).toBe(7);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- synthesize.test`
Expected: FAIL，报 `FillSchema`/`clampSize`/`dedupeTiles` 未从 `@cq/orchestrator` 导出（模块找不到）。

- [ ] **Step 3: 实现 fill.ts**

创建 `packages/orchestrator/src/synthesize/fill.ts`：

```ts
import { z } from "zod";

/** goal 仅允许已实现运行时支持的两类（collect / score）。 */
export const GoalFillSchema = z.union([
  z.object({ kind: z.literal("collect"), need: z.record(z.number().int().positive()) }),
  z.object({ kind: z.literal("score"), target: z.number().int().positive() }),
]);

/** LLM 唯一产物：窄结构，systems/依赖由骨架定死，不开放给 LLM。 */
export const FillSchema = z.object({
  tiles: z.array(z.string().min(1)).min(1),
  size: z.tuple([z.number(), z.number()]),
  goal: GoalFillSchema,
  tuning: z
    .object({
      minLine: z.number().int().min(3).optional(),
      moves: z.number().int().positive().nullable().optional(),
      comboMult: z.number().positive().optional(),
    })
    .optional(),
});

export type GameDefFill = z.infer<typeof FillSchema>;

export type SynthesizeDiagnostic =
  | { kind: "unsupported-genre"; genre: string | null }
  | { kind: "fill-parse-error"; raw: string }
  | { kind: "fill-invalid"; issues: string[] }
  | { kind: "synthesize-failed"; errors: string[] };

const MIN_SIZE = 6;
const MAX_SIZE = 10;
const MIN_TILES = 3;
const MAX_TILES = 7;
const FALLBACK_TILES = ["red", "green", "blue", "yellow", "purple", "orange", "white"];

/** 棋盘尺寸夹到 6..10 并取整，越界不报错。 */
export function clampSize([w, h]: [number, number]): [number, number] {
  const c = (n: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
  return [c(w), c(h)];
}

/** 去重 + 去空白，截到 7；不足 3 用默认色补齐，保证可玩。 */
export function dedupeTiles(tiles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tiles) {
    const v = t.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= MAX_TILES) break;
  }
  for (const f of FALLBACK_TILES) {
    if (out.length >= MIN_TILES) break;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
```

- [ ] **Step 4: 在 index.ts 临时导出（让测试可见）**

在 `packages/orchestrator/src/index.ts` 末尾追加：

```ts
export { FillSchema, GoalFillSchema, clampSize, dedupeTiles } from "./synthesize/fill.js";
export type { GameDefFill, SynthesizeDiagnostic } from "./synthesize/fill.js";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test -- synthesize.test`
Expected: PASS（4 个用例全过）。

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/synthesize/fill.ts packages/orchestrator/src/index.ts packages/orchestrator/test/synthesize.test.ts
git commit -m "feat(orchestrator): add GameDefFill schema + clamp/dedupe helpers"
```

---

## Task 3: skeleton.ts —— match-3 已实现子集骨架

**Files:**
- Create: `packages/orchestrator/src/synthesize/skeleton.ts`
- Test: `packages/orchestrator/test/synthesize.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

在 `packages/orchestrator/test/synthesize.test.ts` 顶部 import 增加 `buildSkeleton`、`createInitialState`、`validate`：

```ts
import { FillSchema, clampSize, dedupeTiles, buildSkeleton, validate } from "@cq/orchestrator";
import { createInitialState } from "@cq/conversation";
```

并在文件末尾追加：

```ts
describe("skeleton · 骨架组装", () => {
  const state = (genre = "match-3") => {
    const s = createInitialState();
    s.workingTitle = "猫咪消消乐";
    s.engineering.genre = genre;
    return s;
  };

  it("collect 目标：含 move-budget(默认25) 与 goal-tracker.collect，且 need 键被过滤进 tiles", () => {
    const def = buildSkeleton(state(), {
      tiles: ["猫爪", "毛线", "铃铛"],
      size: [8, 8],
      goal: { kind: "collect", need: { "猫爪": 20, "不存在的tile": 5 } },
    });
    const move = def.systems.find((s) => s.use === "move-budget");
    expect(move).toEqual({ use: "move-budget", moves: 25 });
    expect(def.goal).toEqual({ use: "goal-tracker", collect: { "猫爪": 20 } });
  });

  it("score 目标：默认无 move-budget，goal-tracker.score 透传", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "score", target: 5000 },
    });
    expect(def.systems.some((s) => s.use === "move-budget")).toBe(false);
    expect(def.goal).toEqual({ use: "goal-tracker", score: 5000 });
  });

  it("骨架对 validate 零错误（依赖链/参数都合法）", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a", "b", "c"], size: [8, 8], goal: { kind: "score", target: 1000 },
    });
    expect(validate(def)).toEqual([]);
  });

  it("size/tiles 越界被 clamp（尺寸夹到 10，tiles 截到 7）", () => {
    const def = buildSkeleton(state(), {
      tiles: ["a","b","c","d","e","f","g","h","i"], size: [99, 99],
      goal: { kind: "score", target: 1000 },
    });
    expect(def.board.size).toEqual([10, 10]);
    expect(def.board.tiles.length).toBe(7);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- synthesize.test`
Expected: FAIL，`buildSkeleton` 未导出。

- [ ] **Step 3: 实现 skeleton.ts**

创建 `packages/orchestrator/src/synthesize/skeleton.ts`：

```ts
import type { ConversationState } from "@cq/conversation";
import type { GameDef, SystemUse } from "../types.js";
import { clampSize, dedupeTiles, type GameDefFill } from "./fill.js";

function slug(s: string): string {
  const cleaned = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .slice(0, 40);
  return cleaned || "untitled-match3";
}

/**
 * match-3 已实现运行时子集骨架（spec §5）。systems 顺序即依赖链。
 * 不含 special-tile/board-layer 等未实现模块，保证产物一定可玩。
 */
export function buildSkeleton(state: ConversationState, fill: GameDefFill): GameDef {
  const tiles = dedupeTiles(fill.tiles);
  const size = clampSize(fill.size);
  const minLine = fill.tuning?.minLine ?? 3;
  const comboMult = fill.tuning?.comboMult ?? 1.5;

  const systems: SystemUse[] = [
    { use: "match-detect", line: minLine },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 800 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 10, comboMult },
  ];

  let goal: SystemUse;
  let needsMoves = false;
  if (fill.goal.kind === "collect") {
    const tileSet = new Set(tiles);
    const need: Record<string, number> = {};
    for (const [k, v] of Object.entries(fill.goal.need)) {
      if (tileSet.has(k)) need[k] = v;
    }
    if (Object.keys(need).length === 0) need[tiles[0]] = 20; // 过滤后空 → 兜底可达
    goal = { use: "goal-tracker", collect: need };
    needsMoves = true;
  } else {
    goal = { use: "goal-tracker", score: fill.goal.target };
  }

  const movesVal = fill.tuning?.moves;
  if (needsMoves) {
    systems.push({ use: "move-budget", moves: typeof movesVal === "number" ? movesVal : 25 });
  } else if (typeof movesVal === "number") {
    systems.push({ use: "move-budget", moves: movesVal });
  }

  systems.push({ use: "shuffle-deadlock", onDeadlock: "shuffle" });

  return {
    id: slug(state.workingTitle ?? state.theme ?? "untitled-match3"),
    board: { size, tiles },
    input: { use: "input-swap", mode: "adjacent", requireMatch: true },
    systems,
    goal,
    rules: [],
  };
}
```

- [ ] **Step 4: 在 index.ts 导出**

在 `packages/orchestrator/src/index.ts` 追加：

```ts
export { buildSkeleton } from "./synthesize/skeleton.js";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test -- synthesize.test`
Expected: PASS（含新增 4 个 skeleton 用例）。

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/synthesize/skeleton.ts packages/orchestrator/src/index.ts packages/orchestrator/test/synthesize.test.ts
git commit -m "feat(orchestrator): add match-3 skeleton builder (implemented subset)"
```

---

## Task 4: synthesize.ts —— genre 判定 + validate 兜底

**Files:**
- Create: `packages/orchestrator/src/synthesize/synthesize.ts`
- Test: `packages/orchestrator/test/synthesize.test.ts`（追加）

- [ ] **Step 1: 追加失败测试**

在 import 增加 `synthesize`、`supportedMatch3Genre`：

```ts
import {
  FillSchema, clampSize, dedupeTiles, buildSkeleton, validate,
  synthesize, supportedMatch3Genre,
} from "@cq/orchestrator";
```

文件末尾追加：

```ts
describe("synthesize · 判 genre + 兜底", () => {
  const mk = (genre?: string) => {
    const s = createInitialState();
    s.workingTitle = "测试游戏";
    if (genre) s.engineering.genre = genre;
    return s;
  };
  const fill = { tiles: ["a", "b", "c"], size: [8, 8] as [number, number], goal: { kind: "score" as const, target: 1000 } };

  it("genre=match-3 → 产出合法 def、零诊断", () => {
    const r = synthesize(mk("match-3"), fill);
    expect(r.def).not.toBeNull();
    expect(r.diagnostics).toEqual([]);
    expect(validate(r.def!)).toEqual([]);
  });

  it("genre 缺失/非 match-3 → def=null + unsupported-genre", () => {
    const r = synthesize(mk("tower-defense"), fill);
    expect(r.def).toBeNull();
    expect(r.diagnostics[0]).toEqual({ kind: "unsupported-genre", genre: "tower-defense" });
    expect(supportedMatch3Genre(mk())).toBe(false);
  });

  it("supportedMatch3Genre 容错大小写/别名归一", () => {
    expect(supportedMatch3Genre(mk("Match-3"))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- synthesize.test`
Expected: FAIL，`synthesize`/`supportedMatch3Genre` 未导出。

- [ ] **Step 3: 实现 synthesize.ts**

创建 `packages/orchestrator/src/synthesize/synthesize.ts`：

```ts
import { normalizeVocabField, genreVocab } from "@cq/dsl";
import type { ConversationState } from "@cq/conversation";
import { validate } from "../validate.js";
import type { GameDef } from "../types.js";
import { buildSkeleton } from "./skeleton.js";
import type { GameDefFill, SynthesizeDiagnostic } from "./fill.js";

export interface SynthesizeResult {
  def: GameDef | null;
  diagnostics: SynthesizeDiagnostic[];
}

/** 仅当对话识别出的 genre 归一后等于 "match-3" 才算 S1 可支持。 */
export function supportedMatch3Genre(state: ConversationState): boolean {
  const raw = state.engineering.genre;
  if (!raw) return false;
  return normalizeVocabField(raw, genreVocab.GENRES).known === "match-3";
}

/**
 * ConversationState + 已校验 fill → GameDef。
 * fill 的 JSON 解析/zod 校验由调用方（server）负责；此处只做 genre 判定 + 骨架组装 + validate 兜底。
 */
export function synthesize(state: ConversationState, fill: GameDefFill): SynthesizeResult {
  if (!supportedMatch3Genre(state)) {
    return { def: null, diagnostics: [{ kind: "unsupported-genre", genre: state.engineering.genre ?? null }] };
  }
  const def = buildSkeleton(state, fill);
  const errors = validate(def);
  if (errors.length > 0) {
    return { def: null, diagnostics: [{ kind: "synthesize-failed", errors: errors.map((e) => e.message) }] };
  }
  return { def, diagnostics: [] };
}
```

> 注：`synthesize-failed` 分支是防御性兜底（骨架对当前 manifests 恒合法）；当模块库演进改了 params/deps 而骨架未同步时它会触发，因此保留但不为其单独造测试。

- [ ] **Step 4: 在 index.ts 导出**

在 `packages/orchestrator/src/index.ts` 追加：

```ts
export { synthesize, supportedMatch3Genre } from "./synthesize/synthesize.js";
export type { SynthesizeResult } from "./synthesize/synthesize.js";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test -- synthesize.test`
Expected: PASS（全部 synthesize 用例）。

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/synthesize/synthesize.ts packages/orchestrator/src/index.ts packages/orchestrator/test/synthesize.test.ts
git commit -m "feat(orchestrator): add synthesize (genre gate + validate fallback)"
```

---

## Task 5: 端到端 golden —— 对话产物真能玩

**Files:**
- Create: `packages/orchestrator/test/synthesize-golden.test.ts`

- [ ] **Step 1: 写 golden 测试**

创建 `packages/orchestrator/test/synthesize-golden.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { synthesize, createGame } from "@cq/orchestrator";
import { createInitialState } from "@cq/conversation";
import type { MatchEngine } from "@cq/modules";

function autoPlay(engine: MatchEngine, maxTurns: number): { turns: number; finalScore: number } {
  let turns = 0;
  let prevScore = 0;
  for (let i = 0; i < maxTurns; i++) {
    const s = engine.getState();
    if (s.status !== "playing") break;
    for (const row of s.board) for (const cell of row) {
      expect(cell).not.toBeNull();
      expect(engine.config.tiles).toContain(cell);
    }
    const moves = engine.legalMoves();
    if (moves.length === 0) break;
    const res = engine.trySwap(moves[0][0], moves[0][1]);
    expect(res.legal).toBe(true);
    const after = engine.getState();
    expect(after.score).toBeGreaterThanOrEqual(prevScore);
    prevScore = after.score;
    turns++;
  }
  return { turns, finalScore: prevScore };
}

function match3State(): ReturnType<typeof createInitialState> {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.theme = "治愈猫咪";
  s.engineering.genre = "match-3";
  return s;
}

describe("synthesize-golden · 对话 → GameDef → 真能玩", () => {
  it("score 目标：自动对局可推进且得分", () => {
    const r = synthesize(match3State(), {
      tiles: ["猫爪", "毛线", "铃铛", "鱼干"], size: [8, 8],
      goal: { kind: "score", target: 99999 }, // 高到当回合内不会赢，纯验证推进
    });
    expect(r.def).not.toBeNull();
    const { turns, finalScore } = autoPlay(createGame({ ...r.def!, seed: 42 }), 60);
    expect(turns).toBeGreaterThan(0);
    expect(finalScore).toBeGreaterThan(0);
  });

  it("collect 目标：步数内分出胜负、可复现", () => {
    const r = synthesize(match3State(), {
      tiles: ["红", "绿", "蓝", "黄"], size: [8, 8],
      goal: { kind: "collect", need: { "红": 20 } }, tuning: { moves: 30 },
    });
    const run = () => {
      const e = createGame({ ...r.def!, seed: 7 });
      autoPlay(e, 200);
      const s = e.getState();
      return { status: s.status, score: s.score };
    };
    const first = run();
    expect(["won", "lost"]).toContain(first.status);
    expect(run()).toEqual(first); // 确定性
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm test -- synthesize-golden`
Expected: PASS（2 个用例）。若 collect 关步数内既不赢也不输导致断言失败，把 `need` 调小（如 `{ "红": 12 }`）后重跑。

- [ ] **Step 3: Commit**

```bash
git add packages/orchestrator/test/synthesize-golden.test.ts
git commit -m "test(orchestrator): golden — conversation→GameDef is actually playable"
```

---

## Task 6: server gameDefFill.ts —— LLM 产 fill + 解析容错 + 重试

**Files:**
- Create: `apps/server/src/gameDefFill.ts`
- Modify: `apps/server/package.json`
- Test: `apps/server/test/gameDefFill.test.ts`

- [ ] **Step 1: 加 orchestrator 依赖**

把 `apps/server/package.json` 的 `dependencies` 增加一行（按字母位置插入即可）：

```json
    "@cq/orchestrator": "workspace:*",
```

Run: `pnpm install`
Expected: 成功链接。

- [ ] **Step 2: 写失败测试**

创建 `apps/server/test/gameDefFill.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { createInitialState, type LlmClient } from "@cq/conversation";
import { extractJson, produceGameDef } from "../src/gameDefFill.js";

function scripted(raws: string[]): LlmClient {
  let i = 0;
  return {
    async *stream() {
      const raw = raws[i++] ?? "";
      yield raw;
    },
  };
}

function match3State() {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.engineering.genre = "match-3";
  return s;
}

const goodFill = JSON.stringify({
  tiles: ["猫爪", "毛线", "铃铛"], size: [8, 8], goal: { kind: "score", target: 5000 },
});

describe("extractJson", () => {
  it("剥掉 ```json 围栏", () => {
    expect(extractJson("前言\n```json\n{\"a\":1}\n```\n尾巴")).toBe('{"a":1}');
  });
  it("无围栏时截取首尾花括号", () => {
    expect(extractJson('噪声 {"a":1} 噪声')).toBe('{"a":1}');
  });
});

describe("produceGameDef", () => {
  it("一次成功 → 产出 def、零诊断", async () => {
    const r = await produceGameDef(scripted([goodFill]), match3State());
    expect(r.def).not.toBeNull();
    expect(r.diagnostics).toEqual([]);
  });

  it("首轮坏 JSON、次轮好 JSON → 重试后成功", async () => {
    const r = await produceGameDef(scripted(["这不是JSON", goodFill]), match3State());
    expect(r.def).not.toBeNull();
  });

  it("两轮都坏 JSON → fill-parse-error", async () => {
    const r = await produceGameDef(scripted(["坏", "还是坏"]), match3State());
    expect(r.def).toBeNull();
    expect(r.diagnostics[0].kind).toBe("fill-parse-error");
  });

  it("JSON 合法但 schema 非法（两轮）→ fill-invalid", async () => {
    const bad = JSON.stringify({ tiles: [], size: [8, 8], goal: { kind: "score", target: 1000 } });
    const r = await produceGameDef(scripted([bad, bad]), match3State());
    expect(r.def).toBeNull();
    expect(r.diagnostics[0].kind).toBe("fill-invalid");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm test -- gameDefFill`
Expected: FAIL，`../src/gameDefFill.js` 不存在。

- [ ] **Step 4: 实现 gameDefFill.ts**

创建 `apps/server/src/gameDefFill.ts`：

```ts
import type { ChatMessage, ConversationState, LlmClient } from "@cq/conversation";
import { FillSchema, synthesize, type SynthesizeResult } from "@cq/orchestrator";

const FILL_SYSTEM = `你是游戏编排助手。基于给定的游戏概念，只输出一个 JSON 对象描述一个 match-3（三消）关卡，不要任何解释文字。
JSON 形如：
{
  "tiles": ["元素1","元素2","元素3"],   // 3~7 个，取自游戏的美术/主题词
  "size": [8, 8],                        // 棋盘宽高，6~10
  "goal": { "kind": "collect", "need": { "元素1": 20 } },  // 或 { "kind": "score", "target": 5000 }
  "tuning": { "minLine": 3, "moves": 25, "comboMult": 1.5 }  // 可选
}
只输出 JSON，不要 markdown 以外的文字。`;

/** 从对话状态拼出给 LLM 的填充提示。 */
export function buildFillPrompt(state: ConversationState): string {
  const e = state.engineering;
  const lines = [
    `游戏标题：${state.workingTitle ?? state.theme ?? "未命名"}`,
    `主题/世界：${state.theme ?? ""} ${state.world ?? ""}`.trim(),
    `美术风格：${e.artStyle ?? ""}`,
    `核心幻想：${state.coreFantasy ?? ""}`,
    `关键词（视觉）：${state.keywordPools.visual.join("、")}`,
    `关键词（玩法）：${state.keywordPools.gameplay.join("、")}`,
    `signature：${e.signatureTerms.join("、")}`,
    `intent：${e.intentTerms.join("、")}`,
  ];
  return `请为下面这个 match-3 游戏概念生成关卡 JSON：\n${lines.join("\n")}`;
}

/** 累积流式分片为完整字符串。 */
async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

/** 剥掉 ```json 围栏 / 截取首尾花括号，得到可 JSON.parse 的子串。 */
export function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

/**
 * 调 LLM 产 GameDefFill，解析容错 + 一次重试。
 * 解析/校验失败累计两轮后回 fill-parse-error / fill-invalid；成功则交 synthesize。
 */
export async function produceGameDef(llm: LlmClient, state: ConversationState): Promise<SynthesizeResult> {
  const base: ChatMessage[] = [
    { role: "system", content: FILL_SYSTEM },
    { role: "user", content: buildFillPrompt(state) },
  ];

  let lastRaw = "";
  let lastIssues: string[] = [];
  let sawParseError = false;
  let sawInvalid = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: ChatMessage[] =
      attempt === 0
        ? base
        : [...base, { role: "user", content: "上一次输出无法解析为合法 JSON 关卡，请严格只输出符合格式的 JSON。" }];

    lastRaw = await collect(llm.stream(messages));

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(lastRaw));
    } catch {
      sawParseError = true;
      continue;
    }

    const r = FillSchema.safeParse(parsed);
    if (!r.success) {
      sawInvalid = true;
      lastIssues = r.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
      continue;
    }

    return synthesize(state, r.data);
  }

  if (sawInvalid && !sawParseError) {
    return { def: null, diagnostics: [{ kind: "fill-invalid", issues: lastIssues }] };
  }
  return { def: null, diagnostics: [{ kind: "fill-parse-error", raw: lastRaw }] };
}
```

> 诊断归类规则：两轮都 JSON 解析失败 → `fill-parse-error`；至少能 parse 但 schema 不过 → `fill-invalid`。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test -- gameDefFill`
Expected: PASS（6 个用例）。

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/gameDefFill.ts apps/server/test/gameDefFill.test.ts
git commit -m "feat(server): produce GameDefFill via LLM with parse fallback + retry"
```

---

## Task 7: server export 接入 + GET /gamedef 端点

**Files:**
- Modify: `apps/server/src/wire.ts`
- Modify: `apps/server/src/server.ts`
- Test: `apps/server/test/export.test.ts`

- [ ] **Step 1: 扩展 ExportResponse 类型**

把 `apps/server/src/wire.ts` 末行的 `ExportResponse` 改为（顶部 import 增加 `GameDef`、`SynthesizeDiagnostic`）：

```ts
import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { GameDef, SynthesizeDiagnostic } from "@cq/orchestrator";
import type { ConversationState, TurnOption } from "@cq/conversation";
```

```ts
/** POST /api/session/:id/export 返回 */
export interface ExportResponse {
  dir: string;
  gddMarkdown: string;
  dsl: GameDSL;
  resolution: ResolutionResult;
  gamedef: GameDef | null;
  diagnostics: SynthesizeDiagnostic[];
}
```

- [ ] **Step 2: 写失败测试**

创建 `apps/server/test/export.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildServer } from "../src/server.js";
import { createInitialState, type ConversationState, type LlmClient } from "@cq/conversation";
import type { SessionStore } from "../src/sessionStore.js";
import { fixtureCatalog } from "../../../packages/resolver/test/fixtures/catalog.fixture.js";

function memStore(initial: Record<string, ConversationState>): SessionStore {
  const map = new Map(Object.entries(initial));
  return {
    async create(s) { const id = "x"; map.set(id, s); return id; },
    async load(id) { return map.get(id) ?? null; },
    async save(id, s) { map.set(id, s); },
  };
}

function scriptedFill(json: string): LlmClient {
  return { async *stream() { yield json; } };
}

function fullDslState(genre: string): ConversationState {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.engineering.genre = genre;
  s.engineering.dimension = "2D";
  s.engineering.engine = "pixijs";
  s.engineering.platform = ["PC"];
  return s;
}

const goodFill = JSON.stringify({
  tiles: ["猫爪", "毛线", "铃铛"], size: [8, 8], goal: { kind: "score", target: 5000 },
});

describe("POST /api/session/:id/export · S1", () => {
  let exportDir: string;
  beforeEach(() => { exportDir = mkdtempSync(resolve(tmpdir(), "cq-export-")); });

  it("match-3 session → 产出 gamedef.json 且响应含 gamedef", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s1: fullDslState("match-3") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s1/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gamedef).not.toBeNull();
    expect(body.diagnostics).toEqual([]);
    expect(existsSync(resolve(exportDir, "s1", "gamedef.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(resolve(exportDir, "s1", "gamedef.json"), "utf8"));
    expect(onDisk.input.use).toBe("input-swap");
    await app.close();
  });

  it("非 match-3 session → gamedef=null + unsupported-genre，但 gdd/dsl 仍导出", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s2: fullDslState("tower-defense") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    const res = await app.inject({ method: "POST", url: "/api/session/s2/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gamedef).toBeNull();
    expect(body.diagnostics[0].kind).toBe("unsupported-genre");
    expect(body.dsl).toBeTruthy();
    expect(existsSync(resolve(exportDir, "s2", "gamedef.json"))).toBe(false);
    await app.close();
  });

  it("GET /api/session/:id/gamedef 取回已导出的 def", async () => {
    const app = buildServer({
      llm: scriptedFill(goodFill),
      store: memStore({ s3: fullDslState("match-3") }),
      catalog: fixtureCatalog,
      systemPrompt: "x",
      exportDir,
    });
    await app.inject({ method: "POST", url: "/api/session/s3/export" });
    const res = await app.inject({ method: "GET", url: "/api/session/s3/gamedef" });
    expect(res.statusCode).toBe(200);
    expect(res.json().input.use).toBe("input-swap");
    await app.close();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm test -- export.test`
Expected: FAIL（响应无 `gamedef` 字段 / 无 `gamedef.json` / GET 端点 404）。

- [ ] **Step 4: 接入 export handler + GET 端点**

在 `apps/server/src/server.ts` 顶部 import 增加：

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { produceGameDef } from "./gameDefFill.js";
import { supportedMatch3Genre } from "@cq/orchestrator";
```

把 export handler（当前 `server.ts:118-131`）改为：

```ts
  app.post<{ Params: { id: string } }>("/api/session/:id/export", async (req, reply) => {
    const state: ConversationState | null = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });

    const synthesis = buildSynthesis(state, deps.catalog, profile);
    if (!synthesis) {
      const { missing } = toGameDsl(state);
      return reply.code(409).send({ error: "DSL incomplete", missing });
    }

    const dir = resolve(exportRoot, req.params.id);
    writeBundle(dir, synthesis);

    // —— S1：对话产物 → 编排 GameDef ——
    const s1 = supportedMatch3Genre(state)
      ? await produceGameDef(deps.llm, state)
      : { def: null, diagnostics: [{ kind: "unsupported-genre", genre: state.engineering.genre ?? null }] as const };
    if (s1.def) {
      writeFileSync(resolve(dir, "gamedef.json"), JSON.stringify(s1.def, null, 2) + "\n");
    }

    return { dir, ...synthesis, gamedef: s1.def, diagnostics: s1.diagnostics };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id/gamedef", async (req, reply) => {
    const file = resolve(exportRoot, req.params.id, "gamedef.json");
    if (!existsSync(file)) return reply.code(404).send({ error: "gamedef not found; export first" });
    return reply.type("application/json").send(readFileSync(file, "utf8"));
  });
```

> 注：`as const` 让 `unsupported-genre` 字面量满足 `SynthesizeDiagnostic` 类型。若 tsc 仍抱怨联合类型，改成显式注解：`{ def: null, diagnostics: [{ kind: "unsupported-genre" as const, genre: state.engineering.genre ?? null }] }`。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `pnpm test -- export.test && pnpm typecheck`
Expected: PASS + typecheck 干净。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/wire.ts apps/server/src/server.ts apps/server/test/export.test.ts
git commit -m "feat(server): emit gamedef.json on export + GET /gamedef endpoint"
```

---

## Task 8: playground 按 session 加载并运行

**Files:**
- Create: `apps/playground/src/loadSession.ts`
- Modify: `apps/playground/vite.config.ts`, `apps/playground/src/main.ts`, `apps/playground/index.html`
- Test: `apps/playground/test/loadSession.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/playground/test/loadSession.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { gameDefFromJson } from "../src/loadSession.js";
import { bejeweled } from "@cq/orchestrator";

describe("gameDefFromJson", () => {
  it("合法 GameDef JSON → def 非空、无 error", () => {
    const r = gameDefFromJson(JSON.parse(JSON.stringify(bejeweled)));
    expect(r.error).toBeUndefined();
    expect(r.def?.input.use).toBe("input-swap");
  });

  it("缺字段/非法 → def=null + error", () => {
    const r = gameDefFromJson({ id: "x", board: { size: [8, 8], tiles: ["a"] }, systems: [{ use: "不存在模块" }] });
    expect(r.def).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- loadSession`
Expected: FAIL，`../src/loadSession.js` 不存在。

> 注：playground 当前可能无 vitest include。若该测试未被 root `vitest.config.ts` 收集，确认其 `include` 覆盖 `apps/**/test/**`（现有 `apps/web/test`、`apps/server/test` 已被收集，故应已覆盖）。

- [ ] **Step 3: 实现 loadSession.ts**

创建 `apps/playground/src/loadSession.ts`：

```ts
import { validate, type GameDef } from "@cq/orchestrator";

export interface LoadResult {
  def: GameDef | null;
  error?: string;
}

/** 把任意 JSON 当作 GameDef 校验：validate 通过才放行，否则回 error。 */
export function gameDefFromJson(json: unknown): LoadResult {
  if (typeof json !== "object" || json === null) return { def: null, error: "不是对象" };
  const def = json as GameDef;
  if (!def.board || !def.input || !Array.isArray(def.systems) || !def.goal) {
    return { def: null, error: "缺少 GameDef 必需字段" };
  }
  const errors = validate(def);
  if (errors.length > 0) return { def: null, error: errors.map((e) => e.message).join("; ") };
  return { def };
}

/** 从 server 拉取某 session 已导出的 gamedef。 */
export async function fetchSessionGameDef(id: string): Promise<LoadResult> {
  const res = await fetch(`/api/session/${encodeURIComponent(id)}/gamedef`);
  if (!res.ok) return { def: null, error: `加载失败 (${res.status})，请先在对话端导出` };
  try {
    return gameDefFromJson(await res.json());
  } catch (e) {
    return { def: null, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- loadSession`
Expected: PASS（2 用例）。

- [ ] **Step 5: 加 vite 代理**

把 `apps/playground/vite.config.ts` 的 `server` 字段改为：

```ts
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:8420" },
  },
```

- [ ] **Step 6: index.html 加 session 输入**

在 `apps/playground/index.html` 的 `.bar` 区块内（`#reset` 按钮后）追加：

```html
      <input id="session" placeholder="对话 session id" style="background:#1b1f27;color:#e6e8ec;border:1px solid #2a2f3a;border-radius:8px;padding:7px 12px;font-size:13px;" />
      <button id="load">加载对话产物</button>
```

- [ ] **Step 7: main.ts 接入加载**

在 `apps/playground/src/main.ts` 顶部 import 改为：

```ts
import { createGame, bejeweled, candyCollect, validate, type GameDef } from "@cq/orchestrator";
import type { MatchEngine, Pos } from "@cq/modules";
import { fetchSessionGameDef } from "./loadSession.js";
```

在文件底部（`start()` 调用之前）追加按钮接线：

```ts
const $session = document.getElementById("session") as HTMLInputElement;
const $load = document.getElementById("load") as HTMLButtonElement;

let loadedDef: GameDef | null = null;

async function loadFromSession() {
  const id = $session.value.trim();
  if (!id) return;
  $status.textContent = "加载中…";
  const r = await fetchSessionGameDef(id);
  if (!r.def) {
    $status.textContent = "加载失败：" + r.error;
    return;
  }
  loadedDef = r.def;
  engine = createGame({ ...loadedDef, seed: (Math.random() * 1e9) | 0 });
  selected = null;
  render();
}

$load.addEventListener("click", loadFromSession);
```

并把 `start()` 改为优先用已加载的 def（替换现有 `start` 函数体首两行）：

```ts
function start() {
  if (loadedDef) {
    engine = createGame({ ...loadedDef, seed: (Math.random() * 1e9) | 0 });
    selected = null;
    render();
    return;
  }
  const def = DEFS[$game.value];
  const errs = validate(def);
  if (errs.length) {
    $status.textContent = "编排校验失败：" + errs.map((e) => e.message).join(" / ");
    return;
  }
  engine = createGame({ ...def, seed: (Math.random() * 1e9) | 0 });
  selected = null;
  render();
}
```

并让切换硬编码下拉时清掉已加载 def（在现有 `$game.addEventListener("change", start)` 之前加一行）：

```ts
$game.addEventListener("change", () => { loadedDef = null; });
```

- [ ] **Step 8: 类型检查 + 全量测试**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck 干净；全部测试 PASS（原 167 + 新增）。

- [ ] **Step 9: 手动冒烟（可选，需 .env 配好 LLM_API_KEY）**

```bash
pnpm dev:server   # 一个终端，:8420
pnpm dev:playground  # 另一个终端，:5174
```
在对话端走完一段 match-3 对话并 export 得到 session id → 在 playground 输入该 id → 点"加载对话产物" → 能玩。

- [ ] **Step 10: Commit**

```bash
git add apps/playground/src/loadSession.ts apps/playground/vite.config.ts apps/playground/src/main.ts apps/playground/index.html apps/playground/test/loadSession.test.ts
git commit -m "feat(playground): load & play a GameDef by conversation session id"
```

---

## 验收对照（spec §10）

- [x] Task 2–4：`ConversationState` + fill → 合法 `GameDef`（validate 0 error）。
- [x] Task 5：golden 证明自动对局可推进、collect 分胜负。
- [x] Task 7：export 对 match-3 产 `gamedef.json`；非 match-3 产 `unsupported-genre` 且 gdd/dsl/resolution 仍导出。
- [x] Task 8：playground 按 session 加载并真玩。
- [x] Task 5/7/8 末步：`pnpm test` / `pnpm typecheck` 全绿。

---

## 自检记录

- **Spec 覆盖**：D1–D6 全部落地（混合=Task3/6、限定子集=Task3 骨架、bundle+golden+playground=Task5/7/8、非 match-3=Task4/7、LLM 窄产物=Task2/6、synthesize 纯函数=Task4）。
- **类型一致**：`GameDefFill`/`SynthesizeDiagnostic`/`SynthesizeResult` 全程同名；`synthesize(state, fill)`、`produceGameDef(llm, state)`、`gameDefFromJson(json)`、`fetchSessionGameDef(id)` 签名前后一致。
- **无占位**：每步含可运行代码与确切命令。
- **已知风险**：Task5 collect 关的 `need` 数值依赖随机棋盘，若步数内不分胜负按步骤注释调小重跑；Task7 `as const` 联合类型若 tsc 报错按注释改显式注解。
