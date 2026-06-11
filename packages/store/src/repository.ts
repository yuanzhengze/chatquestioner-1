import { eq, desc, sql } from "drizzle-orm";
import type { ConversationState } from "@cq/conversation";
import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { GameDef } from "@cq/orchestrator";
import type { Database } from "./db.js";
import { sessions, artifacts, type SessionRow, type ArtifactRow } from "./schema.js";
import { buildCardSummary, type CardSummary } from "./cardSummary.js";

export interface CreateArtifactInput {
  sessionId: string;
  state: ConversationState;
  gddMarkdown: string;
  dsl: GameDSL;
  resolution: ResolutionResult;
  gamedef: GameDef | null;
  exportDir?: string;
}

/** 卡片列表项：列表页只取 cardSummary + 少量元数据，避免拉回大 JSON。 */
export interface ArtifactCard {
  id: string;
  sessionId: string;
  version: number;
  card: CardSummary;
  createdAt: Date;
}

/** 会话列表项：后台列表只取轻量投影，不回完整 state。 */
export interface SessionSummary {
  id: string;
  stage: number;
  workingTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** 该会话已产出的 artifact 数量 */
  artifactCount: number;
}

/** 数据访问层：会话与产出物的读写。无业务逻辑，纯持久化。 */
export class Repository {
  constructor(private readonly db: Database) {}

  // —— sessions ——

  async createSession(state: ConversationState): Promise<string> {
    const [row] = await this.db
      .insert(sessions)
      .values({ state, stage: state.stage, workingTitle: state.workingTitle ?? null })
      .returning({ id: sessions.id });
    return row.id;
  }

  /** 按指定 id 插入（id 已在 /api/session 端点生成）。用于首句 lazy 落库，幂等。 */
  async createSessionWithId(id: string, state: ConversationState): Promise<void> {
    await this.db
      .insert(sessions)
      .values({ id, state, stage: state.stage, workingTitle: state.workingTitle ?? null })
      .onConflictDoNothing({ target: sessions.id });
  }

  async loadSession(id: string): Promise<ConversationState | null> {
    const [row] = await this.db.select({ state: sessions.state }).from(sessions).where(eq(sessions.id, id));
    return row?.state ?? null;
  }

  async saveSession(id: string, state: ConversationState): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        state,
        stage: state.stage,
        workingTitle: state.workingTitle ?? null,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, id));
  }

  async listSessions(limit = 50): Promise<SessionRow[]> {
    return this.db.select().from(sessions).orderBy(desc(sessions.updatedAt)).limit(limit);
  }

  /** 后台会话列表：轻量投影 + 每会话的 artifact 计数，不回完整 state。 */
  async listSessionSummaries(limit = 100): Promise<SessionSummary[]> {
    const rows = await this.db
      .select({
        id: sessions.id,
        stage: sessions.stage,
        workingTitle: sessions.workingTitle,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        artifactCount: sql<number>`count(${artifacts.id})`,
      })
      .from(sessions)
      .leftJoin(artifacts, eq(artifacts.sessionId, sessions.id))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.updatedAt))
      .limit(limit);
    // count() 在 pg 返回 string/bigint，统一成 number。
    return rows.map((r) => ({ ...r, artifactCount: Number(r.artifactCount) }));
  }

  /** 后台会话详情：完整 state + 该会话全部 artifact 卡片。 */
  async getSessionDetail(id: string): Promise<{ session: SessionRow; artifacts: ArtifactCard[] } | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    if (!row) return null;
    const arts = await this.listArtifactsForSession(id);
    return { session: row, artifacts: arts };
  }

  // —— artifacts ——

  /** 写入一次 export 产物，version 在同一 session 内自增。返回完整行。 */
  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRow> {
    const card = buildCardSummary({
      state: input.state,
      dsl: input.dsl,
      resolution: input.resolution,
      gamedef: input.gamedef,
    });

    const [{ next }] = await this.db
      .select({ next: sql<number>`coalesce(max(${artifacts.version}), 0) + 1` })
      .from(artifacts)
      .where(eq(artifacts.sessionId, input.sessionId));

    const [row] = await this.db
      .insert(artifacts)
      .values({
        sessionId: input.sessionId,
        version: next,
        cardSummary: card,
        gddMarkdown: input.gddMarkdown,
        dsl: input.dsl,
        resolution: input.resolution,
        gamedef: input.gamedef,
        exportDir: input.exportDir ?? null,
      })
      .returning();
    return row;
  }

  /** 卡片列表（全局，按时间倒序）。只回 cardSummary + 元数据。 */
  async listArtifactCards(limit = 50): Promise<ArtifactCard[]> {
    const rows = await this.db
      .select({
        id: artifacts.id,
        sessionId: artifacts.sessionId,
        version: artifacts.version,
        card: artifacts.cardSummary,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .orderBy(desc(artifacts.createdAt))
      .limit(limit);
    return rows;
  }

  /** 某 session 的全部产出版本（按 version 倒序）。 */
  async listArtifactsForSession(sessionId: string): Promise<ArtifactCard[]> {
    const rows = await this.db
      .select({
        id: artifacts.id,
        sessionId: artifacts.sessionId,
        version: artifacts.version,
        card: artifacts.cardSummary,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .where(eq(artifacts.sessionId, sessionId))
      .orderBy(desc(artifacts.version));
    return rows;
  }

  /** 产出物详情（含全部原文产物）。 */
  async getArtifact(id: string): Promise<ArtifactRow | null> {
    const [row] = await this.db.select().from(artifacts).where(eq(artifacts.id, id));
    return row ?? null;
  }
}
