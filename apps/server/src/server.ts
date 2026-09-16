import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  advance, createInitialState, toGddModel, normalizeConversationState,
  harvestIntoState, scrubUngroundedState, OPENING_MESSAGE, STAGE_ASKS_TITLE, STAGE_LABELS, historyWantsPreview,
  showDraftBar,
  type ConversationState, type LlmClient, type Retriever,
} from "@cq/conversation";
import { renderGdd, isSubstantive, isComplete, type GddModel } from "@cq/gdd";
import type { Repository } from "@cq/store";
import type { SessionStore } from "./sessionStore.js";
import { FileShareStore, type ShareStore, type ResultShare } from "./shareStore.js";
import { initSse, sendEvent, endSse } from "./sse.js";
import { SSE_EVENTS } from "./wire.js";

export interface ServerDeps {
  llm: LlmClient;
  store: SessionStore;
  /** 测试占位。生产走 skillDir。 */
  systemPrompt?: string;
  skillDir?: string;
  /** 可选：对话期知识检索器（缺省则不注入知识）。 */
  retrieve?: Retriever;
  /** 导出 bundle 落盘根目录，默认 ./data/exports */
  exportDir?: string;
  /** 可选：DB 仓库。配置后 export 双写入库 + 启用卡片/后台 API。 */
  repo?: Repository;
  /** 可选：前端构建产物目录（apps/web/dist）。配置后托管主站 + /admin。 */
  webDir?: string;
  /** 形象海报目录。配置后挂 /avatar/*，供小程序远程拉 PNG。 */
  avatarDir?: string;
  /** 结果页分享快照目录的父目录（其下 shares/）。缺省 ./data */
  shareDir?: string;
}

interface Synthesis {
  gddMarkdown: string;
  gddModel: GddModel;
  complete: boolean;
  draftBar: boolean;
}

/** 有实质内容即可渲染。complete 是 completeness 账；draftBar 才决定预览顶上的草稿条。 */
function buildSynthesis(state: ConversationState, opts?: { requireComplete?: boolean }): Synthesis | null {
  const model = toGddModel(state);
  if (!isSubstantive(model)) return null;
  const complete = isComplete(model);
  if (opts?.requireComplete && !complete) return null;
  return {
    gddMarkdown: renderGdd(model),
    gddModel: model,
    complete,
    draftBar: showDraftBar(state),
  };
}

/** 合法 session id：仅字母数字、下划线、连字符（randomUUID 输出可通过）。防路径穿越。 */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const MAX_SHARE_MD = 200_000;

function titleFromMarkdown(md: string, fallback?: string): string {
  const fromBody = typeof fallback === "string" ? fallback.trim() : "";
  if (fromBody) return fromBody.slice(0, 40);
  const m = md.match(/^#\s+(.+)$/m);
  const t = (m ? m[1].trim() : "") || "未命名游戏";
  return t.slice(0, 40);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function publicShare(row: ResultShare) {
  const out: {
    v: 1 | 2;
    id: string;
    title: string;
    markdown: string;
    model?: unknown;
    complete?: boolean;
  } = { v: row.v === 2 ? 2 : 1, id: row.id, title: row.title, markdown: row.markdown };
  if (out.v === 2 && row.model != null) {
    out.model = row.model;
    out.complete = row.complete === true;
  }
  return out;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const exportRoot = deps.exportDir ?? resolve(process.cwd(), "data", "exports");
  const shareStore: ShareStore = new FileShareStore(deps.shareDir ?? resolve(process.cwd(), "data"));

  // 微信小程序 wx.request POST 默认带 application/json 且 body 为空，
  // Fastify 默认会 400（FST_ERR_CTP_EMPTY_JSON_BODY）。空串按 {} 解析。
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const text = typeof body === "string" ? body.trim() : "";
      if (!text) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  app.get("/api/health", async () => ({ ok: true }));

  // 小程序 / 开发期不依赖 web dist：单独挂形象海报。
  if (deps.avatarDir && existsSync(deps.avatarDir)) {
    app.register(fastifyStatic, {
      root: deps.avatarDir,
      prefix: "/avatar/",
      decorateReply: false,
    });
  }

  // 不再立即落库：只生成 id + 开场白。空会话（用户从未发言）不入库。
  // 真正的持久化推迟到首句 /message（见下方 lazy 创建）。
  // 同意门在用户说出想法之后由 advance 给出，不在开场白里问。
  app.post("/api/session", async () => {
    const id = randomUUID();
    return { id, opening: OPENING_MESSAGE };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id", async (req, reply) => {
    const loaded = await deps.store.load(req.params.id);
    if (!loaded) return reply.code(404).send({ error: "session not found" });
    const state = normalizeConversationState(loaded);
    // GET 只做确定性回收，不调抽取 LLM（微信 20s）。抽取只在用户要文档的那一轮 advance 里跑并落盘。
    harvestIntoState(state);
    scrubUngroundedState(state);
    const model = toGddModel(state);
    const complete = isComplete(model);
    state.gddComplete = complete;
    state.readyForSynthesis = isSubstantive(model) && historyWantsPreview(state.history);
    state.gddDraftBar = showDraftBar(state);
    const syn = (() => {
      if (!state.readyForSynthesis) return null;
      try {
        return buildSynthesis(state);
      } catch (err) {
        console.error("[server] GET synthesis failed:", err);
        return null;
      }
    })();
    if (!syn) return state;
    return { ...state, gddMarkdown: syn.gddMarkdown, gddModel: syn.gddModel, draftBar: syn.draftBar };
  });

  app.delete<{ Params: { id: string } }>("/api/session/:id", async (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
    await deps.store.remove(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Body: { markdown?: string; title?: string; history?: unknown; model?: unknown; complete?: boolean } }>(
    "/api/share",
    async (req, reply) => {
      const markdown = typeof req.body?.markdown === "string" ? req.body.markdown.trim() : "";
      if (!markdown) return reply.code(400).send({ error: "markdown required" });
      if (markdown.length > MAX_SHARE_MD) return reply.code(413).send({ error: "markdown too large" });
      const title = titleFromMarkdown(markdown, req.body?.title);
      const model = isPlainObject(req.body?.model) ? req.body.model : undefined;
      const row = await shareStore.create({
        title,
        markdown,
        model,
        complete: req.body?.complete === true,
      });
      return publicShare(row);
    },
  );

  app.get<{ Params: { id: string } }>("/api/share/:id", async (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid share id" });
    const row = await shareStore.load(req.params.id);
    if (!row) return reply.code(404).send({ error: "share not found" });
    return publicShare(row);
  });

  app.post<{ Params: { id: string }; Body: { message: string } }>(
    "/api/session/:id/message",
    async (req, reply) => {
      if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
      const message = req.body?.message ?? "";

      // 首句 lazy 创建：load 为空说明这是该 id 的第一条消息（/api/session 没落库）。
      // 用开场白初始化 state 并按指定 id 入库，之后再正常推进。
      let state = await deps.store.load(req.params.id);
      if (!state) {
        const fresh = createInitialState();
        fresh.history.push({ role: "assistant", content: OPENING_MESSAGE });
        await deps.store.createWithId(req.params.id, fresh);
        state = fresh;
      } else {
        normalizeConversationState(state);
      }

      reply.hijack();
      initSse(reply);
      // hijack 撤掉了 Fastify 的兜底：socket 'error'（如客户端中途断开）若无监听者会
      // 升级为未捕获异常而拖垮进程。挂一个 no-op，让 sendEvent 的写守卫静默收尾。
      reply.raw.on("error", () => {});
      // TODO: 断开后 LLM 流仍会被 advance 抽干（写已安全丢弃）；要提前中止需把
      //       AbortSignal 串进 @cq/conversation 的 advance，超出本次范围。
      try {
        const res = await advance(state, message, {
          llm: deps.llm,
          systemPrompt: deps.systemPrompt,
          skillDir: deps.skillDir,
          retrieve: deps.retrieve,
          onToken: (text) => sendEvent(reply, SSE_EVENTS.token, { text }),
        });
        await deps.store.save(req.params.id, res.state);

        if (res.warnings.length) sendEvent(reply, SSE_EVENTS.warning, { messages: res.warnings });
        sendEvent(reply, SSE_EVENTS.state, res.state);
        sendEvent(reply, SSE_EVENTS.stage, {
          stage: res.state.stage,
          label: STAGE_ASKS_TITLE[res.state.stage] ?? STAGE_LABELS[res.state.stage] ?? String(res.state.stage),
          readyForSynthesis: res.readyForSynthesis,
        });

        if (res.options?.length) sendEvent(reply, SSE_EVENTS.options, { options: res.options });

        let synthesis = null;
        if (res.readyForSynthesis) {
          try {
            synthesis = buildSynthesis(res.state);
          } catch (err) {
            console.error("[server] synthesis failed:", err);
            sendEvent(reply, SSE_EVENTS.warning, {
              messages: ["文档这一轮没编出来，对话已保存。请再点一次生成或重新打开草稿。"],
            });
          }
        }
        if (synthesis) sendEvent(reply, SSE_EVENTS.synthesis, synthesis);
        sendEvent(reply, SSE_EVENTS.done, { readyForSynthesis: res.readyForSynthesis });
      } catch (err) {
        console.error("[server] turn failed:", err);
        sendEvent(reply, SSE_EVENTS.error, {
          message: err instanceof Error ? err.message : String(err),
        });
        sendEvent(reply, SSE_EVENTS.done, { readyForSynthesis: false });
      } finally {
        endSse(reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>("/api/session/:id/export", async (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
    const loaded: ConversationState | null = await deps.store.load(req.params.id);
    if (!loaded) return reply.code(404).send({ error: "session not found" });
    const state = normalizeConversationState(loaded);
    harvestIntoState(state);
    scrubUngroundedState(state);

    const synthesis = buildSynthesis(state);
    if (!synthesis) return reply.code(409).send({ error: "GDD 尚无实质内容，请先完成几轮对话" });

    const dir = resolve(exportRoot, req.params.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "gdd.md"), synthesis.gddMarkdown);

    // 双写入库：配置了 repo 时，把本次产物落 artifacts（卡片 + 原文），版本自增。
    // session 可能尚未入库（理论上 export 前已有 /message 落库，但兜底创建一次）。
    let artifactId: string | undefined;
    if (deps.repo) {
      try {
        await deps.store.createWithId(req.params.id, state);
        const row = await deps.repo.createArtifact({
          sessionId: req.params.id,
          state,
          gddMarkdown: synthesis.gddMarkdown,
          exportDir: dir,
        });
        artifactId = row.id;
      } catch (err) {
        // 入库失败不阻断 export（文件已写好）；记日志即可。
        console.error("[server] artifact 入库失败:", err);
      }
    }

    return { dir, artifactId, ...synthesis };
  });

  // —— 卡片 / 后台 API（仅在配置了 repo 时启用，否则返回 503） ——
  app.get<{ Querystring: { limit?: string } }>("/api/artifacts", async (req, reply) => {
    if (!deps.repo) return reply.code(503).send({ error: "store not configured" });
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    return deps.repo.listArtifactCards(limit);
  });

  app.get<{ Params: { id: string } }>("/api/session/:id/artifacts", async (req, reply) => {
    if (!deps.repo) return reply.code(503).send({ error: "store not configured" });
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
    return deps.repo.listArtifactsForSession(req.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/artifact/:id", async (req, reply) => {
    if (!deps.repo) return reply.code(503).send({ error: "store not configured" });
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid artifact id" });
    const row = await deps.repo.getArtifact(req.params.id);
    if (!row) return reply.code(404).send({ error: "artifact not found" });
    return row;
  });

  app.get<{ Querystring: { limit?: string } }>("/api/admin/sessions", async (req, reply) => {
    if (!deps.repo) return reply.code(503).send({ error: "store not configured" });
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    return deps.repo.listSessionSummaries(limit);
  });

  app.get<{ Params: { id: string } }>("/api/admin/session/:id", async (req, reply) => {
    if (!deps.repo) return reply.code(503).send({ error: "store not configured" });
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
    const detail = await deps.repo.getSessionDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: "session not found" });
    return detail;
  });

  // —— 静态托管（生产）：主站 + /admin SPA。配置了 webDir 且存在才挂载。 ——
  if (deps.webDir && existsSync(deps.webDir)) {
    const webDir = deps.webDir;
    app.register(fastifyStatic, { root: webDir, prefix: "/" });

    const indexHtml = resolve(webDir, "index.html");
    const adminHtml = resolve(webDir, "admin.html");
    app.setNotFoundHandler((req, reply) => {
      // API 路径未命中：返回 JSON 404，别喂 HTML。
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      // /admin* → admin SPA；其余 → 主站 SPA。
      const file = req.url.startsWith("/admin") && existsSync(adminHtml) ? adminHtml : indexHtml;
      return reply.type("text/html").send(readFileSync(file, "utf8"));
    });
  }

  return app;
}
