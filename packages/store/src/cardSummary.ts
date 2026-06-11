import type { ConversationState } from "@cq/conversation";
import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { GameDef } from "@cq/orchestrator";

/**
 * CardSummary —— 为前端「卡片渲染」预抽取的扁平结构。
 *
 * 设计意图：前端列表/卡片绝不应再去解析 gdd.md 或下钻 dsl/resolution。
 * export 时一次性把渲染卡片需要的字段拍平进这里，前端直接读字段即可。
 * 字段保持「展示导向」（短文本、关键词数组、徽章），与底层 DSL/GameDef 解耦。
 */
export interface CardSummary {
  /** 卡片标题（工作标题，缺省回退占位） */
  title: string;
  /** 一句话电梯陈述 */
  pitch: string;
  /** 核心体验 / 核心幻想（副标题用） */
  coreExperience: string;
  /** 品类，如 match-3 / tower-defense（做品类徽章/分组） */
  genre: string | null;
  /** 维度徽章 2D/3D */
  dimension: string | null;
  /** 引擎徽章 pixijs/threejs… */
  engine: string | null;
  /** 平台徽章数组 */
  platforms: string[];
  /** 核心循环步骤（卡片正面要点列表） */
  coreLoop: string[];
  /** 封面关键词（玩法/情绪等池子的代表词，可做标签云/配色种子） */
  tags: string[];
  /** 差异化卖点（hover/详情用） */
  differentiator: string | null;
  /** MVP 必做条目数（做「规模」指示） */
  mvpMustCount: number;
  /** 状态徽章：是否已产出可运行 GameDef */
  hasRunnableDef: boolean;
  /** 主模板 id（来自 resolution，做「基于 X 模板」标识） */
  primaryTemplate: string | null;
  /** 风险条数（做风险提示徽章） */
  riskCount: number;
}

const PLACEHOLDER_TITLE = "未命名设计";

function firstNonEmpty(...vals: Array<string | undefined>): string {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return "";
}

/** 从关键词池里挑代表词（玩法优先，其次情绪/世界/视觉），去重后取前 8 个。 */
function pickTags(state: ConversationState): string[] {
  const p = state.keywordPools;
  const merged = [...p.gameplay, ...p.emotion, ...p.world, ...p.visual];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of merged) {
    const k = t.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= 8) break;
  }
  return out;
}

/** 收敛核心循环为有序步骤数组（30s → 5min → 30min → 长线，过滤空缺）。 */
function coreLoopSteps(state: ConversationState): string[] {
  const l = state.loop;
  return [l.thirtySec, l.fiveMin, l.thirtyMin, l.longTerm]
    .filter((s): s is string => !!s && !!s.trim())
    .map((s) => s.trim());
}

export interface CardSummaryInput {
  state: ConversationState;
  dsl: GameDSL | null;
  resolution: ResolutionResult | null;
  gamedef: GameDef | null;
}

/** 把一次 export 的产物拍平成前端卡片直读的 CardSummary。 */
export function buildCardSummary(input: CardSummaryInput): CardSummary {
  const { state, dsl, resolution, gamedef } = input;
  const eng = state.engineering;

  return {
    title: firstNonEmpty(state.workingTitle) || PLACEHOLDER_TITLE,
    pitch: firstNonEmpty(state.pitch, state.spark),
    coreExperience: firstNonEmpty(state.coreExperience, state.coreFantasy, state.coreEmotion),
    genre: eng.genre ?? dsl?.genre ?? null,
    dimension: eng.dimension ?? dsl?.constraints.dimension ?? null,
    engine: eng.engine ?? dsl?.constraints.engine ?? null,
    platforms: eng.platform.length ? [...eng.platform] : [...(dsl?.constraints.platform ?? [])],
    coreLoop: coreLoopSteps(state),
    tags: pickTags(state),
    differentiator: firstNonEmpty(state.differentiator) || null,
    mvpMustCount: state.mvpScope.must.length,
    hasRunnableDef: gamedef != null,
    primaryTemplate: resolution?.template.primary ?? null,
    riskCount: state.risks.length,
  };
}
