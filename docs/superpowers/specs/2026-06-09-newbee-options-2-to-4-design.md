# NewBee 选项从 2 个扩展到 2~4 个

> 日期：2026-06-09 · 状态：已确认
> 目标：让 NewBee 每轮抛给前端的方向选项从「恰好 2 个（A/B）」扩展为「2~4 个（A/B/C/D）」，并让前端 UI 相应适配。

## 1. 背景与目标

当前 NewBee 每轮可在 `<<<STATE>>>` JSON 中带 `options`，约束为**恰好 2 项**（id 固定 `A`/`B`）。前端 `Stage` 把 A 放形象左侧、B 放右侧，左右气泡各带专属配色（蓝/橙）。

本设计将选项数量放宽为 **2~4 项浮动**（由 NewBee 按场景决定），id 依次固定 `A`/`B`/`C`/`D`；前端在保持「形象居中 + 左右两侧气泡」的现有视觉风格下，动态适配 2~4 个选项的分布。

**不做（YAGNI）**：不改 SSE 协议字段结构、不改哨兵切分逻辑、不引入新选项布局形态（仍是左右两列竖排气泡）、不为每个选项设计独立配色。

## 2. 决策汇总

| 维度 | 决策 |
|---|---|
| 数量 | 2~4 项浮动（NewBee 按场景决定），不满 2 或超过 4 整体丢弃 |
| id | 依次固定 `A` / `B` / `C` / `D`，按数组顺序取前 N 个 |
| 布局 | 形象居中不变；左右两列竖排气泡，**左右交替分配**（A左、B右、C左、D右） |
| 配色 | 四个气泡统一中性色，不再区分左右蓝/橙 |
| 测试 | 更新 `turn.test.ts` 的 options 解析单测（接受 2~4、拒绝 0/1/5+）；UI 靠 build + 手测 |

**左右交替分配的分布效果**：2 项→左1右1；3 项→左2右1；4 项→左2右2。分布最均衡。

## 3. 改动点（5 处文件）

### 3.1 解析层 `packages/conversation/src/turn.ts`

`parseOptions` 的数量校验从 `raw.length !== 2` 改为 `raw.length < 2 || raw.length > 4`。每项 `id`/`label`/`detail` 非空校验不变；任一项非法则整体返回 `undefined`（沿用现有「静默忽略」语义）。

### 3.2 提示词运行时指令 `packages/conversation/src/llm.ts`（`TURN_DIRECTIVE`）

- JSON 示例从写死 2 项改为示意「2~4 项」（保留 A/B，注释说明可延伸到 C/D）。
- 规则文案：`options` 要么 **2~4 项**（id 依次固定 `A`/`B`/`C`/`D`，各含非空 `label` 与 `detail`），要么整体省略（破冰或纯开放问题时省略）。
- 第 1) 部分「动态投喂 2 个定制创意」措辞放宽为「投喂 2~4 个定制创意」。
- 「当本轮给了 options 时人话回复不重复 detail」的约束不变。

### 3.3 提示词文档 `prompts/newbee.system.md`

`[F2]` 第 3 步「投喂候选」的数量措辞与 3.2 同步放宽（保持文档与运行时指令一致）。其余不动。

### 3.4 前端 `apps/web/src/components/Stage.tsx`

- 去掉硬编码 `optA`/`optB` 与 `find(id==="A"/"B")`。
- 按 `session.options` 数组顺序、用索引奇偶分配到左右两列：偶数索引（A、C）入左列，奇数索引（B、D）入右列。
- `stage-left` / `stage-right` 各渲染该列气泡的纵向列表（`OptionBubble` 复用，`side` 仍传 `left`/`right` 用于气泡圆角朝向与浮现方向）。
- 结束态 `GddPanel` / `FinalPanel` 分支逻辑不变。
- 新一轮清 `pendingId`、`choose`/`phaseOf` 逻辑不变。

### 3.5 前端 `OptionBubble.tsx` + `styles.css`

- `OptionBubble`：`LABEL_TAG` 扩展为 `{ A:"方向 A", B:"方向 B", C:"方向 C", D:"方向 D" }`；移除 tag 的左右专属配色类，统一一种中性高亮色。
- `styles.css`：
  - `.stage-left` / `.stage-right` 改为竖向排列多个气泡（`flex-direction: column; gap`），左列底部对齐、右列顶部对齐保持视觉重心向形象靠拢（沿用现有 `justify-content`）。
  - `.option-bubble` `max-width` 适当收窄以容纳同列两个气泡。
  - 气泡浮现动画 `animation-delay` 按出现顺序错开（避免四个同时弹出）。
  - 移除/合并 `.option-tag-left` / `.option-tag-right` 配色为统一色。

## 4. 数据流（无破坏性变更）

```
LLM 产出含 options[2~4] 的 JSON
  → parseTurnOutput（数量校验 2~4） → advance 透传
  → SSE options 事件 → useSession.options
  → Stage 按索引奇偶分左右两列 → OptionBubble 渲染
```

协议字段（`TurnOption { id, label, detail }`）、哨兵切分、SSE 事件类型、`useSession` 接口均不变。

## 5. 验收标准

1. `pnpm --filter @cq/conversation test` 通过（含更新后的 options 单测：接受 2/3/4 项、拒绝 0/1/5+ 项）。
2. `pnpm --filter @cq/web build` 通过（typecheck + build）。
3. 手测：NewBee 给 2/3/4 个选项时左右两列按交替规则正确分布、均可点选、浮现/选中/淡出动画正常；给 0/1/5+ 项时静默无选项（降级为纯输入框）。

## 6. 风险与对策

- **LLM 给超过 4 项或仅 1 项** → 解析层静默丢弃整组 options（降级为纯输入），提示词强约束 2~4 项。
- **同列两气泡在小屏拥挤** → 沿用现有 `@media (max-width: 860px)` 单列降级（左右列堆叠居中）。
- **id 不连续（如给了 A、C 缺 B）** → 不做 id 连续性校验，按数组顺序渲染并以 `LABEL_TAG[id] ?? id` 兜底；提示词约束 id 依次固定。
