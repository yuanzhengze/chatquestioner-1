import {
  pgTable, uuid, text, integer, jsonb, timestamp, index,
} from "drizzle-orm/pg-core";
import type { ConversationState } from "@cq/conversation";
import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { GameDef } from "@cq/orchestrator";
import type { CardSummary } from "./cardSummary.js";

/**
 * sessions —— 会话本体（替代 FileSessionStore 的 <id>.json）。
 * state 整体存 JSONB，便于续聊读写；列出来的几列是为「会话列表」做的轻量投影。
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 当前阶段 0..7，列出来便于列表过滤/排序 */
    stage: integer("stage").notNull().default(0),
    /** 工作标题投影（便于列表展示，避免下钻 state） */
    workingTitle: text("working_title"),
    /** 完整对话状态（ConversationState） */
    state: jsonb("state").$type<ConversationState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index("sessions_updated_idx").on(t.updatedAt),
  }),
);

/**
 * artifacts —— 每次 export 产出的「交接物」版本。
 * 一个 session 可多次 export，每次一条 artifact（version 自增），保留历史。
 * 卡片渲染只需读 cardSummary（JSONB 扁平字段）；详情可下钻 gddMarkdown/dsl/resolution/gamedef。
 */
export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** 同一 session 内自增版本号（1,2,3…） */
    version: integer("version").notNull().default(1),

    // —— 卡片渲染层（前端直读，无需解析下方原文） ——
    cardSummary: jsonb("card_summary").$type<CardSummary>().notNull(),

    // —— 原文产物层（详情/下游消费） ——
    /** GDD 的 Markdown 全文 */
    gddMarkdown: text("gdd_markdown").notNull(),
    /** 结构化游戏定义 */
    dsl: jsonb("dsl").$type<GameDSL>().notNull(),
    /** catalog 解析结果（模板/技能/MCP/安装包投影） */
    resolution: jsonb("resolution").$type<ResolutionResult>().notNull(),
    /** 可运行引擎定义；仅支持品类（如 match-3）才有，否则 null */
    gamedef: jsonb("gamedef").$type<GameDef | null>(),
    /** 文件落盘目录（双写兼容；DB 为索引层时仍指向 data/exports/<id>） */
    exportDir: text("export_dir"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("artifacts_session_idx").on(t.sessionId),
    createdIdx: index("artifacts_created_idx").on(t.createdAt),
  }),
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type NewArtifactRow = typeof artifacts.$inferInsert;
