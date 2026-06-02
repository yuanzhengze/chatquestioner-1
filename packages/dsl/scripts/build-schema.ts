import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GameDslSchema, ResolutionResultSchema } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../schema");
mkdirSync(outDir, { recursive: true });

const dsl = zodToJsonSchema(GameDslSchema, "GameDSL");
const resolution = zodToJsonSchema(ResolutionResultSchema, "ResolutionResult");

writeFileSync(resolve(outDir, "game-dsl.schema.json"), JSON.stringify(dsl, null, 2) + "\n");
writeFileSync(resolve(outDir, "resolution-result.schema.json"), JSON.stringify(resolution, null, 2) + "\n");

console.log(`[build-schema] wrote game-dsl.schema.json + resolution-result.schema.json to ${outDir}`);
