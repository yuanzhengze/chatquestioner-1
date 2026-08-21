import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  advance, createInitialState, toGddModel, toGameDsl, OPENING_MESSAGE, STAGE_LABELS,
  type ConversationState, type LlmClient, type Retriever,
} from "@cq/conversation";
import { renderGdd } from "@cq/gdd";
import {
  resolve as resolveCatalog, writeBundle,
  type CatalogIndex, type GameDSL, type ResolutionResult,
} from "@cq/resolver";
import { supportedMatch3Genre, type SynthesizeResult } from "@cq/orchestrator";
import type { Repository } from "@cq/store";
import type { SessionStore } from "./sessionStore.js";
import { produceGameDef } from "./gameDefFill.js";
import { initSse, sendEvent, endSse } from "./sse.js";
import { SSE_EVENTS } from "./wire.js";

export interface ServerDeps {
  llm: LlmClient;
  store: SessionStore;
  catalog: CatalogIndex;
  systemPrompt: string;
  /** 可选：对话期知识检索器（缺省则不注入知识）。 */
  retrieve?: Retriever;
  profile?: string;
  /** 导出 bundle 落盘根目录，默认 ./data/exports */
  exportDir?: string;
  /** 可选：DB 仓库。配置后 export 双写入库 + 启用卡片/后台 API。 */
  repo?: Repository;
  /** 可选：前端构建产物目录（apps/web/dist）。配置后托管主站 + /admin。 */
  webDir?: string;
  /** 形象海报目录。配置后挂 /avatar/*，供小程序远程拉 PNG。 */
  avatarDir?: string;
}

interface Synthesis {
  gddMarkdown: string;
  dsl: GameDSL;
  resolution: ResolutionResult;
}

/** state → 交接产物（GDD + DSL + 解析）；工程信号不全（dsl 为空）则返回 null。 */
function buildSynthesis(
  state: ConversationState,
  catalog: CatalogIndex,
  profile: string,
): Synthesis | null {
  const { dsl } = toGameDsl(state);
  if (!dsl) return null;
  const gddMarkdown = renderGdd(toGddModel(state));
  const resolution = resolveCatalog(dsl, catalog, { profile });
  return { gddMarkdown, dsl, resolution };
}

/** 合法 session id：仅字母数字、下划线、连字符（randomUUID 输出可通过）。防路径穿越。 */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const profile = deps.profile ?? "workbench";
  const exportRoot = deps.exportDir ?? resolve(process.cwd(), "data", "exports");

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

  // 不再立即落库：只生成 id + 开场白返回前端。空会话（用户从未发言）不入库。
  // 真正的持久化推迟到首句 /message（见下方 lazy 创建）。
  app.post("/api/session", async () => {
    const id = randomUUID();
    return { id, opening: OPENING_MESSAGE };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id", async (req, reply) => {
    const state = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    return state;
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
          retrieve: deps.retrieve,
          onToken: (text) => sendEvent(reply, SSE_EVENTS.token, { text }),
        });
        await deps.store.save(req.params.id, res.state);

        if (res.warnings.length) sendEvent(reply, SSE_EVENTS.warning, { messages: res.warnings });
        sendEvent(reply, SSE_EVENTS.state, res.state);
        sendEvent(reply, SSE_EVENTS.stage, {
          stage: res.state.stage,
          label: STAGE_LABELS[res.state.stage] ?? String(res.state.stage),
          readyForSynthesis: res.readyForSynthesis,
        });

        if (res.options?.length) sendEvent(reply, SSE_EVENTS.options, { options: res.options });

        // 工程信号齐备（DSL 可编译）即发预览，不再等 LLM 显式置 ready_for_synthesis：
        // 后者是 LLM 对“对话已收敛”的主观判断，常漏置，会让预览空着；而 export 端点本就
        // 只要求 DSL 完整。这里与之对齐——有完整 DSL 就给“精确选择预览”。
        const synthesis = buildSynthesis(res.state, deps.catalog, profile);
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
    const state: ConversationState | null = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });

    const synthesis = buildSynthesis(state, deps.catalog, profile);
    if (!synthesis) {
      const { missing } = toGameDsl(state);
      return reply.code(409).send({ error: "DSL incomplete", missing });
    }

    const dir = resolve(exportRoot, req.params.id);
    writeBundle(dir, synthesis); // writeBundle 内部已 mkdir -p，无需额外建目录

    // —— S1：对话产物 → 编排 GameDef ——
    // LLM 运行时/网络异常也降级为诊断，保证 export 始终返回 200（与设计一致）。
    let s1: SynthesizeResult;
    try {
      s1 = supportedMatch3Genre(state)
        ? await produceGameDef(deps.llm, state)
        : { def: null, diagnostics: [{ kind: "unsupported-genre" as const, genre: state.engineering.genre ?? null }] };
    } catch (err) {
      s1 = { def: null, diagnostics: [{ kind: "fill-parse-error" as const, raw: err instanceof Error ? err.message : String(err) }] };
    }
    if (s1.def) {
      writeFileSync(resolve(dir, "gamedef.json"), JSON.stringify(s1.def, null, 2) + "\n");
    }

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
          dsl: synthesis.dsl,
          resolution: synthesis.resolution,
          gamedef: s1.def,
          exportDir: dir,
        });
        artifactId = row.id;
      } catch (err) {
        // 入库失败不阻断 export（文件已写好）；记日志即可。
        console.error("[server] artifact 入库失败:", err);
      }
    }

    return { dir, artifactId, ...synthesis, gamedef: s1.def, diagnostics: s1.diagnostics };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id/gamedef", async (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(400).send({ error: "invalid session id" });
    const file = resolve(exportRoot, req.params.id, "gamedef.json");
    if (!existsSync(file)) return reply.code(404).send({ error: "gamedef not found; export first" });
    return reply.type("application/json").send(readFileSync(file, "utf8"));
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
