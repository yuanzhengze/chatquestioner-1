import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../src/catalog/build.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const forgeaxRoot = process.env.FORGEAX_ROOT ?? resolve(__dirname, "../../../../forgeax-studio");
const outPath = resolve(__dirname, "../catalog-index.json");

const catalog = buildCatalog(forgeaxRoot);
writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `[build-catalog] wrote ${outPath} — ${catalog.templates.length} templates, ` +
    `${catalog.skills.length} skills, ${catalog.mcp.length} mcp servers`,
);
