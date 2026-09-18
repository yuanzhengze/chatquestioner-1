import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

/** 结果页分享快照。v1 只有 markdown；v2 可带结构化 model，供章节卡。旧文件仍能打开。 */
export interface ResultShare {
  v: 1 | 2;
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  model?: unknown;
  complete?: boolean;
  /** 新快照才有。没有的旧文件跟不了会话更新，不迁。 */
  sessionId?: string;
}

export interface ShareStore {
  create(input: {
    title: string;
    markdown: string;
    model?: unknown;
    complete?: boolean;
    sessionId?: string;
  }): Promise<ResultShare>;
  load(id: string): Promise<ResultShare | null>;
  listBySession(sessionId: string): Promise<ResultShare[]>;
  update(id: string, patch: {
    title?: string;
    markdown?: string;
    model?: unknown;
    complete?: boolean;
  }): Promise<ResultShare | null>;
}

const SAFE_SHARE_ID = /^[A-Za-z0-9_-]+$/;

export class FileShareStore implements ShareStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = resolve(dataDir, "shares");
  }

  private path(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async create(input: {
    title: string;
    markdown: string;
    model?: unknown;
    complete?: boolean;
    sessionId?: string;
  }): Promise<ResultShare> {
    mkdirSync(this.dir, { recursive: true });
    const id = randomUUID();
    const hasModel = input.model != null && typeof input.model === "object";
    const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    const row: ResultShare = {
      v: hasModel ? 2 : 1,
      id,
      title: input.title,
      markdown: input.markdown,
      createdAt: Date.now(),
    };
    if (hasModel) {
      row.model = input.model;
      row.complete = input.complete === true;
    }
    if (SAFE_SHARE_ID.test(sessionId)) row.sessionId = sessionId;
    writeFileSync(this.path(id), JSON.stringify(row, null, 2) + "\n");
    return row;
  }

  async load(id: string): Promise<ResultShare | null> {
    if (!SAFE_SHARE_ID.test(id)) return null;
    const p = this.path(id);
    if (!existsSync(p)) return null;
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as ResultShare;
      if (!raw || typeof raw.markdown !== "string") return null;
      return raw;
    } catch (err) {
      console.warn(`[shareStore] 分享文件损坏，无法解析 (id=${id}):`, err);
      return null;
    }
  }

  async listBySession(sessionId: string): Promise<ResultShare[]> {
    const sid = String(sessionId || "").trim();
    if (!SAFE_SHARE_ID.test(sid) || !existsSync(this.dir)) return [];
    const out: ResultShare[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith(".json")) continue;
      const row = await this.load(name.slice(0, -5));
      if (row && row.sessionId === sid) out.push(row);
    }
    return out;
  }

  async update(id: string, patch: {
    title?: string;
    markdown?: string;
    model?: unknown;
    complete?: boolean;
  }): Promise<ResultShare | null> {
    const row = await this.load(id);
    if (!row) return null;
    if (typeof patch.title === "string" && patch.title.trim()) row.title = patch.title.trim().slice(0, 40);
    if (typeof patch.markdown === "string" && patch.markdown.trim()) row.markdown = patch.markdown;
    if (patch.model != null && typeof patch.model === "object") {
      row.model = patch.model;
      row.v = 2;
    }
    if (typeof patch.complete === "boolean") row.complete = patch.complete;
    writeFileSync(this.path(row.id), JSON.stringify(row, null, 2) + "\n");
    return row;
  }
}
