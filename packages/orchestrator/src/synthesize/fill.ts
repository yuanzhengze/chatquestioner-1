import { z } from "zod";

/** goal 仅允许已实现运行时支持的三类（collect / score / clearLayer）。 */
export const GoalFillSchema = z.union([
  z.object({ kind: z.literal("collect"), need: z.record(z.number().int().positive()) }),
  z.object({ kind: z.literal("score"), target: z.number().int().positive() }),
  z.object({ kind: z.literal("clearLayer") }),
]);

/** LLM 唯一产物：窄结构，systems/依赖由骨架定死，不开放给 LLM。 */
export const FillSchema = z.object({
  tiles: z.array(z.string().min(1)).min(1),
  size: z.tuple([z.number(), z.number()]),
  goal: GoalFillSchema,
  tuning: z
    .object({
      minLine: z.number().int().min(3).optional(),
      moves: z.number().int().positive().nullable().optional(),
      comboMult: z.number().positive().optional(),
    })
    .optional(),
});

export type GameDefFill = z.infer<typeof FillSchema>;

export type SynthesizeDiagnostic =
  | { kind: "unsupported-genre"; genre: string | null }
  | { kind: "fill-parse-error"; raw: string }
  | { kind: "fill-invalid"; issues: string[] }
  | { kind: "synthesize-failed"; errors: string[] };

const MIN_SIZE = 6;
const MAX_SIZE = 10;
const MIN_TILES = 3;
const MAX_TILES = 7;
const FALLBACK_TILES = ["red", "green", "blue", "yellow", "purple", "orange", "white"];

/** 棋盘尺寸夹到 6..10 并取整，越界不报错。 */
export function clampSize([w, h]: [number, number]): [number, number] {
  const c = (n: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
  return [c(w), c(h)];
}

/** 去重 + 去空白，截到 7；不足 3 用默认色补齐，保证可玩。 */
export function dedupeTiles(tiles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tiles) {
    const v = t.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= MAX_TILES) break;
  }
  for (const f of FALLBACK_TILES) {
    if (out.length >= MIN_TILES) break;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
