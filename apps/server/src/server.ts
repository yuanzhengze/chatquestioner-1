import Fastify, { type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  advance, createInitialState, toGddModel, toGameDsl, OPENING_MESSAGE, STAGE_LABELS,
  type ConversationState, type LlmClient,
} from "@cq/conversation";
import { renderGdd } from "@cq/gdd";
import { resolve as resolveCatalog, writeBundle, type CatalogIndex } from "@cq/resolver";
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
          const { dsl } = toGameDsl(res.state);
          if (dsl) {
            const gddMarkdown = renderGdd(toGddModel(res.state));
            const resolution = resolveCatalog(dsl, deps.catalog, { profile });
            sendEvent(reply, SSE_EVENTS.synthesis, { gddMarkdown, dsl, resolution });
          }
        }
        sendEvent(reply, SSE_EVENTS.done, { readyForSynthesis: res.readyForSynthesis });
      } catch (err) {
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

    const { dsl, missing } = toGameDsl(state);
    if (!dsl) return reply.code(409).send({ error: "DSL incomplete", missing });

    const gddMarkdown = renderGdd(toGddModel(state));
    const resolution = resolveCatalog(dsl, deps.catalog, { profile });
    const dir = resolve(exportRoot, req.params.id);
    mkdirSync(dir, { recursive: true });
    writeBundle(dir, { gddMarkdown, dsl, resolution });
    return { dir, gddMarkdown, dsl, resolution };
  });

  return app;
}
