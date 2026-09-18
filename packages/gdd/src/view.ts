import { asGddText, type GddModel } from "./model.js";

export type CoverStatus = "idle" | "pending" | "ready" | "failed";

export interface GddViewChip {
  id: string;
  label: string;
  text: string;
}

export interface StoryboardFrame {
  title: string;
  text: string;
}

export interface LoopNode {
  id: "micro" | "mid" | "macro";
  label: string;
  text: string;
}

export interface GrowthStep {
  id: string;
  label: string;
  text: string;
}

export interface GddView {
  title: string;
  pitch: string;
  dna: GddViewChip[];
  storyboard: StoryboardFrame[];
  loopNodes: LoopNode[];
  delight: string;
  growthSteps: GrowthStep[];
  growthNone: boolean;
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

export function splitInteractionChain(chain: string): string[] {
  return text(chain)
    .split(/\s*(?:→|->|➔|然后|之后)\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
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

export function storyboardFrames(m: GddModel): StoryboardFrame[] {
  const parts = splitInteractionChain(m.interaction?.chain || "");
  if (parts.length >= 2) {
    return parts.slice(0, 4).map((t, i) => ({ title: `第 ${i + 1} 步`, text: t }));
  }
  const inter = m.interaction || { verb: "", target: "", feedback: "", chain: "" };
  const fallback: StoryboardFrame[] = [];
  if (filled(inter.verb)) fallback.push({ title: "主要操作", text: text(inter.verb) });
  if (filled(inter.target)) fallback.push({ title: "操作对象", text: text(inter.target) });
  if (filled(inter.feedback)) fallback.push({ title: "即时反馈", text: text(inter.feedback) });
  if (fallback.length >= 2) return fallback.slice(0, 4);
  const one = text(inter.chain) || text(m.coreAction);
  return one ? [{ title: "你怎么玩", text: one }] : [];
}

export function dnaChips(m: GddModel): GddViewChip[] {
  const chips: GddViewChip[] = [];
  const fantasy = text(m.constitution?.coreFantasy) || text(m.coreFantasy);
  if (fantasy) chips.push({ id: "fantasy", label: "幻想", text: fantasy });
  if (filled(m.coreEmotion)) chips.push({ id: "emotion", label: "情感", text: text(m.coreEmotion) });
  if (filled(m.differentiator)) chips.push({ id: "diff", label: "不同", text: text(m.differentiator) });
  const play = [text(m.presentation?.where), text(m.presentation?.dimension)].filter(Boolean).join(" · ");
  if (play) chips.push({ id: "play", label: "在哪玩", text: play });
  return chips;
}

export function loopNodes(m: GddModel): LoopNode[] {
  const nodes: LoopNode[] = [];
  if (filled(m.loop?.micro)) nodes.push({ id: "micro", label: "头几秒", text: text(m.loop.micro) });
  if (filled(m.loop?.mid)) nodes.push({ id: "mid", label: "一局", text: text(m.loop.mid) });
  if (filled(m.loop?.macro)) nodes.push({ id: "macro", label: "再玩下去", text: text(m.loop.macro) });
  return nodes;
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
    dna: dnaChips(m),
    storyboard: storyboardFrames(m),
    loopNodes: loopNodes(m),
    delight: text(m.coreDelight),
    growthSteps: steps,
    growthNone: Boolean(g.none) && steps.length === 0,
    cover: {
      prompt: coverPromptFromModel(m),
      fingerprint: coverFingerprint(m),
      status: cover.status || "idle",
      imageUrl: cover.imageUrl,
    },
  };
}
