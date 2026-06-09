/**
 * 可落地玩法能力清单（单一事实源）。
 * 列出 synthesize 当前真正能产出的玩法（成品粒度，非底层模块）。
 * 用途：① 驱动 server 的 fill prompt 的 goal 可选项（避免清单/prompt 漂移）；
 *       ② 供对话端将来引导用户命中可落地玩法（本轮不接对话 prompt）。
 * 新增一种运行时玩法 = 在此加一条，prompt 自动同步。
 */

export type GoalKind = "collect" | "score" | "clearLayer";

export interface GameplayCapability {
  goal: GoalKind;
  /** 人读名，如"清果冻关" */
  title: string;
  /** 一行玩法描述（给 agent / prompt） */
  summary: string;
  /** 适合的主题意象（引导命中用） */
  themeHints: string;
  /** fill JSON 里该 goal 的形状示例 */
  jsonExample: string;
}

export const GAMEPLAY_CAPABILITIES: GameplayCapability[] = [
  {
    goal: "collect",
    title: "收集关",
    summary: "消除同色累计到目标数量即胜",
    themeHints: "收集 / 喂养 / 攒齐 / 采集类主题",
    jsonExample: '{ "kind": "collect", "need": { "元素1": 20 } }',
  },
  {
    goal: "score",
    title: "计分关",
    summary: "无尽消除冲击目标分数",
    themeHints: "放松 / 高分挑战 / 无尽类主题",
    jsonExample: '{ "kind": "score", "target": 5000 }',
  },
  {
    goal: "clearLayer",
    title: "清果冻关",
    summary: "棋盘覆盖一层果冻，在其上消除清层，全盘清空即胜",
    themeHints: "清理 / 净化 / 解救被困 / 覆盖物类主题",
    jsonExample: '{ "kind": "clearLayer" }',
  },
];

/** 把可选玩法渲染成 fill prompt 的 goal 段落（D4 单一事实源）。 */
export function renderGoalOptionsForPrompt(): string {
  const lines = GAMEPLAY_CAPABILITIES.map(
    (c) => `- ${c.jsonExample}  // ${c.title}：${c.summary}（${c.themeHints}）`,
  );
  return `"goal" 取以下三种之一：\n${lines.join("\n")}`;
}
