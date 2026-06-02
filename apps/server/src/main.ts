import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "@cq/resolver";
import { readNewbeeSystemPrompt } from "@cq/conversation";
import { loadConfig } from "./config.js";
import { OpenAiLlmClient } from "./llm/openaiClient.js";
import { FileSessionStore } from "./sessionStore.js";
import { buildServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url)); // apps/server/src
const repoRoot = resolve(here, "../../.."); // chat-questioner/

async function start(): Promise<void> {
  const cfg = loadConfig();
  const catalog = buildCatalog(resolve(repoRoot, cfg.FORGEAX_ROOT)); // FORGEAX_ROOT 相对 repo 根
  const systemPrompt = readNewbeeSystemPrompt(resolve(repoRoot, "prompts"));
  const llm = new OpenAiLlmClient({ baseURL: cfg.LLM_BASE_URL, apiKey: cfg.LLM_API_KEY, model: cfg.LLM_MODEL });
  const store = new FileSessionStore(resolve(repoRoot, "data"));

  const app = buildServer({
    llm, store, catalog, systemPrompt, profile: "workbench",
    exportDir: resolve(repoRoot, "data", "exports"),
  });
  await app.listen({ port: cfg.PORT, host: "127.0.0.1" });
  console.log(`[server] listening on http://localhost:${cfg.PORT} — ${catalog.templates.length} templates`);
}

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
