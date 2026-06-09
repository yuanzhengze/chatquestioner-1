# chat-questioner DSL 语法规范

> 日期：2026-06-08 · 状态：**现行规范** · 类型：语法 / 契约（spec）
> 权威源：`packages/dsl`（选择 DSL）、`packages/orchestrator`（编排 DSL）、`packages/modules`（L1 模块 manifest）
> 关联：[01-设计方案.md](./01-设计方案.md) · [09-DSL编排引擎-最小验证方案.md](./09-DSL编排引擎-最小验证方案.md) · [08-通信GDD规范.md](./08-通信GDD规范.md)

---

## 1. 总览

chat-questioner 使用**两套 DSL**，职责不同、互不替代：

| DSL | 类型名 | 形态 | 用途 | 产出文件 |
|-----|--------|------|------|----------|
| **选择 DSL** | `GameDSL` | JSON | 对话 → 精确选 template / skill / MCP | `dsl.json` |
| **编排 DSL** | `GameDef` | TS 对象字面量（可序列化为 JSON） | 声明式编排 match-3 游戏 → 编译运行 | `gamedef.json` |

此外还有两个**派生/子结构**：

| 结构 | 说明 |
|------|------|
| `ResolutionResult` | resolver 对 `GameDSL` 的解析结果，非手写输入 |
| `GameDefFill` | S1 合成时 LLM 产出的窄结构，经 `synthesize()` 组装为完整 `GameDef` |

```text
ConversationState
    ├─ compile() ──→ GameDSL ──→ resolve() ──→ ResolutionResult
    └─ synthesize(fill) ──→ GameDef ──→ validate() ──→ createGame()
```

**校验双轨**：

- `GameDSL`：`GameDslSchema`（zod）+ JSON Schema（`packages/dsl/schema/game-dsl.schema.json`）
- `GameDef`：`validate(def)` 对照 L1 模块 manifest 做编译期校验

---

## 2. 选择 DSL（GameDSL）

### 2.1 设计原则

选择 DSL 的唯一使命：把对话结论变成 agentic_os **能精确取目录**的结构化信号。

- 字段刻意对齐 forgeax 现有词汇（template / skill / MCP 目录）
- **枚举 + 自由词回退（D7）**：`genre` / `mechanics` / `art_style` 优先匹配已知枚举；未命中的原话回退进 `intent_terms`，绝不丢弃
- 缺关键工程约束（platform / dimension / engine）时**不产出半截 DSL**（`dsl = null`）

### 2.2 顶层结构

```jsonc
{
  "schema_version": "0.1",           // 必填，当前固定 "0.1"
  "constraints": { /* 见 §2.3 */ },
  "genre": "match-3",                // 可选，见 §2.4
  "mechanics": ["swap-match"],       // 可选，默认 []
  "art_style": "pixel",              // 可选，见 §2.4
  "modalities": ["image", "audio"],  // 可选，默认 []，驱动 skill/MCP 门控
  "intent_terms": ["猫咪", "解压"],   // 可选，默认 []，喂模板加权匹配
  "signature_terms": ["踩奶节奏"],    // 可选，默认 []，差异化签名词
  "mvp_scope": {                     // 可选，默认 { must: [], cut: [] }
    "must": ["核心连接循环"],
    "cut": ["关卡系统"]
  },
  "constitution_ref": "gdd.md#游戏宪法"  // 可选，回指 GDD 不可漂移项
}
```

### 2.3 constraints（硬约束）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `platform` | `Platform[]` | 是 | 至少 1 项 |
| `dimension` | `Dimension` | 是 | 2D / 3D |
| `engine` | `Engine` | 是 | 渲染引擎选型 |
| `networking` | `Networking` | 否 | 默认 `"singleplayer"` |
| `orientation` | `Orientation` | 否 | 屏幕方向 |

**枚举值**（源码：`packages/dsl/src/dsl.ts`）：

```ts
type Platform    = "PC" | "mobile" | "web";
type Dimension   = "2D" | "3D";
type Engine      = "pixijs" | "threejs" | "phaser" | "canvas" | "dom";
type Networking  = "singleplayer" | "multiplayer";
type Orientation = "Landscape" | "Portrait";
type Modality    = "image" | "audio" | "ui" | "3d" | "pixel"
                 | "sidescroller" | "narrative" | "video";
```

### 2.4 受控词汇表

编译时通过 `normalizeVocabField()` 做大小写不敏感匹配；命中枚举写入结构化字段，未命中写入 `intent_terms`。

**genre**（`packages/dsl/src/vocab/genre.ts`）：

```
match-3, merge-puzzle, puzzle, tower-defense, shooter, platformer, runner,
rpg, roguelike, card-battler, board, idle, action, strategy, casual
```

**mechanics**（`packages/dsl/src/vocab/mechanics.ts`）：

```
drag-connect, swap-match, tap, swipe, merge, score-combo, dodge, shoot,
build-and-upgrade, wave-survival, stack, physics-launch, path-find
```

**art_style**（`packages/dsl/src/vocab/artStyle.ts`）：

```
pixel, watercolor-cozy, cyberpunk, fantasy, minimalist, sci-fi,
cartoon, neon, retro, realistic
```

> 以上枚举可扩展；扩展时在对应 `vocab/*.ts` 追加，并重新 `pnpm build:schema`。

### 2.5 编译规则（ConversationState → GameDSL）

由 `packages/conversation/src/compile.ts` 的 `toGameDsl()` 执行：

1. **硬约束缺失** → `{ dsl: null, missing: ["dimension" | "engine" | "platform"] }`
2. **软字段非法** → 丢弃该枚举值，不打死整份 DSL（如 modalities 里的脏值）
3. **schema 校验失败** → `{ dsl: null, missing: ["schema:…"] }`
4. 成功 → zod 解析后的 `GameDSL`

### 2.6 JSON Schema

- 路径：`packages/dsl/schema/game-dsl.schema.json`
- 生成：`pnpm build:schema`

---

## 3. 编排 DSL（GameDef）

### 3.1 设计原则

编排 DSL 描述一个**可组合的 match-3 游戏**：棋盘、输入、系统管线、目标、规则。

- **P0 形态**：TypeScript 对象字面量（非自定义文本语法）
- 每个系统引用 L1 模块：`{ use: "模块-id", ...params }`
- `board` 字段隐含使用 `board-grid` 模块（无需显式声明）
- 覆盖不到的逻辑走 **hook 逃生舱**（语法已定义，codegen 待落地）

### 3.2 顶层结构

```ts
interface GameDef {
  id: string;                          // 游戏唯一标识（slug）
  board: {
    size: [number, number];            // [宽, 高]，正整数
    tiles: string[];                   // 元素类型名，至少 3 种
    layers?: SystemUse[];              // 覆盖层（如果冻）
    blockers?: SystemUse[];            // 阻挡/蔓延物
  };
  input: SystemUse;                    // 输入模块（恰好 1 个）
  systems: SystemUse[];                // 系统模块链（有序）
  goal: SystemUse | HookRef;          // 目标模块或 hook
  rules: Rule[];                       // 声明式规则（见 §3.5）
  external?: HookRef;                  // 整块外部逻辑逃生舱
  seed?: number;                       // RNG 种子，缺省 0x9e3779b9
}
```

### 3.3 SystemUse（模块引用）

```ts
type SystemUse = { use: string } & Record<string, unknown>;
```

**语法**：以 `use` 键指定模块 id，其余键为该模块的参数（须通过 manifest 的 zod params 校验）。

```ts
// 示例
{ use: "match-detect", line: 3 }
{ use: "input-swap", mode: "adjacent", requireMatch: true }
{ use: "goal-tracker", collect: { red: 20 } }
```

### 3.4 HookRef（逃生舱）

```ts
type HookRef = { hook: string };

// 辅助构造
function hook(name: string): HookRef { return { hook: name }; }

// 示例
goal: hook("pad-battle-outcome")
rules: [{ when: "board-resolved", then: hook("pad-enemy-turn") }]
```

hook 指向需手写 TS 实现的差异化逻辑。当前运行时对 hook 目标**退化为 endless 计分**；codegen stub 生成属 P1 待办。

### 3.5 Rule（规则）

```ts
type Rule = { when: string; then: string | HookRef };
```

**when** 为条件表达式字符串；**then** 为动作字符串或 hook。

文档与示例中出现的 when 词汇：

| when | 含义 |
|------|------|
| `"goal-met"` | 目标达成 |
| `"moves == 0"` | 步数耗尽 |
| `"no-moves"` | 无合法步（常与 deadlock 策略联动） |
| `"combine striped+color-bomb"` | 特殊元素组合（通常 then → hook） |
| `"board-resolved"` | 棋盘结算完毕 |

> **实现说明**：`rules[]` 已在类型与 golden 示例中声明，但 `MatchEngine` 当前通过内置 `evaluateGoal()` 判胜负，**尚未解释执行 rules 数组**。手写 def 中保留 rules 是为 forward-compatible 文档化。

### 3.6 校验（validate）

`packages/orchestrator/src/validate.ts` 在编译期检查：

| 错误 kind | 触发条件 |
|-----------|----------|
| `unknown-module` | `use` 不在 manifest 索引中 |
| `bad-params` | 参数不符合模块 `params` zod schema |
| `unmet-dep` | 模块硬依赖未被引用（`dep` 无 `?` 后缀） |
| `syntax` | hook 缺名字等语法错误 |

**依赖规则**：

- manifest 中 `deps: ["board-grid"]` 为硬依赖，编排里必须出现对应 `use`
- `deps: ["cascade?"]` 带 `?` 为软依赖，可缺省

**隐式引用**：`board-grid` 由 `board.size` + `board.tiles` 隐含，validate 自动计入已用模块集。

---

## 4. L1 模块库参考

模块 manifest 定义于 `packages/modules/src/manifests.ts`。下表为全部 18 个模块的参数契约。

### 4.1 world

#### board-grid（隐含）

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `size` | `[number, number]` | — | 棋盘尺寸 |
| `tiles` | `string[]` | — | 元素类型，min 3 |

> 通过 `board` 字段注入，不在 `systems[]` 中显式写。

#### board-layer

| 参数 | 类型 | 说明 |
|------|------|------|
| `layer` | `string` | 层名（如 `"jelly"`） |
| `coverage` | `string` | 覆盖范围（如 `"all"`、`"preset:lvl23"`） |

**deps**：`board-grid` · **运行时**：✅ 已实现

#### spreader

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `target` | `string` | — | 蔓延物名 |
| `perTurn` | `number` | `1` | 每回合蔓延格数 |
| `blockedByAdjacentClear` | `boolean` | `true` | 相邻消除是否阻止蔓延 |

**deps**：`board-grid` · **运行时**：❌ 未实现

### 4.2 input

#### input-swap

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | `"adjacent"` | `"adjacent"` | 交换模式 |
| `requireMatch` | `boolean` | `true` | 无匹配时是否弹回 |

**deps**：`board-grid` · **运行时**：✅

#### input-link

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `match` | `"same-color"` | `"same-color"` | 连线匹配规则 |

**deps**：`board-grid` · **运行时**：❌

#### input-drag-path

| 参数 | 类型 | 说明 |
|------|------|------|
| `duration` | `number` | 拖拽时限（秒） |

**deps**：`board-grid` · **运行时**：❌

### 4.3 system

#### match-detect

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `line` | `number` (≥3) | `3` | 最小连线长度 |
| `shapes` | `("line"\|"L"\|"T")[]` | — | 可选形状 |
| `simultaneous` | `boolean` | — | 是否同时检测多组 |

**deps**：`board-grid` · **运行时**：✅（shapes / simultaneous 参数暂未影响引擎）

#### special-tile

| 参数 | 类型 | 说明 |
|------|------|------|
| `spawn` | `Record<string, string>` | 连击形状 → 特殊元素映射 |

**deps**：`match-detect` · **运行时**：❌

#### special-trigger

| 参数 | 类型 | 说明 |
|------|------|------|
| `effects` | `string[]` | 可触发的特殊效果列表 |

**deps**：`special-tile` · **运行时**：❌

#### clear-resolve

| 参数 | 类型 | 说明 |
|------|------|------|
| `clearsLayer` | `string` | 消除时同步清指定覆盖层 |

**deps**：`match-detect` · **运行时**：✅

#### gravity-fall

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `speed` | `number` | `800` | 下落速度（渲染用） |

**deps**：`clear-resolve` · **运行时**：✅

#### refill-spawn

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `from` | `"top"` | `"top"` | 补充方向 |
| `weight` | `"even"\|"weighted"` | `"even"` | 权重策略 |

**deps**：`gravity-fall` · **运行时**：✅

#### cascade

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `combo` | `boolean` | `true` | 是否连锁再检测 |

**deps**：`match-detect`, `refill-spawn` · **运行时**：✅

#### score-combo

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `base` | `number` | `10` | 基础分 |
| `comboMult` | `number` | `1.5` | 连击倍率 |

**deps**：`clear-resolve` · **运行时**：✅

#### move-budget

| 参数 | 类型 | 说明 |
|------|------|------|
| `moves` | `number` | 步数限制 |
| `time` | `number` | 计时限制（秒） |

**deps**：无 · **运行时**：✅（moves；time 暂未接入）

#### shuffle-deadlock

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `onDeadlock` | `"shuffle"\|"end"` | `"shuffle"` | 无解时的策略 |

**deps**：`match-detect` · **运行时**：✅

#### drop-collect

| 参数 | 类型 | 说明 |
|------|------|------|
| `item` | `string` | 掉落物类型 |
| `count` | `number` | 需收集数量 |

**deps**：`gravity-fall` · **运行时**：❌

### 4.4 goal

#### goal-tracker

| 参数 | 类型 | 说明 |
|------|------|------|
| `collect` | `Record<string, number>` | 按元素收集目标 |
| `score` | `number \| "endless"` | 分数目标 / 无尽 |
| `clearLayer` | `string` | 清空指定覆盖层 |
| `drop` | `{ item: string; count: number }` | 掉落收集目标 |

**deps**：无 · **运行时**：✅ collect / score / clearLayer；❌ drop

### 4.5 推荐 systems 顺序

标准 match-3 管线（与 `buildSkeleton()` / golden 示例一致）：

```text
match-detect → clear-resolve → gravity-fall → refill-spawn
  → cascade → score-combo → [move-budget] → shuffle-deadlock
```

`board.layers` / `board.blockers` 写在 `board` 字段，不占 `systems[]` 槽位。

---

## 5. GameDefFill（S1 合成子结构）

对话 → GameDef 路径中，LLM **只产出**此窄结构；`systems[]` 与依赖链由 `buildSkeleton()` 规则定死。

```ts
interface GameDefFill {
  tiles: string[];                    // 元素名，1–7 个
  size: [number, number];             // 棋盘尺寸，合成时 clamp 到 6..10
  goal:
    | { kind: "collect"; need: Record<string, number> }
    | { kind: "score"; target: number };
  tuning?: {
    minLine?: number;                 // ≥3，默认 3
    moves?: number | null;            // collect 目标默认 25
    comboMult?: number;               // 默认 1.5
  };
}
```

**后处理**（`packages/orchestrator/src/synthesize/fill.ts`）：

- `clampSize()`：每维 clamp 到 `[6, 10]`
- `dedupeTiles()`：去重去空，截到 7；不足 3 用默认色补齐

**genre 限制**：仅 `match-3`（及同义 genre）走 synthesize；其他 genre 返回 `{ def: null, diagnostics: [{ kind: "unsupported-genre" }] }`。

---

## 6. ResolutionResult（resolver 输出）

非手写 DSL，但作为 bundle 第三轨，在此一并规范。

```jsonc
{
  "schema_version": "0.2",           // 固定 "0.2"
  "profile": "workbench",
  "template": {
    "primary": "match3-candy",
    "references": ["link-match"],
    "basis": {
      "matched_terms": ["连连看"],
      "constraints": { "dimension": "2D", "engine": "pixijs" }
    }
  },
  "skills": [
    { "id": "H_2D_LookMaster", "layer": "L0", "phase": "production", "load": "eager", "trigger": "dimension:2D" }
  ],
  "mcp": [
    { "server": "image-gemini", "layer": "L1", "phase": "production", "load": "eager", "trigger": "modality:image" }
  ],
  "packages": [
    { "id": "kubee-client-contract", "load": "eager", "trigger": "foundation" }
  ],
  "unmatched": [],
  "warnings": [],
  "install_packs": {
    "primary_template": "match3-candy",
    "reference_templates": [],
    "package_ids": []
  }
}
```

**枚举**：

```ts
type SkillLayer = "L0" | "L1" | "L2" | "L3";
type McpLayer   = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
type Phase      = "boot" | "production" | "coding";
type LoadMode   = "eager" | "gated" | "lazy";
```

JSON Schema：`packages/dsl/schema/resolution-result.schema.json`

---

## 7. 完整示例

### 7.1 选择 DSL 示例

```json
{
  "schema_version": "0.1",
  "constraints": {
    "platform": ["mobile", "web"],
    "dimension": "2D",
    "engine": "pixijs",
    "networking": "singleplayer",
    "orientation": "Portrait"
  },
  "genre": "match-3",
  "mechanics": ["swap-match", "score-combo"],
  "art_style": "cartoon",
  "modalities": ["image", "audio", "ui"],
  "intent_terms": ["糖果", "治愈"],
  "signature_terms": ["踩奶节奏"],
  "mvp_scope": {
    "must": ["三消核心循环", "收集目标"],
    "cut": ["社交排行"]
  },
  "constitution_ref": "gdd.md#游戏宪法"
}
```

### 7.2 编排 DSL · Bejeweled 经典（下限，0% hook）

```ts
const bejeweled: GameDef = {
  id: "bejeweled-classic",
  board: {
    size: [8, 8],
    tiles: ["white", "red", "yellow", "green", "blue", "purple", "orange"],
  },
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
  seed: 42,
};
```

### 7.3 编排 DSL · 收集目标关

```ts
const candyCollect: GameDef = {
  id: "candy-collect",
  board: { size: [8, 8], tiles: ["red", "orange", "yellow", "green", "blue", "purple"] },
  input: { use: "input-swap", mode: "adjacent", requireMatch: true },
  systems: [
    { use: "match-detect", line: 3 },
    { use: "clear-resolve" },
    { use: "gravity-fall", speed: 700 },
    { use: "refill-spawn", from: "top", weight: "even" },
    { use: "cascade", combo: true },
    { use: "score-combo", base: 60, comboMult: 1.5 },
    { use: "move-budget", moves: 25 },
    { use: "shuffle-deadlock", onDeadlock: "shuffle" },
  ],
  goal: { use: "goal-tracker", collect: { red: 20 } },
  rules: [
    { when: "goal-met", then: "win" },
    { when: "moves == 0", then: "lose" },
  ],
  seed: 7,
};
```

### 7.4 编排 DSL · 清果冻关（board-layer + clearLayer）

```ts
const candyCrushJelly: GameDef = {
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
  rules: [
    { when: "goal-met", then: "win" },
    { when: "moves == 0", then: "lose" },
  ],
  seed: 11,
};
```

源码位置：`packages/orchestrator/src/games/*.ts`

---

## 8. 实现状态速查

| 能力 | 状态 |
|------|------|
| GameDSL 编译 + zod 校验 | ✅ |
| GameDSL → ResolutionResult | ✅ |
| GameDef validate（manifest 对齐） | ✅ |
| GameDef → MatchEngine（Bejeweled / collect / clearLayer） | ✅ |
| GameDefFill → synthesize → GameDef | ✅ |
| special-tile / special-trigger / spreader / drop-collect | ❌ manifest 有，运行时无 |
| input-link / input-drag-path | ❌ |
| rules[] 解释执行 | ❌ 声明可用，引擎内置判胜负 |
| hook 逃生舱 codegen | ❌ 语法有，stub 生成待做 |
| 自定义文本 DSL 语法 | ❌ P0 仅 TS/JSON 对象 |

---

## 9. 版本与变更

| 产物 | 当前 schema_version | 变更策略 |
|------|---------------------|----------|
| GameDSL | `"0.1"` | 破坏性变更升 minor/major，同步 `build:schema` |
| ResolutionResult | `"0.2"` | 同上 |
| ModuleManifest | `"0.1"` | 改 params 形状必须升 module schema_version |
| GameDef | 无版本字段 | 随 orchestrator 演进；导出 JSON 建议附带 git commit |

---

## 10. 相关命令

```bash
pnpm build:schema      # 从 zod 重新生成 GameDSL / ResolutionResult JSON Schema
pnpm test              # 含 dsl / orchestrator / modules golden 测试
pnpm dev:playground    # 加载 GameDef 本地验证
```
