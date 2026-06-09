# NewBee 选项扩展到 2~4 个 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 NewBee 每轮抛出的方向选项从「恰好 2 个（A/B）」扩展为「2~4 个（A/B/C/D）」，并让前端 UI 动态适配数量。

**Architecture:** 解析层放宽数量校验（2~4）；提示词指令与文档同步放宽措辞；前端 `Stage` 由硬编码 optA/optB 改为按数组索引奇偶分配到左右两列竖排气泡，`OptionBubble`/CSS 适配多个气泡与统一中性配色。协议字段、哨兵切分、SSE 链路均不变。

**Tech Stack:** TypeScript, Vitest（根级 `vitest run`）, React + Vite（`apps/web`），pnpm workspace。

设计依据：`docs/superpowers/specs/2026-06-09-newbee-options-2-to-4-design.md`

---

## File Structure

- Modify: `packages/conversation/src/turn.ts` — `parseOptions` 数量校验 2~4
- Modify: `packages/conversation/test/turn.test.ts` — options 解析单测覆盖 2/3/4 接受、0/1/5 拒绝
- Modify: `packages/conversation/src/llm.ts` — `TURN_DIRECTIVE` 措辞与 JSON 示例放宽
- Modify: `prompts/newbee.system.md` — `[F2]` 投喂候选数量措辞放宽
- Modify: `apps/web/src/components/Stage.tsx` — 按索引奇偶分左右两列渲染
- Modify: `apps/web/src/components/OptionBubble.tsx` — `LABEL_TAG` 扩展到 C/D、移除左右专属 tag 配色
- Modify: `apps/web/src/styles.css` — 左右列竖排、气泡 max-width、动画 delay、统一 tag 配色

测试约定（来自现有 spec）：node 环境无 jsdom，前端组件不做渲染单测，靠 `pnpm --filter @cq/web build` + 手测验证。解析层走 vitest 单测。

---

## Task 1: 解析层放宽数量校验为 2~4

**Files:**
- Modify: `packages/conversation/src/turn.ts:49-60`
- Test: `packages/conversation/test/turn.test.ts:44-69`

- [ ] **Step 1: 更新失败的测试**

把 `packages/conversation/test/turn.test.ts` 中 `describe("parseTurnOutput · options", ...)` 整块（第 44-69 行）替换为下面内容（新增 3/4 项接受用例，把"非法"用例改为 0/1/5 项与缺字段）：

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

  it("解析三项 / 四项 options", () => {
    const mk = (n: number) => {
      const ids = ["A", "B", "C", "D"].slice(0, n);
      const items = ids.map((id) => `{"id":"${id}","label":"标题${id}","detail":"方向${id}"}`).join(",");
      return `回复\n${STATE_SENTINEL}\n{ "options": [${items}] }`;
    };
    const r3 = parseTurnOutput(mk(3));
    expect(r3.options).toHaveLength(3);
    expect(r3.options?.[2]).toEqual({ id: "C", label: "标题C", detail: "方向C" });
    const r4 = parseTurnOutput(mk(4));
    expect(r4.options).toHaveLength(4);
    expect(r4.options?.[3].id).toBe("D");
  });

  it("无 options 字段时为 undefined", () => {
    const raw = `回复\n${STATE_SENTINEL}\n{ "state_delta": {}, "stage_complete": false }`;
    expect(parseTurnOutput(raw).options).toBeUndefined();
  });

  it("数量越界（0 / 1 / 5）被忽略为 undefined", () => {
    const zero = `回复\n${STATE_SENTINEL}\n{ "options": [] }`;
    expect(parseTurnOutput(zero).options).toBeUndefined();
    const one = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x","detail":"y"}] }`;
    expect(parseTurnOutput(one).options).toBeUndefined();
    const five = `回复\n${STATE_SENTINEL}\n{ "options": [` +
      ["A","B","C","D","E"].map((id) => `{"id":"${id}","label":"l${id}","detail":"d${id}"}`).join(",") +
      `] }`;
    expect(parseTurnOutput(five).options).toBeUndefined();
  });

  it("缺字段的项使整组被忽略为 undefined", () => {
    const bad = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x"},{"id":"B","label":"y","detail":"z"}] }`;
    expect(parseTurnOutput(bad).options).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd chat-questioner && pnpm exec vitest run packages/conversation/test/turn.test.ts`
Expected: FAIL —「解析三项 / 四项 options」用例失败（当前 `parseOptions` 要求 `length === 2`，3/4 项返回 undefined）。

- [ ] **Step 3: 修改 `parseOptions` 数量校验**

在 `packages/conversation/src/turn.ts` 中，将第 49-51 行：

```ts
/** 仅接受恰好 2 项、每项含非空 id/label/detail 的数组；否则返回 undefined（静默忽略）。 */
function parseOptions(raw: unknown): TurnOption[] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
```

替换为：

```ts
/** 仅接受 2~4 项、每项含非空 id/label/detail 的数组；否则返回 undefined（静默忽略）。 */
function parseOptions(raw: unknown): TurnOption[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) return undefined;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd chat-questioner && pnpm exec vitest run packages/conversation/test/turn.test.ts`
Expected: PASS（全部 options 用例通过）。

- [ ] **Step 5: 提交**

```bash
cd chat-questioner
git add packages/conversation/src/turn.ts packages/conversation/test/turn.test.ts
git commit -m "feat(conversation): options 数量校验放宽为 2~4 项"
```

---

## Task 2: 提示词指令与文档同步放宽措辞

**Files:**
- Modify: `packages/conversation/src/llm.ts:25` 与 `:36-39` 与 `:58`
- Modify: `prompts/newbee.system.md:47-48`

这一任务只改提示词文本，无单测；靠 build + 后续手测验证。

- [ ] **Step 1: 改 `TURN_DIRECTIVE` 第 1) 部分措辞**

在 `packages/conversation/src/llm.ts` 中，将第 25 行：

```ts
1) 面向用户的人话回复（遵循上文 [F2] 三步：共情承接 → 动态投喂 2 个定制创意 → 单步收敛提问）。
```

替换为：

```ts
1) 面向用户的人话回复（遵循上文 [F2] 三步：共情承接 → 动态投喂 2~4 个定制创意 → 单步收敛提问）。
```

- [ ] **Step 2: 改 JSON 示例的 options 注释**

在 `packages/conversation/src/llm.ts` 中，将第 36-39 行：

```ts
  "options": [                    // 可选：本轮给用户的两个方向，省略则本轮无选项
    { "id": "A", "label": "≤8字短标题", "detail": "一句话方向描述" },
    { "id": "B", "label": "≤8字短标题", "detail": "一句话方向描述" }
  ]
```

替换为：

```ts
  "options": [                    // 可选：本轮给用户的 2~4 个方向（id 依次 A/B/C/D），省略则本轮无选项
    { "id": "A", "label": "≤8字短标题", "detail": "一句话方向描述" },
    { "id": "B", "label": "≤8字短标题", "detail": "一句话方向描述" }
    // …按需再加 C、D，最多 4 项
  ]
```

- [ ] **Step 3: 改规则文案的 options 约束行**

在 `packages/conversation/src/llm.ts` 中，将第 58 行：

```ts
- options 要么恰好 2 项（id 固定 "A"/"B"，各含非空 label 与 detail），要么整体省略（破冰或纯开放问题时省略）。
```

替换为：

```ts
- options 要么 2~4 项（id 依次固定 "A"/"B"/"C"/"D"，各含非空 label 与 detail），要么整体省略（破冰或纯开放问题时省略）。
```

- [ ] **Step 4: 改提示词文档 `[F2]` 投喂措辞**

在 `prompts/newbee.system.md` 中，将第 47-48 行：

```md
2. **动态投喂（Generative Prototyping）**
   基于此前聊到的所有背景，**现场编造 2 个完全不同方向**的、好玩的、贴合当前题材的定制创意实例（必要时给方向 A / 方向 B）。让用户有得选、有得改。
```

替换为：

```md
2. **动态投喂（Generative Prototyping）**
   基于此前聊到的所有背景，**现场编造 2~4 个完全不同方向**的、好玩的、贴合当前题材的定制创意实例（方向 A / B / C / D，按需取数）。让用户有得选、有得改。
```

- [ ] **Step 5: 验证构建（typecheck）**

Run: `cd chat-questioner && pnpm --filter @cq/web build`
Expected: 构建成功（提示词为字符串改动，不影响类型；此处主要确保仓库整体可构建）。

- [ ] **Step 6: 提交**

```bash
cd chat-questioner
git add packages/conversation/src/llm.ts prompts/newbee.system.md
git commit -m "feat(prompt): NewBee 选项措辞放宽为 2~4 项（A/B/C/D）"
```

---

## Task 3: 前端 Stage 按索引奇偶分左右两列

**Files:**
- Modify: `apps/web/src/components/Stage.tsx:43-45` 与 `:60-80`

设计规则：偶数索引（0=A、2=C）入左列，奇数索引（1=B、3=D）入右列。左右交替分配。

- [ ] **Step 1: 替换 optA/optB 推导为左右两列分组**

在 `apps/web/src/components/Stage.tsx` 中，将第 43-45 行：

```tsx
  const opts = session.options;
  const optA = opts?.find((o) => o.id === "A") ?? opts?.[0];
  const optB = opts?.find((o) => o.id === "B") ?? opts?.[1];
```

替换为：

```tsx
  const opts = session.options ?? [];
  const leftOpts = opts.filter((_, i) => i % 2 === 0);
  const rightOpts = opts.filter((_, i) => i % 2 === 1);
```

- [ ] **Step 2: 替换左侧渲染分支**

在 `apps/web/src/components/Stage.tsx` 中，将第 60-67 行：

```tsx
        <div className="stage-side stage-left">
          {ended && session.synthesis
            ? <GddPanel synthesis={session.synthesis} />
            : optA && (
              <OptionBubble option={optA} side="left" phase={phaseOf(optA.id)} disabled={session.busy} onChoose={choose} />
            )}
        </div>
```

替换为：

```tsx
        <div className="stage-side stage-left">
          {ended && session.synthesis
            ? <GddPanel synthesis={session.synthesis} />
            : leftOpts.map((opt) => (
              <OptionBubble key={opt.id} option={opt} side="left" phase={phaseOf(opt.id)} disabled={session.busy} onChoose={choose} />
            ))}
        </div>
```

- [ ] **Step 3: 替换右侧渲染分支**

在 `apps/web/src/components/Stage.tsx` 中，将第 73-79 行：

```tsx
        <div className="stage-side stage-right">
          {ended && session.synthesis
            ? <FinalPanel synthesis={session.synthesis} canExport onExport={session.doExport} />
            : optB && (
              <OptionBubble option={optB} side="right" phase={phaseOf(optB.id)} disabled={session.busy} onChoose={choose} />
            )}
        </div>
```

替换为：

```tsx
        <div className="stage-side stage-right">
          {ended && session.synthesis
            ? <FinalPanel synthesis={session.synthesis} canExport onExport={session.doExport} />
            : rightOpts.map((opt) => (
              <OptionBubble key={opt.id} option={opt} side="right" phase={phaseOf(opt.id)} disabled={session.busy} onChoose={choose} />
            ))}
        </div>
```

- [ ] **Step 4: 验证构建（typecheck + build）**

Run: `cd chat-questioner && pnpm --filter @cq/web build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 5: 提交**

```bash
cd chat-questioner
git add apps/web/src/components/Stage.tsx
git commit -m "feat(web): Stage 按索引奇偶将选项分配到左右两列"
```

---

## Task 4: OptionBubble 扩展 C/D 标签并统一配色

**Files:**
- Modify: `apps/web/src/components/OptionBubble.tsx:14` 与 `:37`

- [ ] **Step 1: 扩展 LABEL_TAG 到 C/D**

在 `apps/web/src/components/OptionBubble.tsx` 中，将第 14 行：

```ts
const LABEL_TAG: Record<string, string> = { A: "方向 A", B: "方向 B" };
```

替换为：

```ts
const LABEL_TAG: Record<string, string> = { A: "方向 A", B: "方向 B", C: "方向 C", D: "方向 D" };
```

- [ ] **Step 2: 移除 tag 的左右专属配色类**

在 `apps/web/src/components/OptionBubble.tsx` 中，将第 37 行：

```tsx
      <span className={`option-tag option-tag-${side}`}>{LABEL_TAG[option.id] ?? option.id} · {option.label}</span>
```

替换为：

```tsx
      <span className="option-tag">{LABEL_TAG[option.id] ?? option.id} · {option.label}</span>
```

- [ ] **Step 3: 验证构建**

Run: `cd chat-questioner && pnpm --filter @cq/web build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 4: 提交**

```bash
cd chat-questioner
git add apps/web/src/components/OptionBubble.tsx
git commit -m "feat(web): OptionBubble 扩展 C/D 标签并统一 tag 配色"
```

---

## Task 5: CSS 适配左右列竖排多气泡与统一配色

**Files:**
- Modify: `apps/web/src/styles.css:25-27`、`:54`、`:62-63`、`:66-68`

- [ ] **Step 1: 左右列改为竖向排列多气泡**

在 `apps/web/src/styles.css` 中，将第 25-27 行：

```css
.stage-side { display: flex; min-height: 0; }
.stage-left { justify-content: flex-end; }
.stage-right { justify-content: flex-start; }
```

替换为：

```css
.stage-side { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.stage-left { align-items: flex-end; justify-content: center; }
.stage-right { align-items: flex-start; justify-content: center; }
```

- [ ] **Step 2: 收窄气泡宽度以容纳同列两个**

在 `apps/web/src/styles.css` 中，将第 54 行：

```css
  max-width: 280px; padding: 14px 16px; border-radius: 16px;
```

替换为：

```css
  max-width: 260px; padding: 12px 14px; border-radius: 16px;
```

- [ ] **Step 3: 气泡浮现动画 delay 按出现顺序错开**

在 `apps/web/src/styles.css` 中，将第 62-63 行：

```css
.option-bubble-left { border-bottom-right-radius: 4px; animation-delay: 0s; }
.option-bubble-right { border-bottom-left-radius: 4px; animation-delay: .15s; }
```

替换为：

```css
.option-bubble-left { border-bottom-right-radius: 4px; }
.option-bubble-right { border-bottom-left-radius: 4px; }
.stage-side .option-bubble:nth-child(1) { animation-delay: 0s; }
.stage-side .option-bubble:nth-child(2) { animation-delay: .12s; }
```

- [ ] **Step 4: tag 配色统一为中性高亮色**

在 `apps/web/src/styles.css` 中，将第 66-68 行：

```css
.option-tag { font-size: 11px; }
.option-tag-left { color: #5ac8fa; }
.option-tag-right { color: #ffb454; }
```

替换为：

```css
.option-tag { font-size: 11px; color: #8fa3c8; }
```

- [ ] **Step 5: 验证构建**

Run: `cd chat-questioner && pnpm --filter @cq/web build`
Expected: 构建成功。

- [ ] **Step 6: 提交**

```bash
cd chat-questioner
git add apps/web/src/styles.css
git commit -m "style(web): 左右列竖排多气泡 + 统一选项配色"
```

---

## Task 6: 全量回归与手测验收

**Files:** 无改动，仅验证。

- [ ] **Step 1: 跑 conversation 解析单测**

Run: `cd chat-questioner && pnpm exec vitest run packages/conversation/test/turn.test.ts`
Expected: PASS（2/3/4 接受、0/1/5 拒绝、缺字段拒绝）。

- [ ] **Step 2: 跑全量单测确保无回归**

Run: `cd chat-questioner && pnpm test`
Expected: 全部 PASS（无因本次改动引入的失败）。

- [ ] **Step 3: 前端构建**

Run: `cd chat-questioner && pnpm --filter @cq/web build`
Expected: 构建成功。

- [ ] **Step 4: 本地手测（dev）**

Run: `cd chat-questioner && pnpm --filter @cq/web dev`
手测核对（对照 spec §5 验收）：
- NewBee 给 2 个选项 → 左 1 右 1；
- 给 3 个 → 左 2（A、C）右 1（B）；
- 给 4 个 → 左 2（A、C）右 2（B、D）；
- 选项均可点选，浮现/选中/淡出动画正常，tag 显示「方向 A/B/C/D · 标题」统一配色；
- 给 0/1/5+ 项时无选项气泡，降级为纯输入框；
- 窄屏（<860px）单列堆叠居中正常。

---

## Self-Review

**Spec coverage（对照 spec §3 改动点）：**
- 3.1 解析层 2~4 → Task 1 ✓
- 3.2 TURN_DIRECTIVE 措辞/示例/规则 → Task 2 ✓
- 3.3 newbee.system.md [F2] → Task 2 ✓
- 3.4 Stage 索引奇偶分列 → Task 3 ✓
- 3.5 OptionBubble LABEL_TAG/配色 → Task 4；CSS 竖排/宽度/delay/tag 色 → Task 5 ✓
- §5 验收（单测 + build + 手测）→ Task 6 ✓

**Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整 old/new 内容。

**Type consistency:** `leftOpts`/`rightOpts` 在 Task 3 定义并使用；`OptionBubble` props（`option`/`side`/`phase`/`disabled`/`onChoose`）与现有签名一致，新增 `key` 不影响类型；`LABEL_TAG` 仍是 `Record<string, string>`。
