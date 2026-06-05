import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@cq/modules": fileURLToPath(new URL("../../packages/modules/src/index.ts", import.meta.url)),
      "@cq/module-index": fileURLToPath(new URL("../../packages/module-index/src/index.ts", import.meta.url)),
      "@cq/orchestrator": fileURLToPath(new URL("../../packages/orchestrator/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5174 },
});
