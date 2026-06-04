# chat-questioner 前端改造 · Stage 舞台交互设计

> 日期：2026-06-04 · 状态：已确认（待评审）
> 目标：把当前的"双列气泡 + 中央形象"界面，改造为"顶部上下文流 + 中部形象 + 左右选项气泡 + 底部输入"的引导式提问界面，并支持收敛后的成果展示。

---

## 1. 背景与目标

当前前端（`apps/web`，Vite + React 18 + 纯 CSS）主界面是 `Stage`：中央 Avatar 视频形象 + 两侧 `BubbleColumn`（左 assistant / 右 user）+ 底部输入 + 右侧详情抽屉。NewBee 抛出的"方向 A / 方向 B"目前只是混在流式文本里的**自然语言**，没有结构化选项，用户只能打字回复。

本次改造目标：

1. **顶部**保留现有上下文流式输出样式（气泡 + token 流式追加），作为对话上下文流。
2. **中部**形象居中；当 NewBee 抛出选项时，A/B 两个选项以**气泡冒出动画**分列形象左右，可点击选中并推进，也可在**底部**自定义输入后发送。
3. 收敛成功（结果无误）后，左右两侧从"选项气泡"切换为"成果面板"：**左 = GDD**、**右 = 最终内容（Resolution / DSL，Tab 切换）+ 导出**，表示 chat-questioner 流程已完成。
4. 气泡冒出与成果呈现均为**缓慢 + 打字机逐字**显现，并由形象做出**对应动作把内容"端"到用户面前**。

非目标（YAGNI）：profile 切换、会话恢复 UI、GDD 富 Markdown 渲染引擎、多于 2 个的选项。

---

## 2. 架构总览

```
NewBee (LLM)
  └─ 每轮输出：人话回复  +  <<<STATE>>> JSON{ state_delta, stage_complete, ready_for_synthesis, options[] }
       │
   server: advance → parseTurnOutput（解析 options） → SSE 事件 token / state / stage / options / synthesis / done
       │
   web: api.sendMessage（dispatch options 事件） → useSession（新增 options 状态）
       │
   Stage（重构）
     ├─ 顶部 ContextStream（流式上下文，保留现有气泡样式）
     ├─ 中部 Avatar（useAvatar 挂接 options→idea-feed 动作）
     ├─ 左右 OptionBubbles（结构化选项，冒泡+打字机）/ 结束态 ResultPanels（GDD + Tab）
     └─ 底部 Composer（自定义输入）
```

设计原则：**选项是结构化协议产物**（不靠前端正则解析）；顶部流式与左右气泡**内容不重复**（顶部只放共情承接 + 收敛提问，方向描述只在气泡）。

---

## 3. 通信协议变更

### 3.1 提示词指令（`packages/conversation/src/llm.ts` · `TURN_DIRECTIVE`）

在 `<<<STATE>>>` JSON 中新增可选字段 `options`，约束 NewBee 把"方向 A / 方向 B"以结构化形式输出，同时**人话回复部分不再展开两个方向的完整描述**，只保留共情承接与那一个收敛提问：

```jsonc
{
  "state_delta": { /* 既有 */ },
  "stage_complete": false,
  "ready_for_synthesis": false,
  "options": [
    { "id": "A", "label": "信号找同伴", "detail": "你是一束信号，要在静默的太空里找回失联的同伴。" },
    { "id": "B", "label": "回声拼真相", "detail": "你是最后清醒的人，靠收集回声拼出真相。" }
  ]
}
```

规则补充写入指令：
- `options` 要么是**恰好 2 项**（id 固定为 "A"/"B"），要么**省略**（破冰、纯开放问题时不给）。
- `label` 为 ≤8 字的短标题，`detail` 为一句话方向描述。
- 人话回复（哨兵前部分）**不重复** `detail` 文案。

### 3.2 解析（`packages/conversation/src/turn.ts`）

`ParsedTurn` / `TurnControl` 增加 `options?: TurnOption[]`：

```ts
export interface TurnOption { id: string; label: string; detail: string }
```

`parseTurnOutput` 从 JSON 读取 `options`，做防御式校验：必须是长度为 2 的数组、每项含非空 `id/label/detail`，否则视为无选项（不报错，仅忽略）。无 `options` 时该字段为 `undefined`。

### 3.3 SSE 线缆（`apps/server/src/wire.ts` + `apps/web/src/sse.ts`/`api.ts`）

新增事件：

| event | data | 时机 |
|---|---|---|
| `options` | `{ options: TurnOption[] }` | 本轮解析出合法选项后、`done` 之前发出 |

`advance`（`packages/conversation/src/advance.ts`）需要把 `parsed.options` 透传到结果对象；server 在拿到 advance 结果后 `sendEvent(reply, "options", { options })`。`api.sendMessage` 的 `SseHandlers` 增加 `onOptions`。

---

## 4. 前端状态（`apps/web/src/hooks/useSession.ts` + `types.ts`）

`useSession` 新增：

- `options: TurnOption[] | null` —— 当前轮可选项；新一轮 `send` 开始时清空（`setOptions(null)`），收到 `options` 事件时设置。
- `chooseOption(opt)` —— 语法糖：等价于 `send(opt.detail)`（发送**完整描述文字**），发送前清空 `options`。

`types.ts` 增加 `TurnOption`。`ChatMessage` 不变（选中项以普通 user 消息进入流）。

---

## 5. UI 组件与布局

`Stage.tsx` 重构为三段式（CSS grid，行：顶部流 / 中部舞台 / 底部输入）。

### 5.1 顶部 · ContextStream（新组件，复用现有气泡样式）

- 横贯顶部的上下文流：按时间顺序展示 user/assistant 气泡，最新在下，自动滚到底。
- assistant 末条流式 token 追加（沿用 `useSession` 流式逻辑）。
- 样式复用 `styles.css` 现有 `.bubble`/`.bubble-role`（聊天气泡视觉），高度受限、可滚动。
- `BubbleColumn`（旧的双列）与遗留 `ChatPanel` 退役。

### 5.2 中部 · 形象 + 选项气泡 / 成果面板

中部为 `grid-template-columns: 1fr auto 1fr`：

- **左列 / 右列（提问态）**：`OptionBubble`（新组件）。
  - 数据来自 `session.options`：A→左、B→右。
  - 入场：冒泡浮现（风格 A，放大 + 上浮 + 淡入）**缓慢**（~0.8s），A 先 B 后（错峰 ~0.15s）。
  - 文案：`detail` 以**打字机逐字**显现（~30ms/字）；打字进行中点击气泡可"跳过"直接显示全文。
  - 交互：点击 → 该气泡高亮放大、另一侧淡出 → `session.chooseOption(opt)` → 顶部流追加该 user 消息 → 下一轮。
  - `session.options` 为 null 时左右不渲染气泡。
- **中列**：`Avatar`（不变）。
- **结束态切换条件（明确）**：当 `session.stage?.readyForSynthesis === true` **且** `session.synthesis` 存在时，左右切换为 `ResultPanel`（见 5.4）。在此之前即使 `synthesis` 预览已提前出现（工程信号齐备但未最终收敛），主区**仍保持提问态**，预览只进右侧详情抽屉，避免过早进入"结束态"。

### 5.3 打字机（新 hook `useTypewriter`）

- 输入完整文本 + 速度，输出当前已显示片段与 `done`。
- 支持 `skip()`（立即显示全文）。
- `prefers-reduced-motion: reduce` 时直接返回全文、`done=true`。
- 复用于 OptionBubble 的 detail 与 ResultPanel 的内容。

### 5.4 结束态 · ResultPanel（新组件）

- **左 = GDD**：`synthesis.gddMarkdown` 以打字机显现于可滚动卡片（纯文本/`pre`，沿用现有简易呈现，长文本打字机加速 + 可跳过）。
- **右 = 最终内容**：Tab 切换
  - `Resolution`：template / skills / mcp / packages（复用现 `ResolutionPreview` 数据），warnings 提示。
  - `DSL`：`synthesis.dsl` 以 JSON 美化展示（只读）。
  - 底部"导出 bundle"按钮 → `session.doExport`。
- 入场缓慢淡入；形象播 `synthesis` 动作。
- 详情抽屉 `DetailsDrawer` 可保留为补充入口（不与主区冲突），或在结束态隐藏；默认保留。

### 5.5 底部 · Composer

沿用现有 `composer`（textarea + 发送，Enter 发送 / Shift+Enter 换行）。结束态可隐藏或禁用（对话已完成）；默认隐藏发送、保留只读提示"对话已完成"。

---

## 6. 形象动作挂接（`apps/web/src/avatar/useAvatar.ts`）

复用现有 emote 词表，无需新增素材：

- **选项出现**：监听 `session.options` 由 null→非空，`dispatch(emote("idea-feed"))`（`point` 指向手势 = "把两个方向端出来"）。
- **成果呈现**：`session.synthesis` 首次出现已触发 `synthesis`（`party`）庆祝；保持不变即可表达"端出成果"。可选追加 `handoff`（`wave`）作为交付收尾（次要，按手感取舍）。

`useSession` 暴露的 `options` 作为 `useAvatar` 的新依赖。

---

## 7. 动画节奏与降级

| 元素 | 动画 | 节奏 |
|---|---|---|
| 选项气泡入场 | 冒泡浮现（scale 0.5→1 + 上浮 + 淡入） | ~0.8s，A/B 错峰 0.15s |
| 选项 detail 文字 | 打字机 | ~30ms/字，可点击跳过 |
| 选中反馈 | 选中项高亮放大、另一项淡出 | ~0.24s |
| 成果面板入场 | 缓慢淡入 | ~0.6s |
| 成果文本 | 打字机（长文加速） | 标题/Pitch 慢，正文加速，可跳过 |

**无障碍**：`prefers-reduced-motion: reduce` 时关闭冒泡/淡入动画与打字机，内容直接完整呈现；形象已有 reduced 降级（静态 poster）。

---

## 8. 错误与边界处理

- **选项缺失/非法**：`parseTurnOutput` 校验失败 → 视为无选项，正常进行（仅底部输入）。不弹错。
- **流式中断 / abort**：沿用现有 `AbortController`；新一轮 `send` 清空 `options` 防止旧选项残留。
- **收敛后再发消息**：默认结束态隐藏输入；若保留，则成果面板可被新一轮覆盖回提问态（避免状态僵死）。
- **形象素材缺失**：`EmoteLayer` 的 `onError` 已回落，不阻塞。

---

## 9. 测试

- `turn.test`（新增/扩展）：`parseTurnOutput` 解析 `options`、非法 options 被忽略、无 options 时 `undefined`。
- `sse.test`：`options` 事件解析。
- `useTypewriter`：逐字推进、skip、reduced-motion 即时返回。
- 组件冒烟：OptionBubble 点击触发 `chooseOption`；结束态渲染 ResultPanel Tab 切换。

---

## 10. 改动文件清单

**后端 / 引擎**
- `packages/conversation/src/llm.ts`（`TURN_DIRECTIVE` 增 options 约束）
- `packages/conversation/src/turn.ts`（`TurnOption`、解析与校验）
- `packages/conversation/src/advance.ts`（透传 options）
- `apps/server/src/wire.ts`（`options` 事件类型）
- `apps/server/src/server.ts`（发送 `options` 事件）

**前端**
- `apps/web/src/types.ts`（`TurnOption`）
- `apps/web/src/sse.ts` / `api.ts`（`onOptions` 处理）
- `apps/web/src/hooks/useSession.ts`（`options` 状态、`chooseOption`、轮次清空）
- `apps/web/src/components/Stage.tsx`（三段式重构）
- `apps/web/src/components/ContextStream.tsx`（新）
- `apps/web/src/components/OptionBubble.tsx`（新）
- `apps/web/src/components/ResultPanel.tsx`（新）
- `apps/web/src/hooks/useTypewriter.ts`（新）
- `apps/web/src/avatar/useAvatar.ts`（options→idea-feed）
- `apps/web/src/styles.css`（顶部流 / 气泡冒泡 / 打字机光标 / 成果面板 / 结束态样式）
- 退役：`BubbleColumn.tsx`、遗留 `ChatPanel.tsx`

提示词参考文档（如需）：`prompts/newbee.system.md` 的 [F2] 与机器协议保持一致。
