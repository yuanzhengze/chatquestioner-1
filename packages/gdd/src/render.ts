import type { GddModel, KeywordPools } from "./model.js";

const POOL_LABELS: Record<keyof KeywordPools, string> = {
  gameplay: "玩法",
  emotion: "情绪",
  world: "世界观",
  visual: "视觉",
  narrative: "叙事",
  motivation: "玩家动机",
};

function list(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "- （待补充）";
}

export function renderGdd(m: GddModel): string {
  const pools = (Object.keys(POOL_LABELS) as (keyof KeywordPools)[])
    .map((k) => `**${POOL_LABELS[k]}**：${m.keywordPools[k].join("、") || "（待补充）"}`)
    .join("\n\n");

  return `# ${m.title}

> 一句话 Pitch：${m.pitch}

## 1. 核心幻想
${m.coreFantasy}

## 2. 核心体验
${m.coreExperience}

## 3. 核心玩法循环
${m.coreLoop.join(" → ")}

## 4. 关键词池
${pools}

## 5. 差异化亮点
${m.differentiator}

## 6. MVP 范围
**本次会做（必须）**
${list(m.mvp.must)}

**主动裁剪**
${list(m.mvp.cut)}

## 7. 风险提示
${list(m.risks)}

## 游戏宪法
> 不可漂移项。后续任何改动需明确确认。
${list(m.constitution)}
`;
}
