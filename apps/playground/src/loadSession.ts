import { validate, type GameDef } from "@cq/orchestrator";

export interface LoadResult {
  def: GameDef | null;
  error?: string;
}

/** 把任意 JSON 当作 GameDef 校验：validate 通过才放行，否则回 error。 */
export function gameDefFromJson(json: unknown): LoadResult {
  if (typeof json !== "object" || json === null) return { def: null, error: "不是对象" };
  const def = json as GameDef;
  if (!def.board || !def.input || !Array.isArray(def.systems) || !def.goal) {
    return { def: null, error: "缺少 GameDef 必需字段" };
  }
  const errors = validate(def);
  if (errors.length > 0) return { def: null, error: errors.map((e) => e.message).join("; ") };
  return { def };
}

/** 从 server 拉取某 session 已导出的 gamedef。 */
export async function fetchSessionGameDef(id: string): Promise<LoadResult> {
  let res: Response;
  try {
    res = await fetch(`/api/session/${encodeURIComponent(id)}/gamedef`);
  } catch {
    return { def: null, error: "无法连接服务端（请确认 server 已启动）" };
  }
  if (!res.ok) return { def: null, error: `加载失败 (${res.status})，请先在对话端导出` };
  try {
    return gameDefFromJson(await res.json());
  } catch (e) {
    return { def: null, error: e instanceof Error ? e.message : String(e) };
  }
}
