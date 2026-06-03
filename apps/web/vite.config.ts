import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 别名直指 TS 源：让 vite 把 @cq/avatar 当作 app 源码转译，
    // 不依赖 node_modules 里 workspace 包的 TS 转译（与现有 web 解耦风格一致）。
    alias: {
      "@cq/avatar": fileURLToPath(new URL("../../packages/avatar/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8420" },
  },
});
