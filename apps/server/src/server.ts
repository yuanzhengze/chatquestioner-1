import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";
import {
  advance, createInitialState, toGddModel, toGameDsl, OPENING_MESSAGE, STAGE_LABELS,
  type ConversationState, type LlmClient,
} from "@cq/conversation";
import { renderGdd } from "@cq/gdd";
import {
  resolve as resolveCatalog, writeBundle,
  type CatalogIndex, type GameDSL, type ResolutionResult,
} from "@cq/resolver";
import type { SessionStore } from "./sessionStore.js";
import { initSse, sendEvent, endSse } from "./sse.js";
import { SSE_EVENTS } from "./wire.js";

export interface ServerDeps {
  llm: LlmClient;
  store: SessionStore;
  catalog: CatalogIndex;
  systemPrompt: string;
  profile?: string;
  /** 导出 bundle 落盘根目录，默认 ./data/exports */
  exportDir?: string;
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

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const profile = deps.profile ?? "workbench";
  const exportRoot = deps.exportDir ?? resolve(process.cwd(), "data", "exports");

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/session", async () => {
    const state = createInitialState();
    state.history.push({ role: "assistant", content: OPENING_MESSAGE });
    const id = await deps.store.create(state);
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
      const state = await deps.store.load(req.params.id);
      if (!state) return reply.code(404).send({ error: "session not found" });
      const message = req.body?.message ?? "";

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

        if (res.readyForSynthesis) {
          const synthesis = buildSynthesis(res.state, deps.catalog, profile);
          if (synthesis) sendEvent(reply, SSE_EVENTS.synthesis, synthesis);
        }
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
    const state: ConversationState | null = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });

    const synthesis = buildSynthesis(state, deps.catalog, profile);
    if (!synthesis) {
      const { missing } = toGameDsl(state);
      return reply.code(409).send({ error: "DSL incomplete", missing });
    }

    const dir = resolve(exportRoot, req.params.id);
    writeBundle(dir, synthesis); // writeBundle 内部已 mkdir -p，无需额外建目录
    return { dir, ...synthesis };
  });

  return app;
}
