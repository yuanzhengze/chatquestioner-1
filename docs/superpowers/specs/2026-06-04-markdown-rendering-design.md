# Markdown 流式渲染接入设计

> 日期：2026-06-04 · 状态：已确认（缩小范围版）
> 目标：用 `markstream-react` 给前端所有文本面接入流式 Markdown 渲染，**本轮不做自定义视觉风格改造**，仅用其默认样式；通过统一封装 `Markdown` 组件预留后续改造接口。

## 1. 范围

- **做**：引入 `markstream-react`；把 NewBee 流式回复、历史消息、用户消息、GDD、选项 detail 改为 Markdown 渲染；保留打字机/平滑流式效果。
- **不做（YAGNI / 推迟）**：自定义"杂志风 B"主题、Mermaid/KaTeX/Monaco、代码高亮（代码块用 `<pre>` 兜底）。等后续交互出样式后再针对性改 `Markdown` 组件与其 CSS 钩子。
- **不变**：最终内容面板的 Resolution（结构化列表）与 DSL（JSON `<pre>`）—— 非 markdown，保持现状。

## 2. 关键设计

### 2.1 统一封装（预留接口）
新建 `apps/web/src/components/Markdown.tsx`，是全站唯一 Markdown 入口：

```tsx
import MarkdownRender from "markstream-react";
export function Markdown({ content, final = true }: { content: string; final?: boolean }) {
  return (
    <div className="cq-md">
      <MarkdownRender content={content} final={final} renderCodeBlocksAsPre />
    </div>
  );
}
```

`renderCodeBlocksAsPre` 避免拉入 Monaco/Shiki/Mermaid 重依赖。`cq-md` 是预留的样式钩子容器，后续 B 风格只改这里与对应 CSS。CSS 基底在入口 `main.tsx` 引入 `markstream-react/index.css`。

### 2.2 两类渲染行为
- **真流式**（NewBee 正在输出的那条 assistant 消息）：`<Markdown content={累积文本} final={!busy} />`，由 markstream 处理平滑流式与半截语法。
- **完整文本**（历史消息、用户消息、GDD、选项 detail）：
  - 历史/用户消息：`final={true}` 直接渲染。
  - GDD、选项 detail：复用 `useTypewriter` 产出渐长字符串 → `<Markdown content={shown} final={done} />`，保留逐字打字机；点击"跳过"仍生效（`tw.skip()`）。

### 2.3 HTML 嵌套修正
`OptionBubble` 当前是 `<button>`，而 Markdown 会渲染 `<p>` 等块级元素，块级内容不能放进 `<button>`。改为 `<div role="button" tabIndex={0}>` + `onClick`/`onKeyDown(Enter/Space)`，保留 disabled 语义（`aria-disabled` + 守卫）。

## 3. 改动文件
- `apps/web/package.json`：加 `markstream-react` 依赖
- `apps/web/src/main.tsx`：`import "markstream-react/index.css"`
- 新建 `apps/web/src/components/Markdown.tsx`
- `apps/web/src/components/ContextStream.tsx`：消息正文用 `Markdown`
- `apps/web/src/components/OptionBubble.tsx`：detail 用 `Markdown`（typewriter 喂入）+ 改 div role=button
- `apps/web/src/components/ResultPanel.tsx`：`GddPanel` 用 `Markdown`（typewriter 喂入）
- `apps/web/src/styles.css`：`.cq-md` 容器最小适配（暗色/滚动），不做风格化

## 4. 风险与对策
- **依赖体积/peer**：仅装 `markstream-react`，靠 `renderCodeBlocksAsPre` 规避重 peer；装后跑 `pnpm --filter @cq/web build` 验证可构建。
- **暗色**：默认样式可能偏亮；`.cq-md` 容器做最小暗色适配或传 `isDark`（按实际类型支持取舍）。
- **测试**：node 环境无 jsdom，组件不做渲染单测；靠 typecheck + build + 本地 dev 手测。
