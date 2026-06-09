# 回合管线化 + 果冻层运行时 · 实施计划

> **For agentic workers:** 按 task-by-task 执行，每步 TDD（先写失败测试 → 实现 → 跑绿 → commit）。
> **Spec:** [`../specs/2026-06-05-turn-pipeline-jelly-design.md`](../specs/2026-06-05-turn-pipeline-jelly-design.md)

**Goal:** 把 `MatchEngine` 写死的回合瀑布重构成有序 Phase 管线，并在管线上新增果冻层运行时（board-layer + clearLayer goal），让"清果冻"关在 playground 真能玩；Bejeweled/candyCollect 行为零变化。

**Tech Stack:** TypeScript / vitest（pnpm monorepo）。

**约定：**
- 管线/phase/layer 运行时全部落在 `packages/modules`；`orchestrator` 只多翻译 layers。
- `MatchEngine` 公开接口（`getState/legalMoves/trySwap/config`）不变。
- 等价性优先：先锁现行为快照，再重构。
- 果冻语义：匹配命中处若有层则同时 -1 层（spec §5.3）。layer 状态 `(number|null)[][]`。

---

## Task A: 锁定等价性 —— 重构前轨迹快照

**Files:** Create `packages/modules/test/equivalence.test.ts`

- [ ] Step 1: 写一个确定性轨迹采集测试：对 bejeweled / candyCollect，用固定 seed 跑 autoPlay（每回合走 legalMoves[0]），把每步的 `{score, movesLeft, status, lastCombo, boardHash}` 收成数组，对整段轨迹做 `toMatchInlineSnapshot()`。boardHash 用简单 join。
- [ ] Step 2: Run `pnpm test -- equivalence`，让 vitest 写入 inline snapshot。
- [ ] Step 3: 确认快照非空（轨迹有多步、score 增长）。
- [ ] Step 4: Commit：`test(modules): lock bejeweled/candyCollect turn trajectory before pipeline refactor`

> 这份快照在 Task C 重构后必须保持不变；它是等价性的硬证据。createGame 在 orchestrator，故测试从 `@cq/orchestrator` 取 def，用 `@cq/orchestrator` 的 createGame。

---

## Task B: state.ts 扩展

**Files:** Modify `packages/modules/src/engine/state.ts`; Test 复用 typecheck

- [ ] Step 1: `Goal` 联合加 `| { kind: "clearLayer" }`。
- [ ] Step 2: `GameState` 加 `layers?: (number | null)[][];`。
- [ ] Step 3: `EngineConfig` 加 `layers?: { coverage: string; layer: string } | null;` 与 `clearsLayer?: boolean;`。
- [ ] Step 4: Run `pnpm typecheck`，预期：MatchEngine.evaluateOutcome 对 Goal 的 switch 可能需补 clearLayer 分支（下一 Task 处理）；若 tsc 报 exhaustiveness 在 B 阶段，先在 MatchEngine 加 `case "clearLayer"` 占位（return false）保持编译，Task D 实装。
- [ ] Step 5: Commit：`feat(modules): extend state for layers + clearLayer goal`

---

## Task C: 管线化（核心重构，保持等价）

**Files:** Create `packages/modules/src/engine/pipeline.ts`, `packages/modules/src/engine/phases.ts`; Modify `MatchEngine.ts`, `index.ts`; Test `packages/modules/test/pipeline.test.ts`

- [ ] Step 1: 写 pipeline.test.ts 失败测试：
  - requireMatch 弹回：构造一个 def→config，trySwap 一个不成匹配的交换 → legal=false、board 复原。
  - cascade 开/关：相同初盘下 cascade=false 只清一次（combo<=1），cascade=true 可>1。
- [ ] Step 2: Run `pnpm test -- pipeline` → FAIL（pipeline 未实现）。
- [ ] Step 3: 实现 `phases.ts`：基于 stages.ts 纯函数，定义 onSwap/detect/resolveClear/scoring/applyGravity/refill/postTurn/evaluateGoal/ensurePlayable 各 phase（读写 TurnContext）。
- [ ] Step 4: 实现 `pipeline.ts`：`TurnContext`/`Phase` 类型 + `compilePipeline(config)` 返回 `{ runTurn }`。runTurn 内部组织：onSwap → detect →（requireMatch 弹回判断）→ 循环{ resolveClear → scoring → applyGravity → refill → cascade? detect : break } → postTurn → evaluateGoal → ensurePlayable。
- [ ] Step 5: 改 `MatchEngine.trySwap`：构造 ctx → runTurn → 回写 → 组 SwapResult。保留 getState/legalMoves/config/constructor。删除 trySwap 内被 runTurn 取代的瀑布代码（仅清理本次产生的孤儿）。
- [ ] Step 6: Run `pnpm test -- equivalence pipeline` → 等价快照**不变**、pipeline 新测试 PASS。若快照变了：停，按 systematic-debugging 对齐 runTurn 与原瀑布，不得改快照。
- [ ] Step 7: Run `pnpm test`（全量）+ `pnpm typecheck`。
- [ ] Step 8: Commit：`refactor(modules): replace hardcoded turn waterfall with compiled phase pipeline`

---

## Task D: 果冻层运行时

**Files:** Modify `MatchEngine.ts`(构造初始化 layers), `phases.ts`(resolveClear 清层 + evaluateGoal clearLayer), `stages.ts`(clearTilesWithLayer); Test `packages/modules/test/jelly.test.ts`

- [ ] Step 1: 写 jelly.test.ts 失败测试（直接构造带 layers 的 EngineConfig + MatchEngine）：
  - 初始化：config.layers(coverage=all) → state.layers 全为 1，形状同 board。
  - 清层：在某有层格制造匹配并 trySwap → 该格 layer 由 1→null、糖被消、collected 记账、clearedThisStep>0。
  - clearLayer 目标：把全盘层清空 → status=won。
- [ ] Step 2: Run `pnpm test -- jelly` → FAIL。
- [ ] Step 3: 实现：
  - `stages.ts` 加 `clearTilesWithLayer(board, layers, positions)`：清糖统计颜色，同时对命中格 layer -1（归零置 null）。
  - MatchEngine 构造：config.layers 存在 → 初始化 state.layers（coverage=all/未知 → 全盘 1）。
  - phases.resolveClear：config.clearsLayer 为真且 ctx.layers 非空 → 用 clearTilesWithLayer，否则原 clearTiles。
  - phases.evaluateGoal：goal.kind==="clearLayer" → layers 全 null 即 won。
  - getState 深拷贝 layers。
- [ ] Step 4: Run `pnpm test -- jelly equivalence`：jelly PASS，等价快照仍不变（无 layers 路径不受影响）。
- [ ] Step 5: Commit：`feat(modules): jelly layer runtime (board-layer + clearLayer goal)`

---

## Task E: orchestrator 翻译 + candyCrushJelly + golden

**Files:** Modify `createGame.ts`, `index.ts`; Create `games/candyCrushJelly.ts`; Modify `orchestrator/test/golden.test.ts`

- [ ] Step 1: 写 golden 失败测试：import candyCrushJelly；`validate` 0 error；autoPlay 在 40 步内清空全盘 layers → status==="won"；同种子可复现。
- [ ] Step 2: Run `pnpm test -- golden` → FAIL（candyCrushJelly 未导出 / toEngineConfig 未翻译 layers）。
- [ ] Step 3: 创建 `games/candyCrushJelly.ts`（spec §6）。
- [ ] Step 4: 改 `toEngineConfig`：读 def.board.layers 找 board-layer → config.layers={coverage,layer}；找 clear-resolve.clearsLayer → config.clearsLayer=true；toGoal 加 goal-tracker.clearLayer → {kind:"clearLayer"}。
- [ ] Step 5: index.ts 导出 candyCrushJelly。
- [ ] Step 6: Run `pnpm test -- golden` → PASS。
- [ ] Step 7: Run `pnpm test` 全量 + `pnpm typecheck`。
- [ ] Step 8: Commit：`feat(orchestrator): candyCrushJelly def + layers translation + golden`

---

## Task F: playground 可玩 + 果冻层渲染

**Files:** Modify `apps/playground/src/main.ts`, `apps/playground/index.html`

- [ ] Step 1: import candyCrushJelly，加入 DEFS（key `candy-crush-jelly`）。
- [ ] Step 2: index.html 下拉 `#game` 增加 `<option value="candy-crush-jelly">Candy Crush（果冻）</option>`。
- [ ] Step 3: render() 读 engine.getState().layers，若某格 layer 非 null 在格子上叠一层半透明覆盖（如白色 alpha），让果冻可见；清层后消失。
- [ ] Step 4: 目标显示：clearLayer 目标时 $goal 显示剩余层数 / 总层数。
- [ ] Step 5: Run `pnpm typecheck`；手动冒烟（可选）：`pnpm dev:playground` 选果冻关试玩。
- [ ] Step 6: Commit：`feat(playground): play candy-crush-jelly with visible jelly layer`

---

## 验收对照（spec §9）
- [x] Task A/C/D: 等价性（快照不变）。
- [x] Task C: 管线取代瀑布。
- [x] Task D/E: 果冻层运行时 + clearLayer goal + golden 清层胜利。
- [x] Task E: validate(candyCrushJelly)=0；headless 清层可复现。
- [x] Task F: playground 可玩可见层。
- [x] 各 Task 末：pnpm test / typecheck 全绿。
