import type { GddModel, KeywordPools } from "./model.js";
import { asGddText, isComplete } from "./model.js";

const POOL_LABELS: Record<keyof KeywordPools, string> = {
  gameplay: "玩法",
  emotion: "情绪",
  world: "世界观",
  visual: "视觉",
  narrative: "叙事",
  motivation: "玩家动机",
};

function line(s: unknown, draftFallback: string): string {
  return asGddText(s) || draftFallback;
}

function bullets(items: unknown, draftFallback: string): string {
  const list = (Array.isArray(items) ? items : []).map(asGddText).filter(Boolean);
  if (!list.length) return `- ${draftFallback}`;
  return list.map((i) => `- ${i}`).join("\n");
}

function none(reason: string, complete: boolean): string {
  return complete ? `本游戏无${reason}，不单列。` : `（未写）`;
}

function joinFantasy(m: GddModel, gap: string): string {
  const parts = [m.coreFantasy, m.playerIdentity]
    .map(asGddText)
    .map((s) => s.replace(/。+$/g, ""))
    .filter(Boolean);
  const uniq: string[] = [];
  for (const p of parts) {
    const idx = uniq.findIndex((u) => u.includes(p) || p.includes(u));
    if (idx >= 0) {
      if (p.length > uniq[idx].length) uniq[idx] = p;
      continue;
    }
    uniq.push(p);
  }
  return uniq.length ? uniq.join("。") : gap;
}

function highlightBlock(m: GddModel, gap: string): string {
  const items = (m.highlights || []).map(asGddText).filter(Boolean);
  if (items.length) return items.map((i) => `- ${i}`).join("\n");
  return line(m.highlight, gap);
}

function optionalLabeled(label: string, value: unknown): string {
  const t = asGddText(value);
  return t ? `- ${label}：${t}` : "";
}

function growthBlock(m: GddModel, complete: boolean, gap: string): string {
  const g = m.growth || { none: false, unlocks: "", nearGoal: "", afterTenMin: "" };
  const unlocks = asGddText(g.unlocks);
  const near = asGddText(g.nearGoal);
  const after = asGddText(g.afterTenMin);
  if (g.none && !unlocks && !near && !after) {
    return `### 成长与变化
本游戏无独立成长`;
  }
  if (!unlocks && !near && !after) return "";
  const lines = [
    `- 越玩越多：${unlocks || (complete ? "本游戏无独立成长" : gap)}`,
    near ? `- 眼前目标：${near}` : (complete ? "" : `- 眼前目标：${gap}`),
    after ? `- 玩一阵之后：${after}` : (complete ? "" : `- 玩一阵之后：${gap}`),
  ].filter(Boolean);
  return `### 成长与变化
${lines.join("\n")}`;
}

function interactionBlock(m: GddModel, gap: string): string {
  const i = m.interaction || { verb: "", target: "", chain: "", feedback: "" };
  return `### 核心交互
- 主要操作：${line(i.verb, gap)}
- 操作对象：${line(i.target, gap)}
- 交互链路：${line(i.chain, gap)}
- 即时反馈：${line(i.feedback, gap)}`;
}

function poolSection(m: GddModel): string {
  const lines = (Object.keys(POOL_LABELS) as (keyof KeywordPools)[])
    .map((k) => {
      const words = (m.keywordPools[k] || []).map(asGddText).filter(Boolean);
      return words.length ? `- **${POOL_LABELS[k]}**：${words.join("、")}` : "";
    })
    .filter(Boolean);
  if (!lines.length) return "";
  return `### 关键词池\n\n${lines.join("\n")}`;
}

/** 按 skill gdd-template 章节渲染。定稿不用「待补充」。 */
export function renderGdd(m: GddModel): string {
  const complete = isComplete(m);
  const gap = complete ? "本游戏无此项，不单列。" : "（未写）";

  const constitution = [
    optionalLabeled("核心幻想", m.constitution.coreFantasy || m.coreFantasy),
    optionalLabeled("核心循环", m.constitution.coreLoop || m.loop.micro),
    optionalLabeled("美术规则", m.constitution.artRule || m.aesthetic),
    optionalLabeled("内容边界", m.constitution.contentBoundary),
    optionalLabeled("呈现边界", m.constitution.presentationBoundary || m.presentation.dimension),
    optionalLabeled("成长规则", m.constitution.growthRule),
    optionalLabeled("世界观规则", m.constitution.worldRule),
    optionalLabeled("UI 规则", m.constitution.uiRule),
  ].filter(Boolean).join("\n");

  let contentBody = line(m.content, "");
  if (!contentBody) {
    contentBody = none("独立关卡/敌人/养成结构，内容即核心循环本身，靠难度变化重复", complete);
  }
  const details: string[] = [];
  if (m.contentFlags.levels) details.push(`### 关卡\n${line(m.contentDetail.levels, gap)}`);
  if (m.contentFlags.boss) details.push(`### Boss\n${line(m.contentDetail.boss, gap)}`);
  if (m.contentFlags.progression) details.push(`### 养成 / 长线\n${line(m.contentDetail.progression, gap)}`);
  if (m.contentFlags.multiplayer) details.push(`### 多人\n${line(m.contentDetail.multiplayer, gap)}`);

  const mid = line(m.loop.mid, complete ? "短单局，中循环即一局。" : "（未写）");
  const macro = line(m.loop.macro, complete ? "本游戏无长线。" : "（未写）");
  const longTerm = asGddText(m.loop.longTerm);
  const longLine = longTerm && longTerm !== asGddText(m.loop.macro)
    ? `\n- 长线：${longTerm}`
    : "";

  const emotionLines = [
    `- 主情感：${line(m.coreEmotion, gap)}`,
    optionalLabeled("禁止情感", m.forbiddenEmotion),
  ].filter(Boolean).join("\n");

  const borrow = m.references.borrow.filter(Boolean);
  const avoid = m.references.avoid.filter(Boolean);
  const refLines = [
    borrow.length ? `- 借鉴：${borrow.join("、")}` : "",
    avoid.length ? `- 刻意避开：${avoid.join("、")}` : "",
  ].filter(Boolean);
  const refBlock = refLines.length ? `### 参考作品\n${refLines.join("\n")}` : "";

  const pools = poolSection(m);
  const contentExtras = [
    ...details,
    pools,
  ].filter(Boolean);

  return `# ${line(m.title, "未命名游戏")}

> 一句话 Pitch：${line(m.pitch, gap)}

## 游戏宪法

> 不可漂移项。后续任何改动需明确确认。

${constitution}

## 1. What · 这是什么游戏

### 核心体验陈述
${line(m.coreExperience, gap)}

### 核心情感
${emotionLines}

### 核心幻想 / 玩家身份
${joinFantasy(m, gap)}

### 差异化亮点
${line(m.differentiator, gap)}
${refBlock ? `\n${refBlock}\n` : ""}
## 2. How · 怎么玩

### 核心动作
${line(m.coreAction, gap)}

${interactionBlock(m, gap)}

### 核心游戏循环
- 微循环（约 30 秒 / 头几秒）：${line(m.loop.micro, gap)}
- 中循环（约 5 分钟）：${mid}
- 宏循环（约 30 分钟 / 长线）：${macro}${longLine}

### 核心机制（按优先级）
${(() => {
    const items = (m.mechanics || []).map(asGddText).filter(Boolean);
    return items.length ? items.map((item, i) => `${i + 1}. ${item}`).join("\n") : `1. ${gap}`;
  })()}

### 核心爽点
${line(m.coreDelight, gap)}

### 奖励节奏
${line(m.reward, gap)}
${(() => {
    const g = growthBlock(m, complete, gap);
    return g ? `\n${g}\n` : "";
  })()}
## 3. Win · Lose

- 胜利：${line(m.winRule, gap)}
- 失败：${line(m.loseRule, gap)}
- 重玩动机：${line(m.replayMotivation, gap)}

## 4. 世界、叙事与美学

### 世界与情境
${line(m.world, gap)}

### 叙事
${line(m.narrative, complete ? "几乎无剧情，体验靠氛围与循环。" : "（未写）")}

### 视听氛围
${line(m.aesthetic, gap)}

### 手感
${line(m.gameFeel, gap)}

### 高光时刻（Juice）
${highlightBlock(m, gap)}

## 5. 内容

${contentBody}
${contentExtras.length ? `\n${contentExtras.join("\n\n")}\n` : ""}
## 6. 呈现与资产

- 在哪玩：${line(m.presentation.where, gap)}
- 画面维度：${line(m.presentation.dimension, gap)}
- 屏幕方向：${line(m.presentation.orientation, gap)}
- 人数：${line(m.presentation.players, gap)}
- 主要资产：${line(m.presentation.assets, gap)}

## 7. 难度与心流

- 怎么上强度：${line(m.difficulty.ramp, gap)}
- 前几分钟玩家应感到：${line(m.difficulty.firstMinutes, gap)}
- 可能的疲劳点与缓解：${line(m.difficulty.fatigue, gap)}
`;
}

export { bullets };
