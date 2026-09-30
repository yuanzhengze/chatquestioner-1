import { gameProfileFromModel, type GameProfile } from "./gameProfile.js";
import { asGddText, type GddModel } from "./model.js";

export type CoverStatus = "idle" | "pending" | "ready" | "failed";

export interface GrowthStep {
  id: string;
  label: string;
  text: string;
}

/** 关键瞬间：核心机制的视觉化预览。内容只从 mechanics 派生。 */
export interface GameplayMoment {
  id: string;
  title: string;
  description: string;
}

export interface GddView {
  title: string;
  pitch: string;
  profile: GameProfile;
  delight: string;
  growthSteps: GrowthStep[];
  growthNone: boolean;
  gameplayMoments: GameplayMoment[];
  cover: {
    prompt: string;
    fingerprint: string;
    status: CoverStatus;
    imageUrl?: string;
  };
}

function text(v: unknown): string {
  return asGddText(v);
}

function filled(v: unknown): boolean {
  return Boolean(text(v));
}

/** 稳定短指纹，Node / 小程序同一算法。 */
export function fnv1aHex(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function coverFingerprint(m: GddModel): string {
  const raw = [
    m.title,
    m.coreFantasy,
    m.constitution?.coreFantasy,
    m.aesthetic,
    m.coreEmotion,
    m.world,
    m.pitch,
    m.presentation?.where,
    m.presentation?.dimension,
  ].map(text).join("|");
  return fnv1aHex(raw);
}

/** 只用已确认字段，禁止模型发明新物件名。画面里不要写字。 */
export function coverPromptFromModel(m: GddModel): string {
  const lines = [
    "游戏封面插画，电影感概念图，一张主视觉。",
    "画面里不要出现任何文字、标题、Logo 或手机 UI。",
  ];
  const title = text(m.title);
  if (title && title !== "未命名游戏") lines.push(`创作参考（不要写进画面）：${title}`);
  const fantasy = text(m.constitution?.coreFantasy) || text(m.coreFantasy);
  if (fantasy) lines.push(`核心幻想：${fantasy}`);
  const world = text(m.world);
  if (world) lines.push(`世界：${world}`);
  const aesthetic = text(m.aesthetic) || text(m.constitution?.artRule);
  if (aesthetic) lines.push(`视听氛围：${aesthetic}`);
  const emotion = text(m.coreEmotion);
  if (emotion) lines.push(`情感：${emotion}`);
  const where = text(m.presentation?.where);
  const dim = text(m.presentation?.dimension);
  if (where || dim) lines.push(`呈现：${[where, dim].filter(Boolean).join("，")}`);
  return lines.join("\n");
}

/**
 * 核心机制是一整句。第一处中文或英文冒号前是标题，后面是正文。
 * 没有冒号，或拆开后有一边是空的，整句当作标题，不另写介绍。
 */
export function parseCoreMechanic(raw: unknown): { title: string; description: string } {
  const whole = text(raw);
  if (!whole) return { title: "", description: "" };
  const full = whole.indexOf("：");
  const half = whole.indexOf(":");
  const idx = full >= 0 && half >= 0 ? Math.min(full, half) : full >= 0 ? full : half;
  if (idx <= 0) return { title: whole, description: "" };
  const title = whole.slice(0, idx).trim();
  const description = whole.slice(idx + 1).trim();
  if (!title || !description) return { title: whole, description: "" };
  return { title, description };
}

/** 未改动的机制原文指纹不变。身份是原文，不是数组下标。 */
export function coreMechanicId(raw: unknown): string {
  return fnv1aHex(text(raw));
}

export function gameplayMomentsFromModel(m: GddModel): GameplayMoment[] {
  const items = (m.mechanics || []).map(text).filter(Boolean);
  const seen = new Map<string, number>();
  return items.map((raw) => {
    const base = coreMechanicId(raw);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const parsed = parseCoreMechanic(raw);
    return {
      id: n === 1 ? base : `${base}-${n}`,
      title: parsed.title,
      description: parsed.description,
    };
  });
}

export function growthStepsFromModel(m: GddModel): GrowthStep[] {
  const g = m.growth || { none: false, unlocks: "", nearGoal: "", afterTenMin: "" };
  const steps: GrowthStep[] = [];
  if (filled(g.nearGoal)) steps.push({ id: "near", label: "眼前目标", text: text(g.nearGoal) });
  if (filled(g.afterTenMin)) steps.push({ id: "after", label: "玩一阵之后", text: text(g.afterTenMin) });
  if (filled(g.unlocks)) steps.push({ id: "unlocks", label: "越玩越多", text: text(g.unlocks) });
  return steps;
}

export function toGddView(m: GddModel, cover: { status?: CoverStatus; imageUrl?: string } = {}): GddView {
  const g = m.growth || { none: false, unlocks: "", nearGoal: "", afterTenMin: "" };
  const steps = growthStepsFromModel(m);
  return {
    title: text(m.title) || "未命名游戏",
    pitch: text(m.pitch),
    profile: gameProfileFromModel(m),
    delight: text(m.coreDelight),
    growthSteps: steps,
    growthNone: Boolean(g.none) && steps.length === 0,
    gameplayMoments: gameplayMomentsFromModel(m),
    cover: {
      prompt: coverPromptFromModel(m),
      fingerprint: coverFingerprint(m),
      status: cover.status || "idle",
      imageUrl: cover.imageUrl,
    },
  };
}
