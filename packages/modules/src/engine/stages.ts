import type { Board, Pos } from "./state.js";
import { pick } from "./rng.js";

/** 纯函数 stage 集合：每个对应 docs/09 §6.2 的一个系统模块。 */

/** match-detect：找出所有横/竖 ≥ minLine 的同色连续段。 */
export function findMatches(board: Board, minLine: number): Pos[] {
  const h = board.length;
  const w = board[0]?.length ?? 0;
  const hit = new Set<string>();

  const scan = (line: Pos[]) => {
    let run: Pos[] = [];
    let color: string | null = null;
    const flush = () => {
      if (color !== null && run.length >= minLine) {
        for (const p of run) hit.add(`${p.r},${p.c}`);
      }
    };
    for (const p of line) {
      const t = board[p.r][p.c];
      if (t !== null && t === color) {
        run.push(p);
      } else {
        flush();
        color = t;
        run = t === null ? [] : [p];
      }
    }
    flush();
  };

  for (let r = 0; r < h; r++) scan(Array.from({ length: w }, (_, c) => ({ r, c })));
  for (let c = 0; c < w; c++) scan(Array.from({ length: h }, (_, r) => ({ r, c })));

  return [...hit].map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  });
}

/** clear-resolve：清除给定位置，返回按色统计的清除数。 */
export function clearTiles(board: Board, positions: Pos[]): Record<string, number> {
  const byColor: Record<string, number> = {};
  for (const { r, c } of positions) {
    const t = board[r][c];
    if (t !== null) byColor[t] = (byColor[t] ?? 0) + 1;
    board[r][c] = null;
  }
  return byColor;
}

/**
 * clear-resolve.clearsLayer：清除被匹配元素的同时，命中格若有覆盖层则减 1（归零置 null）。
 * 语义见 spec §5.3：匹配命中处糖被消、若有层则同时 -1 层。
 */
export function clearTilesWithLayer(
  board: Board,
  layers: (number | null)[][],
  positions: Pos[],
): Record<string, number> {
  const byColor: Record<string, number> = {};
  for (const { r, c } of positions) {
    const t = board[r][c];
    if (t !== null) byColor[t] = (byColor[t] ?? 0) + 1;
    board[r][c] = null;
    const lv = layers[r][c];
    if (typeof lv === "number" && lv > 0) {
      layers[r][c] = lv > 1 ? lv - 1 : null;
    }
  }
  return byColor;
}

/** gravity-fall：每列非空元素下沉到底，空位升到顶。 */
export function applyGravity(board: Board): void {
  const h = board.length;
  const w = board[0]?.length ?? 0;
  for (let c = 0; c < w; c++) {
    const col: string[] = [];
    for (let r = h - 1; r >= 0; r--) {
      const t = board[r][c];
      if (t !== null) col.push(t);
    }
    for (let r = h - 1, i = 0; r >= 0; r--, i++) {
      board[r][c] = i < col.length ? col[i] : null;
    }
  }
}

/** refill-spawn：用随机色填满顶部空位。 */
export function refill(board: Board, tiles: string[], rng: () => number): void {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c] === null) board[r][c] = pick(rng, tiles);
    }
  }
}

/** board-grid：生成无预成匹配的初始棋盘。 */
export function generateBoard(
  w: number,
  h: number,
  tiles: string[],
  rng: () => number,
): Board {
  const board: Board = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const banned = new Set<string>();
      if (c >= 2 && board[r][c - 1] === board[r][c - 2]) banned.add(board[r][c - 1] as string);
      if (r >= 2 && board[r - 1][c] === board[r - 2][c]) banned.add(board[r - 1][c] as string);
      const choices = tiles.filter((t) => !banned.has(t));
      board[r][c] = pick(rng, choices.length ? choices : tiles);
    }
  }
  return board;
}

export function swap(board: Board, a: Pos, b: Pos): void {
  const tmp = board[a.r][a.c];
  board[a.r][a.c] = board[b.r][b.c];
  board[b.r][b.c] = tmp;
}

export function adjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** shuffle-deadlock：枚举所有相邻交换，是否存在能成匹配的一步。 */
export function hasLegalMove(board: Board, minLine: number): boolean {
  const h = board.length;
  const w = board[0]?.length ?? 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= h || nc >= w) continue;
        const a = { r, c };
        const b = { r: nr, c: nc };
        swap(board, a, b);
        const ok = findMatches(board, minLine).length > 0;
        swap(board, a, b);
        if (ok) return true;
      }
    }
  }
  return false;
}

/** 重洗：打散现有元素直到无预成匹配且存在合法步。 */
export function shuffleBoard(board: Board, tiles: string[], minLine: number, rng: () => number): void {
  const h = board.length;
  const w = board[0]?.length ?? 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const flat: string[] = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) flat.push((board[r][c] ?? pick(rng, tiles)) as string);
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    let k = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) board[r][c] = flat[k++];
    if (findMatches(board, minLine).length === 0 && hasLegalMove(board, minLine)) return;
  }
}
