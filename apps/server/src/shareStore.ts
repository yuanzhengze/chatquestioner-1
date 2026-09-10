import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

/** 结果页分享快照。v1 只有文档；以后可加封面 URL、交互状态，path 仍用分享 id。 */
export interface ResultShare {
  v: 1;
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
}

export interface ShareStore {
  create(input: { title: string; markdown: string }): Promise<ResultShare>;
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

  async create(input: { title: string; markdown: string }): Promise<ResultShare> {
    mkdirSync(this.dir, { recursive: true });
    const id = randomUUID();
    const row: ResultShare = {
      v: 1,
      id,
      title: input.title,
      markdown: input.markdown,
      createdAt: Date.now(),
    };
    writeFileSync(this.path(id), JSON.stringify(row, null, 2) + "\n");
    return row;
  }

  async load(id: string): Promise<ResultShare | null> {
    if (!SAFE_SHARE_ID.test(id)) return null;
    const p = this.path(id);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as ResultShare;
    } catch (err) {
      console.warn(`[shareStore] 分享文件损坏，无法解析 (id=${id}):`, err);
      return null;
    }
  }
}
