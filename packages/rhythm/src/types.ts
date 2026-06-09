/**
 * 音游数据契约（rhythm_game_dsl_spec §1、§3.1）。
 * P0 形态：RhythmDef 用 TS 对象字面量（与 match-3 GameDef 同范式）。
 */

export type NoteType = "tap" | "hold" | "flick" | "special";
export type FlickDir = "left" | "right" | "up" | "down";
export type Judgement = "perfect" | "good" | "ok" | "miss";

/** 单个按钮/音符。 */
export interface Note {
  id: string;
  time: number; // 命中目标时刻（ms，相对曲目起点）
  lane: number; // 0-based；单轨恒为 0
  type: NoteType;
  dir?: FlickDir; // 仅 flick 必填
  duration?: number; // 仅 hold 必填（ms）
}

/** 谱面 = 引擎输入数据（由 hook/手写/算法产出，不由 DSL 描述）。 */
export interface Chart {
  songId: string;
  bpm: number;
  durationMs: number;
  difficulty: "easy" | "normal" | "hard";
  laneCount: number;
  notes: Note[]; // 按 time 升序
}

export type GameStatus = "playing" | "cleared" | "failed";

export interface RhythmState {
  now: number;
  score: number;
  combo: number;
  maxCombo: number;
  hp: number | null; // 仅 survival；否则 null
  counts: Record<Judgement, number>;
  status: GameStatus;
}

/** 输入事件（绝对时间戳模型，§6.1）。 */
export interface InputEvent {
  time: number; // inputTime，ms
  lane: number;
  type: NoteType;
  dir?: FlickDir; // flick 输入方向
  /** hold 松手时刻（ms）；仅当 type=hold 时有意义 */
  releaseTime?: number;
}

/** 引用一个 L1 模块并传参：{ use: 模块id, ...params }。 */
export type SystemUse = { use: string } & Record<string, unknown>;

/** 逃生舱：指向手写 hook（如谱面生成）。 */
export type HookRef = { hook: string };
export function hook(name: string): HookRef {
  return { hook: name };
}
export function isHook(x: unknown): x is HookRef {
  return typeof x === "object" && x !== null && "hook" in x;
}

export type Rule = { when: string; then: string | HookRef };

/** 顶层音游编排 DSL（spec §3.1）。 */
export interface RhythmDef {
  id: string;
  track: SystemUse; // track-layout
  notes: SystemUse | HookRef; // note-source：chart 静态 或 hook 生成
  inputs: SystemUse[]; // input-tap/hold/flick/special
  systems: SystemUse[]; // timing-window/base-score/combo-ladder/rank-threshold
  goal: SystemUse; // rank-goal / survival / endless-score
  rules: Rule[];
}
