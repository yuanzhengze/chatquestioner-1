# 音游引擎 S0（人肉编排）· 实施计划

> TDD，task-by-task。**Spec:** [`../../../../rhythm_game_dsl_spec.md`](../../../../rhythm_game_dsl_spec.md)（workspace 根）
> Goal: 新建 `@cq/rhythm`，实现 `RhythmEngine.tick` 帧管线 + judge/score/combo/rank 运行时；手写 chart + RhythmDef 跑通；golden 锁确定性。

**约定：** 新包 `packages/rhythm`，与 `@cq/modules` 并列、同结构；复用 zod；输入=绝对时间戳；满分=全程满连递增。

---

## Task 1: 新建 @cq/rhythm 包骨架
- Create `packages/rhythm/package.json`（name `@cq/rhythm`, type module, exports src/index.ts, dep zod）
- Create `packages/rhythm/tsconfig.json`（extends base）
- Create `packages/rhythm/src/index.ts`（占位 export {}）
- Modify 根 `tsconfig.json`：paths 加 `@cq/rhythm`，include 加 `packages/rhythm/src`
- Modify `vitest.config.ts`：alias 加 `@cq/rhythm`
- Run `pnpm install`；`pnpm typecheck` 绿
- Commit: `build(rhythm): scaffold @cq/rhythm package`

## Task 2: 数据契约 types
- Create `packages/rhythm/src/types.ts`：Note/NoteType/FlickDir/Chart/Judgement/RhythmState/RhythmDef/SystemUse/HookRef（参照 spec §1、§3.1）
- index.ts 导出
- `pnpm typecheck` 绿
- Commit: `feat(rhythm): data contracts (Note/Chart/RhythmState/RhythmDef)`

## Task 3: 判定核心 + 纯函数 stages（TDD）
- Test `packages/rhythm/test/judge.test.ts`：
  - judgeTiming(|Δ|): ≤perfectMs→perfect；早且≤goodMs→good；晚且≤okMs→ok；超→null（不消费）
  - flick 方向错→miss
  - hold 头尾系数平均
  - comboMultAt(combo, ladder): 落阶梯取倍率
  - timingCoef(judgement)
- Implement `packages/rhythm/src/judge.ts`（纯函数）
- Run `pnpm test -- rhythm` → 绿
- Commit: `feat(rhythm): timing/judgement/combo pure functions + tests`

## Task 4: RhythmEngine.tick 帧管线 + golden（TDD）
- Test `packages/rhythm/test/engine.test.ts`：
  - 罐装 chart + 罐装输入事件序列（含 perfect/good/miss/flick错向/hold），按时间喂 tick/feedInput
  - 断言 score/combo/maxCombo/counts/status 终值确定；同输入可复现
  - expire：不输入则 note 到期判 miss、断 combo
- Implement `packages/rhythm/src/RhythmEngine.ts`：构造载入 chart（预计算 theoreticalMax）、feedInput(event)、tick(now) 跑管线（advanceTime/activate/judgeInput/expire/scoring/combo/evaluateGoal）
- Run `pnpm test -- rhythm` → 绿
- Commit: `feat(rhythm): RhythmEngine tick pipeline + golden determinism`

## Task 5: manifests + validate + 手写 RhythmDef/chart
- Create `packages/rhythm/src/manifests.ts`（11 条，spec §3，params zod + 默认）
- Create `packages/rhythm/src/validate.ts`（复用 match-3 validate 范式：unknown-module/bad-params/unmet-dep）
- Create `packages/rhythm/src/games/neonPulse.ts`（RhythmDef）+ `charts/neonPulse.ts`（手写 chart）
- Test `packages/rhythm/test/validate.test.ts`：validate(neonPulse)===[]；坏 def 报错
- Run `pnpm test -- rhythm` → 绿
- Commit: `feat(rhythm): manifests + validate + hand-authored RhythmDef/chart`

## Task 6: 满分/百分比/rank + golden 可复现
- Implement rank 评级（rank-threshold）+ progressPercent；engine 暴露 getRank()/getProgress()
- Test：罐装"全 perfect"输入 → progress≈100%、rank=SSS；可复现
- Run `pnpm test`（全量）+ `pnpm typecheck`
- Commit: `feat(rhythm): rank + percentage scoring with golden`

## 验收
- [x] RhythmEngine 用 DSL 配置（systems 参数）驱动判定/计分/combo/rank
- [x] 罐装输入 golden 确定可复现
- [x] validate(手写 RhythmDef)===[]
- [x] pnpm test/typecheck 全绿
- [x] 谱面走 chart 输入（hook 口子），未硬编进引擎
