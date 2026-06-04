import {
  GameDslSchema,
  PlatformSchema,
  DimensionSchema,
  EngineSchema,
  NetworkingSchema,
  OrientationSchema,
  ModalitySchema,
  normalizeVocabField,
  genreVocab,
  mechanicsVocab,
  artStyleVocab,
  type GameDSL,
} from "@cq/dsl";
import type { z } from "zod";
import type { GddModel } from "@cq/gdd";
import type { ConversationState } from "./state.js";

/** 单值枚举校验：能解析则返回归一值，否则 undefined（不让坏值传染整份 DSL）。 */
function coerceEnum<T extends z.ZodTypeAny>(value: string | undefined, schema: T): z.infer<T> | undefined {
  if (value === undefined) return undefined;
  const r = schema.safeParse(value);
  return r.success ? (r.data as z.infer<T>) : undefined;
}

/** 数组枚举过滤：只保留合法成员，丢弃 LLM 偶发的非法枚举（如把 "2d" 误塞进 modalities）。 */
function keepValid<T extends z.ZodTypeAny>(values: string[], schema: T): z.infer<T>[] {
  const out: z.infer<T>[] = [];
  for (const v of values) {
    const r = schema.safeParse(v);
    if (r.success) out.push(r.data as z.infer<T>);
  }
  return out;
}

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

  // 硬约束：先把核心三件归一+校验（大小写容错：2d→2D / PIXIJS→pixijs），坏值视为缺失。
  const dimension = coerceEnum(eng.dimension?.trim().toUpperCase(), DimensionSchema);
  const engine = coerceEnum(eng.engine?.trim().toLowerCase(), EngineSchema);
  const platform = keepValid(eng.platform, PlatformSchema);

  const missing: string[] = [];
  if (!dimension) missing.push("dimension");
  if (!engine) missing.push("engine");
  if (platform.length === 0) missing.push("platform");
  if (missing.length > 0) return { dsl: null, missing };

  // 软约束：过滤/归一，单个非法枚举（如 modalities 里的 "2d"）被丢弃，绝不打死整份 DSL。
  const modalities = keepValid(eng.modalities, ModalitySchema);
  const networking = coerceEnum(eng.networking, NetworkingSchema) ?? "singleplayer";
  const orientation = coerceEnum(eng.orientation, OrientationSchema);

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
      platform,
      dimension,
      engine,
      networking,
      ...(orientation ? { orientation } : {}),
    },
    ...(genre ? { genre } : {}),
    mechanics,
    ...(artStyle ? { art_style: artStyle } : {}),
    modalities,
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
