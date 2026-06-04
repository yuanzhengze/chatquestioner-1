# Stage 舞台交互 UI 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 chat-questioner 前端改造为「顶部上下文流 + 中部形象 + 左右结构化 A/B 选项气泡（冒泡+打字机）+ 底部输入」，收敛后左右切换为 GDD 与最终内容（Resolution/DSL）成果面板，并由形象做对应动作。

**Architecture:** 选项以结构化协议产出：LLM 在既有 `<<<STATE>>>` JSON 里加 `options` → `parseTurnOutput` 解析校验 → `advance` 透传 → server 发新 SSE `options` 事件 → web `useSession` 持有 `options` 状态 → `Stage` 用新组件 `OptionBubble`/`ContextStream`/`ResultPanel` + `useTypewriter` 渲染；`useAvatar` 把选项出现挂到 `idea-feed` 动作。

**Tech Stack:** pnpm monorepo · TypeScript ESM · React 18 + Vite · 纯 CSS · Vitest（node 环境，纯函数测试）· Fastify SSE。

参考设计文档：`docs/superpowers/specs/2026-06-04-chat-questioner-stage-ui-design.md`

---

## 文件结构

**引擎 / 后端**
- `packages/conversation/src/turn.ts`（修改）：`TurnOption` 类型 + `parseOptions` 校验 + `ParsedTurn.options`
- `packages/conversation/src/llm.ts`（修改）：`TURN_DIRECTIVE` 增 `options` 约束
- `packages/conversation/src/advance.ts`（修改）：`AdvanceResult.options` 透传
- `apps/server/src/wire.ts`（修改）：`SSE_EVENTS.options` + `OptionsEvent`
- `apps/server/src/server.ts`（修改）：发送 `options` 事件

**前端**
- `apps/web/src/types.ts`（修改）：`TurnOption`
- `apps/web/src/sse.ts`（不改，通用解析）；`apps/web/src/api.ts`（修改）：`onOptions` + dispatch
- `apps/web/src/hooks/useSession.ts`（修改）：`options` 状态 + `chooseOption` + 轮次清空
- `apps/web/src/hooks/useTypewriter.ts`（新建）：打字机 hook + 纯函数 `charsForElapsed`
- `apps/web/src/components/ContextStream.tsx`（新建）：顶部上下文流
- `apps/web/src/components/OptionBubble.tsx`（新建）：单个选项气泡
- `apps/web/src/components/ResultPanel.tsx`（新建）：结束态成果面板（Tab）
- `apps/web/src/components/Stage.tsx`（重构）：三段式整合
- `apps/web/src/avatar/useAvatar.ts`（修改）：options→idea-feed
- `apps/web/src/styles.css`（修改）：新布局/动画样式
- 退役：`apps/web/src/components/BubbleColumn.tsx`、`apps/web/src/components/ChatPanel.tsx`（删除）

**测试**
- `packages/conversation/test/turn.test.ts`（扩展）
- `apps/web/test/sse.test.ts`（扩展）
- `apps/web/test/typewriter.test.ts`（新建）

**命令**：测试 `pnpm test`；类型 `pnpm typecheck`；本地预览 `pnpm dev:server` + `pnpm dev:web`。

---

## Task 1: 选项解析协议（turn.ts）

**Files:**
- Modify: `packages/conversation/src/turn.ts`
- Test: `packages/conversation/test/turn.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `turn.test.ts` 末尾的新 describe）

```ts
describe("parseTurnOutput · options", () => {
  it("解析合法的两项 options", () => {
    const raw =
      `共情承接，你更喜欢哪个？\n${STATE_SENTINEL}\n` +
      `{ "state_delta": {}, "stage_complete": false, "options": [` +
      `{"id":"A","label":"信号找同伴","detail":"你是一束信号，找回失联的同伴。"},` +
      `{"id":"B","label":"回声拼真相","detail":"你是最后清醒的人，拼出真相。"}` +
      `] }`;
    const r = parseTurnOutput(raw);
    expect(r.options).toHaveLength(2);
    expect(r.options?.[0]).toEqual({ id: "A", label: "信号找同伴", detail: "你是一束信号，找回失联的同伴。" });
    expect(r.options?.[1].id).toBe("B");
  });

  it("无 options 字段时为 undefined", () => {
    const raw = `回复\n${STATE_SENTINEL}\n{ "state_delta": {}, "stage_complete": false }`;
    expect(parseTurnOutput(raw).options).toBeUndefined();
  });

  it("非法 options（数量不为 2 / 缺字段）被忽略为 undefined", () => {
    const one = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x","detail":"y"}] }`;
    expect(parseTurnOutput(one).options).toBeUndefined();
    const bad = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x"},{"id":"B","label":"y","detail":"z"}] }`;
    expect(parseTurnOutput(bad).options).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test -- turn`
Expected: FAIL（`r.options` 不存在 / 为 undefined 类型报错）

- [ ] **Step 3: 实现**

在 `packages/conversation/src/turn.ts` 顶部类型区加入并扩展 `ParsedTurn`：

```ts
export interface TurnOption {
  id: string;
  label: string;
  detail: string;
}

export interface ParsedTurn {
  reply: string;
  control: TurnControl;
  warnings: string[];
  options?: TurnOption[];
}
```

新增校验函数（放在 `parseTurnOutput` 之前）：

```ts
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** 仅接受恰好 2 项、每项含非空 id/label/detail 的数组；否则返回 undefined（静默忽略）。 */
function parseOptions(raw: unknown): TurnOption[] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const out: TurnOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return undefined;
    const o = item as Record<string, unknown>;
    if (!nonEmptyStr(o.id) || !nonEmptyStr(o.label) || !nonEmptyStr(o.detail)) return undefined;
    out.push({ id: o.id, label: o.label, detail: o.detail });
  }
  return out;
}
```

在 `parseTurnOutput` 成功解析 JSON 的返回处补 `options`（仅修改最后那个 `return`）：

```ts
  return {
    reply,
    control: {
      stateDelta: (json.state_delta ?? {}) as StateDelta,
      stageComplete: json.stage_complete === true,
      readyForSynthesis: json.ready_for_synthesis === true,
    },
    warnings: [],
    options: parseOptions(json.options),
  };
```

（注意：`idx === -1` 与 JSON 损坏的两个早返回分支不带 `options`，自然为 `undefined`，符合预期。）

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test -- turn`
Expected: PASS（原有 4 例 + 新 3 例）

- [ ] **Step 5: 提交**

```bash
git add packages/conversation/src/turn.ts packages/conversation/test/turn.test.ts
git commit -m "feat(conversation): parse structured A/B options from turn output"
```

---

## Task 2: advance 透传 options

**Files:**
- Modify: `packages/conversation/src/advance.ts`
- Test: `packages/conversation/test/advance.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `advance.test.ts`；先确认该文件已有 `advance` 与一个 stub LlmClient 的用法，复用其模式。下面用最小独立 stub）

```ts
import { describe, it, expect } from "vitest";
import { advance } from "../src/advance.js";
import { createInitialState } from "../src/state.js";
import { STATE_SENTINEL } from "../src/turn.js";

function stubLlm(full: string) {
  return { async *stream() { yield full; } };
}

describe("advance · options 透传", () => {
  it("把解析出的 options 放进结果", async () => {
    const raw =
      `回复\n${STATE_SENTINEL}\n{ "state_delta": {}, "options": [` +
      `{"id":"A","label":"a","detail":"da"},{"id":"B","label":"b","detail":"db"}] }`;
    const res = await advance(createInitialState(), "嗨", {
      llm: stubLlm(raw), systemPrompt: "sp",
    });
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].id).toBe("A");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test -- advance`
Expected: FAIL（`res.options` 类型不存在）

- [ ] **Step 3: 实现**

`packages/conversation/src/advance.ts`：在 import 处补 `TurnOption`，扩展 `AdvanceResult`，并在 `return` 带上 `options`。

import 改为：

```ts
import { parseTurnOutput, STATE_SENTINEL, type TurnOption } from "./turn.js";
```

`AdvanceResult` 增加字段：

```ts
export interface AdvanceResult {
  reply: string;
  state: ConversationState;
  readyForSynthesis: boolean;
  warnings: string[];
  options?: TurnOption[];
}
```

函数末尾 `return` 改为：

```ts
  return { reply: parsed.reply, state, readyForSynthesis, warnings: parsed.warnings, options: parsed.options };
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test -- advance`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/conversation/src/advance.ts packages/conversation/test/advance.test.ts
git commit -m "feat(conversation): thread options through advance result"
```

---

## Task 3: 提示词指令增加 options 约束

**Files:**
- Modify: `packages/conversation/src/llm.ts`

无独立单测（纯提示词文本）。改完靠 Task 全量 `pnpm test` + `pnpm typecheck` 守门。

- [ ] **Step 1: 修改 `TURN_DIRECTIVE`**

在 `packages/conversation/src/llm.ts` 的 `TURN_DIRECTIVE` 模板里，JSON 形状示例中加入 `options`，并补规则。把示例 JSON 块替换为：

```ts
${STATE_SENTINEL}
{
  "state_delta": { /* 本轮新识别或更新的字段（camelCase），只填你有把握的，没把握的不要编 */ },
  "stage_complete": false,        // 本阶段关键信息是否已聊清
  "ready_for_synthesis": false,   // 是否可进入收敛（关键工程信号都已明确）
  "options": [                    // 可选：本轮给用户的两个方向，省略则本轮无选项
    { "id": "A", "label": "≤8字短标题", "detail": "一句话方向描述" },
    { "id": "B", "label": "≤8字短标题", "detail": "一句话方向描述" }
  ]
}
```

并在「规则」列表末尾追加两条：

```ts
- options 要么恰好 2 项（id 固定 "A"/"B"，各含非空 label 与 detail），要么整体省略（破冰或纯开放问题时省略）。
- 当本轮给了 options 时，面向用户的人话回复里【不要】再展开两个方向的描述，只保留共情承接与那一个收敛提问；方向描述只放进 options 的 detail。
```

- [ ] **Step 2: 类型守门**

Run: `pnpm typecheck`
Expected: PASS（仅模板字符串改动）

- [ ] **Step 3: 提交**

```bash
git add packages/conversation/src/llm.ts
git commit -m "feat(conversation): instruct LLM to emit structured A/B options"
```

---

## Task 4: server 发送 options SSE 事件

**Files:**
- Modify: `apps/server/src/wire.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: 扩展 wire 协议**

`apps/server/src/wire.ts`：在 `SSE_EVENTS` 加 `options`，并加事件类型与 import。

import 增加 `TurnOption`：

```ts
import type { ConversationState, TurnOption } from "@cq/conversation";
```

`SSE_EVENTS` 增加（放在 `stage` 与 `synthesis` 之间，与发送顺序一致）：

```ts
  options: "options",
```

文件末尾事件类型区增加：

```ts
export interface OptionsEvent { options: TurnOption[] }
```

- [ ] **Step 2: server 发送事件**

`apps/server/src/server.ts`：在发送 `stage` 之后、`buildSynthesis` 之前插入：

```ts
        if (res.options?.length) sendEvent(reply, SSE_EVENTS.options, { options: res.options });
```

- [ ] **Step 3: 类型 + 测试守门**

Run: `pnpm typecheck && pnpm test`
Expected: PASS（无新失败）

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/wire.ts apps/server/src/server.ts
git commit -m "feat(server): emit options SSE event when turn yields choices"
```

---

## Task 5: web 类型与 SSE 消费（options）

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api.ts`
- Test: `apps/web/test/sse.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `sse.test.ts`）

```ts
it("解析 options 帧", () => {
  const buf = `event: options\ndata: {"options":[{"id":"A","label":"a","detail":"da"},{"id":"B","label":"b","detail":"db"}]}\n\n`;
  const { events } = parseSseEvents(buf);
  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("options");
  expect((events[0].data as { options: unknown[] }).options).toHaveLength(2);
});
```

- [ ] **Step 2: 运行测试，确认通过或失败**

Run: `pnpm test -- sse`
Expected: PASS（`parseSseEvents` 是通用解析，本测试用于锁定契约；若已 PASS 视为回归保护，继续）

- [ ] **Step 3: 增加 web 类型**

`apps/web/src/types.ts` 顶部增加：

```ts
export interface TurnOption {
  id: string;
  label: string;
  detail: string;
}
```

- [ ] **Step 4: api.ts 增加 onOptions**

`apps/web/src/api.ts`：import 增加 `TurnOption`：

```ts
import type { RecognizedState, SynthesisPayload, TurnOption } from "./types.js";
```

`SseHandlers` 增加：

```ts
  onOptions?: (options: TurnOption[]) => void;
```

`dispatch` 的 switch 增加（放在 `stage` 之后）：

```ts
    case "options": h.onOptions?.((ev.data as { options: TurnOption[] }).options); break;
```

- [ ] **Step 5: 守门**

Run: `pnpm typecheck && pnpm test -- sse`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/types.ts apps/web/src/api.ts apps/web/test/sse.test.ts
git commit -m "feat(web): consume options SSE event in api layer"
```

---

## Task 6: useSession 持有 options 与 chooseOption

**Files:**
- Modify: `apps/web/src/hooks/useSession.ts`

无 jsdom，组件/hook 不做渲染测试；靠 `pnpm typecheck` 守门，行为在 Task 11 本地验证。

- [ ] **Step 1: 扩展 UseSession 接口**

`apps/web/src/hooks/useSession.ts`：import 增加 `TurnOption`：

```ts
import type { ChatMessage, RecognizedState, StageInfo, SynthesisPayload, TurnOption } from "../types.js";
```

`UseSession` 接口增加：

```ts
  options: TurnOption[] | null;
  chooseOption: (opt: TurnOption) => Promise<void>;
```

- [ ] **Step 2: 增加状态与清空逻辑**

在其它 `useState` 旁增加：

```ts
  const [options, setOptions] = useState<TurnOption[] | null>(null);
```

在 `send` 回调体最前面（`setBusy(true)` 之后）增加清空：

```ts
    setOptions(null);
```

在 `sendMessage` 的 handlers 里增加：

```ts
      onOptions: (opts) => setOptions(opts),
```

- [ ] **Step 3: 增加 chooseOption 并导出**

在 `doExport` 之后增加：

```ts
  const chooseOption = useCallback(async (opt: TurnOption) => {
    setOptions(null);
    await send(opt.detail);
  }, [send]);
```

`return` 增加 `options, chooseOption`：

```ts
  return { messages, state, stage, synthesis, busy, error, warnTick, options, send, chooseOption, doExport };
```

- [ ] **Step 4: 守门**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/hooks/useSession.ts
git commit -m "feat(web): hold current options + chooseOption in useSession"
```

---

## Task 7: useTypewriter（hook + 纯函数）

**Files:**
- Create: `apps/web/src/hooks/useTypewriter.ts`
- Test: `apps/web/test/typewriter.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `apps/web/test/typewriter.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { charsForElapsed } from "../src/hooks/useTypewriter.js";

describe("charsForElapsed", () => {
  it("按速度推进字数，封顶为文本长度", () => {
    expect(charsForElapsed(0, 30, 10)).toBe(0);
    expect(charsForElapsed(90, 30, 10)).toBe(3);
    expect(charsForElapsed(99999, 30, 10)).toBe(10);
  });
  it("speed<=0 视为瞬时全显", () => {
    expect(charsForElapsed(0, 0, 5)).toBe(5);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test -- typewriter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 hook**

新建 `apps/web/src/hooks/useTypewriter.ts`：

```ts
import { useEffect, useRef, useState } from "react";

/** 纯函数：给定已过去时间与每字毫秒数，算出应显示的字数（封顶 total）。speed<=0 即瞬时全显。 */
export function charsForElapsed(elapsedMs: number, msPerChar: number, total: number): number {
  if (msPerChar <= 0) return total;
  return Math.min(total, Math.max(0, Math.floor(elapsedMs / msPerChar)));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 打字机：把 text 按 msPerChar 逐字显现。
 * 返回 { shown, done, skip }；skip() 立即显示全文。
 * prefers-reduced-motion 下直接全显。
 */
export function useTypewriter(text: string, msPerChar = 30): { shown: string; done: boolean; skip: () => void } {
  const [count, setCount] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const skippedRef = useRef(false);

  useEffect(() => {
    skippedRef.current = false;
    setCount(0);
    if (prefersReducedMotion() || msPerChar <= 0) {
      setCount(text.length);
      return;
    }
    startRef.current = performance.now();
    const tick = () => {
      if (skippedRef.current) return;
      const c = charsForElapsed(performance.now() - startRef.current, msPerChar, text.length);
      setCount(c);
      if (c < text.length) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, msPerChar]);

  const skip = () => { skippedRef.current = true; cancelAnimationFrame(rafRef.current); setCount(text.length); };
  return { shown: text.slice(0, count), done: count >= text.length, skip };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test -- typewriter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/hooks/useTypewriter.ts apps/web/test/typewriter.test.ts
git commit -m "feat(web): add useTypewriter hook with pure charsForElapsed"
```

---

## Task 8: OptionBubble 组件

**Files:**
- Create: `apps/web/src/components/OptionBubble.tsx`

- [ ] **Step 1: 实现组件**

新建 `apps/web/src/components/OptionBubble.tsx`：

```tsx
import { useTypewriter } from "../hooks/useTypewriter.js";
import type { TurnOption } from "../types.js";

interface Props {
  option: TurnOption;
  side: "left" | "right";
  /** 选中态："chosen" 高亮放大，"dismissed" 淡出，undefined 正常。 */
  phase?: "chosen" | "dismissed";
  disabled?: boolean;
  onChoose: (opt: TurnOption) => void;
}

const LABEL_TAG: Record<string, string> = { A: "方向 A", B: "方向 B" };

/** 形象一侧的可点选项气泡：冒泡浮现入场，detail 打字机逐字显现。 */
export function OptionBubble({ option, side, phase, disabled, onChoose }: Props) {
  const tw = useTypewriter(option.detail, 30);
  const cls = `option-bubble option-bubble-${side}` +
    (phase === "chosen" ? " option-chosen" : "") +
    (phase === "dismissed" ? " option-dismissed" : "");
  const handle = () => {
    if (disabled) return;
    if (!tw.done) { tw.skip(); return; } // 打字进行中：先补全文，不立即选中
    onChoose(option);
  };
  return (
    <button type="button" className={cls} onClick={handle} disabled={disabled} aria-label={`选择${LABEL_TAG[option.id] ?? option.id}：${option.label}`}>
      <span className={`option-tag option-tag-${side}`}>{LABEL_TAG[option.id] ?? option.id} · {option.label}</span>
      <span className="option-detail">{tw.shown}{!tw.done && <i className="tw-caret" />}</span>
    </button>
  );
}
```

- [ ] **Step 2: 守门**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/OptionBubble.tsx
git commit -m "feat(web): add OptionBubble with pop-in + typewriter"
```

---

## Task 9: ContextStream 组件（顶部上下文流）

**Files:**
- Create: `apps/web/src/components/ContextStream.tsx`

- [ ] **Step 1: 实现组件**

新建 `apps/web/src/components/ContextStream.tsx`：

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types.js";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
}

/** 顶部上下文流：按时间顺序的对话气泡，新消息在底部，自动滚到底。复用现有 .bubble 样式。 */
export function ContextStream({ messages, busy }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  const lastIdx = messages.length - 1;
  return (
    <div className="context-stream">
      {messages.map((m, i) => {
        const streamingPlaceholder = m.role === "assistant" && i === lastIdx && !m.content && busy;
        return (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-role">{m.role === "user" ? "你" : "NewBee"}</div>
            <div className="bubble-text">{m.content || (streamingPlaceholder ? "…" : "")}</div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 2: 守门**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/ContextStream.tsx
git commit -m "feat(web): add ContextStream top conversation log"
```

---

## Task 10: ResultPanel 组件（结束态成果）

**Files:**
- Create: `apps/web/src/components/ResultPanel.tsx`

- [ ] **Step 1: 实现组件**

新建 `apps/web/src/components/ResultPanel.tsx`：

```tsx
import { useState } from "react";
import { useTypewriter } from "../hooks/useTypewriter.js";
import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload;
  canExport: boolean;
  onExport: () => void;
}

/** 左侧成果：GDD（打字机加速显现，可点击跳过）。 */
export function GddPanel({ synthesis }: { synthesis: SynthesisPayload }) {
  const tw = useTypewriter(synthesis.gddMarkdown, 6); // 长文：加速
  return (
    <div className="result-panel" onClick={() => !tw.done && tw.skip()}>
      <div className="result-head gdd">📄 GDD · 游戏设计文档</div>
      <pre className="result-body">{tw.shown}{!tw.done && <i className="tw-caret" />}</pre>
    </div>
  );
}

/** 右侧成果：Resolution / DSL 分 Tab + 导出。 */
export function FinalPanel({ synthesis, canExport, onExport }: Props) {
  const [tab, setTab] = useState<"resolution" | "dsl">("resolution");
  const r = synthesis.resolution;
  return (
    <div className="result-panel">
      <div className="result-head final">📦 最终内容输出</div>
      <div className="result-tabs">
        <button className={tab === "resolution" ? "active" : ""} onClick={() => setTab("resolution")}>Resolution</button>
        <button className={tab === "dsl" ? "active" : ""} onClick={() => setTab("dsl")}>DSL</button>
      </div>
      <div className="result-body">
        {tab === "resolution" ? (
          <div className="res-block">
            <div><strong>主模板</strong> {r.template.primary}</div>
            <div><strong>Skills（{r.skills.length}）</strong>
              <ul>{r.skills.map((s) => <li key={s.id}>{s.id} · {s.layer}/{s.load}</li>)}</ul></div>
            <div><strong>MCP（{r.mcp.length}）</strong>
              <ul>{r.mcp.map((m) => <li key={m.server}>{m.server} · {m.layer}/{m.phase}</li>)}</ul></div>
            <div><strong>Packages（{r.packages.length}）</strong>
              <ul>{r.packages.map((p) => <li key={p.id}>{p.id}</li>)}</ul></div>
            {r.warnings.length > 0 && <div className="res-warn">⚠ {r.warnings.join("；")}</div>}
          </div>
        ) : (
          <pre className="dsl-json">{JSON.stringify(synthesis.dsl, null, 2)}</pre>
        )}
      </div>
      <button className="result-export" disabled={!canExport} onClick={onExport}>⬇ 导出 bundle</button>
    </div>
  );
}
```

- [ ] **Step 2: 守门**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/ResultPanel.tsx
git commit -m "feat(web): add ResultPanel (GDD + Resolution/DSL tabs)"
```

---

## Task 11: Stage 三段式重构

**Files:**
- Modify: `apps/web/src/components/Stage.tsx`

- [ ] **Step 1: 重写 Stage.tsx**

整文件替换为：

```tsx
import { useEffect, useRef, useState } from "react";
import type { UseSession } from "../hooks/useSession.js";
import type { TurnOption } from "../types.js";
import { useAvatar } from "../avatar/useAvatar.js";
import { Avatar } from "../avatar/Avatar.js";
import { ContextStream } from "./ContextStream.js";
import { OptionBubble } from "./OptionBubble.js";
import { GddPanel, FinalPanel } from "./ResultPanel.js";
import { DetailsDrawer } from "./DetailsDrawer.js";

/** 三段式：顶部上下文流 + 中部形象（左右选项气泡 / 结束态成果面板）+ 底部输入。 */
export function Stage({ session }: { session: UseSession }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const typing = focused && draft.trim().length > 0 && !session.busy;

  const { view, onEmoteEnded } = useAvatar(session, typing);

  const ended = session.stage?.readyForSynthesis === true && !!session.synthesis;

  // 新一轮（options 变化）清掉上一轮的待选高亮。
  useEffect(() => { setPendingId(null); }, [session.options]);

  const submit = () => {
    const t = draft.trim();
    if (!t || session.busy) return;
    void session.send(t);
    setDraft("");
  };

  // 点击选项：先播放选中/淡出动画，再发送。
  const choose = (opt: TurnOption) => {
    if (session.busy || pendingId) return;
    setPendingId(opt.id);
    window.setTimeout(() => void session.chooseOption(opt), 260);
  };

  const phaseOf = (id: string): "chosen" | "dismissed" | undefined =>
    pendingId == null ? undefined : id === pendingId ? "chosen" : "dismissed";

  const opts = session.options;
  const optA = opts?.find((o) => o.id === "A") ?? opts?.[0];
  const optB = opts?.find((o) => o.id === "B") ?? opts?.[1];

  return (
    <div className="app">
      <header className="app-header">
        <h1>NewBee · 游戏共创</h1>
        <div className="header-spacer" />
        {session.error && <span className="err">出错：{session.error}</span>}
        <button className="drawer-toggle" onClick={() => setDrawerOpen((o) => !o)}>已识别 ▸</button>
      </header>

      <section className="top-stream">
        <ContextStream messages={session.messages} busy={session.busy} />
      </section>

      <main className="stage">
        <div className="stage-side stage-left">
          {ended && session.synthesis
            ? <GddPanel synthesis={session.synthesis} />
            : optA && <OptionBubble option={optA} side="left" phase={phaseOf(optA.id)} disabled={session.busy} onChoose={choose} />}
        </div>

        <div className="stage-center">
          <Avatar view={view} onEmoteEnded={onEmoteEnded} />
        </div>

        <div className="stage-side stage-right">
          {ended && session.synthesis
            ? <FinalPanel synthesis={session.synthesis} canExport onExport={session.doExport} />
            : optB && <OptionBubble option={optB} side="right" phase={phaseOf(optB.id)} disabled={session.busy} onChoose={choose} />}
        </div>
      </main>

      {!ended && (
        <footer className="composer">
          <textarea
            value={draft}
            placeholder="说说你的脑洞…（Enter 发送，Shift+Enter 换行）"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button disabled={session.busy} onClick={submit}>{session.busy ? "构思中…" : "发送"}</button>
        </footer>
      )}
      {ended && <footer className="composer composer-done">🎉 对话已完成，游戏概念已成型。</footer>}

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        state={session.state}
        stage={session.stage}
        synthesis={session.synthesis}
        canExport={Boolean(session.synthesis)}
        onExport={session.doExport}
      />
    </div>
  );
}
```

注意：删除了原 `seenSynthesis` 自动弹抽屉逻辑（结束态主区已展示成果，抽屉降级为补充入口，避免遮挡）。

- [ ] **Step 2: 守门**

Run: `pnpm typecheck`
Expected: PASS（确认 `BubbleColumn` 已不再被 import）

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/Stage.tsx
git commit -m "feat(web): rebuild Stage into three-zone layout with options/results"
```

---

## Task 12: useAvatar 把选项出现挂到 idea-feed

**Files:**
- Modify: `apps/web/src/avatar/useAvatar.ts`

- [ ] **Step 1: 增加 options 监听**

`apps/web/src/avatar/useAvatar.ts`：在「收敛达成」effect 之后增加（null→非空 时触发一次 idea-feed）：

```ts
  // 选项冒出：形象做"端出两个方向"的指向手势。
  const hadOptionsRef = useRef(false);
  useEffect(() => {
    const has = !!session.options && session.options.length > 0;
    if (has && !hadOptionsRef.current) dispatch(emote("idea-feed"));
    hadOptionsRef.current = has;
  }, [session.options, dispatch]);
```

（`useRef` 已在文件顶部 import。）

- [ ] **Step 2: 守门**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/avatar/useAvatar.ts
git commit -m "feat(web): trigger idea-feed emote when options appear"
```

---

## Task 13: 样式（styles.css）

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 调整布局与新增样式**

把 `apps/web/src/styles.css` 中 `.app` 改为三段式行布局，并替换/新增以下规则。

将 `.app` 规则改为：

```css
.app { display: grid; grid-template-rows: auto auto 1fr auto; height: 100vh; }
```

在 `.app-header` 规则后新增顶部流样式：

```css
.top-stream { border-bottom: 1px solid #232734; max-height: 26vh; overflow: hidden; }
.context-stream { height: 100%; max-height: 26vh; overflow-y: auto; padding: 14px 24px; display: flex; flex-direction: column; gap: 10px; }
```

保留 `.stage` 的 grid（中部），但移除 `align-items: stretch` 改为 center，并新增侧栏与选项气泡：

把 `.stage` 规则替换为：

```css
.stage {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 24px;
  padding: 20px 32px;
  align-items: center;
  background: radial-gradient(120% 120% at 50% 30%, #161a24 0%, #0f1115 70%);
}
.stage-side { display: flex; min-height: 0; }
.stage-left { justify-content: flex-end; }
.stage-right { justify-content: flex-start; }
```

新增选项气泡样式（含冒泡浮现动画、打字机光标、选中/淡出）：

```css
.option-bubble {
  position: relative; text-align: left; cursor: pointer;
  max-width: 280px; padding: 14px 16px; border-radius: 16px;
  background: #1b1f29; border: 1px solid #2c3344; color: inherit;
  box-shadow: 0 10px 28px rgba(0,0,0,.45);
  display: flex; flex-direction: column; gap: 6px;
  animation: popRise .8s cubic-bezier(.2,.8,.25,1) both;
}
.option-bubble:disabled { cursor: default; }
.option-bubble:hover:not(:disabled) { border-color: #3a4d7a; }
.option-bubble-left { border-bottom-right-radius: 4px; animation-delay: 0s; }
.option-bubble-right { border-bottom-left-radius: 4px; animation-delay: .15s; }
@keyframes popRise { from { opacity: 0; transform: translateY(18px) scale(.6); } to { opacity: 1; transform: translateY(0) scale(1); } }

.option-tag { font-size: 11px; }
.option-tag-left { color: #5ac8fa; }
.option-tag-right { color: #ffb454; }
.option-detail { font-size: 14px; line-height: 1.55; min-height: 1.55em; }

.tw-caret { display: inline-block; width: 7px; height: 1em; margin-left: 2px; background: currentColor; opacity: .7; vertical-align: -2px; animation: caretBlink .8s steps(1) infinite; }
@keyframes caretBlink { 50% { opacity: 0; } }

.option-chosen { animation: chosenPulse .26s ease-out forwards; border-color: #2b6ef2; }
@keyframes chosenPulse { to { transform: scale(1.06); box-shadow: 0 12px 34px rgba(43,110,242,.5); } }
.option-dismissed { animation: dismissFade .26s ease-in forwards; }
@keyframes dismissFade { to { opacity: 0; transform: scale(.92); } }
```

新增结束态成果面板样式：

```css
.result-panel { width: 100%; max-width: 360px; max-height: 56vh; background: #11141b; border: 1px solid #2c3344; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; animation: panelIn .6s ease-out both; }
@keyframes panelIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.result-head { font-size: 12px; }
.result-head.gdd { color: #5ac8fa; }
.result-head.final { color: #ffb454; }
.result-tabs { display: flex; gap: 6px; }
.result-tabs button { background: #1b1f29; color: #cdd3df; border: 1px solid #2c3344; border-radius: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; }
.result-tabs button.active { background: #2b6ef2; color: #fff; border-color: #2b6ef2; }
.result-body { flex: 1; overflow: auto; font-size: 12px; line-height: 1.6; }
.result-body pre, .dsl-json { white-space: pre-wrap; word-break: break-word; margin: 0; background: #0b0d12; padding: 10px; border-radius: 8px; }
.result-export { background: #2bb673; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.result-export:disabled { opacity: .4; cursor: default; }

.composer-done { justify-content: center; align-items: center; color: #9fb0d0; font-size: 14px; }
```

把底部 `.composer` 规则改为页脚铺满居中（替换原 `.composer` 宽度规则）：

```css
.composer { display: flex; gap: 8px; padding: 16px 32px; border-top: 1px solid #232734; justify-content: center; }
.composer textarea { width: min(560px, 70vw); resize: none; height: 56px; background: #1b1f29; color: inherit; border: 1px solid #2c3344; border-radius: 10px; padding: 10px; }
.composer button { padding: 0 20px; background: #2b6ef2; color: #fff; border: 0; border-radius: 10px; cursor: pointer; }
.composer button:disabled { opacity: 0.5; cursor: default; }
```

在响应式段落补移动端（窄屏堆叠 + 关闭横向 grid）：

```css
@media (max-width: 860px) {
  .stage { grid-template-columns: 1fr; grid-template-rows: auto auto auto; gap: 12px; padding: 16px; }
  .stage-center { order: -1; }
  .stage-left, .stage-right { justify-content: center; }
  .result-panel { max-width: none; }
}
@media (prefers-reduced-motion: reduce) {
  .option-bubble, .result-panel, .option-chosen, .option-dismissed { animation: none; }
  .tw-caret { display: none; }
}
```

删除已退役的旧规则：`.bubble-col*`、`.bubble-left`、`.bubble-right` 及 `.app-main`/`.col*`/`.chat*`（属遗留 ChatPanel）。保留 `.bubble`/`.bubble.user`/`.bubble.assistant`/`.bubble-role`（ContextStream 复用）、`.avatar*`、`.drawer*`、`.state-panel`/`.resolution*`/`.gdd-draft`（抽屉仍用）。

- [ ] **Step 2: 守门 + 本地视觉验证**

Run: `pnpm typecheck`（CSS 不影响类型，确认无 TS 回归）
然后本地：`pnpm dev:server`（一终端）+ `pnpm dev:web`（另一终端），浏览器开 `http://localhost:5173`，确认：顶部流可见、形象居中、选项气泡冒出 + 打字机、点击有选中/淡出、底部输入可发送。
Expected: 视觉符合设计；无控制台报错。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/styles.css
git commit -m "style(web): three-zone stage layout, option bubbles, result panels"
```

---

## Task 14: 退役旧组件

**Files:**
- Delete: `apps/web/src/components/BubbleColumn.tsx`
- Delete: `apps/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: 确认无引用后删除**

先确认无 import（`Stage.tsx` 已不引用 `BubbleColumn`；`App.tsx` 用的是 `Stage`，非 `ChatPanel`）。删除两文件。

- [ ] **Step 2: 守门**

Run: `pnpm typecheck && pnpm test`
Expected: PASS（无悬空 import）

- [ ] **Step 3: 提交**

```bash
git rm apps/web/src/components/BubbleColumn.tsx apps/web/src/components/ChatPanel.tsx
git commit -m "chore(web): remove legacy BubbleColumn and ChatPanel"
```

---

## Task 15: 端到端核对与收尾

**Files:** 无（验证 + 文档）

- [ ] **Step 1: 全量守门**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿。

- [ ] **Step 2: 端到端手测（dev）**

`pnpm dev:server` + `pnpm dev:web`，走一遍：破冰（无气泡，仅输入）→ 多轮（左右冒出 A/B 气泡 + 形象 idea-feed 动作）→ 点击 A（选中放大、B 淡出、选中文进顶部流、下一轮）→ 也试底部自定义输入 → 直到工程信号齐备且 readyForSynthesis → 结束态（左 GDD 打字机、右 Resolution/DSL Tab + 导出、形象 synthesis 动作、底部显示"已完成"）。
Expected: 各节拍符合设计；reduced-motion 下动画/打字机关闭仍可用。

- [ ] **Step 3:（可选）更新形象文档**

若行为有偏差，回看 `docs/06-设计方案-状态机形象.md` 的 idea-feed/synthesis 触发描述是否需要补一句"选项事件触发 idea-feed"。无偏差则跳过。

- [ ] **Step 4: 最终提交（若有遗留改动）**

```bash
git add -A
git commit -m "chore(web): finalize stage UI revamp"
```

---

## 自检（Spec coverage / Placeholder / Type consistency）

- **Spec 覆盖**：①三段式布局→T9/T11/T13；②结构化选项协议→T1–T5；③顶部不重复→T3 指令；④冒泡+打字机→T7/T8/T13；⑤点击发送完整 detail→T6/T8/T11；⑥无选项轮仅输入→T1 校验 + T11 条件渲染；⑦结束态 GDD+Resolution/DSL Tab→T10/T11；⑧形象动作→T12；⑨reduced-motion 降级→T7/T13；⑩退役旧组件→T14。
- **占位符**：无 TBD/TODO；各代码步骤含完整代码。
- **类型一致**：`TurnOption{id,label,detail}` 在 conversation（turn.ts）与 web（types.ts）两处定义一致；`AdvanceResult.options`、`SseHandlers.onOptions`、`UseSession.options/chooseOption`、`SSE_EVENTS.options` 串联一致；`charsForElapsed` 在 hook 与测试同签名 `(elapsedMs, msPerChar, total)`。
- **依赖约束**：组件测试因无 jsdom 不做渲染断言，改用纯函数测试 + typecheck + dev 手测（与现仓库一致）。
