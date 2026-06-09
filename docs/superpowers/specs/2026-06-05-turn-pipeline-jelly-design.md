# 回合管线化 + 果冻层运行时 · 设计方案

> 日期：2026-06-05 · 状态：**待用户审阅** · 类型：设计文档（spec）
> 关联：[`../../09-DSL编排引擎-最小验证方案.md`](../../09-DSL编排引擎-最小验证方案.md)（§5 S0、§6.2 模块库）、[`../../10-优化清单.md`](../../10-优化清单.md)（P0-2 第一项：board-layer + clearLayer）
> 复用事实源：`packages/modules`（`MatchEngine`/`stages.ts`/`manifests.ts`/`state.ts`）、`packages/orchestrator`（`createGame`/`validate`/`GameDef`/games）、`apps/playground`
> 前置阅读：S1 spec/plan（本轮不改 `synthesize`/`skeleton` 及其测试）

---

## 1. 背景与目标

### 1.1 问题
`GameDef.systems[]` 表面声明式、可插拔，实则**假插拔**：`createGame` 把 systems 数组拍平成 `EngineConfig` 的扁平字段（`cascade:boolean` / `comboMult:number` …），真正的回合流程写死在 `MatchEngine.trySwap` 一条瀑布里（swap → match → clear → score → gravity → refill → 连锁循环 → 步数 → 判胜负 → 防死锁）。systems 的**顺序和组合从未参与编排**，只被探测存在性。

后果：新增机制（果冻层、特殊糖果等）无法靠"加模块"完成，必须改 `trySwap` 本体——这正是 P0-2 卡住的根因，也是"DSL 可编排可插拔"承诺的断点。

### 1.2 目标
1. 把写死的回合瀑布重构成**有序 Phase 管线**：引擎按 `GameDef` 编译出的 phase 序列执行，systems 真正驱动流程。
2. 在管线上**新增果冻层运行时**：`board-layer` + `clear-resolve.clearsLayer` + `goal-tracker.clearLayer`，让"清果冻"关真能玩。
3. 提供一份手写 `candyCrushJelly` def，在 playground 可玩、有 headless golden 验收。

### 1.3 非目标（本轮不做）
- 不做 `special-tile`/`special-trigger`/`spreader`/`drop-collect`（P0-2 第二项，下一轮）。管线**预留** generate-special 槽，使其后续是"加模块"而非"改瀑布"。
- 不改 S1 的 `synthesize`/`skeleton` 及其测试（skeleton 继续产已实现子集，不产 layers）。
- 不做 codegen / hook（P1-1）。不接 module-index 构建期（P1-2）。
- 不上自定义文本语法，继续用 TS 对象字面量。

---

## 2. 关键决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 执行模型 | **有序 Phase 管线**：每个 system 模块贡献 0..N 个 phase，注册到具名阶段槽，引擎只按序跑 | 让 systems 顺序/组合真正生效；新增机制=注册 phase，不改引擎本体 |
| D2 | `MatchEngine` 去留 | **保留外壳与公开接口**（`getState/legalMoves/trySwap/config`），仅把内部瀑布换成"跑管线" | 锁死被 S0/S1 golden、playground、server 依赖的契约，零破坏 |
| D3 | `EngineConfig` 去留 | **保留并扩展**（加 `layers?`），不推翻 | `state.ts`/`createGame`/S1 都依赖它；管线由 def+config 一起编译 |
| D4 | 等价性保证 | Bejeweled/candyCollect 装出的管线必须与现瀑布**逐步等价**，用现有确定性 golden（同种子同结果）锁死 | 重构不得改变既有两个游戏的任何可观察行为 |
| D5 | 本轮新机制范围 | **只做果冻层**（board-layer + clearLayer goal），special 留下一轮 | 足以验证"真插拔"，复杂度与风险可控 |
| D6 | layer 状态存放 | 放进 `GameState.layers?: (number|null)[][]`（与 board 同形，数字=剩余层数，null=该格无层） | 与 board 平行、可序列化、golden 可断言；不引入并行数据结构 |
| D7 | layer 覆盖范围 | `board-layer.coverage` 支持 `"all"`（全盘 1 层）本轮够用；其余值（如 "bottom-2rows"）解析失败则退化为 all 并不报错 | 清果冻 MVP 只需全盘层；扩展留参数位 |

---

## 3. 架构与职责切分

```
GameDef ──[orchestrator.createGame]──┐
   │  toEngineConfig(def) → EngineConfig(+layers)
   └─────────────────────────────────┤
                                      ▼
              [modules] compilePipeline(config) → Phase[]
                                      │
                                      ▼
              MatchEngine（外壳不变）
                 constructor: 建 board (+layers)，ensurePlayable
                 trySwap(a,b): 建 TurnContext → 依次跑 Phase[] → 回 SwapResult
                 getState/legalMoves/config: 不变
```

**依赖方向不变**：`orchestrator → modules`。管线编译、phase、layer 运行时**全部落在 `packages/modules`**（运行时归属 modules，编排归属 orchestrator）。`createGame` 只多翻译一个 `layers` 字段。

| 单元 | 位置 | 职责 | 纯度 |
|---|---|---|---|
| `toEngineConfig` | orchestrator | `GameDef`→`EngineConfig`（新增 layers 翻译） | 纯 |
| `compilePipeline` | modules（新增 `engine/pipeline.ts`） | `EngineConfig`→`Phase[]`（按 systems 决定装哪些 phase、是否成环） | 纯 |
| phase 实现 | modules（`engine/phases.ts` 新增，复用 `stages.ts` 纯函数） | 每个 phase 读写 `TurnContext` | 纯（rng 经 ctx 注入） |
| `MatchEngine` | modules（改写内部） | 建上下文、跑管线、维护 state（含 layers） | 有状态外壳 |

---

## 4. 管线模型

### 4.1 阶段槽（固定顺序）
一个回合由固定顺序的"阶段槽"组成；每个 system 模块把自己的 phase 注册到某个槽。引擎按槽序执行，**槽序固定、槽内容由 def 决定**：

```
onSwap        → 交换 a,b（input-swap）
detect        → 找匹配（match-detect）写入 ctx.matches
generateSpecial → 预留槽（本轮空；special-tile 下一轮注册）
resolveClear  → 清除 matches；若 clearsLayer 则先扣层、被层挡住的格不消（clear-resolve）
scoring       → 按本步清除数 + 连击倍率加分（score-combo）
applyGravity  → 下落（gravity-fall）
refill        → 顶部补齐（refill-spawn）
[cascade 回到 detect：若 cascade 在编排里且本步有清除，则循环]
postTurn      → 步数-1（move-budget）
evaluateGoal  → 判胜负（goal-tracker：collect/score/clearLayer）
ensurePlayable→ 无解则重洗/结束（shuffle-deadlock）
```

> `requireMatch` 的"弹回"语义：onSwap 后首次 detect 若无匹配且 requireMatch，则撤销交换、回 `{legal:false}`，不进入后续槽。这与现 `trySwap` 行为一致。

### 4.2 类型契约

```ts
// engine/pipeline.ts
export interface TurnContext {
  board: Board;
  layers: (number | null)[][] | null;   // 与 board 同形；null = 本局无层
  state: GameState;                      // 引擎可变状态（score/collected/movesLeft/status/lastCombo）
  config: EngineConfig;
  rng: () => number;
  matches: Pos[];                        // detect 写、resolveClear 读
  clearedThisStep: number;               // resolveClear 写、scoring 读
  combo: number;                         // 连锁深度
  legal: boolean;                        // requireMatch 弹回时置 false
}

export type Phase = (ctx: TurnContext) => void;

export function compilePipeline(config: EngineConfig): {
  runTurn: (ctx: TurnContext) => void;   // 执行一个完整回合（含 cascade 环）
};
```

`compilePipeline` 内部按 config 组装 phase 列表与 cascade 环，返回一个 `runTurn`。`MatchEngine.trySwap` 只负责：构造 ctx → `runTurn(ctx)` → 把 ctx 回写进 state → 组 `SwapResult`。

### 4.3 等价性约束（D4）
对 `layers === null` 且无新模块的 def（即 Bejeweled/candyCollect），`runTurn` 必须产生与现 `trySwap` **逐位等价**的结果：相同种子下，每一步 board、score、collected、movesLeft、status、combo 完全一致。验收靠现有 `orchestrator/test/golden.test.ts`（确定性断言 + 同种子可复现）保持全绿，必要时补一条"重构前后同种子轨迹一致"的快照。

---

## 5. 果冻层运行时（本轮新机制）

### 5.1 状态
`GameState` 新增 `layers?: (number | null)[][]`：与 board 同形，元素是该格剩余层数（≥1），`null` = 该格无层。`getState()` 深拷贝 layers。无 `board-layer` 模块时 `layers` 为 `undefined`/`null`，不影响旧路径。

### 5.2 初始化
`board-layer.coverage === "all"`（或无法识别的值）→ 全盘每格 1 层（`layer` 字段记层类型名，仅展示用）。`MatchEngine` 构造时若 config.layers 存在则初始化 `state.layers`。

### 5.3 消除时清层（clear-resolve.clearsLayer）
resolveClear phase：对每个 match 到的格子，
- 若该格 `layers[r][c]` 为 number 且 >0：**层减 1**；层清零后置 `null`。本步**该格元素是否一并消除**取经典 Candy Crush 语义——消除该格元素（层与糖一起处理：糖被消、层 -1）。即：匹配命中即消糖，命中处若有层则同时减一层。
- 计入 `collected` 与 `clearedThisStep` 的口径不变（按被消糖的颜色统计）。

> 简化但自洽：本轮"匹配命中处若有层则同时 -1 层"。这让"在有层处反复制造匹配"即可清层，golden 自动对局可达成。更复杂的"层挡住下落/需相邻"等留作 special 轮。

### 5.4 目标（goal-tracker.clearLayer）
`Goal` 类型扩展：

```ts
export type Goal =
  | { kind: "collect"; need: Record<string, number> }
  | { kind: "score"; target: number | "endless" }
  | { kind: "clearLayer" };          // 全盘 layers 归零即 won
```

evaluateGoal phase：`clearLayer` 时，`layers` 全为 `null`（无剩余层）→ `won`。`createGame.toGoal` 增加：`goal-tracker.clearLayer` 存在 → `{ kind: "clearLayer" }`（不再退化 endless）。

### 5.5 GameDef → EngineConfig 翻译
`toEngineConfig` 新增：读 `def.board.layers`，若含 `board-layer` 则 `config.layers = { coverage, layer }`；`clear-resolve.clearsLayer` 透传；goal 为 `clearLayer` 时走 5.4。`EngineConfig` 加可选字段：

```ts
layers?: { coverage: string; layer: string } | null;
clearsLayer?: boolean;
```

---

## 6. 手写样本：candyCrushJelly

```ts
// packages/orchestrator/src/games/candyCrushJelly.ts
export const candyCrushJelly: GameDef = {
  id: "candy-crush-jelly",
  board: {
    size: [8, 8],
    tiles: ["red", "orange", "yellow", "green", "blue", "purple"],
    layers: [{ use: "board-layer", layer: "jelly", coverage: "all" }],
  },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve", clearsLayer: "jelly" },
    { use: "gravity-fall", speed: 700 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 60, comboMult: 1.5 },
    { use: "move-budget", moves: 40 },
    { use: "shuffle-deadlock", onDeadlock: "shuffle" },
  ],
  goal: { use: "goal-tracker", clearLayer: "jelly" },
  rules: [{ when: "goal-met", then: "win" }, { when: "moves == 0", then: "lose" }],
  seed: 11,
};
```

> `validate(def)` 必须 0 error：`board-layer` deps `board-grid`✓、`clear-resolve` deps `match-detect`✓、`goal-tracker.clearLayer` 是已声明参数✓。move-budget=40 给 golden 足够步数清全盘层。

`createGame` 导出 `candyCrushJelly`；playground 下拉新增一项。

---

## 7. 文件清单

```
新增 packages/modules/src/engine/pipeline.ts      # TurnContext / Phase / compilePipeline
新增 packages/modules/src/engine/phases.ts         # 各槽 phase 实现（复用 stages.ts）
修改 packages/modules/src/engine/state.ts          # GameState.layers?；Goal 加 clearLayer；EngineConfig 加 layers?/clearsLayer?
修改 packages/modules/src/engine/MatchEngine.ts     # 内部改为 compilePipeline + runTurn；构造初始化 layers
修改 packages/modules/src/engine/stages.ts          # 新增 clearTilesWithLayer（或扩展 clearTiles）；其余不动
修改 packages/modules/src/index.ts                  # 导出 compilePipeline/TurnContext/Phase（如需）
修改 packages/orchestrator/src/createGame.ts        # toEngineConfig 翻译 layers/clearsLayer/clearLayer goal
新增 packages/orchestrator/src/games/candyCrushJelly.ts
修改 packages/orchestrator/src/index.ts             # 导出 candyCrushJelly
新增 packages/modules/test/pipeline.test.ts         # 管线单测 + 等价性
新增 packages/modules/test/jelly.test.ts            # 果冻层运行时单测
修改 packages/orchestrator/test/golden.test.ts      # 加 candyCrushJelly golden（清层→won）
修改 apps/playground/src/main.ts + index.html       # 下拉加 candy-crush-jelly；render 画果冻层
```

复用：`stages.ts` 全部纯函数、`makeRng`、`validate`、现有 golden autoPlay 模式。

---

## 8. 测试策略

- `modules/test/pipeline.test.ts`：
  - 等价性：同种子下，`compilePipeline`+runTurn 跑 bejeweled/candyCollect 的逐步轨迹 == 重构前快照（board/score/collected/status 序列）。
  - 槽序：requireMatch 弹回（无匹配交换 → legal=false、board 复原）；cascade 开/关时连锁次数差异。
- `modules/test/jelly.test.ts`：
  - 初始化：coverage=all → 全盘 layers 全为 1。
  - 清层：在有层格制造匹配 → 对应格 layer 归零置 null、糖被消、collected 记账。
  - 目标：layers 全清 → status=won。
- `orchestrator/test/golden.test.ts`（追加，最高价值）：
  - candyCrushJelly autoPlay：headless 自动对局在步数内把全盘 layers 清空 → won；同种子可复现。
- `orchestrator` 既有 golden/validate/synthesize* 全绿（零破坏验收）。

---

## 9. 验收标准

- [ ] `pnpm test` 全绿（既有 167 + 新增），`pnpm typecheck` 干净。
- [ ] Bejeweled/candyCollect 在同种子下行为与重构前逐步一致（等价性测试 + 既有 golden）。
- [ ] `validate(candyCrushJelly)` 返回 0 error。
- [ ] candyCrushJelly headless autoPlay 能清空全盘果冻层 → won，且可复现。
- [ ] playground 选 candy-crush-jelly 能玩：可见果冻层、消除清层、清完判胜。
- [ ] 新增机制为"注册 phase + 加 manifest 已声明参数"，未改动 `trySwap` 式的写死瀑布（瀑布已被管线取代）。

---

## 10. 风险与回退

- **等价性回归**：管线重构最大风险是无意改变 Bejeweled/candyCollect 行为。缓解：先写"重构前轨迹快照"测试，再重构，绿了才继续。
- **layer 语义争议**：5.3 采用"匹配命中处同时 -1 层"的简化语义。若后续要经典"层独立于糖"的规则，扩展 phase 即可，不影响管线骨架。
- **cascade 环边界**：连锁循环须与现 `while(matches)` 完全对齐（含 cascade 关时只清一次）。等价性测试覆盖。

## 11. 开放问题
- `compilePipeline` 是否需要把 phase 列表暴露给 codegen（P1-1）复用？本轮先内部用，接口保持可被 emit 的纯结构，便于后续。
