import { asGddText, type GddModel } from "./model.js";
import { fnv1aHex, gameplayMomentsFromModel, type GameplayMoment } from "./view.js";

export type GameplayImageStatus = "idle" | "queued" | "pending" | "ready" | "failed" | "stale";

function norm(raw: unknown): string {
  return asGddText(raw).replace(/\s+/g, " ").trim();
}

/** 封面和玩法图共用的视觉设定。只收已确认字段，空项省略，顺序固定。 */
export function visualBibleFromModel(m: GddModel): string {
  const lines: string[] = [];
  const world = norm(m.world);
  if (world) lines.push(`世界：${world}`);
  const who = norm(m.playerIdentity);
  if (who) lines.push(`主角：${who}`);
  const fantasy = norm(m.constitution?.coreFantasy) || norm(m.coreFantasy);
  if (fantasy) lines.push(`幻想：${fantasy}`);
  const art = norm(m.aesthetic) || norm(m.constitution?.artRule);
  if (art) lines.push(`美术：${art}`);
  const visual = (m.keywordPools?.visual || []).map(norm).filter(Boolean);
  if (visual.length) lines.push(`色彩与材质：${visual.join("、")}`);
  const pres = [norm(m.presentation?.where), norm(m.presentation?.dimension), norm(m.presentation?.orientation)].filter(Boolean);
  if (pres.length) lines.push(`呈现：${pres.join("，")}`);
  return lines.join("\n");
}

export function visualBibleFingerprint(m: GddModel): string {
  return fnv1aHex(visualBibleFromModel(m));
}

export function gameplayImageFingerprint(moment: Pick<GameplayMoment, "id" | "title" | "description">, bibleFp: string): string {
  return fnv1aHex([moment.id, norm(moment.title), norm(moment.description), bibleFp].join("\n"));
}

/** 玩法过程的一瞬，不是封面主视觉。 */
export function gameplayImagePrompt(m: GddModel, moment: Pick<GameplayMoment, "title" | "description">): string {
  const bible = visualBibleFromModel(m);
  const title = norm(moment.title);
  const description = norm(moment.description);
  const action = description ? `${title}\n${description}` : title;
  const lines = [
    "16:9 horizontal gameplay screenshot composition.",
    "Compose this as a wide 16:9 gameplay screenshot. The generated source image may use a slightly taller aspect ratio, but the final image will be center-cropped to 16:9. Keep all essential gameplay information, player actions, interactive objects, characters, feedback effects, and focal subjects inside the central 16:9 safe area. Treat the top and bottom edges as expendable crop areas. Do not place essential information near the top or bottom edges.",
    "Wide horizontal composition, gameplay camera, environmental context extending to the left and right. No square composition, no centered poster composition, no portrait-like framing.",
    "This is an in-game screenshot of an active gameplay moment happening now: the player action, the object being acted on, and the visible gameplay consequence. Not a poster, key art, promotional illustration, product shot, centered composition, isolated object, character portrait, empty landscape, or moodboard.",
    "No text, no Chinese characters, no captions, no title, no logo, no tutorial arrows, no instructional overlay, no infographic, no phone frame, no multi-panel layout. Do not draw a tutorial card that explains the mechanic.",
    "除非这一下玩法离开游戏内界面就完全无法看懂，否则不要画 HUD。不要画出下面没有写到的武器、角色或规则。",
    "",
    "视觉设定（和这款游戏的封面保持同一个世界、同一种画法）：",
    bible || "（视觉设定未单列，按这一下玩法本身来画，不要另起一种风格。）",
    "",
    "这一下要画清楚的玩法：",
    action,
    "",
    "画面要横着展开：左右有正在发生的游戏空间，关键的手、角色、操作对象和反馈都放在画面中部，不要贴上沿或下沿。",
  ];
  return lines.join("\n");
}

export function rebindGameplayLineup(
  lineup: string[],
  currentIds: string[],
  itemIds: string[],
): Array<{ from: string; to: string }> {
  const current = new Set(currentIds);
  const have = new Set(itemIds);
  const orphans = lineup.filter((id) => id && !current.has(id) && have.has(id));
  const fresh = currentIds.filter((id) => id && !have.has(id));
  if (orphans.length === 1 && fresh.length === 1) {
    return [{ from: orphans[0], to: fresh[0] }];
  }
  const moves: Array<{ from: string; to: string }> = [];
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();
  const n = Math.max(lineup.length, currentIds.length);
  for (let i = 0; i < n; i++) {
    const from = lineup[i];
    const to = currentIds[i];
    if (!from || !to || from === to) continue;
    if (current.has(from) || have.has(to)) continue;
    if (!have.has(from) || usedFrom.has(from) || usedTo.has(to)) continue;
    moves.push({ from, to });
    usedFrom.add(from);
    usedTo.add(to);
  }
  return moves;
}

export function presentGameplayStatus(
  record: { status?: string; fingerprint?: string } | null | undefined,
  hasFile: boolean,
  currentFingerprint: string,
): GameplayImageStatus {
  if (!record || !record.fingerprint) return "idle";
  const same = record.fingerprint === currentFingerprint;
  const status = record.status;
  if (same) {
    if (status === "queued") return "queued";
    if (status === "pending") return "pending";
    if (status === "failed") return "failed";
    if ((status === "ready" || status === "stale") && hasFile) return "ready";
    return "idle";
  }
  if (hasFile && (status === "ready" || status === "stale" || status === "failed" || status === "pending" || status === "queued")) {
    return "stale";
  }
  return "idle";
}

export function currentGameplayMoments(m: GddModel): GameplayMoment[] {
  return gameplayMomentsFromModel(m);
}
