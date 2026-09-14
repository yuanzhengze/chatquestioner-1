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

/** 按 skill gdd-template 章节渲染。定稿不用「待补充」。 */
export function renderGdd(m: GddModel): string {
  const complete = isComplete(m);
  const gap = complete ? "本游戏无此项，不单列。" : "（未写）";
  const pools = (Object.keys(POOL_LABELS) as (keyof KeywordPools)[])
    .map((k) => {
      const words = (m.keywordPools[k] || []).map(asGddText).filter(Boolean);
      return `- **${POOL_LABELS[k]}**：${words.length ? words.join("、") : gap}`;
    })
    .join("\n");

  const extraConst = (m.constitution.extras || []).map(asGddText).filter(Boolean).map((x) => `- ${x}`).join("\n");
  const constitution = [
    `- 核心幻想：${line(m.constitution.coreFantasy || m.coreFantasy, gap)}`,
    `- 核心循环：${line(m.constitution.coreLoop || m.loop.micro, gap)}`,
    `- 美术规则：${line(m.constitution.artRule || m.aesthetic, gap)}`,
    `- 内容边界：${line(m.constitution.contentBoundary, gap)}`,
    `- 呈现边界：${line(m.constitution.presentationBoundary || m.presentation.dimension, gap)}`,
    extraConst,
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

  return `# ${line(m.title, "未命名游戏")}

> 一句话 Pitch：${line(m.pitch, gap)}

## 游戏宪法

> 不可漂移项。后续任何改动需明确确认。

${constitution}

## 1. What · 这是什么游戏

### 核心体验陈述
${line(m.coreExperience, gap)}

### 核心情感
- 主情感：${line(m.coreEmotion, gap)}
- 禁止情感：${line(m.forbiddenEmotion, gap)}

### 核心幻想 / 玩家身份
${line([m.coreFantasy, m.playerIdentity].map(asGddText).filter(Boolean).join("。"), gap)}

### 差异化亮点
${line(m.differentiator, gap)}

### 参考作品
- 借鉴：${m.references.borrow.length ? m.references.borrow.join("、") : gap}
- 刻意避开：${m.references.avoid.length ? m.references.avoid.join("、") : gap}

## 2. How · 怎么玩

### 核心动作
${line(m.coreAction, gap)}

### 核心游戏循环
- 微循环（约 30 秒 / 头几秒）：${line(m.loop.micro, gap)}
- 中循环（约 5 分钟）：${mid}
- 宏循环（约 30 分钟 / 长线）：${macro}

### 核心机制（按优先级）
${(() => {
    const items = (m.mechanics || []).map(asGddText).filter(Boolean);
    return items.length ? items.map((item, i) => `${i + 1}. ${item}`).join("\n") : `1. ${gap}`;
  })()}

### 奖励节奏
${line(m.reward, gap)}

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
${line(m.highlight, gap)}

## 5. 内容

${contentBody}
${details.length ? `\n${details.join("\n\n")}\n` : ""}
### 关键词池

${pools}

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
