import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@cq/avatar": fileURLToPath(new URL("./packages/avatar/src/index.ts", import.meta.url)),
      "@cq/modules": fileURLToPath(new URL("./packages/modules/src/index.ts", import.meta.url)),
      "@cq/module-index": fileURLToPath(new URL("./packages/module-index/src/index.ts", import.meta.url)),
      "@cq/orchestrator": fileURLToPath(new URL("./packages/orchestrator/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
  },
});
