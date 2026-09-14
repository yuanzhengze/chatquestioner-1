import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
}

export interface ShareStore {
  create(input: {
    title: string;
    markdown: string;
    model?: unknown;
    complete?: boolean;
  }): Promise<ResultShare>;
  load(id: string): Promise<ResultShare | null>;
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
  }): Promise<ResultShare> {
    mkdirSync(this.dir, { recursive: true });
    const id = randomUUID();
    const hasModel = input.model != null && typeof input.model === "object";
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
}
