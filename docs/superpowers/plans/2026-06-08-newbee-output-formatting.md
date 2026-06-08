# NewBee 输出格式分层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 NewBee 回复在视觉上区分闲聊文本与重点信息（行内加粗高亮 + emoji 引用块卡片），用户在前端一眼可辨。

**Architecture:** 复用原生 Markdown 语义（`**加粗**` + `>` emoji 引用块），不改输出协议与渲染链路；提示词约束 LLM 稳定产出标记，纯 CSS 给 `markstream-react` 渲出的 `<strong>`/`<blockquote>` 加视觉强化。

**Tech Stack:** TypeScript、React、`markstream-react`、CSS、pnpm（monorepo，`@cq/web`）。

参考 spec：`docs/superpowers/specs/2026-06-08-newbee-output-formatting-design.md`

---

## File Structure

- `prompts/newbee.system.md` — 系统提示词，新增 `[F9] 输出排版规范` 一节（置于 [F8] 之后）。
- `packages/conversation/src/llm.ts` — `TURN_DIRECTIVE` 第 1) 部分补一句排版引用。
- `apps/web/src/styles.css` — `.cq-md strong` 行内高亮 + `.cq-md blockquote` 卡片样式（增量，已有 `.cq-md` 容器规则在 116-119 行）。

不改动：`Markdown.tsx`、`turn.ts`、`advance.ts`、`ContextStream.tsx`、前端类型。

色板基线（取自现有 `styles.css`）：主色 `#2b6ef2`，正文 `#e6e8ec`，气泡底 `#1b1f29`，边框 `#2c3344`。

---

## Task 1: 提示词新增 [F9] 输出排版规范

**Files:**
- Modify: `prompts/newbee.system.md`（在 [F8] 语气一节末尾、文件结尾处追加 [F9]）

- [ ] **Step 1: 在 `prompts/newbee.system.md` 末尾追加 [F9] 一节**

在文件最后（[F8] 语气一节的最后一行 `...而不是审问或评判。` 之后）追加：

```markdown

---

## [F9] 输出排版规范（让用户分清「闲聊」与「重点」）

你面向用户的人话回复，按内容性质分两类排版：

1. **闲聊 / 承接** —— 用**普通文本**。包括共情承接、口语化过渡、铺垫语气的句子，不加任何强调标记。

2. **重点信息** —— 用 Markdown 标记，让用户一眼抓住：
   - **行内重点**：把你刚提炼出的「核心爽点 / 关键设计词」用 `**加粗**` 标出。每段最多 1–2 处，宁缺毋滥。
   - **重点区块**：需要用户重点感知或拍板的整段内容，用 `>` 引用块承载，且**首行必须以约定 emoji 起头**：
     - `> 💡 …` —— **关键想法 / 创意提炼**（你提出的核心点子、对用户潜台词的设计化翻译）。
     - `> ❓ …` —— **重要引导问题 / 待确认**（需用户拍板的核心选择、宪法项确认，即 [F2] 第 3 步的那一个收敛提问）。
     - `> 📌 …` —— **阶段小结 / 已定核心**（[F6] 的阶段性小结、被钉为「宪法」的确认项）。

**纪律**：
- 纯闲聊不要加粗；emoji 只在 `>` 引用块首行使用，正文里不要乱放这三个 emoji。
- 不要因为排版而堆砌大量重点块——一轮通常 **0–2 个**区块就够。
- 本轮若已给出 A/B 选项（options），收敛提问放进 `> ❓ …` 区块即可，不要在正文里重复展开两个方向的描述（方向描述只在 options 里）。
```

- [ ] **Step 2: 人工核对**

Read `prompts/newbee.system.md`，确认 [F9] 紧跟 [F8] 之后、Markdown 结构完整（标题层级、`>` 示例未被转义破坏）。

- [ ] **Step 3: Commit**

```bash
git add prompts/newbee.system.md
git commit -m "feat(prompt): add F9 output formatting spec for NewBee replies"
```

---

## Task 2: TURN_DIRECTIVE 补排版引用

**Files:**
- Modify: `packages/conversation/src/llm.ts`（`TURN_DIRECTIVE` 第 1) 部分，约 25 行）
- Test: `packages/conversation/test/prompt-f25.test.ts`（已有的提示词文案测试，参考其断言风格；如无对应断言可跳过新增）

- [ ] **Step 1: 修改 `TURN_DIRECTIVE` 第 1) 部分**

将现有：

```ts
1) 面向用户的人话回复（遵循上文 [F2] 三步：共情承接 → 动态投喂 2 个定制创意 → 单步收敛提问）。
   绝不在这部分出现任何 JSON、字段名或英文键名。
```

改为：

```ts
1) 面向用户的人话回复（遵循上文 [F2] 三步：共情承接 → 动态投喂 2 个定制创意 → 单步收敛提问）。
   按 [F9] 输出排版规范区分闲聊与重点：闲聊用普通文本，行内重点用 **加粗**，
   重点整段用首行带 💡/❓/📌 的 > 引用块承载。绝不在这部分出现任何 JSON、字段名或英文键名。
```

- [ ] **Step 2: 确认改动不破坏哨兵协议**

Read 修改后的 `packages/conversation/src/llm.ts`，确认 `STATE_SENTINEL` 引用、第 2) 部分 JSON 协议、`state_delta` 键列表均原样未动；新增文案仅在第 1) 部分内。

- [ ] **Step 3: 跑相关测试**

Run: `pnpm --filter @cq/conversation test`
Expected: 现有测试全部 PASS（本改动不触及解析逻辑；若 `prompt-f25.test.ts` 对 `TURN_DIRECTIVE` 文案有精确字符串断言而失败，更新该断言以包含新增句子）。

- [ ] **Step 4: Commit**

```bash
git add packages/conversation/src/llm.ts packages/conversation/test/prompt-f25.test.ts
git commit -m "feat(conversation): reference F9 formatting in TURN_DIRECTIVE reply section"
```

---

## Task 3: 前端 CSS — 行内高亮 + 重点卡片

**Files:**
- Modify: `apps/web/src/styles.css`（紧接现有 `.cq-md` 规则之后，约 119 行后）

- [ ] **Step 1: 在 `.cq-md` 现有规则后追加强化样式**

在 `styles.css` 第 119 行（`.cq-md :where(...):last-child { margin-bottom: 0; }`）之后追加：

```css
/* ===== 重点信息视觉强化：行内加粗高亮 + emoji 引用块卡片 ===== */
.cq-md strong {
  color: #7aa6ff;
  background: rgba(43, 110, 242, 0.16);
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 600;
}
.cq-md blockquote {
  margin: 10px 0;
  padding: 10px 14px;
  background: rgba(43, 110, 242, 0.08);
  border-left: 3px solid #2b6ef2;
  border-radius: 8px;
  color: #e6e8ec;
}
.cq-md blockquote p { margin: 0; }
.cq-md blockquote p + p { margin-top: 6px; }
```

- [ ] **Step 2: typecheck + build 验证**

Run: `pnpm --filter @cq/web build`
Expected: PASS（typecheck + build 无错误；CSS 改动不引入类型问题）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web): style inline bold highlight and emoji blockquote cards in .cq-md"
```

---

## Task 4: 端到端手测验收

**Files:** 无（手动验证）

- [ ] **Step 1: 启动 dev 环境**

Run: `pnpm --filter @cq/web dev`（按 README 实际命令；若需同时起 server，参考 `apps/server` 启动方式）

- [ ] **Step 2: 对照验收标准逐项确认**

与 NewBee 对话几轮，确认：
1. NewBee 回复中 `**加粗**` 显示为蓝色高亮底（荧光笔效果）。
2. `> 💡 …` / `> ❓ …` / `> 📌 …` 显示为带左色条的卡片，emoji 作为图标在首行。
3. 普通闲聊文本为默认正文样式，无强调。
4. 流式输出过程中半截语法（如刚打出 `> 💡 关键想`）不报错、不闪烁错乱。
5. 哨兵后的 STATE JSON 不出现在气泡里、不被渲成卡片。
6. 历史消息（上一轮回复）同样套用该样式。

- [ ] **Step 3: 若发现暗色对比度或卡片观感问题**

回到 Task 3 微调 `#7aa6ff` / `rgba(...)` / `border-left` 色值，重跑 `pnpm --filter @cq/web build`，单独 commit：

```bash
git add apps/web/src/styles.css
git commit -m "style(web): tune highlight/card colors for dark panel contrast"
```

---

## Self-Review

**1. Spec coverage：**
- §2 语义约定（行内加粗 / 三类 emoji 引用块）→ Task 1（提示词约定）+ Task 3（渲染）。
- §3 前端纯 CSS 渲染 → Task 3。
- §4 提示词改动（[F9] + TURN_DIRECTIVE）→ Task 1 + Task 2。
- §5 改动文件清单（3 个文件）→ Task 1/2/3 覆盖；不改动文件均未触及。
- §6 验收标准（build、手测、流式、哨兵隔离）→ Task 3 Step 2 + Task 4。
- §7 风险（emoji 缺失降级、暗色对比、加粗误伤）→ blockquote 基础卡片样式对所有引用块生效（emoji 缺失仍是卡片，优雅降级）；Task 4 Step 3 处理对比度；加粗样式克制（Task 3）。
- 全部覆盖，无 gap。

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整可粘贴内容；命令与预期均具体。

**3. Type consistency：** 本计划不新增类型/函数签名；CSS 选择器（`.cq-md strong`、`.cq-md blockquote`）与现有 `.cq-md` 容器一致；emoji 三类（💡/❓/📌）在 Task 1、Task 4 中保持一致。
