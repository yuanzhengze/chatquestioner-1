import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationState } from "@cq/conversation";

export interface SessionStore {
  create(state: ConversationState): Promise<string>;
  load(id: string): Promise<ConversationState | null>;
  save(id: string, state: ConversationState): Promise<void>;
}

/** 把每个会话状态落盘为 <dataDir>/sessions/<id>.json，可续聊。 */
export class FileSessionStore implements SessionStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = resolve(dataDir, "sessions");
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async create(state: ConversationState): Promise<string> {
    const id = randomUUID();
    await this.save(id, state);
    return id;
  }

  async load(id: string): Promise<ConversationState | null> {
    const p = this.path(id);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as ConversationState;
    } catch {
      return null;
    }
  }

  async save(id: string, state: ConversationState): Promise<void> {
    writeFileSync(this.path(id), JSON.stringify(state, null, 2) + "\n");
  }
}
