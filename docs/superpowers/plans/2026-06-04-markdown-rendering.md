# Markdown 流式渲染接入 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]`。

**Goal:** 用 `markstream-react` 给前端文本面接入流式 Markdown 渲染，默认样式，统一封装预留改造接口。

**Architecture:** 新建 `Markdown` 封装（全站唯一入口，`renderCodeBlocksAsPre`）；真流式传 `final={!busy}`，完整文本用 `useTypewriter` 喂入 `final={done}`；`OptionBubble` 改 div role=button 以容纳块级 markdown。

**Tech Stack:** React 18 + Vite + 纯 CSS；`markstream-react`。

参考 spec：`docs/superpowers/specs/2026-06-04-markdown-rendering-design.md`

---

## Task 1: 安装依赖并引入 CSS 基底

**Files:** `apps/web/package.json`、`apps/web/src/main.tsx`

- [ ] **Step 1: 安装**

Run: `pnpm --filter @cq/web add markstream-react`
Expected: package.json 出现 `markstream-react`，lockfile 更新。

- [ ] **Step 2: 引入样式基底**

`apps/web/src/main.tsx` 顶部 import 区加入：

```ts
import "markstream-react/index.css";
```

- [ ] **Step 3: 构建守门**

Run: `pnpm --filter @cq/web build`
Expected: 构建成功（确认依赖可解析、无缺失 peer）。若报缺 peer，按提示补装最小集合后重试。

- [ ] **Step 4: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/main.tsx
git commit -m "build(web): add markstream-react + import base css"
```

## Task 2: Markdown 封装组件

**Files:** Create `apps/web/src/components/Markdown.tsx`

- [ ] **Step 1: 实现**

```tsx
import MarkdownRender from "markstream-react";

interface Props {
  content: string;
  /** 流式是否结束；false 时 markstream 保留 mid-state 解析。 */
  final?: boolean;
}

/** 全站唯一 Markdown 入口。后续自定义视觉风格只改此处与 .cq-md 的 CSS。 */
export function Markdown({ content, final = true }: Props) {
  return (
    <div className="cq-md">
      <MarkdownRender content={content} final={final} renderCodeBlocksAsPre />
    </div>
  );
}
```

- [ ] **Step 2: 守门** Run: `pnpm typecheck`（若 `renderCodeBlocksAsPre`/`final` 类型不符，依据 markstream-react 类型调整 props）。Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/Markdown.tsx
git commit -m "feat(web): add Markdown wrapper around markstream-react"
```

## Task 3: ContextStream 接入

**Files:** `apps/web/src/components/ContextStream.tsx`

- [ ] **Step 1: 改正文渲染**

import 增加：`import { Markdown } from "./Markdown.js";`
把消息正文 `<div className="bubble-text">{...}</div>` 替换为：

```tsx
<div className="bubble-text">
  {m.content
    ? <Markdown content={m.content} final={!(m.role === "assistant" && i === lastIdx && busy)} />
    : (streamingPlaceholder ? "…" : "")}
</div>
```

- [ ] **Step 2: 守门** Run: `pnpm typecheck`。Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/ContextStream.tsx
git commit -m "feat(web): render context stream messages as markdown"
```

## Task 4: OptionBubble 接入（div role=button + markdown detail）

**Files:** `apps/web/src/components/OptionBubble.tsx`

- [ ] **Step 1: 重写组件**

```tsx
import { useTypewriter } from "../hooks/useTypewriter.js";
import { Markdown } from "./Markdown.js";
import type { TurnOption } from "../types.js";

interface Props {
  option: TurnOption;
  side: "left" | "right";
  phase?: "chosen" | "dismissed";
  disabled?: boolean;
  onChoose: (opt: TurnOption) => void;
}

const LABEL_TAG: Record<string, string> = { A: "方向 A", B: "方向 B" };

/** 形象一侧的可点选项气泡：冒泡浮现，detail 打字机 + markdown。块级内容用 div role=button 承载。 */
export function OptionBubble({ option, side, phase, disabled, onChoose }: Props) {
  const tw = useTypewriter(option.detail, 30);
  const cls = `option-bubble option-bubble-${side}` +
    (phase === "chosen" ? " option-chosen" : "") +
    (phase === "dismissed" ? " option-dismissed" : "");
  const activate = () => {
    if (disabled) return;
    if (!tw.done) { tw.skip(); return; }
    onChoose(option);
  };
  return (
    <div
      className={cls}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`选择${LABEL_TAG[option.id] ?? option.id}：${option.label}`}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
    >
      <span className={`option-tag option-tag-${side}`}>{LABEL_TAG[option.id] ?? option.id} · {option.label}</span>
      <Markdown content={tw.shown} final={tw.done} />
    </div>
  );
}
```

- [ ] **Step 2: 守门** Run: `pnpm typecheck`。Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/OptionBubble.tsx
git commit -m "feat(web): render option detail as markdown (div role=button)"
```

## Task 5: GddPanel 接入

**Files:** `apps/web/src/components/ResultPanel.tsx`

- [ ] **Step 1: 改 GddPanel**

import 增加：`import { Markdown } from "./Markdown.js";`
把 `GddPanel` 的 `<pre className="result-body">...</pre>` 替换为：

```tsx
    <div className="result-panel" onClick={() => !tw.done && tw.skip()}>
      <div className="result-head gdd">📄 GDD · 游戏设计文档</div>
      <div className="result-body"><Markdown content={tw.shown} final={tw.done} /></div>
    </div>
```

（保留顶部 `useTypewriter(synthesis.gddMarkdown, 6)`。）

- [ ] **Step 2: 守门** Run: `pnpm typecheck`。Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/ResultPanel.tsx
git commit -m "feat(web): render GDD panel as markdown"
```

## Task 6: .cq-md 容器最小适配 + 端到端

**Files:** `apps/web/src/styles.css`

- [ ] **Step 1: 加最小容器样式**（不做风格化，仅暗色/继承/间距收敛）

```css
/* Markdown 容器（预留改造钩子；本轮仅最小适配，不风格化） */
.cq-md { color: inherit; font-size: inherit; }
.cq-md :where(p, ul, ol, h1, h2, h3, h4, blockquote, pre):first-child { margin-top: 0; }
.cq-md :where(p, ul, ol, h1, h2, h3, h4, blockquote, pre):last-child { margin-bottom: 0; }
```

- [ ] **Step 2: 构建 + 类型守门**

Run: `pnpm typecheck && pnpm --filter @cq/web build`
Expected: 全部成功。

- [ ] **Step 3: 本地手测**

`pnpm dev:server` + `pnpm dev:web` → http://localhost:5173：确认 NewBee 回复以 markdown 流式渲染、历史/用户消息、选项 detail、收敛后 GDD 均为 markdown；暗色下可读；选项点击/跳过/键盘可用。
Expected: 行为正常，无控制台报错（暗色不可读则在 `.cq-md` 补最小暗色覆盖）。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/styles.css
git commit -m "style(web): minimal .cq-md container adaptation"
```

## 自检
- Spec 覆盖：依赖+CSS→T1；封装→T2；流式/历史→T3；选项→T4；GDD→T5；容器→T6。Resolution/DSL 不变（spec 明确）。
- 占位符：无。
- 类型一致：`Markdown{content, final}` 在 T2 定义，T3/T4/T5 调用一致；`useTypewriter` 既有签名复用。
