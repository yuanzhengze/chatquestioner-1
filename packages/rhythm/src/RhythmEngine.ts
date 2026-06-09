import type { Chart, InputEvent, Judgement, Note, RhythmDef, RhythmState, SystemUse } from "./types.js";
import {
  comboMultAt,
  holdCoef,
  judgeTiming,
  timingCoef,
  type ComboLadder,
  type TimingWindow,
} from "./judge.js";

export type Goal =
  | { kind: "rank-goal"; minRank: Rank }
  | { kind: "survival"; hp: number; missDmg: number; okDmg: number }
  | { kind: "endless-score" };

/** 评分等级（高→低）。 */
export type Rank = "SSS" | "SS" | "S" | "A" | "B" | "C" | "D";

/** rank-threshold 参数：各等级所需百分比下限（D 为兜底，无阈值）。 */
export interface RankThreshold {
  sss: number;
  ss: number;
  s: number;
  a: number;
  b: number;
  c: number;
}

const DEFAULT_RANK_THRESHOLD: RankThreshold = { sss: 98, ss: 90, s: 85, a: 75, b: 70, c: 60 };

/** rank 高→低排序，用于 rank-goal 的达标比较。 */
const RANK_ORDER: Rank[] = ["SSS", "SS", "S", "A", "B", "C", "D"];

function rankFromPercent(pct: number, t: RankThreshold): Rank {
  if (pct >= t.sss) return "SSS";
  if (pct >= t.ss) return "SS";
  if (pct >= t.s) return "S";
  if (pct >= t.a) return "A";
  if (pct >= t.b) return "B";
  if (pct >= t.c) return "C";
  return "D";
}

/** 由 RhythmDef 翻译出来的引擎配置（RhythmDef → EngineConfig）。 */
export interface EngineConfig {
  window: TimingWindow;
  baseScore: Record<string, number>; // type → 基础分
  ladder: ComboLadder | null; // null = 关闭 combo 加成
  rankThreshold: RankThreshold;
  goal: Goal;
  tailJudge: boolean; // hold 是否附加松手判定
}

interface NoteRuntime {
  note: Note;
  judged: boolean;
}

/**
 * 音游运行时引擎：把 chart + config 组装成时间轴帧循环（spec §2）。
 * 输入为绝对时间戳事件；tick(now) 推进时间并结算。确定性、可复现。
 */
export class RhythmEngine {
  readonly chart: Chart;
  readonly config: EngineConfig;
  readonly theoreticalMax: number;
  private notes: NoteRuntime[];
  private pending: InputEvent[] = [];
  private state: RhythmState;

  constructor(chart: Chart, config: EngineConfig) {
    this.chart = chart;
    this.config = config;
    this.notes = chart.notes
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((note) => ({ note, judged: false }));
    this.theoreticalMax = this.computeTheoreticalMax();
    this.state = {
      now: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: config.goal.kind === "survival" ? config.goal.hp : null,
      counts: { perfect: 0, good: 0, ok: 0, miss: 0 },
      status: "playing",
    };
  }

  getState(): RhythmState {
    return { ...this.state, counts: { ...this.state.counts } };
  }

  /** 当前进度百分比（spec §2.3）：playerScore / theoreticalMax × 100。 */
  progressPercent(): number {
    if (this.theoreticalMax <= 0) return 0;
    return (this.state.score / this.theoreticalMax) * 100;
  }

  /** 当前评分等级（rank-threshold 映射百分比）。 */
  rank(): Rank {
    return rankFromPercent(this.progressPercent(), this.config.rankThreshold);
  }

  /** 理论满分（spec §6.4）：全程满连递增，与实际游玩共用 comboMultAt。 */
  private computeTheoreticalMax(): number {
    let total = 0;
    let combo = 0;
    for (const { note } of this.notes) {
      combo++;
      const base = this.config.baseScore[note.type] ?? 0;
      const cm = this.config.ladder ? comboMultAt(combo, this.config.ladder) : 1;
      total += base * 1.0 * cm;
    }
    return total;
  }

  feedInput(ev: InputEvent): void {
    this.pending.push(ev);
  }

  /** 推进到 now：先处理 ≤now 的输入，再 expire 已过窗口的 note。 */
  tick(now: number): void {
    if (this.state.status !== "playing") {
      this.state.now = now;
      return;
    }
    this.state.now = now;

    const due = this.pending
      .filter((e) => e.time <= now)
      .sort((a, b) => a.time - b.time);
    this.pending = this.pending.filter((e) => e.time > now);
    for (const ev of due) {
      if (this.state.status !== "playing") break;
      this.judgeInput(ev);
    }

    // expire：okMs 窗口已过仍未判定 → miss
    for (const nr of this.notes) {
      if (nr.judged) continue;
      if (this.state.status !== "playing") break;
      if (nr.note.time + this.config.window.okMs < now) {
        nr.judged = true;
        this.applyJudgement("miss", nr.note);
      }
    }

    this.evaluateGoal();
  }

  /** 胜负判定（spec §2.1 evaluateGoal）：rank-goal 在谱面打完后比 rank；survival 在 checkHp 内即时处理。 */
  private evaluateGoal(): void {
    if (this.state.status !== "playing") return;
    if (this.config.goal.kind !== "rank-goal") return;
    const allJudged = this.notes.every((nr) => nr.judged);
    if (!allJudged) return;
    const need = RANK_ORDER.indexOf(this.config.goal.minRank);
    const got = RANK_ORDER.indexOf(this.rank());
    // RANK_ORDER 高→低，下标越小等级越高：达标 = got <= need。
    this.state.status = got <= need ? "cleared" : "failed";
  }

  /** 匹配最近的可判定 note（同 lane + type，且在 okMs 窗口内），算 Timing。 */
  private judgeInput(ev: InputEvent): void {
    let best: NoteRuntime | null = null;
    let bestAbs = Infinity;
    for (const nr of this.notes) {
      if (nr.judged) continue;
      const n = nr.note;
      if (n.lane !== ev.lane || n.type !== ev.type) continue;
      const a = Math.abs(ev.time - n.time);
      if (a < bestAbs) {
        bestAbs = a;
        best = nr;
      }
    }
    if (!best) return; // 空击，不扣分

    const n = best.note;
    // flick 方向错 → miss、断 combo（spec §6.3）
    if (n.type === "flick" && ev.dir !== n.dir) {
      best.judged = true;
      this.applyJudgement("miss", n);
      return;
    }

    const head = judgeTiming(ev.time - n.time, this.config.window);
    if (head === null) return; // 不在窗口内，不消费

    best.judged = true;
    if (n.type === "hold") {
      const tailJ =
        this.config.tailJudge && n.duration !== undefined && ev.releaseTime !== undefined
          ? judgeTiming(ev.releaseTime - (n.time + n.duration), this.config.window) ?? "miss"
          : null;
      const coef = holdCoef(head, tailJ);
      this.applyScored(head, coef, n);
    } else {
      this.applyScored(head, timingCoef(head), n);
    }
  }

  /** 命中（非 miss）：按 coef 计分、推进 combo。 */
  private applyScored(judge: Judgement, coef: number, note: Note): void {
    const s = this.state;
    s.counts[judge]++;
    if (judge === "miss") {
      this.breakCombo();
      return;
    }
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const base = this.config.baseScore[note.type] ?? 0;
    const cm = this.config.ladder ? comboMultAt(s.combo, this.config.ladder) : 1;
    s.score += Math.round(base * coef * cm);
    if (this.config.goal.kind === "survival" && judge === "ok" && s.hp !== null) {
      s.hp -= this.config.goal.okDmg;
      this.checkHp();
    }
  }

  private applyJudgement(judge: Judgement, _note: Note): void {
    const s = this.state;
    s.counts[judge]++;
    if (judge === "miss") {
      this.breakCombo();
      if (this.config.goal.kind === "survival" && s.hp !== null) {
        s.hp -= this.config.goal.missDmg;
        this.checkHp();
      }
    }
  }

  private breakCombo(): void {
    this.state.combo = 0;
  }

  private checkHp(): void {
    if (this.state.hp !== null && this.state.hp <= 0) {
      this.state.hp = 0;
      this.state.status = "failed";
    }
  }
}

function findUse(uses: SystemUse[], id: string): SystemUse | undefined {
  return uses.find((u) => u.use === id);
}

function num(su: SystemUse | undefined, key: string, fallback: number): number {
  const v = su?.[key];
  return typeof v === "number" ? v : fallback;
}

/**
 * 把 RhythmDef 翻译成 EngineConfig 并实例化引擎（RhythmDef → EngineConfig → RhythmEngine）。
 * 读取 systems 里的 timing-window/base-score/combo-ladder/rank-threshold 与 goal/input-hold。
 */
export function createRhythmGame(def: RhythmDef, chart: Chart): RhythmEngine {
  const tw = findUse(def.systems, "timing-window");
  const window: TimingWindow = {
    perfectMs: num(tw, "perfectMs", 40),
    goodMs: num(tw, "goodMs", 90),
    okMs: num(tw, "okMs", 140),
  };

  const bs = findUse(def.systems, "base-score");
  const baseScore: Record<string, number> = {
    tap: num(bs, "tap", 100),
    hold: num(bs, "hold", 200),
    flick: num(bs, "flick", 150),
    special: num(bs, "special", 300),
  };

  const cl = findUse(def.systems, "combo-ladder");
  const ladder: ComboLadder | null = cl
    ? {
        n: num(cl, "n", 10),
        tiers: (cl.tiers as [number, number][] | undefined) ?? [
          [1, 1.1],
          [2, 1.2],
          [3, 1.5],
        ],
      }
    : null;

  const rt = findUse(def.systems, "rank-threshold");
  const rankThreshold: RankThreshold = {
    sss: num(rt, "sss", DEFAULT_RANK_THRESHOLD.sss),
    ss: num(rt, "ss", DEFAULT_RANK_THRESHOLD.ss),
    s: num(rt, "s", DEFAULT_RANK_THRESHOLD.s),
    a: num(rt, "a", DEFAULT_RANK_THRESHOLD.a),
    b: num(rt, "b", DEFAULT_RANK_THRESHOLD.b),
    c: num(rt, "c", DEFAULT_RANK_THRESHOLD.c),
  };

  const goal = translateGoal(def.goal);

  const holdUse = def.inputs.find((u) => u.use === "input-hold");
  const tailJudge = holdUse ? holdUse.tailJudge !== false : true;

  return new RhythmEngine(chart, { window, baseScore, ladder, rankThreshold, goal, tailJudge });
}

function translateGoal(g: SystemUse): Goal {
  switch (g.use) {
    case "survival":
      return {
        kind: "survival",
        hp: num(g, "hp", 100),
        missDmg: num(g, "missDmg", 10),
        okDmg: num(g, "okDmg", 3),
      };
    case "endless-score":
      return { kind: "endless-score" };
    case "rank-goal":
    default:
      return { kind: "rank-goal", minRank: (g.minRank as Rank) ?? "A" };
  }
}
