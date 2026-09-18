# Newbee · 游戏共创

把一句贫瘠脑洞，通过对话澄清成一份游戏设计文档（GDD）。这是 [ForgeaX](https://github.com/ForgeaXGame/forgeax-studio) 的前置共创，文档目前手动交给下游做游戏。

**产品设计（何时出卡、何时出文档、宿主 vs 模型）以 [docs/PRODUCT.md](docs/PRODUCT.md) 为准。** 改对话规则先改那份，再改代码。

本仓 GitHub：[`lbj051019/newbee`](https://github.com/lbj051019/newbee)（private）。npm 包名仍是历史遗留的 `chat-questioner`。

---

## 现在做什么、不做什么

做：微信小程序 + 网页的引导对话 → Interactive GDD 预览（真封面、游戏基因、交互分镜、循环三环）/ 分享卡片。出文档后可在预览里点一句改。手风琴展开收回有动画，切到另一块时视角跟到新标题。主人可导出 `{游戏名}-gdd.md`（发给文件传输助手 ≈ 保存在微信；模拟器发不了，要用真机），Markdown 也可复制，手动交给 ForgeaX。小程序视觉跟 ForgeaX 设计令牌（lime 主按钮黑字、分层深色表面），不搬 Studio 桌面壳。

不做（对用户不承诺）：按 DSL 自动选型、match-3 可玩原型、在 ForgeaX 里一键开工。仓库里还留着 `packages/dsl`、`resolver`、`playground` 等历史代码，以及 `docs/01`–`12` 旧设计稿，只作考古，不要当成当前产品。

---

## 环境

- Node.js ≥ 20
- pnpm
- OpenAI 兼容的 LLM（`.env` 里的 `LLM_API_KEY`）
- 封面生图（可选）：同一代理，`.env` 里 `IMAGE_MODEL` 默认 `gpt-image-2`。空字符串则关闭生图，结果页用色块。
- 小程序：微信开发者工具

```bash
pnpm install
cp .env.example .env   # 填 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL；封面用 IMAGE_MODEL
```

默认后端端口 **8420**。不要把密钥写进文档或开发日志。

---

## 怎么跑

### 后端（小程序和网页都要）

```bash
pnpm dev:server
```

看到 `listening on http://localhost:8420` 再发消息。改 `packages/conversation` 时 `tsx watch` 会热重启，重启窗口里请求会 `CONNECTION_REFUSED`。

### 微信小程序

```bash
pnpm bundle:miniprogram
pnpm dev:server
```

微信开发者工具导入 `apps/miniprogram`。详情勾选 **不校验合法域名、web-view、TLS、HTTPS 证书**。模拟器请求 `http://127.0.0.1:8420`。真机把 `apps/miniprogram/config.ts` 改成电脑局域网 IP。

更细的步骤：[apps/miniprogram/README.md](apps/miniprogram/README.md)。

### 网页（对照用）

```bash
pnpm dev:web
```

浏览器打开 [http://localhost:5173](http://localhost:5173)，`/api` 代理到 8420。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm test` | 全仓 vitest |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm dev:server` | Fastify 后端 |
| `pnpm dev:web` | 网页对话 |
| `pnpm bundle:miniprogram` | 打包小程序共享逻辑（不要手改 `lib/shared.js`） |

可选、当前产品不依赖：`pnpm build:catalog` / `pnpm build:knowledge` / `pnpm dev:playground`。

---

## 仓库怎么读

```text
apps/miniprogram/     微信小程序（首页 / 共创 / 我的 / GDD 预览）
apps/server/          Fastify + SSE，会话与出文档
apps/web/             网页对照
packages/conversation 对话阶段机、出卡、出文档闸门
packages/gdd          GDD 模型与 Markdown
prompts/game-gdd-clarify/  引导 skill、问法、完整度清单
docs/PRODUCT.md       产品说明书（先读这个）
```

对话闸门的实现入口：`packages/conversation/src/advance.ts`。

---

## 文档

| 文档 | 用途 |
| --- | --- |
| [docs/PRODUCT.md](docs/PRODUCT.md) | **当前产品行为** |
| [prompts/game-gdd-clarify/SKILL.md](prompts/game-gdd-clarify/SKILL.md) | 给模型的引导规范 |
| [prompts/game-gdd-clarify/completeness.md](prompts/game-gdd-clarify/completeness.md) | GDD 完整度清单（代码里的定稿完整对齐它） |
| 任务书（仓外） | 范围、待定项、和 ForgeaX 的关系 |
| `docs/01`–`12`、`docs/superpowers/` | 历史设计，可能与现状不符 |
