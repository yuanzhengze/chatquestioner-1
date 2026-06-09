import type { Judgement } from "./types.js";

/** timing-window 参数（三档判定窗口，ms）。 */
export interface TimingWindow {
  perfectMs: number;
  goodMs: number;
  okMs: number;
}

/** combo-ladder 参数：n=阶梯基数；tiers=[[倍数, 系数], ...] 升序。 */
export interface ComboLadder {
  n: number;
  tiers: [number, number][];
}

/**
 * 判定单次输入相对 note 的 Timing 档。delta = inputTime - note.time。
 * 早(delta<0)/晚(delta>0) 非对称（spec §2.2）：
 * - |delta| ≤ perfectMs → perfect
 * - 早 且 |delta| ≤ goodMs → good
 * - 晚 且 |delta| ≤ okMs → ok
 * - 否则 null（不消费该输入，note 留队列等 expire）
 * 注：晚且落在 (perfectMs, goodMs] 也只能 ok（good 是"早"专属）。
 */
export function judgeTiming(delta: number, w: TimingWindow): Judgement | null {
  const a = Math.abs(delta);
  if (a <= w.perfectMs) return "perfect";
  if (delta < 0) {
    return a <= w.goodMs ? "good" : null;
  }
  return a <= w.okMs ? "ok" : null;
}

/** Timing 档 → 分数系数。 */
export function timingCoef(j: Judgement): number {
  switch (j) {
    case "perfect":
      return 1.0;
    case "good":
      return 0.8;
    case "ok":
      return 0.5;
    case "miss":
      return 0;
  }
}

/** hold 头尾系数合成（spec §6.2）：两次平均；tail=null（tailJudge=false）→ 只取头。 */
export function holdCoef(head: Judgement, tail: Judgement | null): number {
  const h = timingCoef(head);
  if (tail === null) return h;
  return (h + timingCoef(tail)) / 2;
}

/** 当前 combo 数对应的倍率（spec §3 combo-ladder / §4）。combo<n 未激活=1.0。 */
export function comboMultAt(combo: number, ladder: ComboLadder): number {
  let mult = 1.0;
  for (const [mult_n, coef] of ladder.tiers) {
    if (combo >= ladder.n * mult_n) mult = coef;
  }
  return mult;
}
