import type { Chart, RhythmDef, SystemUse } from "./types.js";
import { isHook } from "./types.js";
import { generateChart, type GenerateChartInput } from "./chartgen.js";
import { createRhythmGame, RhythmEngine } from "./RhythmEngine.js";

/** 谱面生成 hook 签名（方案 §8）：输入 → Chart（可同步或异步）。 */
export type ChartHook = (input: GenerateChartInput) => Chart | Promise<Chart>;

/** hook 注册表：hook 名 → 实现。note-source.chart={hook:name} 在此查表。 */
export type HookRegistry = Record<string, ChartHook>;

/** 内置 hook：generateChart = P1 算法骨架。下游可扩展（P2/P3 接入音频服务）。 */
export const defaultHooks: HookRegistry = {
  generateChart,
};

/** createRhythmGameAsync 的 chart 来源选项：静态 chart 或 hook 注册表 + 输入。 */
export interface RhythmGameOptions {
  /** 静态谱面（note-source 不走 hook 时直接消费） */
  chart?: Chart;
  /** hook 注册表（note-source.chart={hook} 时按名查表） */
  hooks?: HookRegistry;
  /** 传给 hook 的输入（方案 §8 GenerateChartInput） */
  input?: GenerateChartInput;
}

/**
 * 加载期解析 note-source 并组装引擎（spec §3.1 / §5）。
 * - notes.chart 是 {hook:name} → 从 hooks 查表调用，拿运行时 Chart；
 * - 否则用 opts.chart 静态谱面。
 */
export async function createRhythmGameAsync(
  def: RhythmDef,
  opts: RhythmGameOptions,
): Promise<RhythmEngine> {
  const chart = await resolveChart(def, opts);
  return createRhythmGame(def, chart);
}

async function resolveChart(def: RhythmDef, opts: RhythmGameOptions): Promise<Chart> {
  const ns = def.notes;
  // note-source 的 chart 字段指向 hook：{ use:"note-source", chart:{hook:"..."} }
  if (!isHook(ns)) {
    const chartRef = (ns as SystemUse).chart;
    if (isHook(chartRef)) {
      const reg = opts.hooks ?? defaultHooks;
      const fn = reg[chartRef.hook];
      if (!fn) throw new Error(`未注册的谱面 hook: ${chartRef.hook}`);
      if (!opts.input) throw new Error(`hook ${chartRef.hook} 需要 input（GenerateChartInput）`);
      return await fn(opts.input);
    }
  } else {
    // notes 顶层直接是 HookRef 形式
    const reg = opts.hooks ?? defaultHooks;
    const fn = reg[ns.hook];
    if (!fn) throw new Error(`未注册的谱面 hook: ${ns.hook}`);
    if (!opts.input) throw new Error(`hook ${ns.hook} 需要 input（GenerateChartInput）`);
    return await fn(opts.input);
  }
  if (!opts.chart) throw new Error("note-source 未指向 hook 且未提供静态 chart");
  return opts.chart;
}
