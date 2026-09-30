import { asGddText, type GddModel } from "./model.js";
import { STEAM_TAGS, type SteamTag } from "./steamTaxonomy.js";

export const GENRE_LIMIT = 3;
export const TAG_LIMIT = 6;
export const MIN_CONFIDENCE = 0.55;

export interface ModelTagPick {
  tagId: number;
  evidence?: string;
  confidence?: number;
  fields?: string[];
}

export interface ParsedClassification {
  genres: ModelTagPick[];
  tags: ModelTagPick[];
}

export interface KeptTag {
  tagId: number;
  label: string;
  category: string;
  evidence: string;
  confidence: number;
  evidenceFields: string[];
}

export interface FilteredTag {
  tagId: number;
  label: string;
  reason: string;
}

export interface ValidationResult {
  genres: KeptTag[];
  tags: KeptTag[];
  filtered: FilteredTag[];
}

function text(v: unknown): string {
  return asGddText(v);
}

function lines(v: unknown): string[] {
  return Array.isArray(v) ? v.map(text).filter(Boolean) : [];
}

function joinOwn(v: unknown): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return text(v);
  return Object.values(v as Record<string, unknown>)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function fnv1aHex(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function selectableTags(): SteamTag[] {
  return STEAM_TAGS.filter((tag) => !tag.skipAsTag && tag.category !== "excluded" && tag.category !== "visual" && tag.aliases.length > 0);
}

export function classificationCorpus(m: GddModel): string {
  const c = m.constitution;
  const blocks: Array<[string, string]> = [
    ["标题", text(m.title)],
    ["一句话", text(m.pitch)],
    ["核心体验", text(m.coreExperience)],
    ["核心幻想", text(m.coreFantasy)],
    ["宪法幻想", text(c?.coreFantasy)],
    ["宪法循环", text(c?.coreLoop)],
    ["内容边界", text(c?.contentBoundary)],
    ["呈现边界", text(c?.presentationBoundary)],
    ["成长规则", text(c?.growthRule)],
    ["世界规则", text(c?.worldRule)],
    ["美术规则", text(c?.artRule)],
    ["核心情感", text(m.coreEmotion)],
    ["不要的情感", text(m.forbiddenEmotion)],
    ["差异点", text(m.differentiator)],
    ["玩家身份", text(m.playerIdentity)],
    ["核心动作", text(m.coreAction)],
    ["交互", joinOwn(m.interaction)],
    ["核心机制", lines(m.mechanics).join("\n")],
    ["核心循环", joinOwn(m.loop)],
    ["核心爽点", text(m.coreDelight)],
    ["成长", joinOwn(m.growth)],
    ["胜利", text(m.winRule)],
    ["失败", text(m.loseRule)],
    ["奖励", text(m.reward)],
    ["内容", text(m.content)],
    ["内容细节", joinOwn(m.contentDetail)],
    ["世界", text(m.world)],
    ["叙事", text(m.narrative)],
    ["难度", joinOwn(m.difficulty)],
    ["玩法关键词", lines(m.keywordPools?.gameplay).join("、")],
    ["情感关键词", lines(m.keywordPools?.emotion).join("、")],
    ["动机关键词", lines(m.keywordPools?.motivation).join("、")],
    ["叙事关键词", lines(m.keywordPools?.narrative).join("、")],
    ["世界关键词", lines(m.keywordPools?.world).join("、")],
    ["呈现", joinOwn(m.presentation)],
    ["美术", text(m.aesthetic)],
  ];
  return blocks.filter(([, value]) => value).map(([name, value]) => `${name}：${value}`).join("\n");
}

export function profileFingerprint(m: GddModel): string {
  return fnv1aHex(classificationCorpus(m));
}

export function catalogText(): string {
  return selectableTags().map((tag) => `${tag.id}\t${tag.zh}\t${tag.category}`).join("\n");
}

export function classificationMessages(corpus: string, note = ""): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "你是游戏设计文档的分类员。只能从给定的 Steam 标签表里选择，不能发明新标签。",
    "输出一个 JSON 对象，不要 Markdown。格式：",
    '{"genres":[{"tagId":1664,"evidence":"为什么整份文档支持这个类型","confidence":0.9,"fields":["核心机制"]}],"tags":[{"tagId":1687,"evidence":"为什么这是反复发生的特征","confidence":0.8,"fields":["核心机制"]}]}',
    "genres 只选 category=genre，最多 3 个。tags 只选 gameplay、theme、mood、feature，最多 6 个。不够就少选，不要凑数。",
    "先读「内容边界」。写着不做、不是、避免、不以……为核心的，不能因为字面出现就选成正向标签。",
    "出现过一次，不等于它描述整个游戏。标签只留给核心玩法、反复行为、重要系统、强烈主题和显著体验。",
    "不要选最泛的标签来充数。evidence 必须指向文档里的正向依据。confidence 取 0 到 1。",
    "tagId 必须是表里的数字。",
  ].join("\n");
  const user = [
    note,
    "标签表（id、中文名、category）：",
    catalogText(),
    "",
    "已确认的游戏设计文档：",
    corpus,
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function parseModelJson(raw: string): ParsedClassification | null {
  const textBody = String(raw || "").trim();
  const fenced = textBody.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    const data = JSON.parse(fenced[0]) as { genres?: unknown; tags?: unknown };
    return { genres: asPicks(data.genres), tags: asPicks(data.tags) };
  } catch {
    return null;
  }
}

function asPicks(value: unknown): ModelTagPick[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const tagId = Number(row.tagId);
    return {
      tagId,
      evidence: typeof row.evidence === "string" ? row.evidence.trim() : "",
      confidence: typeof row.confidence === "number" ? row.confidence : Number(row.confidence),
      fields: Array.isArray(row.fields) ? row.fields.map((field) => text(field)).filter(Boolean).slice(0, 6) : [],
    };
  }).filter((row) => Number.isFinite(row.tagId));
}

export function mentionIsNegated(corpus: string, alias: string): boolean {
  if (!alias || alias.length < 2) return false;
  let from = 0;
  let positive = 0;
  let negative = 0;
  while (from < corpus.length) {
    const at = corpus.indexOf(alias, from);
    if (at < 0) break;
    const before = corpus.slice(Math.max(0, at - 18), at);
    const negated = /(?:不做|不是|不要|避免|不以|不把|没有|不能|不会|并不)[^。；\n]{0,12}$/.test(before)
      || (/不$/.test(before) && !/(?:不同|不过|不再|不断|不仅|不可)$/.test(before));
    if (negated) negative += 1;
    else positive += 1;
    from = at + alias.length;
  }
  return negative > 0 && positive === 0;
}

function tagById(id: number): SteamTag | undefined {
  return STEAM_TAGS.find((tag) => tag.id === id);
}

function namesOf(tag: SteamTag): string[] {
  return [...new Set([...tag.aliases, tag.zh].map((item) => item.trim()).filter((item) => item.length >= 2))];
}

function blockedByBoundary(corpus: string, tag: SteamTag): boolean {
  return namesOf(tag).some((alias) => mentionIsNegated(corpus, alias));
}

export function validateClassification(corpus: string, parsed: ParsedClassification | null): ValidationResult {
  const filtered: FilteredTag[] = [];
  if (!parsed) {
    filtered.push({ tagId: 0, label: "", reason: "模型输出不是合法 JSON" });
    return { genres: [], tags: [], filtered };
  }
  const genres = keep(corpus, parsed.genres, "genre", GENRE_LIMIT, filtered);
  const tags = keep(corpus, parsed.tags, "tag", TAG_LIMIT, filtered);
  return { genres, tags, filtered };
}

function keep(corpus: string, picks: ModelTagPick[], kind: "genre" | "tag", limit: number, filtered: FilteredTag[]): KeptTag[] {
  const seen = new Set<number>();
  const accepted: KeptTag[] = [];
  const ranked = [...picks].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  for (const pick of ranked) {
    const tag = tagById(pick.tagId);
    const label = tag?.zh || "";
    if (!tag) {
      filtered.push({ tagId: pick.tagId, label, reason: "tagId 不在 Steam 词表里" });
      continue;
    }
    if (tag.category === "excluded" || tag.category === "visual" || tag.skipAsTag) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: tag.excludeReason || "这个标签不参与自动分类" });
      continue;
    }
    if (kind === "genre" && tag.category !== "genre") {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "不是类型" });
      continue;
    }
    if (kind === "tag" && tag.category === "genre") {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "类型不能放进标签" });
      continue;
    }
    if (seen.has(tag.id)) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "重复" });
      continue;
    }
    const confidence = Number(pick.confidence);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "信心不足" });
      continue;
    }
    if (!pick.evidence) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "没有证据" });
      continue;
    }
    if (blockedByBoundary(corpus, tag) || namesOf(tag).some((alias) => mentionIsNegated(pick.evidence || "", alias))) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: "内容边界或证据是否定，不能当成正向标签" });
      continue;
    }
    if (accepted.length >= limit) {
      filtered.push({ tagId: tag.id, label: tag.zh, reason: kind === "genre" ? "超过 3 个类型" : "超过 6 个标签" });
      continue;
    }
    seen.add(tag.id);
    accepted.push({
      tagId: tag.id,
      label: tag.zh,
      category: tag.category,
      evidence: pick.evidence,
      confidence,
      evidenceFields: pick.fields || [],
    });
  }
  return accepted;
}
