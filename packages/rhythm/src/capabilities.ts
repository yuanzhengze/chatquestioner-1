/**
 * 音游可落地玩法能力清单（单一事实源，spec §4）。
 * 与 match-3 的 GAMEPLAY_CAPABILITIES 同形：列出当前真正能跑通的玩法（成品粒度）。
 * 用途：① 将来驱动对话 Agent 引导用户命中可落地玩法；② 渲染 prompt 的 goal 可选项。
 * 新增一种运行时玩法 = 在此加一条 + 引擎 translateGoal 支持对应 goal。
 */

import type { Goal } from "./RhythmEngine.js";

export type GoalKind = Goal["kind"];

export interface GameplayCapability {
  goal: GoalKind;
  /** 人读名，如"评分闯关" */
  title: string;
  /** 一行玩法描述（给 agent / prompt） */
  summary: string;
  /** 适合的主题意象（引导命中用） */
  themeHints: string;
  /** RhythmDef.goal 里该玩法的形状示例 */
  jsonExample: string;
}

export const GAMEPLAY_CAPABILITIES: GameplayCapability[] = [
  {
    goal: "rank-goal",
    title: "评分闯关",
    summary: "按谱面演奏，达到目标 Rank 即过关",
    themeHints: "标准音游 / 打榜 / 段位类主题",
    jsonExample: '{ "use": "rank-goal", "minRank": "A" }',
  },
  {
    goal: "survival",
    title: "血量生存",
    summary: "MISS/OK 扣血，血量耗尽失败",
    themeHints: "紧张 / 硬核 / Boss 战类主题",
    jsonExample: '{ "use": "survival", "hp": 100, "missDmg": 10, "okDmg": 3 }',
  },
  {
    goal: "endless-score",
    title: "无尽刷分",
    summary: "不设过关线，纯冲高分（rank-threshold 仅评级）",
    themeHints: "放松 / 高分挑战类主题",
    jsonExample: '{ "use": "endless-score" }',
  },
];

/** 把可选玩法渲染成 prompt 的 goal 段落（单一事实源，对齐 match-3）。 */
export function renderGoalOptionsForPrompt(): string {
  const lines = GAMEPLAY_CAPABILITIES.map(
    (c) => `- ${c.jsonExample}  // ${c.title}：${c.summary}（${c.themeHints}）`,
  );
  return `"goal" 取以下三种之一：\n${lines.join("\n")}`;
}
