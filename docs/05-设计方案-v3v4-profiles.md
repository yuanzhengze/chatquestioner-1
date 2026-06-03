# chat-questioner v3/v4 设计方案 —— 对话 Profile 化与 A/B 对比

> 日期：2026-06-03 · 状态：**待用户审阅** · 类型：设计文档（spec）
> 关联：[`01-设计方案.md`](./01-设计方案.md)（v1 主设计）、[`../prompts/newbee.system.md`](../prompts/newbee.system.md)（v1）、[`../prompts/newbee-v3.system.md`](../prompts/newbee-v3.system.md)（v3）、[`../prompts/newbee-v4.system.md`](../prompts/newbee-v4.system.md)（v4）
> 前置决策（本轮用户已拍板）：**① 保留 DSL→resolver 精确选型流水线**（v3/v4 也要产出完整 bundle）；**② 参数化为 ConversationProfile**（v1/v3/v4 只是不同 profile，前端加切换器，最大化复用、内置 A/B）。

---

## 1. 目标与核心约束

**目标**：在不动 `dsl / gdd / resolver / server 壳 / web 壳` 的前提下，把对话引擎从"写死的 v1 八阶段"升级为**可插拔 profile**，让 v1（创意导演）、v3（显式五阶段顾问）、v4（潜行共创）三种**提问策略**并存，用户可一键切换、同口径对比"哪种更能引导小白做出好游戏"。

**不可动摇的约束（A/B 公平性的地基）**：三个 profile **共享同一套** `ConversationState`、`mergeStateDelta`、`toGameDsl`、`toGddModel`、`@cq/dsl`、`@cq/gdd`、`@cq/resolver`。即——**无论用哪种提问策略，最终都收敛到同一个状态模型 → 同一份 DSL → 同一个 resolver → 同一形态 bundle**。提问方式不同，产物口径相同，对比才有意义。

> 这也直接回答了"v3/v4 纯净形态喂不动 DSL"的问题：本方案要求**每个 profile 的提示词都必须把 DSL 必需的工程信号（2D/3D、platform、modalities）问出来**（v3 折进第四阶段、v4 折进后半场），且每个 profile 的收敛判据都复用同一条硬规则：`dimension & engine & platform 三者齐 → 方可收敛`。

---

## 2. 复用边界（现状盘点）

| 资源 | 处置 |
|---|---|
| `@cq/dsl`、`@cq/gdd`、`@cq/resolver` | ✅ 原样复用，零改动 |
| `apps/server` 的 SSE/会话/导出/`buildSynthesis` | ✅ 复用；仅在 `buildServer`/`/api/session` 增加 `conversationProfile` 维度 |
| `apps/web` 的 SSE 解析/api/hook/组件 | ✅ 复用；新增一个 profile 选择器 + 透传 |
| `@cq/conversation` 的 `state.ts` `merge.ts` `compile.ts` `turn.ts` `advance.ts`（流式/解析骨架） | ✅ 复用骨架；`advance` 改为吃 profile |
| `@cq/conversation` 的 `stages.ts`（写死 8 阶段）、`llm.ts` 里的 `OPENING_MESSAGE` / `TURN_DIRECTIVE` 常量、`prompt.ts`（写死读 `newbee.system.md`） | ⚠️ **profile 化**：从"全局常量"变成"每 profile 一份" |

> ⚠️ **命名冲突预警**：`buildServer` 现有的 `profile?: string`（默认 `"workbench"`）是 **resolver profile**（白名单口径），与本方案引入的 **conversation profile**（v1/v3/v4）是两个维度。实现时一律用 `resolverProfile` 与 `conversationProfile` 显式区分，**不要复用同一个 `profile` 字段**。

---

## 3. 核心抽象：`ConversationProfile`

把今天写死的四类东西收进一个对象。新增 `packages/conversation/src/profiles/`：

```ts
// packages/conversation/src/profile.ts
export interface StageMachine {
  count: number;                                   // 阶段总数
  labels: Record<number, string>;                  // 阶段名（给 UI 报幕/进度）
  ready: Record<number, (s: ConversationState) => boolean>; // 各阶段"必填字段已齐"判据
}

export interface ConversationProfile {
  id: "v1" | "v3" | "v4";
  label: string;                 // UI 显示名，如 "v4 · 潜行共创"
  systemPromptFile: string;      // prompts/ 下的文件名
  opening: string;               // stage 0 开场白（取代全局 OPENING_MESSAGE）
  stages: StageMachine;          // 取代写死的 STAGE_COUNT/STAGE_LABELS/STAGE_READY
  turnDirective: string;         // 取代写死的 TURN_DIRECTIVE（见 §3.1）
}
```

**关键设计决定**：`state_delta` 允许键、`ready_for_synthesis` 的硬规则（`dimension/engine/platform` 三者齐）**在所有 profile 间完全一致**——它属于"共享状态契约"，不进 profile。profile 只定制 `turnDirective` 中**面向用户那段人话的产出方式**（v1 三步投喂 / v3 报幕+阶段文档 / v4 前潜行后共创）。这样既允许提问风格千差万别，又锁死了产物口径。

### 3.1 `turnDirective` 的拆分

现 `TURN_DIRECTIVE`（`llm.ts`）= **人话产出规则** + **机器状态块协议**。拆成：
- **共享部分 `STATE_CONTRACT`**：哨兵、JSON 形状、`state_delta` 允许键、`ready_for_synthesis` 硬规则——**所有 profile 共用一份常量**。
- **per-profile 部分 `humanTurnRule`**：
  - v1：现 [F2] 三步（共情→投喂 2 创意→单步提问）。
  - v3：报幕（进新阶段首轮）→共情→（按需投喂方向）→1–2 问；阶段聊清时输出阶段文档+确认门。
  - v4：前半场"接情绪+只问 1 个、不暴露目的"；揭示拐点亮卡；后半场"共情+投喂+单步收敛"。

`profile.turnDirective = humanTurnRule(profile) + "\n\n" + STATE_CONTRACT`。

### 3.2 各 profile 的阶段机映射（都落到同一 `ConversationState`）

| | v1（现状，8 阶段） | v3（五阶段顾问） | v4（两宏观阶段） |
|---|---|---|---|
| 阶段 | 0破冰…7收敛 | 1创意→2系统→3美术→4工程→5收敛自检 | A潜行挖掘 → B揭示共创 →（收敛） |
| `ready[i]` 复用字段 | 见 `stages.ts` | 1:`spark&coreEmotion&coreAction`；2:`loop.thirtySec&reward&failRule`；3:`aesthetic`(+`artStyle`/visual 关键词)；4:`engineering.{dimension,engine,platform}`；5:`pitch&keywordPools&mvp.must` | A:`spark&coreEmotion`；B:`coreAction&loop.thirtySec&engineering.{dimension,engine,platform}`；收敛:`pitch&mvp.must` |
| 收敛硬门（共享） | `toGameDsl(state).missing===[]` 即 `dimension&engine&platform` 齐 | 同左 | 同左 |

> v3 第四阶段、v4 阶段 B 是**工程信号采集点**——这是把"喂得动 DSL"焊进流程的地方，已写进两份提示词的对应 fragment。

---

## 4. 引擎改动点（最小集）

1. `advance(prev, userInput, deps)`：`deps` 增 `profile: ConversationProfile`。内部把 `TURN_DIRECTIVE` 换成 `deps.profile.turnDirective`，把 `nextStage(state, complete)` 换成 `nextStage(state, complete, deps.profile.stages)`（`stages.ts` 的 `STAGE_COUNT/STAGE_LABELS/STAGE_READY` 改为接收 `StageMachine` 参数）。
2. 新增 `profiles/{v1,v3,v4}.ts` 各导出一个 `ConversationProfile`；`profiles/index.ts` 导出 `PROFILES: Record<id, ConversationProfile>` 与 `getProfile(id)`。
3. `prompt.ts` 的 `readNewbeeSystemPrompt` 泛化为 `readSystemPrompt(promptsDir, file)`；v1 仍指向 `newbee.system.md`。
4. `llm.ts`：`OPENING_MESSAGE` 退役（移入各 profile 的 `opening`）；`TURN_DIRECTIVE` 拆为 `STATE_CONTRACT` + 各 profile `humanTurnRule`。
5. `state.ts` / `merge.ts` / `compile.ts` / `turn.ts`：**不改**（共享契约）。

## 5. server / web 改动点（最小集）

- **server**：
  - `buildServer` 入参增 `profiles: Record<id, ConversationProfile>` 与默认 `conversationProfile`；保留 `resolverProfile`（原 `profile`，改名）。
  - `POST /api/session` 接受 `{ conversationProfile?: "v1"|"v3"|"v4" }`，把选定 profile 的 `id` 存进会话（`ConversationState` 增一个**不参与 DSL** 的 `profileId` 元字段，或存在 session 元数据里——倾向后者，避免污染共享状态）；返回该 profile 的 `opening` 与 `label`。
  - `POST /api/session/:id/message`：从会话元数据取 `profileId` → `getProfile()` → 传给 `advance`。
  - `main.ts`：`buildCatalog` 后加载三份系统提示词，组装 `PROFILES` 注入 `buildServer`。
- **web**：
  - 新会话前的一个轻量选择器（下拉/三按钮：v1 创意导演 / v3 五阶段顾问 / v4 潜行共创），`createSession({conversationProfile})` 透传。
  - 其余（SSE token / state / stage / synthesis）零改动——因为产物口径一致。
  - 阶段进度条用 `profile.stages.labels` 渲染（v3 显示 1–5、v4 显示 A/B），已有 `onStage` 通道直接复用。

> 会话与导出按 `conversationProfile` 分目录（如 `data/exports/<profile>/<id>/`），方便横向比对三种 profile 的产物。

---

## 6. A/B 对比口径（本方案的最终目的）

**同输入、换 profile、比产物**。建议固定 3–5 个"小白脑洞"种子输入（如"我想做个治愈的猫咪游戏""赛博朋克送外卖""躲子弹"），对每个种子分别用 v1/v3/v4 走一遍，对比：

| 维度 | 怎么量 | 数据来源 |
|---|---|---|
| **引导效率** | 到达收敛（`ready_for_synthesis`）用了几轮 | `state.history` 轮数 |
| **小白友好度** | 主观打分 + 术语泄漏次数（提示词要求零术语，可抽检 reply） | 人工评审 / 关键词扫描 |
| **产物完整度** | DSL 是否齐全、`unmatched` 是否为空、resolver 选到的 template/skill/mcp 数量与贴合度 | `resolution.json` |
| **概念质量/有魂** | pitch/差异化/情感时刻是否打动人 | 人工评审 GDD |
| **完成率/弃聊** | 多少种子能走到收敛、哪一版中途卡住 | 会话日志 |

> 因三 profile 产物同形（`{gdd.md, dsl.json, resolution.json}`），可写一个 `compare` 脚本把同种子的三份 bundle 并排 diff。可作为后续小里程碑（非必须）。

---

## 7. 实施里程碑（建议交付顺序，全程 TDD）

- **P1 · 抽象落地（引擎）**：`ConversationProfile` 类型 + `stages.ts` 参数化 + `STATE_CONTRACT`/`humanTurnRule` 拆分 + `profiles/{v1}.ts`（先把现状无损迁成 v1 profile，回归测试必须全绿——**证明重构零行为变化**）。
- **P2 · v3/v4 profile**：`profiles/{v3,v4}.ts` + 两份提示词接线 + 各自阶段机 `ready` 守卫 + 剧本回放测试（喂罐装答案，断言阶段推进与最终 DSL 收敛）。
- **P3 · server/web 接线**：`buildServer`/`/api/session` 增 `conversationProfile`、`main.ts` 装配三 profile、web 选择器 + 进度条按 profile labels 渲染。
- **P4（可选）· compare 脚本**：固定种子 × 三 profile → 并排产物对比报告。

> P1 是关键安全垫：先把 v1 无损迁进 profile 框架、回归全绿，再加 v3/v4，确保新增策略不回归既有行为。

---

## 8. 风险与取舍

| 风险 | 应对 |
|---|---|
| `conversationProfile` 与 `resolverProfile` 命名/语义混淆 | 全代码显式两套命名，禁用裸 `profile` |
| 重构 `stages.ts` 影响 v1 现有行为 | P1 以 v1 回归测试为验收门，零行为变化才进 P2 |
| v4 潜行前半场可能久聊不收敛 | 阶段 A `ready` 仅需 `spark&coreEmotion`；提示词限定 6–12 轮触发揭示拐点；后半场强制采集工程信号 |
| LLM 不按 profile 的人话规则走（如 v4 暴露术语） | A/B 评审里"术语泄漏次数"作为显式指标；必要时在 `humanTurnRule` 加更强禁令 |
| 用户原意"新开文件夹" vs 实选"profile 化" | 已按用户拍板走 profile 化（最大复用、内置 A/B）；如需物理隔离可在 P3 后再 fork |
| 把 `profileId` 塞进共享 `ConversationState` 会污染 DSL | `profileId` 存 session 元数据，不进 `ConversationState`/不进 `toGameDsl` |

---

## 9. 待用户确认

1. 里程碑顺序与"P1 先无损迁 v1"的安全垫策略是否认可？
2. profile 选择器放在**新建会话前的一个轻量入口**（而非聊天中途切换）是否符合预期？
3. 是否需要 P4 的 compare 脚本（自动化三方产物对比），还是先人工评审即可？
