# S1 扩展：玩法能力清单 + skeleton 产果冻关 · 实施计划

> 按 task-by-task TDD（先写失败测试 → 实现 → 跑绿 → commit）。
> **Spec:** [`../specs/2026-06-08-s1-jelly-capabilities-design.md`](../specs/2026-06-08-s1-jelly-capabilities-design.md)

**Goal:** 建可落地玩法能力清单（单一事实源），让 S1 skeleton 能产果冻关（clearLayer），fill prompt 由清单驱动。collect/score 行为零变化；不碰 conversation 提问 prompt。

**约定：** capability 清单放 `packages/orchestrator/src/capabilities.ts`；coverage 固定 all；果冻关默认 40 步。

---

## Task A: capabilities.ts 单一事实源

**Files:** Create `packages/orchestrator/src/capabilities.ts`; Modify `index.ts`; Test `packages/orchestrator/test/capabilities.test.ts`

- [ ] Step 1: 写失败测试：GAMEPLAY_CAPABILITIES 长度 3、含 goal collect/score/clearLayer；renderGoalOptionsForPrompt() 文本含三种 kind 与各自 themeHints 片段（如"清理"/"收集"/"高分"）。
- [ ] Step 2: Run `pnpm test -- capabilities` → FAIL（模块未导出）。
- [ ] Step 3: 实现 capabilities.ts（GoalKind / GameplayCapability / GAMEPLAY_CAPABILITIES / renderGoalOptionsForPrompt）。
- [ ] Step 4: index.ts 导出。
- [ ] Step 5: Run `pnpm test -- capabilities` → PASS。
- [ ] Step 6: Commit：`feat(orchestrator): add gameplay capability profiles (single source of truth)`

---

## Task B: fill.ts 加 clearLayer goal

**Files:** Modify `packages/orchestrator/src/synthesize/fill.ts`; Test `synthesize.test.ts`（追加）

- [ ] Step 1: 追加失败测试：FillSchema.safeParse({tiles,size,goal:{kind:"clearLayer"}}).success===true；非法 goal.kind 仍 false。
- [ ] Step 2: Run `pnpm test -- synthesize.test` → FAIL。
- [ ] Step 3: GoalFillSchema union 加 `z.object({ kind: z.literal("clearLayer") })`。
- [ ] Step 4: Run `pnpm test -- synthesize.test` → PASS（含既有 collect/score 用例）。
- [ ] Step 5: Commit：`feat(orchestrator): allow clearLayer goal in GameDefFill`

---

## Task C: skeleton.ts 果冻关分支

**Files:** Modify `packages/orchestrator/src/synthesize/skeleton.ts`; Test `synthesize.test.ts`（追加）

- [ ] Step 1: 追加失败测试：
  - buildSkeleton(state, clearLayer fill) → board.layers 含 {use:"board-layer",coverage:"all"}；systems 含 {use:"clear-resolve",clearsLayer:"jelly"}、{use:"move-budget",moves:40}；goal === {use:"goal-tracker",clearLayer:"jelly"}。
  - validate(果冻关 def) === []。
  - 回归：collect fill 仍产无 layers、clear-resolve 无参；score fill 同。
- [ ] Step 2: Run `pnpm test -- synthesize.test` → FAIL。
- [ ] Step 3: 实现 clearLayer 分支（spec §4）：clearLayer 时 board.layers/clearsLayer/goal/move-budget 按规格；其余分支不动。
- [ ] Step 4: Run `pnpm test -- synthesize.test` → PASS。
- [ ] Step 5: Commit：`feat(orchestrator): skeleton emits jelly (clearLayer) level`

---

## Task D: synthesize-golden 对话→果冻关可玩

**Files:** Modify `packages/orchestrator/test/synthesize-golden.test.ts`

- [ ] Step 1: 追加测试：match-3 state + clearLayer fill（tiles 3、size [4,4] 经 clamp 会到 [6,6]，故 golden 用直接小 def 路径或去 move-budget+小棋盘——按现有 golden autoPlay 模式，clamp 后最小 6×6=36 格，贪心可在数千回合清完，给足 maxTurns）。synthesize → def 非空、validate 0；createGame(去 move-budget 版或大 maxTurns) autoPlay → status==="won" 且 layers 全 null；同种子可复现。
- [ ] Step 2: Run `pnpm test -- synthesize-golden` → 应 PASS（实现已在 C 完成）。若清不完：去掉 move-budget 跑（验证目标贯通，不验证 40 步内可赢）。
- [ ] Step 3: Run `pnpm test`（全量）+ `pnpm typecheck`。
- [ ] Step 4: Commit：`test(orchestrator): golden conversation→jelly GameDef playable`

---

## Task E: server fill prompt 由清单驱动

**Files:** Modify `apps/server/src/gameDefFill.ts`; Test `apps/server/test/gameDefFill.test.ts`

- [ ] Step 1: 看现有 gameDefFill.test.ts 是否断言 FILL_SYSTEM 文本；写/调测试：buildFillPrompt 或 FILL_SYSTEM 含 "clearLayer"；produceGameDef(scripted 吐 {kind:"clearLayer"} fill) → def 非空且 def.board.layers 非空。
- [ ] Step 2: Run `pnpm test -- gameDefFill` → FAIL（prompt 无 clearLayer）。
- [ ] Step 3: 改 FILL_SYSTEM：goal 可选项段落用 `renderGoalOptionsForPrompt()` 注入（import from @cq/orchestrator）。
- [ ] Step 4: Run `pnpm test -- gameDefFill` → PASS。
- [ ] Step 5: Run `pnpm test` 全量 + `pnpm typecheck`。
- [ ] Step 6: Commit：`feat(server): drive fill prompt goal options from capability list`

---

## 验收对照（spec §8）
- [x] Task A: 单一事实源三档。
- [x] Task B/C: clearLayer fill → 合法果冻关 def。
- [x] Task D: 对话→果冻关可玩 golden。
- [x] Task C: collect/score 回归零变化。
- [x] Task E: prompt 由清单生成、含 clearLayer。
- [x] 各 Task 末：pnpm test/typecheck 绿；未碰 conversation prompt。
