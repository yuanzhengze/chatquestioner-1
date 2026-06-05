# S1 闭环：对话产物 → 编排 DSL → 可玩游戏 · 设计方案

> 日期：2026-06-05 · 状态：**待用户审阅** · 类型：设计文档（spec）
> 关联：[`../../09-DSL编排引擎-最小验证方案.md`](../../09-DSL编排引擎-最小验证方案.md)（§5 三阶段路线 S1）、[`../../10-优化清单.md`](../../10-优化清单.md)（P0-1）
> 复用事实源：`packages/orchestrator`（`validate`/`createGame`/`GameDef`）、`packages/modules`（`MatchEngine`/`legalMoves`/manifests）、`packages/conversation`（`ConversationState`/`scriptedLlm`）、`apps/server`（`openaiClient`/export handler/`writeBundle`）

---

## 1. 背景与目标

### 1.1 问题
项目里存在**两套互不相通的 DSL**：
- **选择 DSL**（`GameDSL`：`constraints/genre/mechanics/modalities`）：对话产出，喂 `resolver` 选 template/skill/mcp。✅ 已闭环。
- **编排 DSL**（`GameDef`：`board/input/systems/goal/rules`）：喂 `orchestrator` 编译跑游戏。✅ 仅能跑硬编码 def。

二者之间没有任何翻译，`docs/09` §5 规划的 **S1（对话 → 编排 DSL → 编译 → 跑游戏）完全没连**。`ConversationState` 与 `GameDSL` 都只有创意/工程信号，**没有** `board.tiles`、`systems[]`、`goal` 这些 `GameDef` 必需字段。

### 1.2 目标
打通"对话 → 一个真能玩的 match-3 游戏"这条端到端管道，让 S1 可独立验收。

### 1.3 非目标（本轮不做）
- 不补编排运行时未实现模块（special-tile/board-layer/spreader 等，属优化清单 P0-2）。
- 不做 codegen / hook 逃生舱落地（属 P1-1）。
- 不接 module-index 构建期闭环（属 P1-2）。
- 不支持 match-3 以外的 genre（诚实告警，见 §6）。

---

## 2. 关键决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 翻译方式 | **混合**：规则定骨架 + LLM 填细节 + `validate` 兜底 | 纯规则填不动 board/goal 缺口；纯 LLM 易跑飞。骨架压住结构、LLM 只产创意细节最稳 |
| D2 | 本轮运行时范围 | **限定已实现子集**（Bejeweled 级 + collect/score 目标 + 步数限制） | 与 P0-2 解耦，S1 可独立验收；保证产物一定可玩 |
| D3 | 验收形态 | server 导出多产 `gamedef.json` 进 bundle + playground 按 session 加载 + golden 端到端 | 先把管道与可重复验收做扎实，UI 串联留作可选增量 |
| D4 | 非 match-3 genre | **诚实告警**（`unsupported-genre`），不勉强生成 | 不产垃圾 GameDef；其余 bundle 照常导出 |
| D5 | LLM 产物边界 | LLM 只吐窄结构 `GameDefFill`（tiles/size/goal/参数），**不吐整个 GameDef** | 把 LLM 跑飞空间压到最小；`systems[]`/依赖由骨架定死 |
| D6 | `synthesize` 纯度 | **纯函数**，LLM 调用在 server 完成、fill 作参数传入 | 翻译核心可单测、可 golden，无需真调模型 |

---

## 3. 架构与职责切分

```
ConversationState ──┐
                    ├─→ [server] LLM 产 GameDefFill (JSON)  ── 创意细节
                    │            │
                    ▼            ▼
              [orchestrator] synthesize(state, fill) ── 纯函数
                 ① 规则定骨架（genre=match-3 → 已实现子集模块清单）
                 ② 用 fill 填 tiles / 尺寸 / goal / 参数
                 ③ 组装 GameDef → validate() 兜底
                                 │
                                 ▼
                       GameDef (合法) → createGame → 可玩
```

| 单元 | 位置 | 输入 → 输出 | 纯函数 |
|---|---|---|---|
| `buildFillPrompt` + LLM 调用 + 重试 | `apps/server` | state → `GameDefFill` | 否（调 LLM，复用 `openaiClient`/`LlmClient.stream` 累积） |
| `synthesize` | `packages/orchestrator` | `(state, fill)` → `{ def \| null, diagnostics }` | 是 |
| `validate` / `createGame` / `legalMoves` | `packages/orchestrator`·`packages/modules` | 已有，复用 | 是 |

**依赖方向不变**：`orchestrator → modules`；LLM 在 `server`，`synthesize` 不依赖 LLM。

---

## 4. 数据契约

### 4.1 `GameDefFill`（LLM 唯一产物，zod 校验）

```ts
interface GameDefFill {
  tiles: string[];        // 3–7 个元素名，源自美学/主题
  size: [number, number]; // 棋盘尺寸，clamp 到 6..10
  goal:
    | { kind: "collect"; need: Record<string, number> }  // need 的键须 ∈ tiles
    | { kind: "score"; target: number };
  tuning?: {
    minLine?: number;     // ≥3，默认 3
    moves?: number | null;// 默认：collect→25，score→null
    comboMult?: number;   // 默认 1.5
  };
}
```

### 4.2 诊断（`SynthesizeDiagnostic`）

```ts
type SynthesizeDiagnostic =
  | { kind: "unsupported-genre"; genre: string | null }
  | { kind: "fill-parse-error"; raw: string }
  | { kind: "fill-invalid"; issues: string[] }
  | { kind: "synthesize-failed"; errors: string[] };
```

诊断仅用于回传与判空，消费方不解析其文本格式。

---

## 5. 骨架规则（`synthesize`，确定性）

match-3 已实现子集，systems 顺序即依赖链，全部已实现运行时：

```ts
id:     slug(state.workingTitle ?? state.theme ?? "untitled-match3")
board:  { size: clampSize(fill.size), tiles: dedupeClamp(fill.tiles, 3, 7) }  // 无 layers/blockers
input:  { use: "input-swap", mode: "adjacent", requireMatch: true }
systems:[
  { use: "match-detect", line: fill.tuning?.minLine ?? 3 },
  { use: "clear-resolve" },
  { use: "gravity-fall", speed: 800 },
  { use: "refill-spawn", from: "top", weight: "even" },
  { use: "cascade", combo: true },
  { use: "score-combo", base: 10, comboMult: fill.tuning?.comboMult ?? 1.5 },
  // move-budget：goal=collect 或显式给 moves 时加入
  // shuffle-deadlock：恒加（onDeadlock:"shuffle"）
]
goal:   fill.goal → { use: "goal-tracker", collect|score }   // collect.need 过滤掉不在 tiles 的键
rules:  []   // S1 不产 rules（hook 留给 P1-1）
```

---

## 6. 数据流（挂在现有 export 流程上）

`POST /api/session/:id/export`（现有 handler `server.ts:118-131`）：

```
1. 现有：buildSynthesis → gdd.md / dsl.json / resolution.json（不变）
2. 新增 S1：
   a. genre 判定：normalizeVocabField(state.engineering.genre) === "match-3"？
      否 → gamedef=null, diagnostics=[{unsupported-genre}]
   b. 是 → buildFillPrompt(state) → LLM(stream 累积) → 剥 ```json → JSON.parse
          → FillSchema.safeParse
          - parse 失败 → 一次重试（追加"只输出 JSON"）→ 仍失败 {fill-parse-error}
          - zod 失败 → 一次重试（回喂 issues）→ 仍失败 {fill-invalid}
   c. synthesize(state, fill) → 组装 GameDef → validate()
          - validate 有 error → 一次重试（回喂 error 修 fill）→ 仍失败 {synthesize-failed}
   d. 成功 → 写 data/exports/:id/gamedef.json，纳入 ExportResponse
```

**playground 接入**：新增 `GET /api/session/:id/gamedef`（dev）；playground 增"按 session 加载"——拉取 → `validate` → `createGame` → 玩；保留现有硬编码 def 下拉。

---

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| genre 非 match-3 | `gamedef=null` + `unsupported-genre`；其余 bundle 照常导出 |
| LLM 输出非合法 JSON | 一次重试 → `fill-parse-error` |
| fill zod 校验失败 | 一次重试（回喂 issues）→ `fill-invalid` |
| 组装后 `validate()` 有 error | 一次重试（回喂 error）→ `synthesize-failed` |
| size/tiles 越界 | `synthesize` 内 clamp（size→6..10，tiles 去重取 3..7），不报错 |
| goal.collect 引用不存在的 tile | 过滤非法 need 键，保证目标可达 |

原则：**不产半截 GameDef**，要么合法可玩，要么 null + 诊断。

---

## 8. 测试策略

- `orchestrator/synthesize.test.ts`：罐装 `(state, fill)` → 断言 GameDef 合法、`validate` 0 error、`createGame` 可实例化；非法 fill → `def=null`+诊断；clamp/过滤边界。
- `orchestrator/synthesize-golden.test.ts`（**最高价值**）：罐装 state + fill → GameDef → `createGame` 用 `legalMoves` 自动对局 N 步 → 断言状态推进/分数增长，证明"对话→真能玩"。
- `server/gameDefFill.test.ts`：JSON 解析容错（剥 ```json）、重试触发逻辑（scriptedLLM 先吐坏 JSON 再吐好的）。
- `server/export.test.ts`：scriptedLLM 注入 → match-3 session 导出含 `gamedef.json`；非 match-3 → `gamedef=null`+`unsupported-genre`。
- `playground/loadSession.test.ts`：解析 bundle JSON → 合法 GameDef 的纯函数单测。

---

## 9. 文件清单

```
新增 packages/orchestrator/src/synthesize/fill.ts        # GameDefFill 类型 + FillSchema + clamp/dedupe 工具
新增 packages/orchestrator/src/synthesize/skeleton.ts    # match-3 已实现子集骨架（纯函数）
新增 packages/orchestrator/src/synthesize/synthesize.ts  # synthesize(state, fill) → {def|null, diagnostics}
修改 packages/orchestrator/src/index.ts                  # 导出 synthesize / GameDefFill / FillSchema / 诊断类型
新增 apps/server/src/gameDefFill.ts                      # buildFillPrompt + LLM 调用 + 重试
修改 apps/server/src/server.ts                           # export handler 接 S1 步骤 + GET /gamedef 端点
修改 apps/server/src/wire.ts                             # ExportResponse 加 gamedef + diagnostics
修改 packages/resolver/src/bundle.ts                     # writeBundle 写 gamedef.json（或 server 侧单写，实施时定）
修改 apps/playground/src/main.ts + index.html           # 按 session 加载并运行，保留硬编码下拉
```

复用：`validate`/`createGame`/`MatchEngine.legalMoves`/`scriptedLlm`/`writeBundle`/`openaiClient` 全部复用。

---

## 10. 验收标准

- [ ] 一段 match-3 对话的 `ConversationState`（+ LLM fill）→ 合法 `GameDef`（`validate` 0 error）。
- [ ] 该 `GameDef` 经 `createGame` 自动对局可推进、可达成 goal（golden 断言）。
- [ ] `/api/session/:id/export` 对 match-3 session 产出 `gamedef.json`；非 match-3 产 `gamedef=null` + `unsupported-genre`，且 gdd/dsl/resolution 仍正常导出。
- [ ] playground 能按 session 加载该 GameDef 并真玩。
- [ ] `pnpm test` / `pnpm typecheck` 全绿。

---

## 11. 开放问题

- `gamedef.json` 写入由 `writeBundle` 统一负责还是 server 侧单写——实施时按改动量定，二者等价。
- playground 取产物用静态文件还是 `GET /gamedef` 端点——倾向端点（与现有 server 一致），实施时定。
