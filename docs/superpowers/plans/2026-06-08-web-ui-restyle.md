# NewBee Web 前端 UI/UX 高级化重设 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/web` 从深色科技仪表盘重设为"可爱但克制的精致暖调"舞台式界面。

**Architecture:** Token 优先——先在 `styles.css` 顶部 `:root` 建立全套 design token（颜色/字体/圆角/间距/阴影/动效时长），再逐区块替换样式与微调组件结构。纯 CSS 动效，不引入新依赖。

**Tech Stack:** React 18 + Vite + 手写 CSS（CSS variables）。字体走 Google Fonts + 系统圆体兜底。

**Spec:** `docs/superpowers/specs/2026-06-08-web-ui-restyle-design.md`

**验证方式说明：** 纯视觉重设无法单元测试。每个任务的验证 = (1) `pnpm --filter @cq/web typecheck` 通过；(2) `pnpm --filter @cq/web dev` 启动后人工视觉自查关键点；(3) 现有测试（typewriter/sse/avatar）保持通过 `pnpm --filter @cq/web test`。每个任务结束 commit。

---

## File Structure

- `apps/web/index.html` — 引入字体 `<link>`
- `apps/web/src/styles.css` — 主战场：`:root` token + 全部样式重写
- `apps/web/src/components/Stage.tsx` — 居中容器、布局重心、首屏入场 class
- `apps/web/src/components/ContextStream.tsx` — 历史条弱化（结构基本不变，靠 CSS）
- `apps/web/src/components/OptionBubble.tsx` — tag 结构、可选引导小尾巴
- `apps/web/src/components/ResultPanel.tsx` — 成果卡片徽章/层次
- `apps/web/src/avatar/Avatar.tsx` — 暖光晕/落地投影外层容器
- `apps/web/src/components/DetailsDrawer.tsx` / `StatePanel.tsx` / `ResolutionPreview.tsx` — 跟随 token 适配（CSS）

---

## Task 0: 基线确认（不改代码）

**Files:** 无

- [ ] **Step 1: 确认依赖已安装、起得来**

Run: `pnpm --filter @cq/web typecheck && pnpm --filter @cq/web test`
Expected: typecheck 无错误；现有测试（typewriter/sse/avatar）全部 PASS。

- [ ] **Step 2: 启动 dev 截一张改前基线（人工）**

Run: `pnpm --filter @cq/web dev`
打开浏览器访问 dev 地址，确认现有深色界面正常渲染（顶部流 / 中央 Avatar / 左右气泡 / 底部输入）。记下当前观感，作为重设前后对比基线。无需 commit。

---

## Task 1: 建立 design token + 引入字体

把全套设计变量集中到 `:root`，并在 `index.html` 引入字体。这是后续所有任务的基础。

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/styles.css:1-2`（在文件最顶部插入 `:root`）

- [ ] **Step 1: 在 `index.html` 的 `<head>` 引入字体**

在 `apps/web/index.html` 的 `<title>` 之后、`</head>` 之前插入：

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
```

说明：Baloo 2 = 圆润显示字（标题/tag）；DM Sans = 精致正文；JetBrains Mono = 代码。中文走系统圆体兜底（见 token）。

- [ ] **Step 2: 在 `styles.css` 最顶部插入 `:root` token 块**

在 `apps/web/src/styles.css` 第 1 行 `* { box-sizing: border-box; }` 之前插入：

```css
:root {
  /* 字体 */
  --font-display: "Baloo 2", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;
  --font-body: "DM Sans", -apple-system, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;

  /* 颜色 — 克制暖调 */
  --bg: #FAF8F4;
  --bg-warm: #F3EDE3;
  --surface: #FFFFFF;
  --border: #ECE6DC;
  --border-strong: #E0D7C8;
  --ink: #3A3530;
  --ink-soft: #8A8175;
  --accent: #E8943A;          /* 蜂蜜琥珀：CTA/选中/强调 */
  --accent-soft: #FBE7CC;
  --dir-a: #5B8A8A;           /* 方向 A：青灰 */
  --dir-b: #C77B6B;           /* 方向 B：陶土粉 */
  --danger: #C7564B;

  /* 圆角 */
  --r-sm: 10px;
  --r-md: 14px;
  --r-lg: 20px;
  --r-pill: 999px;

  /* 间距阶梯 */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;
  --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;

  /* 字号阶梯 */
  --fs-xs: 11px; --fs-sm: 13px; --fs-base: 15px;
  --fs-md: 18px; --fs-lg: 24px; --fs-xl: 32px;

  /* 阴影 — 柔和多层纸感 */
  --shadow-sm: 0 1px 2px rgba(74,59,42,.05), 0 2px 8px rgba(74,59,42,.05);
  --shadow-md: 0 2px 6px rgba(74,59,42,.06), 0 8px 24px rgba(74,59,42,.08);
  --shadow-lg: 0 4px 12px rgba(74,59,42,.07), 0 18px 48px rgba(74,59,42,.10);
  --glow-accent: 0 0 0 3px rgba(232,148,58,.18);

  /* 动效时长 */
  --t-fast: 140ms;
  --t-base: 240ms;
  --t-slow: 600ms;
  --ease-soft: cubic-bezier(.2,.8,.25,1);
}
```

- [ ] **Step 3: typecheck + 视觉确认未崩**

Run: `pnpm --filter @cq/web typecheck`
Expected: PASS（仅加了 CSS 变量和 html link，无 TS 影响）。
dev 中确认页面仍能渲染（此步样式尚未应用 token，视觉变化很小，主要确认字体已加载、无报错）。

- [ ] **Step 4: Commit**

```bash
git -C chat-questioner add apps/web/index.html apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): add design tokens and fonts for UI restyle"
```

---

## Task 2: 全局基底 + 居中容器 + 顶部 header

应用 token 到 body/app 骨架，内容收进居中容器，header 改暖调。

**Files:**
- Modify: `apps/web/src/styles.css`（`body` / `.app` / `.app-header` 相关）
- Modify: `apps/web/src/components/Stage.tsx`（`.app` 外加居中容器 class）

- [ ] **Step 1: 重写 body / .app / header 样式**

把 `styles.css` 中现有的 `body`、`.app`、`.app-header`、`.app-header h1`、`.header-spacer`、`.err`、`.drawer-toggle` 整段替换为：

```css
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
body::before {
  /* 极淡噪点纹理，避免塑料纯色 */
  content: "";
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.app {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100vh;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}
.app-header {
  padding: var(--sp-4) var(--sp-5);
  display: flex; align-items: center; gap: var(--sp-4);
}
.app-header h1 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-md);
  letter-spacing: .01em;
  margin: 0;
  color: var(--ink);
}
.header-spacer { flex: 1; }
.err { color: var(--danger); font-size: var(--fs-sm); }
.drawer-toggle {
  background: var(--surface);
  color: var(--ink-soft);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: 6px 14px; cursor: pointer; font-size: var(--fs-sm);
  transition: border-color var(--t-fast), color var(--t-fast);
}
.drawer-toggle:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 2: typecheck + 视觉自查**

Run: `pnpm --filter @cq/web typecheck`
Expected: PASS。
dev 视觉确认：背景变暖白、内容居中（两侧留白）、header 标题用圆体、按钮变 pill。Stage.tsx 暂未改，布局应仍正常。

- [ ] **Step 3: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): warm tokenized global shell and centered container"
```

---

## Task 3: 顶部上下文流弱化为"历史条"

降低存在感：收窄、半透明、圆润对话泡，暖色区分用户/NewBee。结构不动，纯 CSS。

**Files:**
- Modify: `apps/web/src/styles.css`（`.top-stream` / `.context-stream` / `.bubble` 相关）

- [ ] **Step 1: 替换 .top-stream / .context-stream / .bubble 样式**

把现有 `.top-stream`、`.context-stream`、`.bubble`、`.bubble.user`、`.bubble.assistant`、`.bubble-role` 整段替换为：

```css
.top-stream {
  max-height: 22vh; overflow: hidden;
  opacity: .82;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 24px);
          mask-image: linear-gradient(to bottom, transparent 0, #000 24px);
}
.context-stream {
  height: 100%; max-height: 22vh; overflow-y: auto;
  padding: var(--sp-3) var(--sp-5);
  display: flex; flex-direction: column; gap: var(--sp-2);
}
.bubble {
  max-width: 78%;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  white-space: pre-wrap; line-height: 1.5;
  font-size: var(--fs-sm);
}
.bubble.user { align-self: flex-end; background: var(--accent-soft); color: var(--ink); }
.bubble.assistant { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); }
.bubble-role { font-size: var(--fs-xs); color: var(--ink-soft); margin-bottom: 2px; }
```

- [ ] **Step 2: typecheck + 视觉自查**

Run: `pnpm --filter @cq/web typecheck`
Expected: PASS。
dev 视觉确认：顶部历史区更轻、半透明、顶部有渐隐遮罩、气泡圆润暖色，不再抢中央焦点。

- [ ] **Step 3: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): soften context stream into a light history strip"
```

---

## Task 4: 中央舞台 + Avatar 暖光晕/落地投影

舞台暖光背景；Avatar 加柔和光晕 + 落地光台 + 极轻呼吸。

**Files:**
- Modify: `apps/web/src/styles.css`（`.stage` / `.stage-*` / `.avatar` 相关）
- Modify: `apps/web/src/avatar/Avatar.tsx:50-52`（外层容器加一个光晕 wrapper class）

- [ ] **Step 1: 替换 .stage / .avatar 样式**

把现有 `.stage`、`.stage-side`、`.stage-left`、`.stage-right`、`.stage-center`、`.avatar`、`.avatar-emote` + `@keyframes emotePop` 整段替换为：

```css
.stage {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6);
  align-items: center;
  background: radial-gradient(60% 55% at 50% 42%, rgba(232,148,58,.12) 0%, transparent 70%);
}
.stage-side { display: flex; min-height: 0; }
.stage-left { justify-content: flex-end; }
.stage-right { justify-content: flex-start; }
.stage-center {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-4); align-self: center; position: relative;
}
.avatar-halo {
  position: relative;
  display: flex; align-items: center; justify-content: center;
}
.avatar-halo::before {
  /* 暖光晕：极轻呼吸 */
  content: ""; position: absolute; inset: -8%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, rgba(255,201,77,.32) 0%, transparent 62%);
  filter: blur(8px); z-index: 0;
  animation: haloBreath 6s ease-in-out infinite;
}
.avatar-halo::after {
  /* 落地光台投影 */
  content: ""; position: absolute; left: 50%; bottom: 4%;
  width: 56%; height: 7%; transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(74,59,42,.18) 0%, transparent 70%);
  filter: blur(3px); z-index: 0;
}
@keyframes haloBreath { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
.avatar { position: relative; z-index: 1; }
.avatar-layer { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.avatar-emote { animation: emotePop 160ms var(--ease-soft); }
@keyframes emotePop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

- [ ] **Step 2: Avatar.tsx 外层包一个光晕容器**

在 `apps/web/src/avatar/Avatar.tsx` 中，把正常渲染分支的最外层 `<div className="avatar" style={box}>` 包到一个光晕容器里。将 50-67 行的 return（`<div className="avatar" style={box}> ... </div>`）改为：

```tsx
  return (
    <div className="avatar-halo">
      <div className="avatar" style={box}>
        <video
          ref={baseRef}
          key={baseline.primitive}
          className="avatar-layer"
          autoPlay
          loop
          muted
          playsInline
          poster={baseUrls.poster}
          style={emote ? { visibility: "hidden" } : undefined}
        >
          <source src={baseUrls.webm} type="video/webm" />
          <source src={baseUrls.hevc} type="video/mp4; codecs=hvc1" />
        </video>
        {emote && <EmoteLayer key={view.emote!} primitive={emote.primitive} onEnded={onEmoteEnded} />}
      </div>
    </div>
  );
```

同样把 reduced-motion 分支（42-46 行）的 `<div className="avatar" style={box}>...</div>` 包一层 `<div className="avatar-halo">`（但 reduced 时光晕呼吸动画已被 reduced-motion 规则关闭，见 Task 7）：

```tsx
    return (
      <div className="avatar-halo">
        <div className="avatar" style={box}>
          <img className="avatar-layer" src={assetUrls(top.primitive).poster} alt="NewBee" />
        </div>
      </div>
    );
```

- [ ] **Step 3: typecheck + 测试 + 视觉自查**

Run: `pnpm --filter @cq/web typecheck && pnpm --filter @cq/web test`
Expected: typecheck PASS；avatar 测试仍 PASS（仅外层包了 div，未改资源绑定逻辑）。
dev 视觉确认：Avatar 周围有柔和暖光晕（轻微呼吸）、脚下有落地投影，居中更有"舞台"感。

- [ ] **Step 4: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css apps/web/src/avatar/Avatar.tsx
git -C chat-questioner commit -m "feat(web): warm stage glow and avatar halo/ground shadow"
```

---

## Task 5: 选项气泡 — 暖调卡片 + 克制入场/选中动效

白底卡片、方向色 tag、克制 popRise、柔和选中反馈。

**Files:**
- Modify: `apps/web/src/styles.css`（`.option-*` / 相关 keyframes / `.tw-caret`）

- [ ] **Step 1: 替换选项气泡相关样式**

把现有 `.option-bubble` 到 `@keyframes dismissFade` 之间（含 `.option-tag*`、`.option-detail`、`.tw-caret`、`@keyframes caretBlink`、`.option-chosen`、`.option-dismissed` 及其 keyframes）整段替换为：

```css
.option-bubble {
  position: relative; text-align: left; cursor: pointer;
  max-width: 280px; padding: var(--sp-4) var(--sp-4);
  border-radius: var(--r-lg);
  background: var(--surface); border: 1px solid var(--border); color: var(--ink);
  box-shadow: var(--shadow-md);
  display: flex; flex-direction: column; gap: var(--sp-2);
  animation: popRise var(--t-slow) var(--ease-soft) both;
  transition: border-color var(--t-base), box-shadow var(--t-base), transform var(--t-base);
}
.option-bubble:disabled { cursor: default; }
.option-bubble:hover:not(:disabled) { border-color: var(--accent); box-shadow: var(--shadow-lg); transform: translateY(-2px); }
.option-bubble-left { border-bottom-right-radius: var(--r-sm); animation-delay: 0s; }
.option-bubble-right { border-bottom-left-radius: var(--r-sm); animation-delay: .12s; }
@keyframes popRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

.option-tag { font-family: var(--font-display); font-weight: 600; font-size: var(--fs-xs); letter-spacing: .02em; }
.option-tag-left { color: var(--dir-a); }
.option-tag-right { color: var(--dir-b); }
.option-detail { font-size: var(--fs-base); line-height: 1.55; min-height: 1.55em; }

.tw-caret { display: inline-block; width: 7px; height: 1em; margin-left: 2px; background: var(--accent); opacity: .8; vertical-align: -2px; animation: caretBlink .8s steps(1) infinite; }
@keyframes caretBlink { 50% { opacity: 0; } }

.option-chosen { animation: chosenLift var(--t-base) var(--ease-soft) forwards; border-color: var(--accent); box-shadow: var(--shadow-lg), var(--glow-accent); }
@keyframes chosenLift { to { transform: translateY(-4px); } }
.option-dismissed { animation: dismissFade var(--t-base) ease-in forwards; }
@keyframes dismissFade { to { opacity: 0; transform: scale(.96); } }
```

- [ ] **Step 2: typecheck + 视觉自查**

Run: `pnpm --filter @cq/web typecheck`
Expected: PASS。
dev 视觉确认：气泡为白底暖描边柔和投影；tag 用青灰/陶土粉；hover 抬升+主色描边；点击选中态为主色描边渐亮+轻抬升+外发光（无夸张脉冲），未选中淡出。

- [ ] **Step 3: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): restyle option bubbles with restrained motion"
```

---

## Task 6: 底部输入卡 + 结束态成果面板

输入框做成圆润悬浮卡 + 主色按钮；成果面板升级为有层次卡片。

**Files:**
- Modify: `apps/web/src/styles.css`（`.composer*` / `.result-*` / `.res-*` / `.dsl-json`）

- [ ] **Step 1: 替换 composer 样式**

把现有 `.composer`、`.composer textarea`、`.composer button`、`.composer button:disabled`、`.composer-done` 整段替换为：

```css
.composer { display: flex; gap: var(--sp-2); padding: var(--sp-4) var(--sp-6) var(--sp-5); justify-content: center; }
.composer textarea {
  width: min(560px, 70vw); resize: none; height: 56px;
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--border); border-radius: var(--r-lg);
  padding: var(--sp-3) var(--sp-4); font-family: var(--font-body); font-size: var(--fs-base);
  box-shadow: var(--shadow-md);
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.composer textarea::placeholder { color: var(--ink-soft); }
.composer textarea:focus { outline: none; border-color: var(--accent); box-shadow: var(--shadow-md), var(--glow-accent); }
.composer button {
  padding: 0 var(--sp-5); background: var(--accent); color: #fff; border: 0;
  border-radius: var(--r-lg); cursor: pointer; font-family: var(--font-display); font-weight: 600;
  box-shadow: var(--shadow-sm); transition: filter var(--t-fast), transform var(--t-fast);
}
.composer button:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
.composer button:disabled { opacity: .5; cursor: default; }
.composer-done { justify-content: center; align-items: center; color: var(--ink-soft); font-size: var(--fs-sm); }
```

- [ ] **Step 2: 替换 result-panel / res-* / dsl 样式**

把现有 `.result-panel` 到 `.gdd-draft pre`（含 `@keyframes panelIn`、`.result-head*`、`.result-tabs*`、`.result-body*`、`.result-export*`、`.state-panel`、`.resolution`、`.muted`、`.state-*`、`.resolution-head*`、`.res-*`、`.gdd-draft`）逐条改为引用 token。关键替换如下（保留选择器，替换值）：

```css
.result-panel { width: 100%; max-width: 360px; max-height: 56vh; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); box-shadow: var(--shadow-lg); animation: panelIn var(--t-slow) var(--ease-soft) both; }
@keyframes panelIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.result-head { font-family: var(--font-display); font-weight: 600; font-size: var(--fs-sm); display: flex; align-items: center; gap: var(--sp-2); }
.result-head.gdd { color: var(--dir-a); }
.result-head.final { color: var(--accent); }
.result-tabs { display: flex; gap: var(--sp-2); }
.result-tabs button { background: var(--bg-warm); color: var(--ink-soft); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 5px 14px; cursor: pointer; font-size: var(--fs-xs); transition: all var(--t-fast); }
.result-tabs button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.result-body { flex: 1; overflow: auto; font-size: var(--fs-sm); line-height: 1.6; }
.result-body pre, .dsl-json { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: var(--font-mono); background: var(--bg-warm); padding: var(--sp-3); border-radius: var(--r-md); }
.result-export { background: var(--accent); color: #fff; border: 0; border-radius: var(--r-md); padding: var(--sp-2) var(--sp-4); cursor: pointer; font-family: var(--font-display); font-weight: 600; }
.result-export:disabled { opacity: .4; cursor: default; }
.state-panel, .resolution { padding: var(--sp-4); border-bottom: 1px solid var(--border); }
.state-panel h3, .resolution h3 { font-family: var(--font-display); font-size: var(--fs-base); margin: 0 0 var(--sp-3); }
.muted { color: var(--ink-soft); font-size: var(--fs-sm); }
.state-row { display: flex; gap: var(--sp-3); padding: var(--sp-1) 0; font-size: var(--fs-sm); }
.state-label { min-width: 72px; color: var(--ink-soft); }
.state-value { flex: 1; }
.resolution-head { display: flex; justify-content: space-between; align-items: center; }
.resolution-head button { background: var(--accent); color: #fff; border: 0; border-radius: var(--r-sm); padding: 6px 12px; cursor: pointer; }
.resolution-head button:disabled { opacity: .4; cursor: default; }
.res-block { font-size: var(--fs-sm); margin: var(--sp-2) 0; }
.res-block ul { margin: var(--sp-1) 0 0; padding-left: 18px; }
.res-warn { color: var(--accent); font-size: var(--fs-xs); margin-top: var(--sp-2); }
.gdd-draft pre { max-height: 240px; overflow: auto; background: var(--bg-warm); padding: var(--sp-3); border-radius: var(--r-md); font-family: var(--font-mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; }
```

- [ ] **Step 3: typecheck + 视觉自查**

Run: `pnpm --filter @cq/web typecheck`
Expected: PASS。
dev 视觉确认：输入框为悬浮圆角卡、聚焦有主色辉光、发送按钮蜂蜜琥珀；结束态触发后成果面板为有层次卡片、tab 为 pill、代码用等宽字。

- [ ] **Step 4: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): floating composer card and layered result panels"
```

---

## Task 7: 抽屉 + Markdown + 首屏入场 + reduced-motion 收尾

适配侧抽屉与 markdown 强调色到 token；加首屏 staggered 入场；扩展 reduced-motion 降级覆盖新动效。

**Files:**
- Modify: `apps/web/src/styles.css`（`.drawer*`、`.cq-md*`、新增 `.app-header/.stage/.composer` 入场、扩展 `@media (prefers-reduced-motion)`、调整 860px 断点）
- Modify: `apps/web/src/components/Stage.tsx`（给 header/stage/composer 加入场触发 class）

- [ ] **Step 1: 替换抽屉与 markdown 样式**

把现有 `.drawer-scrim` 到 `.cq-md blockquote p + p`（含 `.drawer*`、`.cq-md*`）整段替换为：

```css
.drawer-scrim { position: fixed; inset: 0; background: rgba(58,53,48,.32); z-index: 20; }
.drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: 420px; max-width: 88vw;
  background: var(--surface); border-left: 1px solid var(--border); z-index: 21;
  transform: translateX(100%); transition: transform var(--t-base) var(--ease-soft);
  display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
}
.drawer-open { transform: translateX(0); }
.drawer-head { display: flex; justify-content: space-between; align-items: center; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); font-family: var(--font-display); font-size: var(--fs-base); }
.drawer-close { background: transparent; color: var(--ink-soft); border: 0; font-size: 22px; line-height: 1; cursor: pointer; }
.drawer-body { flex: 1; overflow-y: auto; }
.cq-md { color: inherit; font-size: inherit; }
.cq-md :where(p, ul, ol, h1, h2, h3, h4, blockquote, pre):first-child { margin-top: 0; }
.cq-md :where(p, ul, ol, h1, h2, h3, h4, blockquote, pre):last-child { margin-bottom: 0; }
.cq-md strong {
  color: var(--accent);
  background: var(--accent-soft);
  padding: 0 4px; border-radius: 4px; font-weight: 600;
}
.cq-md blockquote {
  margin: var(--sp-3) 0; padding: var(--sp-3) var(--sp-4);
  background: var(--bg-warm); border-left: 3px solid var(--accent);
  border-radius: var(--r-md); color: var(--ink);
}
.cq-md blockquote p { margin: 0; }
.cq-md blockquote p + p { margin-top: 6px; }
```

- [ ] **Step 2: 加首屏入场动画（styles.css）**

在 `.app-header`、`.stage-center`、`.composer` 上叠加入场。在 markdown 块之后追加：

```css
/* 首屏 staggered 入场 */
.app-header { animation: enterUp var(--t-slow) var(--ease-soft) both; }
.stage-center { animation: enterUp var(--t-slow) var(--ease-soft) .08s both; }
.composer { animation: enterUp var(--t-slow) var(--ease-soft) .16s both; }
@keyframes enterUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
```

注意：`.app-header`/`.composer` 已在前面任务定义，这里是追加 `animation` 声明（同选择器后写覆盖即可，CSS 后者生效）。

- [ ] **Step 3: 扩展 reduced-motion 降级**

把现有 `@media (prefers-reduced-motion: reduce)` 块替换为：

```css
@media (prefers-reduced-motion: reduce) {
  .option-bubble, .result-panel, .option-chosen, .option-dismissed,
  .app-header, .stage-center, .composer, .avatar-halo::before { animation: none; }
  .tw-caret { display: none; }
}
```

- [ ] **Step 4: 调整 860px 断点（值改 token，逻辑不变）**

把现有 `@media (max-width: 860px)` 块替换为：

```css
@media (max-width: 860px) {
  .stage { grid-template-columns: 1fr; grid-template-rows: auto auto auto; gap: var(--sp-3); padding: var(--sp-4); }
  .stage-center { order: -1; }
  .stage-left, .stage-right { justify-content: center; }
  .result-panel { max-width: none; }
}
```

- [ ] **Step 5: typecheck + 全测试 + 完整视觉走查**

Run: `pnpm --filter @cq/web typecheck && pnpm --filter @cq/web test`
Expected: 全 PASS。
dev 完整走查：首屏加载有轻量 staggered 入场；抽屉暖调；markdown 强调用主色高亮；窄屏单列堆叠正常；系统开启"减弱动态效果"后入场/呼吸光全部停止、布局仍正常。

- [ ] **Step 6: Commit**

```bash
git -C chat-questioner add apps/web/src/styles.css
git -C chat-questioner commit -m "feat(web): drawer/markdown tokens, entrance motion, reduced-motion fallbacks"
```

---

## Self-Review（计划自检结果）

- **Spec 覆盖**：① 配色/基调 → Task 1+2；② 字体排版 → Task 1（token）+各任务应用；③ 布局（居中/弱化历史流/强化舞台/悬浮输入/成果卡片）→ Task 2/3/4/6；④ 动效与质感（噪点/光晕/入场/选中/reduced-motion）→ Task 2/4/5/7。无遗漏。
- **占位符**：每步均含完整 CSS/TSX，无 TBD/TODO。
- **一致性**：token 名（`--accent`/`--dir-a`/`--r-lg` 等）在 Task 1 定义，后续任务一致引用；`.avatar-halo` 在 Task 4 同时定义 CSS 与 TSX 包裹，并在 Task 7 reduced-motion 中引用 `.avatar-halo::before`，一致。
- **范围**：聚焦 `apps/web` 视觉，不碰后端/SSE/会话逻辑、不改 Avatar 视频资源、不加新依赖。
