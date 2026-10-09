import type { ConversationState } from "@cq/conversation";

export interface ShareProfile {
  genres: string[];
  tags: string[];
}

/** 快照作用域的玩法图地址：只带快照 id，不把源会话 id 交给打开快照的人。 */
export function shareGameplayImagePath(shareId: string, mechanicId: string, stamp?: string): string {
  const q = stamp ? `?f=${encodeURIComponent(stamp)}` : "";
  return `/api/share/${shareId}/gameplay/${mechanicId}${q}`;
}

function labels(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row && typeof row === "object" ? String((row as { label?: unknown }).label || "").trim() : ""))
    .filter(Boolean);
}

/** 源会话已完成的游戏类型；没完成就不给。只读。 */
export function shareProfile(state: ConversationState): ShareProfile | undefined {
  const cls = state.gameClassification;
  if (!cls || cls.status !== "ready") return undefined;
  const profile = { genres: labels(cls.genres), tags: labels(cls.tags) };
  return profile.genres.length || profile.tags.length ? profile : undefined;
}
