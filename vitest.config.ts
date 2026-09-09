import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@cq/avatar": fileURLToPath(new URL("./packages/avatar/src/index.ts", import.meta.url)),
      "@cq/gdd": fileURLToPath(new URL("./packages/gdd/src/index.ts", import.meta.url)),
      "@cq/conversation": fileURLToPath(new URL("./packages/conversation/src/index.ts", import.meta.url)),
      "@cq/knowledge": fileURLToPath(new URL("./packages/knowledge/src/index.ts", import.meta.url)),
      "@cq/store": fileURLToPath(new URL("./packages/store/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
  },
});
