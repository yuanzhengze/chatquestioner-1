import {
  GameDslSchema,
  normalizeVocabField,
  genreVocab,
  mechanicsVocab,
  artStyleVocab,
  type GameDSL,
} from "@cq/dsl";
import type { GddModel } from "@cq/gdd";
import type { ConversationState } from "./state.js";

/** ConversationState → GddModel（人看的 GDD 渲染输入）。 */
export function toGddModel(state: ConversationState): GddModel {
  const coreLoop = [state.loop.thirtySec, state.loop.fiveMin, state.loop.thirtyMin, state.loop.longTerm]
    .filter((x): x is string => Boolean(x && x.trim()));
  return {
    title: state.workingTitle ?? state.theme ?? state.spark ?? "未命名游戏",
    pitch: state.pitch ?? "",
    coreFantasy: state.coreFantasy ?? "",
    coreExperience: state.coreExperience ?? state.coreEmotion ?? "",
    coreLoop,
    keywordPools: state.keywordPools,
    differentiator: state.differentiator ?? "",
    references: { borrow: state.references, avoid: state.avoidReferences },
    mvp: { must: state.mvpScope.must, cut: state.mvpScope.cut },
    risks: state.risks,
    constitution: state.constitution,
  };
}

export interface CompileDslResult {
  dsl: GameDSL | null;
  missing: string[];
}

/** ConversationState → GameDSL；缺关键工程信号则 dsl=null + missing（不导半截）。 */
export function toGameDsl(state: ConversationState): CompileDslResult {
  const eng = state.engineering;
  const missing: string[] = [];
  if (!eng.dimension) missing.push("dimension");
  if (!eng.engine) missing.push("engine");
  if (eng.platform.length === 0) missing.push("platform");
  if (missing.length > 0) return { dsl: null, missing };

  // 枚举 + 自由词回退（D7）：未命中枚举的原话回退进 intent_terms，绝不丢弃。
  const intent = new Set(eng.intentTerms.map((t) => t.trim()).filter(Boolean));

  let genre: string | undefined;
  if (eng.genre) {
    const r = normalizeVocabField(eng.genre, genreVocab.GENRES);
    genre = r.known;
    for (const f of r.fallback) intent.add(f);
  }

  const mechanics: string[] = [];
  for (const m of eng.mechanics) {
    const r = normalizeVocabField(m, mechanicsVocab.MECHANICS);
    if (r.known) mechanics.push(r.known);
    else for (const f of r.fallback) intent.add(f);
  }

  let artStyle: string | undefined;
  if (eng.artStyle) {
    const r = normalizeVocabField(eng.artStyle, artStyleVocab.ART_STYLES);
    artStyle = r.known;
    for (const f of r.fallback) intent.add(f);
  }

  const candidate = {
    schema_version: "0.1",
    constraints: {
      platform: eng.platform,
      dimension: eng.dimension,
      engine: eng.engine,
      networking: eng.networking ?? "singleplayer",
      ...(eng.orientation ? { orientation: eng.orientation } : {}),
    },
    ...(genre ? { genre } : {}),
    mechanics,
    ...(artStyle ? { art_style: artStyle } : {}),
    modalities: eng.modalities,
    intent_terms: [...intent],
    signature_terms: eng.signatureTerms,
    mvp_scope: { must: state.mvpScope.must, cut: state.mvpScope.cut },
    constitution_ref: "gdd.md#游戏宪法",
  };

  const parsed = GameDslSchema.safeParse(candidate);
  if (!parsed.success) {
    return { dsl: null, missing: parsed.error.issues.map((i) => `schema:${i.path.join(".") || "root"}`) };
  }
  return { dsl: parsed.data, missing: [] };
}
