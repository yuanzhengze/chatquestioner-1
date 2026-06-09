# chat-questioner

**创意导演式对话 → 游戏设计文档 → 精确选型 → 可玩原型**

chat-questioner 是 [forgeax-studio](https://github.com/forgeax/forgeax-studio) 的**独立前置应用**：通过 NewBee 深挖式引导对话，帮「小白」把模糊脑洞收敛成完整游戏概念，并产出机器可读的 DSL，让下游 agent 能**零搜索、按需精确**地选取 template / skill / MCP。项目还包含一套 match-3 编排 DSL 验证台，可将对话结论编译为真正可玩的消除类游戏。

---

## 为什么做这个项目

forgeax-studio 现有 Launch 流程缺少「陪用户把游戏想清楚」的环节：用户填一句 prompt 就进入编排，产出质量依赖运气；运行时还要全量加载 skill/MCP 并现场搜索模板，上下文开销大。

chat-questioner 在 agentic_os **之前**插入一段创意导演对话，解决两件事：

1. **做出好游戏** — 5 阶段深挖引导，产出覆盖各维度的富 GDD（`gdd.md`）
2. **精确执行** — 把对话结论编译为选择 DSL（`dsl.json`），离线 resolver 映射到 `{ template, skills, mcp }`，短路 pack-search

---

## 核心能力

| 能力 | 说明 |
|------|------|
| NewBee 对话引擎 | 5 阶段创意导演式引导 + 单步收敛 + 知识库 RAG 投喂 |
| 富 GDD 产出 | 人可读的完整游戏设计文档，右栏实时刷新 |
| 选择 DSL | 结构化 `GameDSL`（genre / mechanics / modalities 等），zod 校验 |
| Resolver | 对 forgeax 真实目录离线解析，DSL → ResolutionResult |
| 编排 DSL（S1） | 对话 → `GameDef` → `createGame()` → match-3 可玩原型 |
| 交接 Bundle | 收敛后一键导出 `gdd.md` + `dsl.json` + `resolution.json` + `gamedef.json` |

---

## 架构概览

```text
用户 ──→ web (React) ──SSE──→ server (Fastify)
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              conversation      gdd           dsl
              (阶段机+LLM)    (渲染 GDD)    (编译 DSL)
                    │                           │
                    └───────────┬───────────────┘
                                ▼
                           resolver ──→ forgeax catalog
                                │
                                ▼
                          orchestrator ──→ modules (MatchEngine)
                                │
                                ▼
                          playground (Canvas 验证台)
```

**依赖方向**（单向，避免环）：

- `web → server → { conversation, gdd, dsl, resolver, orchestrator, knowledge }`
- `conversation → { gdd, dsl }`
- `orchestrator → modules`
- `resolver → dsl`

---

## 仓库结构

```text
chat-questioner/
├── apps/
│   ├── web/              # Vite + React 对话 UI（左对话流，右 GDD 草稿 + 状态）
│   ├── server/           # Fastify + SSE；会话编排；LLM 接线；Bundle 导出
│   └── playground/       # match-3 编排 DSL 本地验证台（Canvas）
├── packages/
│   ├── conversation/     # NewBee 引擎：阶段机、advance、compile
│   ├── gdd/              # GDD 模型 + Markdown 渲染
│   ├── dsl/              # 选择 DSL 类型 + JSON Schema + zod 校验
│   ├── resolver/         # catalog 索引 + resolve()
│   ├── knowledge/        # 知识库构建与向量检索（RAG）
│   ├── avatar/           # 状态机形象资源
│   ├── orchestrator/     # GameDef 编排 DSL + validate + createGame + synthesize
│   ├── modules/          # match-3 系统模块库（MatchEngine 等）
│   └── module-index/     # 模块 manifest 索引
├── prompts/              # NewBee 系统提示词
├── docs/                 # 设计文档与实施计划
└── data/                 # 会话与导出（gitignore）
```

---

## 环境要求

- **Node.js** ≥ 20
- **pnpm**（workspace monorepo）
- **forgeax-studio** 仓库（与 chat-questioner 平级放置，供 resolver 读取真实目录）
- **LLM API Key**（OpenAI 兼容，默认走 LiteLLM Proxy）

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
LLM_BASE_URL=https://llm-proxy.forgeax.com/v1
LLM_API_KEY=sk-your-key-here
LLM_MODEL=gemini-3.1-pro
FORGEAX_ROOT=../forgeax-studio   # 指向 forgeax-studio 仓库根
PORT=8420
```

### 3. 构建索引（首次或 catalog 变更后）

```bash
pnpm build:catalog      # 读取 forgeax 目录 → catalog-index.json
pnpm build:knowledge    # 构建知识库向量索引（RAG 用）
pnpm build:schema       # 生成 DSL JSON Schema
```

### 4. 启动开发服务

```bash
# 终端 1：后端
pnpm dev:server

# 终端 2：前端
pnpm dev:web
```

浏览器打开 [http://localhost:5173](http://localhost:5173)。前端通过 Vite proxy 将 `/api` 转发到 `http://localhost:8420`。

### 5. 验证 match-3 编排台（可选）

```bash
pnpm dev:playground
```

在 playground 中选择预设游戏（Bejeweled / Candy Collect），或加载 server 导出的 session `gamedef.json` 进行验证。

---

## 协作者上手须知

clone 本仓库后，运行前端 / 后端 / 对话引擎**只需** `pnpm install` + 配置 `.env`，无需任何额外大文件。下面三点是新协作者最容易踩的坑：

### 状态机形象资源：成品已入库，母版可选

- 状态机形象的转码**成品**（`webm` / `png` / `mov`，约 16M）已随仓库提交在 `apps/web/public/avatar/`，前端直接读取，**开箱即用**。
- 形象**母版**（`Visual-State-Machine/mov`，约 1.2G ProRes 视频）**不随仓库分发**。
- 因此**普通协作者不需要母版，也不需要运行 `pnpm build:avatar`**。
- 只有在「重新转码 / 替换形象 IP」时才需要母版：把母版放到与本仓库**平级**的 `Visual-State-Machine/mov/`，或用 `AVATAR_MASTERS=/abs/path pnpm build:avatar` 指定路径（还需本机安装 `ffmpeg`）。

### forgeax-studio 依赖（仅 resolver / build:catalog 需要）

- `resolver` 读取平级的 `forgeax-studio` 仓库目录来生成 catalog 索引，因此 `pnpm build:catalog` 需要 `FORGEAX_ROOT`（默认 `../forgeax-studio`）指向一个真实的 forgeax-studio 仓库。
- 若暂时不需要选型解析（resolver），可跳过 `build:catalog`；对话引擎、GDD 渲染、前后端不依赖它。

### 必需的外部凭据

- `LLM_API_KEY`：OpenAI 兼容 LLM key（默认走 LiteLLM Proxy），对话引擎必需。

> 一句话总结：**`pnpm install` → 配 `.env` 的 `LLM_API_KEY` → `pnpm dev:server` + `pnpm dev:web`** 即可跑起来；`build:avatar` / `build:catalog` 是按需的进阶步骤。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm test` | 运行全仓库 vitest 测试 |
| `pnpm test:watch` | 监听模式 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm dev:server` | 启动 Fastify 后端 |
| `pnpm dev:web` | 启动 React 前端 |
| `pnpm dev:playground` | 启动 match-3 验证台 |
| `pnpm build:catalog` | 重建 forgeax catalog 索引 |
| `pnpm build:knowledge` | 重建知识库向量索引 |
| `pnpm build:schema` | 生成 DSL JSON Schema |
| `pnpm build:avatar` | 构建状态机形象资源 |

---

## 对话收敛产出

会话进入收敛阶段后，server 会编译并导出 **Bundle**，默认写入 `data/exports/<session-id>/`：

| 文件 | 用途 |
|------|------|
| `gdd.md` | 人可读的游戏设计文档 |
| `dsl.json` | 机器可读的选择 DSL（`GameDSL`） |
| `resolution.json` | resolver 输出：template / skills / mcp 精确选型 |
| `gamedef.json` | match-3 编排 DSL（S1 闭环，genre 非 match-3 时可能为空并附诊断） |

Bundle 契约面向下游 agentic_os 交接；本轮不替换 forgeax 的 pillar/design/production 流程。

---

## 设计文档

| 文档 | 内容 |
|------|------|
| [docs/01-设计方案.md](docs/01-设计方案.md) | 总体设计：目标、架构、数据流、DSL 契约 |
| [docs/02-实施计划-M0-M1.md](docs/02-实施计划-M0-M1.md) | DSL + resolver 契约层 |
| [docs/03-实施计划-M2-对话引擎.md](docs/03-实施计划-M2-对话引擎.md) | NewBee 对话引擎 |
| [docs/04-实施计划-M3-server-web.md](docs/04-实施计划-M3-server-web.md) | Server + Web 应用壳 |
| [docs/07-设计方案-知识库.md](docs/07-设计方案-知识库.md) | 知识库 RAG |
| [docs/09-DSL编排引擎-最小验证方案.md](docs/09-DSL编排引擎-最小验证方案.md) | 编排 DSL + modules + playground |
| [docs/superpowers/specs/2026-06-05-s1-conversation-to-gamedef-design.md](docs/superpowers/specs/2026-06-05-s1-conversation-to-gamedef-design.md) | S1：对话 → GameDef → 可玩游戏 |

提问策略参考：[docs/00-NewBee提问策略参考集.md](docs/00-NewBee提问策略参考集.md)

---

## 与 forgeax-studio 的关系

- **独立部署、独立迭代**：不挤占 agentic_os 上下文预算
- **只读依赖**：resolver 读取 forgeax 的 template / skill / MCP 目录，构建期生成索引
- **前置环节**：产出 Bundle 供下游消费；活接线 agentic_os 在后续 milestone 完成
- **同生态**：全 TypeScript，LLM 走同一 LiteLLM Proxy

---

## 技术栈

TypeScript (ESM) · pnpm workspaces · Vitest · Zod · Fastify · Vite · React · OpenAI 兼容 LLM 客户端 · SSE 流式对话
