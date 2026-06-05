# chat-questioner 设计方案 —— DSL 游戏编排引擎 · 最小验证方案

> 日期：2026-06-04 · 状态：**待用户审阅** · 类型：设计方案 + P0 实施 spec
> 关联：[`01-设计方案.md`](./01-设计方案.md)（DSL/resolver 主设计）、[`07-设计方案-知识库.md`](./07-设计方案-知识库.md)
> 复用事实源：`packages/resolver`（`buildCatalog()` 构建期索引模式）、`packages/dsl`（zod + `schema_version` 纪律）、forgeax-studio `pixijs-2d` 内核（已分层的运行时底座）

---

## 1. 背景与定位

### 1.1 想法
把 DSL 从现在的「选择 / 门控层」升级为**顶层游戏编排引擎**：把模板切碎成「用底层语言（TS）写的可复用模块」，顶层用声明式 DSL 编排游戏流程。目标收益是把「写实现代码 + 读用法文档」的上下文移出 agent 窗口——对被模块覆盖的部分成立（大幅降低），长尾创意与调试仍需代码进窗口（不归零），本质是把成本从运行时 LLM 转移到平台/模块库的研发维护。

### 1.2 两个真实阻碍（本文重点回答）
1. **怎么把一个游戏拆成 DSL 编排？**（§3 方法论）
2. **要新增 / 修改的模块，用什么方式索引和新增？**（§4 机制）

### 1.3 关键决策：不 fork agentic_os
两个阻碍都是 **DSL / 模块模型问题**，与 agentic_os 的复杂度（kubee 编排、profile、MCP wire、sandbox 生命周期）**正交**。fork 它会背上与验证无关的包袱。

**结论**：建一个独立、极薄的「编排验证台」，agent 最后才进（§5）。运行时直接复用 forgeax 的 `pixijs-2d` 内核——它的 `packages/render-adapter`（pixi/three）、`packages/platform`、`engine/` 已经分层好，AI 不写；变动只在 `game/core`。

---

## 2. 总体架构

### 2.1 四层（在现有底座上加两层）

| 层 | 内容 | 状态 | DSL 关系 |
|---|---|---|---|
| **L0 运行时内核** | engine 循环 / render-adapter(pixi·three) / platform / i18n | 已存在（forgeax） | 永不触碰内部，只选择+配置 |
| **L1 系统模块库** | 每个 genre 的可组合系统：网格/移动/匹配/下落/计分… | **要建** | 模块 = TS 实现 + manifest 契约 |
| **L2 编排 DSL** | 声明式游戏图：world/entities/systems/rules/tuning | **要建** | agent 真正"写"的东西 |
| **L3 编译器/装配器** | DSL → 生成 `GameInstance`/`MainScene`（import 模块 + 接线） | **要建** | 纯函数、确定性、保留逃生舱 |

### 2.2 验证台包结构（置于 chat-questioner monorepo）

```text
chat-questioner/
├── packages/
│   ├── modules/        # L1 系统模块库：每模块 = index.ts + module.manifest.ts + module.test.ts
│   ├── orchestrator/   # L2 DSL parser + L3 codegen
│   └── module-index/   # 模块索引器（仿 resolver/catalog）
└── apps/
    └── playground/     # 本地：贴一段 DSL → 编译 → vite 跑出真实游戏，零 agent
```

**依赖方向**：`playground → orchestrator → {modules, module-index}`；`module-index → modules`（只读 manifest）；`orchestrator → @cq/dsl`（复用 zod）。

---

## 3. 阻碍一 · 游戏拆解方法论（ECS 透镜 + 三色标记）

### 3.1 六个正交问题（即拆解顺序）

| # | 问题 | 落到 DSL |
|---|---|---|
| 1 | **世界**：空间是什么（网格/连续平面/棋盘）？ | `world` / `board` |
| 2 | **实体**：场上有哪些"东西"，各几个？ | `entities`（带 count） |
| 3 | **状态**：每个实体携带什么数据？ | 由挂载系统隐含声明 |
| 4 | **系统**：每 tick 对实体做什么？ | `use 系统(...)` |
| 5 | **规则**：什么条件 → 什么后果？ | `rules` |
| 6 | **调参**：所有可调数字 | `tuning` / `config` |

### 3.2 拆解工作流（对任意游戏走一遍）

1. 写一句话核心循环（直接从 GDD / NewBee 对话产出拿）。
2. 列实体 + 数量。
3. 对每个实体问「它每帧在干嘛」→ 落成系统。
4. 画**交互矩阵**（实体 × 实体，碰到会怎样）→ 直接生成 `rules`。
5. 列胜负 / 结束条件 → 补进 `rules`。
6. 把所有写死的数字抽出来 → `tuning`。
7. **三色标记**每个系统/规则（§3.3）。

### 3.3 三色标记法（判断"能不能编排"的核心工具）

- 🟢 **绿**：已有通用模块（grid-move、collide、score…）→ 直接 `use`。
- 🟡 **黄**：genre 特有但可复用（match-detect、wave-spawner…）→ 要建模块。
- 🔴 **红**：本游戏独有的灵魂逻辑，没法复用 → 手写 hook（逃生舱）。

> **红色比例 = 逃生舱触发率**，是验证一个 genre 适不适合 DSL 化的核心健康指标。反复做几个该 genre 游戏后红色稳定降到低位（建议 <15%）= 成功；老是大片红 = 该 genre 不适合硬上。

### 3.4 实例：coin-collector（来自真实 `GameInstance.ts`）

核心循环：玩家八向移动收集金币、躲避反弹的敌人；全收集胜、触敌负。

交互矩阵：

| player 撞上 → | coin | enemy | wall |
|---|---|---|---|
| 后果 | +10 分、消除 | 失败 | 阻挡 |

编排结果：

```text
world  { grid 20x15 tile 32; walls 0.1 }
player { use grid-move(speed 200, boost 1.6), wall-collide }
coin x10  { use pickup(score +10) }
enemy x3  { use bounce-ai(speed 20..100), damage(lethal) }
rules {
  player hits coin  -> score += 10; despawn coin
  coins == 0        -> win
  player hits enemy -> lose
}
```

`grid-move`/`bounce-ai`/`pickup`/`wall-collide` 全 🟢，红色为 0 —— 这类极简游戏几乎纯 DSL。

---

## 4. 阻碍二 · 模块的索引与新增机制

**复用 `resolver/catalog` 已验证的「构建期索引」模式**（`buildCatalog()` 扫真实目录 → `CatalogIndex` JSON → resolver 消费）。模块照搬。

### 4.1 模块 = 代码 + manifest（契约）

```text
packages/modules/grid-move/
├── index.ts            # 底层 TS 实现（纯逻辑，可单测）
├── module.manifest.ts  # 契约：id / params schema / 端口 / 依赖 / 示例
└── module.test.ts      # 单测
```

manifest 是模块**对 DSL 暴露的全部契约**（详见 §6.4 类型定义）。

### 4.2 索引器（仿 `buildCatalog`）

`buildModuleIndex(modulesRoot)`：扫 `packages/modules/*/module.manifest.ts` → 产出 `module-index.json`（`params` 序列化成 JSON Schema 以便跨语言/校验）。

### 4.3 编译器消费 index

按 DSL 里 `use` 的 id 查 index → 用 `params` 校验参数 → 按 `deps` 拉依赖 → 按 `reads/writes` 检查端口接得上 → 生成 `import` + 接线。**参数填错 / 端口接不上在编译期报错，不是运行时才炸。**

### 4.4 新增 / 修改工作流

**新增**（三步，纯机械）：
1. 写 `index.ts`（实现）+ `module.test.ts`。
2. 写 `module.manifest.ts`（含 ≥1 个 `examples`）。
3. `pnpm build:module-index` → 自动收录 → DSL 立即可 `use`。

**修改**：
- 改实现、不改 `params`/端口 → 直接改 + 补单测。
- 改 `params` 形状（删字段/改类型）→ **必须升 `schema_version`**，并跑引用它的 golden 游戏确认编译仍过。

### 4.5 关键：模块索引「不占 agent 上下文」（闭环回最初的假设）

完全复用 resolver 的门控：

- agent 拿到 DSL 信号（genre/modality）→ 门控出「本 genre 可能用到的模块清单」，只含 `id + 一行描述`。
- agent 真正 `use` 某模块时，才把它的**完整 `params` schema** 拉进上下文。
- 模块**实现代码 `index.ts` 永不进上下文**——确定性、已单测，编译器直接 import。

⇒ 模块库再大，进上下文的永远是「本局这几个模块的 schema」，不是整库。这就是「写代码不进窗口」假设成立的机制保证。

---

## 5. 三阶段验证路线（agent 最后才进）

| 阶段 | 做什么 | 验证什么 | agent |
|---|---|---|---|
| **S0 · 人肉编排** | 手写 DSL → 编译 → playground 跑出真实游戏 | 拆解模型 + 模块索引/编译机制成立 | ❌ 零 agent |
| **S1 · 对话产 DSL** | chat-questioner 对话产出 → 生成 DSL 草案 → 编译 | LLM 能产合法 DSL、逃生舱触发率可控 | ✅ 最小 |
| **S2 · 回接** | 编排产物接回 agentic_os（档位 3） | 端到端 + 上下文实测降幅 | ✅ 完整 |

**别跳过 S0**：零 agent、纯本地，是检验两个阻碍最干净的环境。

---

## 6. P0 Spec —— 消除类（match-3 / merge）

### 6.1 选型理由
消除类**分解干净、高频、规则可参数化**，红色比例天然低，是验证 DSL 编排可行性的最佳首发 genre。先做 match-3（交换匹配），merge（合成）作为同框架变体。

### 6.2 L1 模块清单（match-3）

> 已按附录 A 的实拆验证修正：`special-tile`/`special-trigger`/`board-layer` 提进首发（match-3 标配）；`goal-tracker` 扩为多目标类型；蔓延物 / 拖拽输入 / 掉落收集列二批；**特殊元素组合效果保持 hook**（护城河，不强行模块化）。

| 模块 id | kind | 色 | 批次 | 职责 | 关键 params |
|---|---|---|---|---|---|
| `board-grid` | world | 🟢 | 首发 | 棋盘网格 + 元素类型集 | `size`(WxH), `tiles` |
| `board-layer` | world | 🟡 | 首发 | 覆盖层（果冻/冰冻），消除其上元素清层 | `layer`, `coverage` |
| `input-swap` | input | 🟡 | 首发 | 相邻两格交换 | `mode`:adjacent, `requireMatch` |
| `match-detect` | system | 🟡 | 首发 | 匹配检测（横竖≥N / 形状） | `line`(≥3), `shapes`(L/T) |
| `special-tile` | system | 🟡 | 首发 | 特殊元素**生成**（4连/5连/LT → 条纹/炸弹/包装） | `spawn` 映射 |
| `special-trigger` | system | 🟡 | 首发 | 特殊元素**单个触发**效果 | `effects` |
| `clear-resolve` | system | 🟡 | 首发 | 消除被匹配元素（可连带清层） | `clearsLayer` |
| `gravity-fall` | system | 🟢 | 首发 | 重力下落填补空位 | `speed` |
| `refill-spawn` | system | 🟢 | 首发 | 顶部补充新元素 | `from`, `weight` |
| `cascade` | system | 🟡 | 首发 | 连锁：消除后再检测 → 连击 | `combo`(bool) |
| `score-combo` | system | 🟢 | 首发 | 计分 + 连击倍率 | `base`, `comboMult` |
| `goal-tracker` | goal | 🟡 | 首发 | 多类型目标 → 胜负 | `collect`/`score`/`clearLayer`/`drop` |
| `move-budget` | system | 🟢 | 首发 | 步数 / 计时限制 | `moves` 或 `time` |
| `shuffle-deadlock` | system | 🟡 | 首发 | 无解检测 + 重洗/结束 | `onDeadlock` |
| `input-link` | input | 🟡 | 二批 | 同色连线（连连看 / Two Dots 式） | `match`:same-color |
| `input-drag-path` | input | 🟡 | 二批 | 限时拖拽自由移动（PAD 式） | `duration` |
| `spreader` | system | 🟡 | 二批 | 蔓延阻挡物（巧克力/藤蔓），相邻消除阻止 | `target`, `perTurn` |
| `drop-collect` | system | 🟡 | 二批 | 掉落物收集目标（樱桃落底） | `item`, `count` |

> **首发 14 个**即可跑通 Bejeweled 全部 + Candy Crush 主流关卡（实拆见附录 A）。二批 4 个覆盖连线/拖拽变体与标杆级阻挡物。特殊元素**组合矩阵**（条纹+炸弹、双炸弹…）始终走 hook。

### 6.3 最小 DSL 语法

> **P0 决策：DSL 形态用 TS 对象字面量**（零 parser 成本，编译期直接拿类型校验），具体形状与实例见附录 A。下面的 EBNF 为**后续自定义文本语法阶段**保留——模型用 TS 对象验证站得住后再上。

EBNF（简化，后续阶段）：

```ebnf
game     = "game" IDENT "{" board input systems goal rules tuning? "}" ;
board    = "board" "{" "size" WxH ";" "tiles" "[" IDENT,* "]" ";" "}" ;
input    = "input" CALL ;                      (* swap(adjacent) | link(same-color) *)
systems  = "systems" "{" (CALL | HOOK)* "}" ;
goal     = "goal" "{" goalExpr "}" ;
rules    = "rules" "{" rule* "}" ;
rule     = condition "->" effect (";" effect)* ;
tuning   = "tuning" "{" (IDENT VALUE ";")* "}" ;
HOOK     = "hook" "(" STRING ")" ;             (* 逃生舱 *)
```

示例（candy-match）：

```text
game candy-match {
  board { size 8x8; tiles [red, green, blue, yellow, purple]; }
  input swap(adjacent)
  systems {
    match-detect(line >= 3)
    clear-resolve
    gravity-fall(speed 800)
    refill-spawn(from top, weight even)
    cascade(combo true)
    score-combo(base 10, combo-mult 1.5)
    move-budget(moves 25)
    shuffle-deadlock
  }
  goal  { collect red x20 }
  rules {
    no-moves   -> shuffle
    goal-met   -> win
    moves == 0 -> lose
  }
}
```

### 6.4 manifest 接口（TS）

```ts
import { z } from "zod";

export type ModuleKind = "world" | "input" | "system" | "goal";

export interface ModuleManifest {
  id: string;                  // 全局唯一，= DSL 里 use 的名字
  kind: ModuleKind;
  genre: string[];             // ["*"] 通用 | ["match3","merge"]
  description: string;         // 一行，进可检索目录（门控用）
  params: z.ZodTypeAny;        // 复用 @cq/dsl 的 zod；编译期校验 DSL 传参
  reads: string[];            // 消费的组件/信号（如 "board","input"）
  writes: string[];           // 修改的组件/信号（如 "board","score"）
  deps: string[];             // 依赖模块 id；"?" 后缀=软依赖（如 "cascade?"）
  triggers?: string[];        // 复用 resolver trigger（如 "genre:match3"）
  examples: string[];         // golden 游戏 id，至少 1 个
  schema_version: string;     // 改 params 形状必须升版
}
```

### 6.5 索引器接口

```ts
export interface ModuleIndexEntry extends Omit<ModuleManifest, "params"> {
  paramsSchema: object;        // params 转成的 JSON Schema
}
export interface ModuleIndex {
  generatedAt: string;
  modules: ModuleIndexEntry[];
}

/** 扫 modulesRoot/*/module.manifest.ts → 产出索引；校验 id 唯一、deps 可达、examples 非空。 */
export function buildModuleIndex(modulesRoot: string): ModuleIndex;
```

### 6.6 编译器接口

```ts
export interface CompileError {
  kind: "unknown-module" | "bad-params" | "unmet-dep" | "port-mismatch" | "syntax";
  message: string;
  at?: string;                 // DSL 中位置
}
export interface CompileResult {
  files: { path: string; content: string }[];  // 生成的 TS（GameInstance/MainScene/config）
  hooks: string[];                              // 需手写的 hook stub 路径
  used: string[];                               // 命中的模块 id（= 本局进上下文的 schema 集）
  errors: CompileError[];
}

/** DSL 源 + 模块索引 → 生成代码。纯函数，确定性。 */
export function compile(dslSource: string, index: ModuleIndex): CompileResult;
```

### 6.7 逃生舱（hook）机制
DSL 里出现 `hook("name")`，编译器：
1. 生成一个 stub 文件 `game/core/source/hooks/name.ts`（带签名 + TODO）。
2. 在装配代码里接好调用点。
3. 把路径塞进 `CompileResult.hooks`，交给 agent / 人填红色逻辑。

⇒ 覆盖不到永远不卡死，只平滑回退。`hooks.length / (used.length + hooks.length)` 即该游戏的逃生舱触发率。

### 6.8 golden 验收
仿 `resolver/test/golden.test.ts`：每个 `examples` 游戏一份 `.cq` DSL，断言 `compile()` 无 `errors`、`hooks` 为空（或在白名单内）、生成代码可被 vite 构建。模块库演进时跑全套 golden 防回归。

---

## 7. P0 落地清单

1. ~~选定 genre：**match-3**~~ ✅ 已定（merge 作变体）。
2. ~~用 §3.2 工作流实拆 2–3 个真实 match-3 游戏~~ ✅ 已做（附录 A：Bejeweled 0% / Candy Crush ~9% / PAD ~45%，genre 拆得动）。
3. ~~据实拆定模块清单~~ ✅ 已定（§6.2，首发 14 + 二批 4）。
4. 建 `packages/modules`（实现**首发 14 个**模块 + manifest + 单测）、`packages/module-index`（`buildModuleIndex`）、`packages/orchestrator`（TS 对象 DSL 校验 + `compile`）、`apps/playground`。
5. **跑通 S0**：手写 `candy-match.ts`（TS 对象）→ `compile` → playground 真的能玩 + golden 通过。

完成第 5 步，两个阻碍即有实证答案：拆解有可套用工作流 + 三色指标；模块有「manifest + 索引器 + 编译期校验 + 按需门控」完整机制。

---

## 8. 开放问题

- ~~**DSL 形态**~~ ✅ **已决：P0 用 TS 对象字面量**，验证模型站得住后再上自定义文本语法（实拆已证明 TS 对象表达力够用，见附录 A 结论 4）。
- **codegen vs 运行时解释器**：P0 用 codegen（保留逃生舱、复用构建链）；成熟 genre 再评估下沉到数据驱动运行时。
- **状态机形象联动**：编排/编译事件（stage-up、build-success/fail）可复用 [`06-设计方案-状态机形象.md`](./06-设计方案-状态机形象.md) 的 emote 信号。
- **与 resolver 的关系**：模块门控应与现有 `resolve()` 合流，还是独立一套 module-resolver？建议复用同一 trigger 词汇与门控引擎。

---

## 附录 A · match-3 实拆验证（2026-06-04）

用 §3.3 三色标记法实拆三个真实游戏（从最纯粹到跨 genre 反例），验证 genre 拆不拆得动、红色边界在哪、TS 对象形态够不够用。

### A.0 DSL 形态（TS 对象字面量）

```ts
interface GameDef {
  id: string;
  board: { size: [number, number]; tiles: string[]; layers?: SystemUse[]; blockers?: SystemUse[] };
  input: SystemUse;                       // { use: "swap", mode: "adjacent" } 等
  systems: SystemUse[];                   // { use: 模块id, ...params }
  goal: GoalDef | HookRef;
  rules: Rule[];
  external?: HookRef;                     // 整块逃生舱
}
type SystemUse = { use: string } & Record<string, unknown>;
type Rule = { when: string; then: string | HookRef };
const hook = (name: string): HookRef => ({ hook: name });
```

### A.1 Bejeweled Classic（下限）

核心循环：8×8 交换相邻宝石，横/竖≥3 消除；无关卡目标，无解即结束。

```ts
const bejeweled: GameDef = {
  id: "bejeweled-classic",
  board: { size: [8, 8], tiles: ["white","red","yellow","green","blue","purple","orange"] },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 800 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 10, comboMult: 1.5 },
    { use: "shuffle-deadlock", onDeadlock: "end" },
  ],
  goal: { use: "goal-tracker", score: "endless" },
  rules: [{ when: "no-moves", then: "lose" }],
};
```

**🔴 红色 0%** —— 全部首发模块覆盖。

### A.2 Candy Crush Saga（标杆，取"清果冻"关）

特色：特殊糖果（4连条纹/5连色彩炸弹/LT 包装）、果冻覆盖层、巧克力蔓延。

```ts
const candyCrushJelly: GameDef = {
  id: "candy-crush-jelly-23",
  board: {
    size: [9, 9],
    tiles: ["red","orange","yellow","green","blue","purple"],
    layers:   [{ use: "board-layer", layer: "jelly", coverage: "preset:lvl23" }],
    blockers: [{ use: "spreader", target: "chocolate", perTurn: 1,
                blockedByAdjacentClear: true, start: [[4,0]] }],
  },
  input: { use: "input-swap", mode: "adjacent" },
  systems: [
    { use: "match-detect", line: 3, shapes: ["line","L","T"] },
    { use: "special-tile", spawn: { 4: "striped", 5: "color-bomb", LT: "wrapped" } },
    { use: "special-trigger", effects: ["striped","wrapped","color-bomb"] },
    { use: "clear-resolve", clearsLayer: "jelly" },
    { use: "gravity-fall", speed: 700 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 60, comboMult: 1.5 },
    { use: "move-budget", moves: 30 },
    { use: "shuffle-deadlock", onDeadlock: "shuffle" },
  ],
  goal: { use: "goal-tracker", clearLayer: "jelly" },
  rules: [
    { when: "goal-met", then: "win" },
    { when: "moves == 0", then: "lose" },
    { when: "combine striped+color-bomb", then: hook("cc-combo-striped-bomb") },   // 🔴
    { when: "combine color-bomb+color-bomb", then: hook("cc-combo-double-bomb") }, // 🔴
  ],
};
```

**🔴 红色 ~9%**（2 hook / ~21 节点）—— 精确落在"特殊糖果组合效果"这一护城河，核心 90%+ 可编排。

### A.3 Puzzle & Dragons（边界反例）

核心循环：限时拖珠自由移动凑匹配 → 消除转伤害 → 回合制 RPG 战斗。

```ts
const puzzleAndDragons: GameDef = {
  id: "pad-dungeon",
  board: { size: [6, 5], tiles: ["fire","water","wood","light","dark","heart"] },
  input: { use: "input-drag-path", duration: 4 },
  systems: [
    { use: "match-detect", line: 3, simultaneous: true },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 500 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "hook", name: "pad-combat-resolve" },   // 🔴 消除→伤害/回血
  ],
  goal: hook("pad-battle-outcome"),                // 🔴 战斗胜负
  rules: [{ when: "board-resolved", then: hook("pad-enemy-turn") }], // 🔴 敌人回合
  external: hook("pad-rpg-layer"),                 // 🔴 队伍/技能/属性克制
};
```

**🔴 红色 ~45%**（按逻辑工作量）—— "消除"只是输入手段，游戏主体（RPG 战斗）整个在编排引擎之外。

### A.4 结论

| 游戏 | 红色比例 | 性质 |
|---|---|---|
| Bejeweled | 0% | 纯绿/黄，首发清单全覆盖 |
| Candy Crush | ~9% | 红色=特殊元素组合（护城河），适合 hook |
| Puzzle & Dragons | ~45% | 红色=游戏主体，已跨出 match-3 genre |

1. **match-3 拆得动**：正统消除红色比例低，首发 14 模块覆盖绝大多数主流消除游戏。
2. **逃生舱位置高度规律**：红色几乎全落在"特殊元素组合效果"——差异化护城河，量小、独特、值得手写，hook 用在此恰到好处。
3. **得到 genre 边界判据**：当"消除"退化为另一 genre 的输入手段（PAD），红色暴涨。**红色 >25% ⇒ 选错 genre 或本就跨 genre**，不该硬塞——这条同时是 DSL 健康度护栏。
4. **TS 对象字面量够用**：三例（含特殊元素、覆盖层、蔓延物、拖拽输入、整块 hook）都表达得下且可读，证明"先 TS 对象、后自定义语法"的决策成立，P0 不必急于写 parser。
