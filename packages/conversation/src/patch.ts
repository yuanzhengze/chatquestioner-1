import { asGddText, coreMechanicId, stripListNumber } from "@cq/gdd";
import { mechanicIdOf, toGddModel } from "./compile.js";
import { PATCH_OPTIONS } from "./llm.js";
import { mergeStateDelta, type StateDelta } from "./merge.js";
import type { ConversationState, OptionPhase, PatchContext } from "./state.js";

/** 预览里的第 N 条核心机制。一条就是一个修改单元。 */
const MECHANIC_ITEM = /^mechanics\.(\d+)$/;

interface MechanicEdit {
  lineId: string;
  from: string;
  to: string;
}

export interface PatchIntent {
  lineId: string;
  lineText: string;
  sectionId?: string;
  sectionTitle?: string;
}

const CONSTITUTION_KEYS = [
  "coreFantasy",
  "coreLoop",
  "artRule",
  "contentBoundary",
  "presentationBoundary",
  "growthRule",
  "worldRule",
  "uiRule",
] as const;

const LOOP_ALIAS: Record<string, "thirtySec" | "fiveMin" | "thirtyMin" | "longTerm"> = {
  micro: "thirtySec",
  mid: "fiveMin",
  macro: "thirtyMin",
  longTerm: "longTerm",
  thirtySec: "thirtySec",
  fiveMin: "fiveMin",
  thirtyMin: "thirtyMin",
};

const STATIC_PATHS: Record<string, string[]> = {
  coreExperience: ["coreExperience"],
  coreEmotion: ["coreEmotion"],
  forbiddenEmotion: ["forbiddenEmotion"],
  coreFantasy: ["coreFantasy", "playerIdentity"],
  playerIdentity: ["playerIdentity"],
  differentiator: ["differentiator"],
  "references.borrow": ["references"],
  "references.avoid": ["avoidReferences"],
  coreAction: ["coreAction"],
  "interaction.verb": ["interaction.verb"],
  "interaction.target": ["interaction.target"],
  "interaction.chain": ["interaction.chain"],
  "interaction.feedback": ["interaction.feedback"],
  mechanics: ["mechanics"],
  "loop.micro": ["loop.thirtySec"],
  "loop.mid": ["loop.fiveMin"],
  "loop.macro": ["loop.thirtyMin"],
  "loop.longTerm": ["loop.longTerm"],
  coreDelight: ["coreDelight"],
  reward: ["reward"],
  "growth.none": ["growth.none"],
  "growth.unlocks": ["growth.unlocks"],
  "growth.nearGoal": ["growth.nearGoal"],
  "growth.afterTenMin": ["growth.afterTenMin"],
  winRule: ["winRule"],
  loseRule: ["failRule"],
  failRule: ["failRule"],
  replayMotivation: ["replayMotivation"],
  world: ["world"],
  narrative: ["narrative"],
  aesthetic: ["aesthetic"],
  gameFeel: ["gameFeel"],
  juice: ["juice"],
  highlight: ["juice"],
  content: ["content.overview"],
  "content.overview": ["content.overview"],
  "content.levels": ["content.levels"],
  "content.boss": ["content.boss"],
  "content.progression": ["content.progression"],
  "content.multiplayer": ["content.multiplayer"],
  "presentation.where": ["presentation.where"],
  "presentation.dimension": ["presentation.dimension"],
  "presentation.orientation": ["presentation.orientation"],
  "presentation.players": ["presentation.players"],
  "presentation.assets": ["presentation.assets"],
  "difficulty.ramp": ["difficulty.ramp"],
  "difficulty.firstMinutes": ["difficulty.firstMinutes"],
  "difficulty.fatigue": ["difficulty.fatigue"],
  "keywordPools.gameplay": ["keywordPools.gameplay"],
  "keywordPools.emotion": ["keywordPools.emotion"],
  "keywordPools.world": ["keywordPools.world"],
  "keywordPools.visual": ["keywordPools.visual"],
  "keywordPools.narrative": ["keywordPools.narrative"],
  "keywordPools.motivation": ["keywordPools.motivation"],
};

for (const key of CONSTITUTION_KEYS) {
  STATIC_PATHS[`constitution.${key}`] = [`constitutionFields.${key}`];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!isRecord(cur) && !Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (!isRecord(next)) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function isKnownLineId(lineId: string): boolean {
  const id = String(lineId || "").trim();
  if (!id) return false;
  if (STATIC_PATHS[id]) return true;
  if (/^mechanics(\.\d+)?$/.test(id)) return true;
  if (/^highlights(\.\d+)?$/.test(id)) return true;
  if (/^constitution\.(coreFantasy|coreLoop|artRule|contentBoundary|presentationBoundary|growthRule|worldRule|uiRule)$/.test(id)) {
    return true;
  }
  return false;
}

/** 单条机制不走整表路径，见 mechanicEdits。只有「机制：（未写）」那一行才写整表。 */
export function pathsForLine(lineId: string): string[] {
  const id = String(lineId || "").trim();
  if (MECHANIC_ITEM.test(id)) return [];
  if (/^highlights(\.\d+)?$/.test(id)) return ["juice"];
  return STATIC_PATHS[id] ? [...STATIC_PATHS[id]] : [];
}

function mechanicIndex(lineId: string): number {
  const hit = String(lineId || "").trim().match(MECHANIC_ITEM);
  return hit ? Number(hit[1]) : -1;
}

/** 点下去的那一条：先认行文里的原句，对不上再按位置取。 */
export function mechanicTarget(state: ConversationState, lineId: string, lineText: string): string {
  const shown = toGddModel(state).mechanics;
  const typed = stripListNumber(lineText);
  if (typed && shown.includes(typed)) return typed;
  const idx = mechanicIndex(lineId);
  return idx >= 0 ? shown[idx] || "" : "";
}

function readMechanicEdit(
  delta: Record<string, unknown>,
  lineId: string,
  shown: string[],
  sole: boolean,
): string {
  const edits = delta.mechanic_edits ?? delta.mechanicEdits;
  if (isRecord(edits)) {
    const value = stripListNumber(edits[lineId]);
    if (value) return value;
  }
  /** 模型没按要求、还是交了整表：只从里面取目标这一条，其余条目不写回。 */
  if (!sole || !Array.isArray(delta.mechanics)) return "";
  const list = delta.mechanics.map((item) => stripListNumber(item)).filter(Boolean);
  if (list.length === 1) return list[0];
  const idx = mechanicIndex(lineId);
  if (list.length === shown.length && idx >= 0) return list[idx] || "";
  const fresh = list.filter((item) => !shown.includes(item));
  return fresh.length === 1 ? fresh[0] : "";
}

/** fromRaw 是存下来的原文（旧会话可能带着序号），身份按 compile 同一条规则取。 */
function keepMechanicIdentity(state: ConversationState, fromRaw: string, to: string): void {
  const ids = { ...(state.mechanicIds || {}) };
  const stable = mechanicIdOf(ids, fromRaw);
  delete ids[coreMechanicId(fromRaw)];
  delete ids[coreMechanicId(stripListNumber(fromRaw))];
  const toKey = coreMechanicId(to);
  if (toKey !== stable) ids[toKey] = stable;
  else delete ids[toKey];
  if (Object.keys(ids).length) state.mechanicIds = ids;
  else delete state.mechanicIds;
}

/** 只换目标那一条。其他机制按原值留着。写回的正文不带展示序号。 */
function applyMechanicEdits(state: ConversationState, edits: MechanicEdit[]): void {
  for (const edit of edits) {
    const from = stripListNumber(edit?.from);
    const to = stripListNumber(edit?.to);
    if (!from || !to || from === to) continue;
    let base: unknown[] = Array.isArray(state.mechanics) ? [...state.mechanics] : [];
    let idx = base.findIndex((item) => stripListNumber(item) === from);
    if (idx < 0) {
      /** 文档里看到的机制可能是编译时从工程信号或核心动作补出来的，先把看到的这张表落成正文。 */
      const shown = toGddModel(state).mechanics;
      idx = shown.indexOf(from);
      if (idx < 0) continue;
      base = [...shown];
    }
    const fromRaw = asGddText(base[idx]);
    const taken = base.some((item, i) => i !== idx && stripListNumber(item) === to);
    base[idx] = to;
    state.mechanics = base as string[];
    if (!taken) keepMechanicIdentity(state, fromRaw, to);
  }
}

function readLoopValue(delta: Record<string, unknown>, stateKey: string): unknown {
  const direct = getPath(delta, `loop.${stateKey}`);
  if (direct !== undefined) return direct;
  for (const [alias, mapped] of Object.entries(LOOP_ALIAS)) {
    if (mapped === stateKey) {
      const v = getPath(delta, `loop.${alias}`);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function readPath(delta: Record<string, unknown>, path: string): unknown {
  if (path.startsWith("loop.")) {
    return readLoopValue(delta, path.slice("loop.".length));
  }
  if (path.startsWith("constitutionFields.")) {
    const key = path.slice("constitutionFields.".length);
    return getPath(delta, path) ?? getPath(delta, `constitution.${key}`);
  }
  if (path === "failRule") {
    return getPath(delta, "failRule") ?? getPath(delta, "loseRule");
  }
  if (path === "content.overview") {
    return getPath(delta, "content.overview") ?? getPath(delta, "content");
  }
  return getPath(delta, path);
}

/** 丢掉对照旧稿的说法，只留改完后的现行正文。 */
export function scrubContrastCopy(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const parts = raw.split(/(?<=[。！？；\n])/);
  const kept: string[] = [];
  for (const part of parts) {
    const next = rewriteContrastSentence(part);
    if (next.trim()) kept.push(next);
  }
  return kept.join("").trim() || raw;
}

function rewriteContrastSentence(s: string): string {
  const t = s.trim();
  if (!t) return s;
  const swapped = t.match(/不再(?:需要|是)?[\s\S]{0,80}?(?:而是通过|而是|改为|改成|换成)([\s\S]+)$/);
  if (swapped && swapped[1].trim().length >= 2) return joinPunct(s, swapped[1].trim());
  const now = t.match(/^(?:原来|之前)[\s\S]{0,80}?(?:现在|改为|改成)([\s\S]+)$/);
  if (now && now[1].trim().length >= 2) return joinPunct(s, now[1].trim());
  if (/^不再(?:需要|是)/.test(t) && !/而是|改为|改成|换成/.test(t)) return "";
  return s;
}

function joinPunct(original: string, next: string): string {
  const punct = original.match(/[。！？；]$/)?.[0] || "";
  const body = next.replace(/[。！？；]+$/g, "").trim();
  return original.startsWith(original.trim()) && original !== original.trim()
    ? `${original.slice(0, original.length - original.trim().length)}${body}${punct}`
    : `${body}${punct}`;
}

export function asFinalCopy(value: unknown): unknown {
  if (typeof value === "string") return scrubContrastCopy(value);
  if (Array.isArray(value)) return value.map((item) => asFinalCopy(item));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = asFinalCopy(v);
    return out;
  }
  return value;
}

/**
 * 丢掉未知键；只保留清单行对应的 ConversationState 路径。
 * 单条机制按 targets 里的原句记成 mechanicEdits，写回时只换这一条。
 */
export function filterPatchDelta(
  raw: Record<string, unknown> | undefined,
  lineIds: string[],
  targets: Record<string, string> = {},
  shown: string[] = [],
): StateDelta {
  const delta = isRecord(raw) ? raw : {};
  const allowed = new Set<string>();
  for (const id of lineIds) {
    for (const path of pathsForLine(id)) allowed.add(path);
  }
  const out: Record<string, unknown> = {};
  for (const path of allowed) {
    const value = readPath(delta, path);
    if (value === undefined) continue;
    setPath(out, path, asFinalCopy(value));
  }
  const items = lineIds.filter((id) => MECHANIC_ITEM.test(id));
  const edits: MechanicEdit[] = [];
  for (const id of items) {
    const from = targets[id] || "";
    if (!from) continue;
    const to = stripListNumber(asFinalCopy(readMechanicEdit(delta, id, shown, items.length === 1)));
    if (to && to !== from) edits.push({ lineId: id, from, to });
  }
  if (edits.length) out.mechanicEdits = edits;
  return out as StateDelta;
}

export function resolveAffectedLineIds(
  tapped: string,
  claimed: string[] | undefined,
  delta: Record<string, unknown> | undefined,
  hasMechanics = false,
): string[] {
  const known = new Set<string>();
  if (isKnownLineId(tapped)) known.add(tapped);
  const tappedItem = MECHANIC_ITEM.test(tapped);
  for (const id of claimed || []) {
    if (!isKnownLineId(id)) continue;
    /** 已有机制时不接受整表；点的是一条机制时，别的机制也不跟着改。 */
    if (id === "mechanics" && hasMechanics) continue;
    if (tappedItem && id.startsWith("mechanics") && id !== tapped) continue;
    known.add(id);
  }
  if (!claimed?.length && !hasMechanics && Array.isArray((delta as StateDelta | undefined)?.mechanics)) {
    known.add("mechanics");
  }
  return [...known];
}

export function patchAskReply(intent: PatchIntent): string {
  const section = String(intent.sectionTitle || "").trim();
  const body = String(intent.lineText || "").trim() || "（未写）";
  const where = section ? `「${section}」里的这一句` : "文档里的这一句";
  return `你要点改${where}：\n\n${body}\n\n想改成什么样？只说这一处就行。`;
}

function asResumePhase(phase: OptionPhase | undefined): Exclude<OptionPhase, "patch"> {
  if (phase === "convergence" || phase === "supplement" || phase === "awaitingEdit" || phase === "interview") {
    return phase;
  }
  return "interview";
}

export function beginLinePatch(state: ConversationState, intent: PatchIntent): ConversationState {
  const lineId = String(intent.lineId || "").trim();
  const existing = state.optionPhase === "patch" ? state.patchContext : undefined;
  const resumePhase = existing?.resumePhase ?? asResumePhase(state.optionPhase);
  const resumeOptions = existing?.resumeOptions
    ? existing.resumeOptions.map((o) => ({ ...o }))
    : (state.lastOptions || []).map((o) => ({ ...o }));
  const ctx: PatchContext = {
    lineId,
    lineText: String(intent.lineText || ""),
    sectionId: intent.sectionId,
    sectionTitle: intent.sectionTitle,
    resumePhase,
    resumeOptions,
    awaitingConfirm: false,
  };
  const resumeOrigin = existing ? existing.resumeOrigin : (state.iterationOrigin === "cocreation" ? "cocreation" : undefined);
  if (resumeOrigin) {
    ctx.resumeOrigin = resumeOrigin;
    if (existing ? existing.resumeAsked : state.revisionAsked) ctx.resumeAsked = true;
  }
  if (MECHANIC_ITEM.test(lineId)) {
    const target = mechanicTarget(state, lineId, ctx.lineText);
    if (target) ctx.targetText = target;
  }
  state.patchContext = ctx;
  state.optionPhase = "patch";
  state.iterationOrigin = "document_patch";
  delete state.revisionAsked;
  state.lastOptions = [];
  /** 机制那一行在页面上带着「2.」，问的时候只给原句，免得模型把序号抄进新正文。 */
  const reply = patchAskReply(ctx.targetText ? { ...intent, lineText: ctx.targetText } : intent);
  state.history.push({ role: "assistant", content: reply });
  return state;
}

export function restorePatchPhase(state: ConversationState): void {
  const ctx = state.patchContext;
  const resumePhase = ctx?.resumePhase ?? "interview";
  const resumeOptions = ctx?.resumeOptions ? ctx.resumeOptions.map((o) => ({ ...o })) : [];
  delete state.patchContext;
  delete state.iterationOrigin;
  delete state.revisionAsked;
  if (resumePhase === "convergence" || resumePhase === "awaitingEdit") {
    state.optionPhase = "awaitingEdit";
    state.lastOptions = [];
    return;
  }
  state.optionPhase = resumePhase;
  state.lastOptions = resumeOptions.length ? resumeOptions : [];
  if (ctx?.resumeOrigin === "cocreation") {
    state.iterationOrigin = "cocreation";
    if (ctx.resumeAsked) state.revisionAsked = true;
  }
}

export function applyPendingPatch(state: ConversationState): void {
  const ctx = state.patchContext;
  if (!ctx) return;
  const pending = isRecord(ctx.pendingDelta) ? ctx.pendingDelta : {};
  const { mechanicEdits, ...rest } = pending;
  const ids = ctx.affectedLineIds?.length ? ctx.affectedLineIds : [ctx.lineId];
  mergeStateDelta(state, filterPatchDelta(rest, ids), { replaceLists: true });
  applyMechanicEdits(state, Array.isArray(mechanicEdits) ? (mechanicEdits as MechanicEdit[]) : []);
}

export function stashPatchProposal(
  state: ConversationState,
  delta: Record<string, unknown> | undefined,
  claimed: string[] | undefined,
): string[] {
  const ctx = state.patchContext;
  if (!ctx) return [];
  const shown = toGddModel(state).mechanics;
  const ids = resolveAffectedLineIds(ctx.lineId, claimed, delta, shown.length > 0);
  const targets: Record<string, string> = {};
  for (const id of ids) {
    if (!MECHANIC_ITEM.test(id)) continue;
    const target = id === ctx.lineId && ctx.targetText ? ctx.targetText : shown[mechanicIndex(id)] || "";
    if (target) targets[id] = target;
  }
  ctx.pendingDelta = filterPatchDelta(delta, ids, targets, shown) as Record<string, unknown>;
  ctx.affectedLineIds = ids;
  ctx.awaitingConfirm = true;
  state.patchContext = ctx;
  state.optionPhase = "patch";
  state.lastOptions = PATCH_OPTIONS.map((o) => ({ ...o }));
  return ids;
}

export function clearPatchProposal(state: ConversationState): void {
  const ctx = state.patchContext;
  if (!ctx) return;
  delete ctx.pendingDelta;
  delete ctx.affectedLineIds;
  ctx.awaitingConfirm = false;
  state.optionPhase = "patch";
  state.lastOptions = [];
}

export function patchHostGuard(state: ConversationState): string {
  const ctx = state.patchContext;
  const where = ctx?.sectionTitle ? `「${ctx.sectionTitle}」` : "文档";
  const line = ctx?.lineText ? `原文：${ctx.lineText}` : "";
  const id = ctx?.lineId ? `行 id：${ctx.lineId}` : "";
  const shown = toGddModel(state).mechanics;
  const listing = shown.length
    ? `\n现行核心机制（行 id：原文）：\n${shown.map((text, i) => `mechanics.${i}：${text}`).join("\n")}`
    : "";
  const mechanicRule = ctx && MECHANIC_ITEM.test(ctx.lineId)
    ? `用户点的是核心机制里的 ${ctx.lineId} 这一条。只改这一条：把改完后的整句写进 state_delta.mechanic_edits，键就是 "${ctx.lineId}"。整句不要带「1.」「2、」这类列表序号。不要写 mechanics 整表，其他机制一个字都不要动，也不要列进 affected_lines。`
    : `要顺带改某一条核心机制，就写 state_delta.mechanic_edits：{"mechanics.N": "改完后的整句"}，整句不要带列表序号，并把这个行 id 列进 affected_lines。不要写 mechanics 整表。`;
  return `\n\n[宿主硬约束] 用户正在改${where}的一处。${id} ${line}
只处理这一处意图。人话不要说「手风琴」「字段」「第几节」；宿主会自己列出将改的地方。
state_delta 每个字段只写改完后的现行正文，当作文档里从来就是这样。禁止对照旧稿：不要写「不再需要 / 不再是 / 原来 / 之前 / 而是通过 / 改为」。被换掉的旧设定不要再出现。相关玩法句一并列入 affected_lines，全部写成新正文。
禁止定稿三选，禁止「改一块 / 再挖挖」，禁止 JSON options，禁止人话 A./B./C.。
JSON 只含 state_delta（仅这些字段，以及 mechanic_edits）和 affected_lines（行 id 数组）。未知键不要写。${mechanicRule}${listing}`;
}

const LINE_LABELS: Record<string, string> = {
  coreExperience: "这是什么游戏",
  coreEmotion: "主情感",
  forbiddenEmotion: "禁止情感",
  coreFantasy: "核心幻想",
  playerIdentity: "玩家身份",
  differentiator: "差异化",
  "references.borrow": "借鉴",
  "references.avoid": "刻意避开",
  coreAction: "核心动作",
  "interaction.verb": "主要操作",
  "interaction.target": "操作对象",
  "interaction.chain": "交互链路",
  "interaction.feedback": "即时反馈",
  mechanics: "机制",
  "loop.micro": "微循环",
  "loop.mid": "中循环",
  "loop.macro": "宏循环",
  "loop.longTerm": "长线",
  coreDelight: "核心爽点",
  reward: "奖励",
  "growth.none": "成长与变化",
  "growth.unlocks": "越玩越多",
  "growth.nearGoal": "眼前目标",
  "growth.afterTenMin": "玩一阵之后",
  winRule: "胜利",
  loseRule: "失败",
  failRule: "失败",
  replayMotivation: "重玩",
  world: "世界",
  narrative: "叙事",
  aesthetic: "视听",
  gameFeel: "手感",
  highlight: "高光",
  content: "内容",
  "content.overview": "内容",
  "content.levels": "关卡",
  "content.boss": "Boss",
  "content.progression": "养成 / 长线",
  "content.multiplayer": "多人",
  "presentation.where": "在哪玩",
  "presentation.dimension": "画面维度",
  "presentation.orientation": "屏幕方向",
  "presentation.players": "人数",
  "presentation.assets": "主要资产",
  "difficulty.ramp": "怎么上强度",
  "difficulty.firstMinutes": "前几分钟",
  "difficulty.fatigue": "疲劳与缓解",
  "keywordPools.gameplay": "玩法关键词",
  "keywordPools.emotion": "情绪关键词",
  "keywordPools.world": "世界观关键词",
  "keywordPools.visual": "视觉关键词",
  "keywordPools.narrative": "叙事关键词",
  "keywordPools.motivation": "玩家动机关键词",
  "constitution.coreFantasy": "核心幻想",
  "constitution.coreLoop": "核心循环",
  "constitution.artRule": "美术规则",
  "constitution.contentBoundary": "内容边界",
  "constitution.presentationBoundary": "呈现边界",
  "constitution.growthRule": "成长规则",
  "constitution.worldRule": "世界观规则",
  "constitution.uiRule": "UI 规则",
};

export function labelForLine(lineId: string): string {
  const id = String(lineId || "").trim();
  const idx = mechanicIndex(id);
  if (idx >= 0) return `核心机制第 ${idx + 1} 条`;
  if (id === "mechanics") return "机制";
  if (/^highlights(\.\d+)?$/.test(id)) return "高光瞬间";
  return LINE_LABELS[id] || "这一处";
}

function previewDeltaValue(delta: Record<string, unknown> | undefined, lineId: string): string {
  if (MECHANIC_ITEM.test(lineId)) {
    const edits = Array.isArray(delta?.mechanicEdits) ? (delta.mechanicEdits as MechanicEdit[]) : [];
    return asGddText(edits.find((edit) => edit?.lineId === lineId)?.to);
  }
  const filtered = filterPatchDelta(delta, [lineId]);
  for (const path of pathsForLine(lineId)) {
    const v = readPath(filtered as Record<string, unknown>, path);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length) {
      return v.map((item) => String(item || "").trim()).filter(Boolean).join("、");
    }
  }
  return "";
}

function changeLines(state: ConversationState): string[] {
  const ctx = state.patchContext;
  const ids = ctx?.affectedLineIds?.length
    ? ctx.affectedLineIds
    : (ctx?.lineId ? [ctx.lineId] : []);
  const lines: string[] = [];
  for (const id of ids) {
    const label = labelForLine(id);
    const next = previewDeltaValue(ctx?.pendingDelta, id);
    lines.push(next ? `- ${label}：改成「${next}」` : `- ${label}`);
  }
  return lines;
}

export function patchProposalReply(state: ConversationState): string {
  const lines = changeLines(state);
  if (!lines.length) {
    return "按你刚才说的，文档里相关的话会换成新的说法。下面选一下要不要改进去。";
  }
  return `按你刚才说的，文档里会改这些地方：\n\n${lines.join("\n")}`;
}

/** 写回之后的回执。要在 restorePatchPhase 清掉 patchContext 之前调用。 */
export function patchApplyReply(state?: ConversationState): string {
  const lines = state ? changeLines(state) : [];
  if (!lines.length) return "已经按你说的改好了，回预览看。";
  return `已经按你说的改好了：\n\n${lines.join("\n")}\n\n回预览看。`;
}

export function patchCancelReply(): string {
  return "这次没改文档，回预览。";
}

export function patchTweakReply(): string {
  return "好，你再改改这一处的说法。说完我再告诉你文档里会改成什么样。";
}
