import { z } from "zod";

/** 音游 L1 模块清单（rhythm_game_dsl_spec §3）。与 match-3 manifest 同范式。 */
export type RhythmModuleKind = "world" | "input" | "system" | "goal";

export interface RhythmModuleManifest {
  id: string;
  kind: RhythmModuleKind;
  description: string;
  params: z.ZodTypeAny;
  reads: string[];
  writes: string[];
  deps: string[];
  examples: string[];
  schema_version: string;
}

const V = "0.1";
const EX = ["neon-pulse-normal"];

export const RHYTHM_MANIFESTS: RhythmModuleManifest[] = [
  {
    id: "track-layout", kind: "world",
    description: "轨道布局：lanes=轨道数（1 单轨 / N 多轨）",
    params: z.object({ lanes: z.number().int().positive().default(4) }),
    reads: ["input"], writes: ["track"], deps: [], examples: EX, schema_version: V,
  },
  {
    id: "note-source", kind: "world",
    description: "谱面来源：静态 chart 或 hook 生成",
    params: z.object({ chart: z.any().optional() }),
    reads: [], writes: ["notes"], deps: ["track-layout"], examples: EX, schema_version: V,
  },
  {
    id: "input-tap", kind: "input",
    description: "点按输入",
    params: z.object({}),
    reads: ["input", "notes"], writes: ["notes"], deps: ["track-layout"], examples: EX, schema_version: V,
  },
  {
    id: "input-hold", kind: "input",
    description: "长按输入；tailJudge=松手附加判定",
    params: z.object({ tailJudge: z.boolean().default(true) }),
    reads: ["input", "notes"], writes: ["notes"], deps: ["track-layout"], examples: EX, schema_version: V,
  },
  {
    id: "input-flick", kind: "input",
    description: "方向滑动输入",
    params: z.object({ dirs: z.array(z.enum(["left", "right", "up", "down"])).default(["left", "right", "up", "down"]) }),
    reads: ["input", "notes"], writes: ["notes"], deps: ["track-layout"], examples: EX, schema_version: V,
  },
  {
    id: "input-special", kind: "input",
    description: "特殊飞入按钮（可扩展）",
    params: z.object({ kinds: z.array(z.string()).default([]) }),
    reads: ["input", "notes"], writes: ["notes"], deps: ["track-layout"], examples: [], schema_version: V,
  },
  {
    id: "timing-window", kind: "system",
    description: "三档判定窗口（ms）",
    params: z.object({
      perfectMs: z.number().positive().default(40),
      goodMs: z.number().positive().default(90),
      okMs: z.number().positive().default(140),
    }),
    reads: ["notes", "input"], writes: ["judgement"], deps: ["note-source"], examples: EX, schema_version: V,
  },
  {
    id: "base-score", kind: "system",
    description: "每类按钮基础分",
    params: z.object({
      tap: z.number().nonnegative().default(100),
      hold: z.number().nonnegative().default(200),
      flick: z.number().nonnegative().default(150),
      special: z.number().nonnegative().default(300),
    }),
    reads: ["judgement"], writes: ["score"], deps: ["timing-window"], examples: EX, schema_version: V,
  },
  {
    id: "combo-ladder", kind: "system",
    description: "连击阶梯倍率：n=阶梯基数，tiers=[[倍数,系数]]",
    params: z.object({
      n: z.number().int().positive().default(10),
      tiers: z.array(z.tuple([z.number().int().positive(), z.number().positive()])).default([[1, 1.1], [2, 1.2], [3, 1.5]]),
    }),
    reads: ["judgement"], writes: ["combo", "score"], deps: ["timing-window"], examples: EX, schema_version: V,
  },
  {
    id: "rank-threshold", kind: "system",
    description: "评分等级阈值（百分比）",
    params: z.object({
      sss: z.number().default(98), ss: z.number().default(90), s: z.number().default(85),
      a: z.number().default(75), b: z.number().default(70), c: z.number().default(60),
    }),
    reads: ["score"], writes: ["rank"], deps: ["base-score"], examples: EX, schema_version: V,
  },
  {
    id: "rank-goal", kind: "goal",
    description: "达到目标 Rank 即过关",
    params: z.object({ minRank: z.enum(["SSS", "SS", "S", "A", "B", "C"]).default("A") }),
    reads: ["rank"], writes: ["status"], deps: ["rank-threshold"], examples: EX, schema_version: V,
  },
  {
    id: "survival", kind: "goal",
    description: "血量制：MISS/OK 扣血，血尽失败",
    params: z.object({
      hp: z.number().positive().default(100),
      missDmg: z.number().nonnegative().default(10),
      okDmg: z.number().nonnegative().default(3),
    }),
    reads: ["judgement"], writes: ["hp", "status"], deps: ["timing-window"], examples: [], schema_version: V,
  },
  {
    id: "endless-score", kind: "goal",
    description: "无尽刷分，不设过关线",
    params: z.object({}),
    reads: ["score"], writes: [], deps: ["base-score"], examples: [], schema_version: V,
  },
];

export const RHYTHM_MANIFEST_BY_ID: Map<string, RhythmModuleManifest> = new Map(
  RHYTHM_MANIFESTS.map((m) => [m.id, m]),
);
