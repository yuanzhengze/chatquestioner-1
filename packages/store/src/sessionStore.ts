import type { ConversationState } from "@cq/conversation";
import type { Repository } from "./repository.js";

/**
 * 结构与 apps/server 的 SessionStore 接口一致，用 Postgres 落地。
 * 替换 FileSessionStore：会话状态进 sessions 表（state JSONB）。
 */
export class PgSessionStore {
  constructor(private readonly repo: Repository) {}

  async create(state: ConversationState): Promise<string> {
    return this.repo.createSession(state);
  }

  /** 按指定 id 创建（首句 lazy 落库用）。 */
  async createWithId(id: string, state: ConversationState): Promise<void> {
    await this.repo.createSessionWithId(id, state);
  }

  async load(id: string): Promise<ConversationState | null> {
    return this.repo.loadSession(id);
  }

  async save(id: string, state: ConversationState): Promise<void> {
    await this.repo.saveSession(id, state);
  }
}
