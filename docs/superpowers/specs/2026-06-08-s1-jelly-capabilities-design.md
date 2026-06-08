# S1 扩展：可落地玩法能力清单 + skeleton 产果冻关 · 设计方案

> 日期：2026-06-08 · 状态：**待用户审阅** · 类型：设计文档（spec）
> 关联：[`2026-06-05-s1-conversation-to-gamedef-design.md`](./2026-06-05-s1-conversation-to-gamedef-design.md)（S1 翻译管道）、[`2026-06-05-turn-pipeline-jelly-design.md`](./2026-06-05-turn-pipeline-jelly-design.md)（果冻层运行时）、[`../../09-DSL编排引擎-最小验证方案.md`](../../09-DSL编排引擎-最小验证方案.md)（§4.5 门控不占上下文）
> 复用事实源：`packages/orchestrator`（`synthesize`/`buildSkeleton`/`FillSchema`/`createGame`/`validate`/`candyCrushJelly`）、`apps/server`（`gameDefFill.ts` 的 `FILL_SYSTEM`/`buildFillPrompt`）

---

## 1. 背景与目标

### 1.1 问题
上一轮把果冻层运行时（`board-layer` + `clearLayer` goal）做通了，但**只有手写 `candyCrushJelly` def 能用**：S1 的 `buildSkeleton` 故意只产已实现子集（collect/score），不产 layers。结果是——运行时支持清果冻，但**没有任何一段对话能产出带 layers 的 GameDef**。

更深一层：对话端（chat-questioner agent）对"下游引擎到底能稳稳做出哪些玩法"是**瞎的**，没有单一事实源说明"当前可落地的玩法有哪几种"。这也是 §4.5"门控暴露给 agent"机制缺的那块——但暴露的应是**玩法能力档案（成品粒度）**，不是底层模块 list（零件粒度）。

### 1.2 目标
1. 建一份**可落地玩法能力清单（capability profiles）**作为单一事实源：当前 synthesize 真正能产出的玩法（collect / score / clearLayer），含 id + 一行描述 + 主题适配提示。
2. 让 `FillSchema.goal` 支持 `clearLayer`，`buildSkeleton` 见到它就产果冻关（layers + clearsLayer + clearLayer goal + move-budget）。
3. server 的 fill prompt 改为**由 capability 清单驱动生成**"有哪些 goal 可选"，消除"清单支持、prompt 没提"的漂移。

### 1.3 非目标（本轮不做）
- 不改 conversation 的提问/系统 prompt、不做对话端主动引导（用户保留现版"纯发散引导"作为 A，另起被清单引导的 B 做人工 AB，属下一步）。capability 清单设计成对话端将来可直接 import 的形状。
- 不做 special candy（管线已留 generateSpecial 空槽，下一轮）。
- coverage 固定 "all"，不开放给 LLM（运行时只实现 all）。
- 不上文本语法，继续 TS 对象。

---

## 2. 关键决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 暴露给 agent 的粒度 | **玩法能力档案（capability profiles）**，非底层模块 list | 用户头脑风暴关心玩法成品（"清掉果冻才算赢"），不关心 gravity-fall；§4.5 门控精神 |
| D2 | 触发果冻关的判定 | **A 方案：LLM 在 fill 里选 `goal.kind:"clearLayer"`** | 符合 S1 "骨架定结构、LLM 填创意"（D5）；规则关键词命中太脆 |
| D3 | capability 清单位置 | `packages/orchestrator/src/capabilities.ts` | 紧挨 synthesize，运行时能力变更一处同步；对话端将来跨包 import 合理 |
| D4 | 清单与 fill 的关系 | fill prompt 的"goal 可选项"段落由清单**生成**，不再手写 | 杜绝清单/prompt 漂移；加新玩法只改清单一处 |
| D5 | coverage | skeleton 固定写 `"all"`，不进 fill | 运行时只实现 all，避免 LLM 产 "bottom-2rows" 造成体验落差 |
| D6 | 果冻关步数 | clearLayer 必带 move-budget（fill.tuning.moves 或默认 40） | 果冻关需步数约束才成立关卡；与手写 candyCrushJelly 对齐 |
| D7 | synthesize 签名/纯度 | 不变（纯函数，validate 兜底） | clearLayer 自动走通现有 synthesize，零签名变更 |

---

## 3. 数据契约

### 3.1 GameplayCapability（capabilities.ts）

```ts
export type GoalKind = "collect" | "score" | "clearLayer";

export interface GameplayCapability {
  goal: GoalKind;
  title: string;        // 人读名："清果冻关"
  summary: string;      // 一行玩法描述（给 agent / prompt）
  themeHints: string;   // 适合的主题意象（引导命中用）
}

export const GAMEPLAY_CAPABILITIES: GameplayCapability[] = [
  { goal: "collect",    title: "收集关", summary: "消除同色累计到目标数量即胜",
    themeHints: "收集 / 喂养 / 攒齐 / 采集类主题" },
  { goal: "score",      title: "计分关", summary: "无尽消除冲击目标分数",
    themeHints: "放松 / 高分挑战 / 无尽类主题" },
  { goal: "clearLayer", title: "清果冻关", summary: "棋盘覆盖一层果冻，在其上消除清层，全盘清空即胜",
    themeHints: "清理 / 净化 / 解救被困 / 覆盖物类主题" },
];

/** 给 fill prompt 用：把可选玩法渲染成 JSON 示例 + 说明（D4 单一事实源）。 */
export function renderGoalOptionsForPrompt(): string;
```

### 3.2 FillSchema.goal 扩展（fill.ts）

```ts
export const GoalFillSchema = z.union([
  z.object({ kind: z.literal("collect"), need: z.record(z.number().int().positive()) }),
  z.object({ kind: z.literal("score"), target: z.number().int().positive() }),
  z.object({ kind: z.literal("clearLayer") }),   // 新增；无额外参数（coverage 固定 all）
]);
```

诊断类型 `SynthesizeDiagnostic` 不变。

---

## 4. skeleton 果冻关分支（skeleton.ts）

`buildSkeleton` 在现有基础上，当 `fill.goal.kind === "clearLayer"` 时：

```
board.layers += { use: "board-layer", layer: "jelly", coverage: "all" }
clear-resolve  → { use: "clear-resolve", clearsLayer: "jelly" }   // 替换无参版
goal           → { use: "goal-tracker", clearLayer: "jelly" }
move-budget    → { use: "move-budget", moves: fill.tuning?.moves ?? 40 }  // 果冻关必带
其余 systems（match-detect/gravity/refill/cascade/score-combo/shuffle）不变
```

collect / score 两条分支**完全不变**（等价性由现有 synthesize 测试保证）。产出的果冻关 def 结构与手写 `candyCrushJelly` 同构，`validate` 必 0 error。

---

## 5. fill prompt 由清单驱动（server/gameDefFill.ts）

`FILL_SYSTEM` 当前硬编码"goal 形如 collect/score"。改为：goal 可选项段落用 `renderGoalOptionsForPrompt()` 注入，使其自动包含 clearLayer 及主题适配提示。其余（剥 ```json、重试、produceGameDef 逻辑）不变。

示例（清单生成的片段）：
```
"goal" 可选三种之一：
- { "kind": "collect", "need": { "元素1": 20 } }  // 收集关：消除同色累计到目标数量即胜（收集/喂养/攒齐类主题）
- { "kind": "score", "target": 5000 }              // 计分关：无尽消除冲击目标分数（放松/高分挑战类主题）
- { "kind": "clearLayer" }                          // 清果冻关：棋盘覆盖一层果冻，消除清层，全盘清空即胜（清理/净化/解救类主题）
```

---

## 6. 文件清单

```
新增 packages/orchestrator/src/capabilities.ts          # GameplayCapability + GAMEPLAY_CAPABILITIES + renderGoalOptionsForPrompt
修改 packages/orchestrator/src/index.ts                  # 导出 capabilities
修改 packages/orchestrator/src/synthesize/fill.ts        # GoalFillSchema 加 clearLayer
修改 packages/orchestrator/src/synthesize/skeleton.ts    # clearLayer 分支
新增 packages/orchestrator/test/capabilities.test.ts     # 清单 + renderGoalOptionsForPrompt
修改 packages/orchestrator/test/synthesize.test.ts       # fill clearLayer 通过 + skeleton 果冻关组装 + validate 0
修改 packages/orchestrator/test/synthesize-golden.test.ts# 对话(clearLayer fill) → GameDef → 自动对局清层(可控规模)
修改 apps/server/src/gameDefFill.ts                      # FILL_SYSTEM 注入 renderGoalOptionsForPrompt()
修改 apps/server/test/gameDefFill.test.ts（如存在断言 prompt） # 适配（按需）
```

复用：`buildSkeleton`/`validate`/`createGame`/`MatchEngine.legalMoves`/`candyCrushJelly`（结构参照）/现有 golden autoPlay。

---

## 7. 测试策略

- `capabilities.test.ts`：GAMEPLAY_CAPABILITIES 含三种 goal；`renderGoalOptionsForPrompt()` 文本含 collect/score/clearLayer 三段且含 themeHints 关键词。
- `synthesize.test.ts`（追加）：
  - `FillSchema` 接受 `{ kind: "clearLayer" }`。
  - `buildSkeleton(clearLayer fill)` → board.layers 含 board-layer、clear-resolve 带 clearsLayer、goal 为 clearLayer、含 move-budget(默认40)；collect/score 分支保持原样（回归）。
  - `validate(果冻关 def)` === []。
- `synthesize-golden.test.ts`（追加）：clearLayer fill → synthesize → createGame，小棋盘(如 4×4 + tiles 3) autoPlay 清空全盘层 → won，同种子可复现。
- `gameDefFill.test.ts`：produceGameDef 注入 scripted LLM 吐 `{kind:"clearLayer"}` fill → def 非空、def.goal.clearLayer 存在（或 def.board.layers 非空）。
- 全量 `pnpm test` / `pnpm typecheck` 绿；S1 既有 synthesize/export/golden 测试不破坏。

---

## 8. 验收标准

- [ ] `GAMEPLAY_CAPABILITIES` 是单一事实源，含 collect/score/clearLayer 三档。
- [ ] fill prompt 的 goal 可选项由清单生成（含 clearLayer + themeHints），无手写漂移。
- [ ] LLM 产 `{kind:"clearLayer"}` fill → synthesize 产出合法果冻关 GameDef（validate 0）。
- [ ] 该果冻关 createGame 自动对局可清层 → won（golden，可控规模 + 可复现）。
- [ ] collect/score 既有行为零变化（回归测试）。
- [ ] `pnpm test` / `pnpm typecheck` 全绿。
- [ ] 未触碰 conversation 提问/系统 prompt（A 版纯发散引导保持原样）。

## 9. 开放问题
- clearLayer 关的 move-budget 默认 40：8×8 全盘 64 格，贪心 autoPlay 难在 40 步清完（关卡难度问题，非引擎）。golden 用小棋盘验证目标贯通；真关步数留作产品调参。
- capability 清单将来供对话端 B 版引导时，是否要带"代表作示例游戏"字段——本轮先不加，B 版按需扩。
