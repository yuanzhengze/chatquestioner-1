import { createGame, bejeweled, candyCollect, validate, type GameDef } from "@cq/orchestrator";
import type { MatchEngine, Pos } from "@cq/modules";
import { fetchSessionGameDef } from "./loadSession.js";

const TILE_COLORS: Record<string, string> = {
  white: "#e8eaed",
  red: "#ef4444",
  yellow: "#facc15",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  orange: "#f97316",
};

const DEFS: Record<string, GameDef> = { "candy-collect": candyCollect, bejeweled };

const CELL = 56;
const GAP = 4;
const PAD = 8;

const canvas = document.getElementById("board") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $score = document.getElementById("score")!;
const $moves = document.getElementById("moves")!;
const $goal = document.getElementById("goal")!;
const $status = document.getElementById("status")!;
const $game = document.getElementById("game") as HTMLSelectElement;
const $reset = document.getElementById("reset") as HTMLButtonElement;

let engine: MatchEngine;
let selected: Pos | null = null;
let loadedDef: GameDef | null = null;

function activeDef(): GameDef {
  return loadedDef ?? DEFS[$game.value];
}

function cellXY(r: number, c: number): [number, number] {
  return [PAD + c * (CELL + GAP), PAD + r * (CELL + GAP)];
}

function roundRect(x: number, y: number, w: number, h: number, rad: number) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function render() {
  const s = engine.getState();
  canvas.width = PAD * 2 + s.width * (CELL + GAP) - GAP;
  canvas.height = PAD * 2 + s.height * (CELL + GAP) - GAP;

  ctx.fillStyle = "#161a21";
  roundRect(0, 0, canvas.width, canvas.height, 12);
  ctx.fill();

  for (let r = 0; r < s.height; r++) {
    for (let c = 0; c < s.width; c++) {
      const tile = s.board[r][c];
      const [x, y] = cellXY(r, c);
      ctx.fillStyle = tile ? (TILE_COLORS[tile] ?? "#777") : "#222";
      roundRect(x, y, CELL, CELL, 10);
      ctx.fill();
      if (selected && selected.r === r && selected.c === c) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
        ctx.stroke();
      }
    }
  }

  $score.textContent = String(s.score);
  $moves.textContent = s.movesLeft === null ? "∞" : String(s.movesLeft);
  $goal.textContent = goalText();
  $status.textContent = s.status === "won" ? "🎉 通关！" : s.status === "lost" ? "💀 失败" : "进行中…";
  $status.className = s.status === "won" ? "won" : s.status === "lost" ? "lost" : "";
}

function goalText(): string {
  const def = activeDef();
  const goal = def.goal;
  if ("collect" in goal && goal.collect) {
    const s = engine.getState();
    return Object.entries(goal.collect as Record<string, number>)
      .map(([color, n]) => `目标 收集 ${color} ${Math.min(s.collected[color] ?? 0, n)}/${n}`)
      .join("  ");
  }
  if ("score" in goal) return `目标 ${goal.score === "endless" ? "无尽计分" : `${goal.score} 分`}`;
  return "目标 –";
}

function posFromEvent(ev: MouseEvent): Pos | null {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left - PAD;
  const py = ev.clientY - rect.top - PAD;
  const c = Math.floor(px / (CELL + GAP));
  const r = Math.floor(py / (CELL + GAP));
  const s = engine.getState();
  if (r < 0 || c < 0 || r >= s.height || c >= s.width) return null;
  return { r, c };
}

function onClick(ev: MouseEvent) {
  if (engine.getState().status !== "playing") return;
  const p = posFromEvent(ev);
  if (!p) return;
  if (!selected) {
    selected = p;
  } else if (selected.r === p.r && selected.c === p.c) {
    selected = null;
  } else {
    engine.trySwap(selected, p);
    selected = null;
  }
  render();
}

function start() {
  const def = activeDef();
  if (!loadedDef) {
    const errs = validate(def);
    if (errs.length) {
      $status.textContent = "编排校验失败：" + errs.map((e) => e.message).join(" / ");
      return;
    }
  }
  engine = createGame({ ...def, seed: (Math.random() * 1e9) | 0 });
  selected = null;
  render();
}

const $session = document.getElementById("session") as HTMLInputElement;
const $load = document.getElementById("load") as HTMLButtonElement;

async function loadFromSession() {
  const id = $session.value.trim();
  if (!id) return;
  $status.textContent = "加载中…";
  const r = await fetchSessionGameDef(id);
  if (!r.def) {
    $status.textContent = "加载失败：" + r.error;
    return;
  }
  loadedDef = r.def;
  engine = createGame({ ...loadedDef, seed: (Math.random() * 1e9) | 0 });
  selected = null;
  render();
}

$load.addEventListener("click", loadFromSession);

canvas.addEventListener("click", onClick);
$reset.addEventListener("click", start);
$game.addEventListener("change", () => { loadedDef = null; });
$game.addEventListener("change", start);
start();
