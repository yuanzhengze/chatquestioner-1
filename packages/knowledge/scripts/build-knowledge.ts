import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "@cq/resolver";
import { seedCards } from "../src/seed.js";
import { loadCuratedCards, buildIndex } from "../src/build.js";
import { createLocalEmbedder } from "../src/embed.js";

const here = dirname(fileURLToPath(import.meta.url)); // packages/knowledge/scripts
const repoRoot = resolve(here, "../../..");           // chat-questioner/
const forgeaxRoot = resolve(repoRoot, process.env.FORGEAX_ROOT ?? "../forgeax-studio");
const dataDir = resolve(here, "../data");
const outPath = resolve(here, "../knowledge-index.json");

async function main(): Promise<void> {
  const catalog = buildCatalog(forgeaxRoot);
  const cards = [...seedCards(catalog), ...loadCuratedCards(dataDir)];
  const embedder = await createLocalEmbedder(process.env.KB_EMBEDDING_MODEL);
  const index = await buildIndex(cards, embedder);
  writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`[build-knowledge] wrote ${outPath} — ${index.cards.length} cards, dim ${index.dim}, model ${index.model}`);
}

main().catch((err) => {
  console.error("[build-knowledge] failed:", err);
  process.exit(1);
});
