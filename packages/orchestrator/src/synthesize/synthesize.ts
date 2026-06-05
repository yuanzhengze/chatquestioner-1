import { normalizeVocabField, genreVocab } from "@cq/dsl";
import type { ConversationState } from "@cq/conversation";
import { validate } from "../validate.js";
import type { GameDef } from "../types.js";
import { buildSkeleton } from "./skeleton.js";
import type { GameDefFill, SynthesizeDiagnostic } from "./fill.js";

export interface SynthesizeResult {
  def: GameDef | null;
  diagnostics: SynthesizeDiagnostic[];
}

/** 仅当对话识别出的 genre 归一后等于 "match-3" 才算 S1 可支持。 */
export function supportedMatch3Genre(state: ConversationState): boolean {
  const raw = state.engineering.genre;
  if (!raw) return false;
  return normalizeVocabField(raw, genreVocab.GENRES).known === "match-3";
}

/**
 * ConversationState + 已校验 fill → GameDef。
 * fill 的 JSON 解析/zod 校验由调用方（server）负责；此处只做 genre 判定 + 骨架组装 + validate 兜底。
 */
export function synthesize(state: ConversationState, fill: GameDefFill): SynthesizeResult {
  if (!supportedMatch3Genre(state)) {
    return { def: null, diagnostics: [{ kind: "unsupported-genre", genre: state.engineering.genre ?? null }] };
  }
  const def = buildSkeleton(state, fill);
  const errors = validate(def);
  if (errors.length > 0) {
    return { def: null, diagnostics: [{ kind: "synthesize-failed", errors: errors.map((e) => e.message) }] };
  }
  return { def, diagnostics: [] };
}
