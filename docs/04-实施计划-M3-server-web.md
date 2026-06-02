# chat-questioner M3 实施计划（server + web 应用壳）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**依赖前置：** 本计划建立在 **M2（`@cq/conversation`）已完成** 之上。它消费 M2 的 `advance` / `createInitialState` / `OPENING_MESSAGE` / `STAGE_LABELS` / `toGddModel` / `toGameDsl` / `readNewbeeSystemPrompt` / `ConversationState`，M1 的 `buildCatalog` / `resolve` / `writeBundle` / `CatalogIndex`，以及 `@cq/gdd` 的 `renderGdd`、`@cq/dsl` 的 `GameDSL` / `ResolutionResult`。**先做完 M2 再做 M3。**

**Goal:** 把对话引擎装进一个可端到端跑通的应用壳——`apps/server`（Fastify + SSE）做会话生命周期/LLM 接线/收敛时调 gdd+dsl+resolver/导出 bundle；`apps/web`（Vite+React）左对话流（SSE 流式）、右"实时 GDD 草稿 + 已识别状态"，收敛后展示 resolution 预览 + 一键导出。

**Architecture:** server 用**工厂 + 依赖注入**：`buildServer({ llm, store, catalog, systemPrompt, profile })`，`LlmClient` 与会话存储、catalog 都注入，使路由可在**不碰真实 LLM / 不依赖 forgeax 目录**的前提下被测试（注入 `FakeLlmClient` + 罐装 catalog）。真实入口 `main.ts` 装配 `OpenAiLlmClient`（OpenAI 兼容、指向 LiteLLM Proxy）+ 文件型会话存储 + `buildCatalog(FORGEAX_ROOT)`。SSE 用 `reply.hijack()` + `reply.raw` 直写 `event:/data:` 帧。web 通过 `fetch` + `ReadableStream` 解析 POST-SSE（不用只支持 GET 的 `EventSource`），SSE 帧解析抽成纯函数单测。

**Tech Stack:** TypeScript (ESM)；server：Fastify v5、`openai` v4（OpenAI 兼容客户端）、`dotenv`、tsx（dev/start）；web：Vite v5、React 18、`@vitejs/plugin-react`；测试：vitest（server 路由 inject + 真实 listen SSE 冒烟 / web SSE 解析纯函数）。

> 关键事实（已核实，影响实现）：
> 1. `@cq/dsl` 既导出 `GameDSL` 也导出 `ResolutionResult` 类型——web 要类型时**从 `@cq/dsl` 取**，**绝不**从 `@cq/resolver` 取（resolver 引了 `node:fs`，进浏览器 bundle 会炸）。为彻底解耦，web 用 `src/types.ts` 自描述线缆 DTO，运行时不 import 任何 workspace 包。
> 2. `resolve(dsl, catalog, { profile })` **永不抛**：无模板命中时回退 `basic/{pixijs-2d|threejs-3d}` 并加 `warnings`。故 server 测试用的罐装 catalog 只要含一个 `basic/pixijs-2d` 模板即可让导出/收敛走通。
> 3. env 变量名（见 `.env.example`）：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（默认 `gemini-3.1-pro`）/ `FORGEAX_ROOT`（默认 `../forgeax-studio`）/ `PORT`（默认 8420）。密钥仅在 `.env`（`.gitignore` 已护），会话落盘目录 `data/`（已 gitignore）。
> 4. `OpenAiLlmClient` 必须实现 M2 的 `LlmClient` 接口：`stream(messages: ChatMessage[]): AsyncIterable<string>`，逐 token 产出 delta 文本。

---

## 文件结构（决策锁定）

```
chat-questioner/
├── pnpm-workspace.yaml                  # 修改：加 "apps/*"
├── package.json                         # 修改：加 dev:server/dev:web 脚本；typecheck 链上 web
├── tsconfig.json                        # 修改：include 加 apps/server/src（web 走自带 tsconfig）
├── vitest.config.ts                     # 修改：include 加 "apps/*/test/**/*.test.ts"
├── apps/
│   ├── server/
│   │   ├── package.json                 # @cq/server（依赖 conversation/gdd/dsl/resolver + fastify/openai/dotenv）
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── config.ts                # loadConfig(env) zod 校验
│   │   │   ├── wire.ts                  # SSE 事件名常量 + 线缆 DTO 类型
│   │   │   ├── sse.ts                   # initSse / sendEvent / endSse
│   │   │   ├── sessionStore.ts          # SessionStore 接口 + FileSessionStore
│   │   │   ├── llm/openaiClient.ts      # OpenAiLlmClient implements LlmClient
│   │   │   ├── server.ts                # buildServer(deps) → Fastify 实例（注册路由）
│   │   │   └── main.ts                  # 真实入口：装配 + listen
│   │   └── test/
│   │       ├── fixtures/fakeLlm.ts      # 罐装 LlmClient（脚本/可抛错）
│   │       ├── fixtures/catalog.ts      # 最小 CatalogIndex（含 basic/pixijs-2d）
│   │       ├── routes.test.ts           # inject：health/create/get/export(404/409/ok)
│   │       └── sse.test.ts              # 真实 listen + fetch：token/state/stage/done + error
│   └── web/
│       ├── package.json                 # @cq/web（react/react-dom + vite/plugin-react）
│       ├── index.html
│       ├── vite.config.ts               # dev proxy /api → :8420
│       ├── tsconfig.json                # DOM lib + jsx
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── styles.css
│       │   ├── types.ts                 # 自描述线缆 DTO（不 import workspace）
│       │   ├── sse.ts                   # parseSseEvents 纯函数（可单测）
│       │   ├── api.ts                   # createSession/getSession/sendMessage/exportBundle
│       │   ├── hooks/useSession.ts      # 会话状态机（messages/state/synthesis）
│       │   └── components/{ChatPanel,StatePanel,ResolutionPreview}.tsx
│       └── test/sse.test.ts             # parseSseEvents 单测
└── prompts/newbee.system.md             # server 启动时读取
```

**依赖方向**（与 spec §4 一致）：`web → server → { conversation, gdd, dsl, resolver }`。web 运行时**不**依赖任何 workspace 包（只在 `types.ts` 自描述 DTO）。

---

## SSE 线缆契约（贯穿 server T5 与 web T8，先锁死）

`POST /api/session/:id/message`（body `{ message: string }`）打开 `text/event-stream`，依次发：

| event | data（JSON） | 时机 |
|---|---|---|
| `token` | `{ "text": string }` | 流式人话回复分片（只含 `<<<STATE>>>` 之前内容） |
| `warning` | `{ "messages": string[] }` | 本轮解析有告警（无哨兵/JSON 坏）时 |
| `state` | 完整 `ConversationState` 快照 | 本轮合并后 |
| `stage` | `{ "stage": number, "label": string, "readyForSynthesis": boolean }` | 本轮推进后 |
| `synthesis` | `{ "gddMarkdown": string, "dsl": GameDSL, "resolution": ResolutionResult }` | 仅当 `readyForSynthesis` 为真 |
| `error` | `{ "message": string }` | LLM/引擎异常 |
| `done` | `{ "readyForSynthesis": boolean }` | 本轮结束（总会发，error 后也发以便前端收尾） |

其余端点（非 SSE，标准 JSON）：`GET /api/health`、`POST /api/session`、`GET /api/session/:id`、`POST /api/session/:id/export`。

---

## Task 1: 工作区接线（apps/* + 根配置）

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`
- Modify: `package.json`（根脚本）
- Modify: `tsconfig.json`（根 include）

- [ ] **Step 1: `pnpm-workspace.yaml` 加 apps**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: `vitest.config.ts` 纳入 apps 测试**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: 根 `package.json` scripts 加 dev 入口 + typecheck 链上 web**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p apps/web/tsconfig.json",
    "build:catalog": "tsx packages/resolver/scripts/build-catalog.ts",
    "build:schema": "tsx packages/dsl/scripts/build-schema.ts",
    "dev:server": "pnpm --filter @cq/server dev",
    "dev:web": "pnpm --filter @cq/web dev"
  }
}
```

> 说明：`build:schema` 来自 M2；若 M2 已加则保留。server 源走根 tsconfig 一并 typecheck（node 环境）；web 有 DOM/JSX，单独 `apps/web/tsconfig.json` 校验。

- [ ] **Step 4: 根 `tsconfig.json` include 加 server 源**（paths 已含 `@cq/conversation`/`@cq/resolver` 等，来自 M2）

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@cq/dsl": ["packages/dsl/src/index.ts"],
      "@cq/gdd": ["packages/gdd/src/index.ts"],
      "@cq/resolver": ["packages/resolver/src/index.ts"],
      "@cq/conversation": ["packages/conversation/src/index.ts"]
    }
  },
  "include": [
    "packages/dsl/src",
    "packages/dsl/scripts",
    "packages/gdd/src",
    "packages/resolver/src",
    "packages/resolver/scripts",
    "packages/conversation/src",
    "apps/server/src"
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml vitest.config.ts package.json tsconfig.json
git commit -m "chore: wire apps/* into workspace, vitest, typecheck"
```

---

## Task 2: server 脚手架 + 配置加载

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/config.ts`
- Test: `apps/server/test/config.test.ts`

- [ ] **Step 1: 写 `apps/server/package.json`**

```json
{
  "name": "@cq/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts"
  },
  "dependencies": {
    "@cq/conversation": "workspace:*",
    "@cq/dsl": "workspace:*",
    "@cq/gdd": "workspace:*",
    "@cq/resolver": "workspace:*",
    "fastify": "^5.0.0",
    "openai": "^4.67.0",
    "dotenv": "^16.4.0"
  }
}
```

- [ ] **Step 2: 写 `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: 装依赖**

Run: `pnpm install`
Expected: `@cq/server` 链入 workspace；fastify/openai/dotenv 安装到 `apps/server/node_modules`（或 hoist）。

- [ ] **Step 4: 写失败测试 `apps/server/test/config.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("解析必需 env，模型/根目录/端口有默认值", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1", LLM_API_KEY: "sk-x" });
    expect(cfg.LLM_MODEL).toBe("gemini-3.1-pro");
    expect(cfg.FORGEAX_ROOT).toBe("../forgeax-studio");
    expect(cfg.PORT).toBe(8420);
  });

  it("缺 LLM_API_KEY 直接抛（启动期快速失败）", () => {
    expect(() => loadConfig({ LLM_BASE_URL: "https://llm-proxy.forgeax.com/v1" })).toThrow();
  });

  it("PORT 字符串被强转为数字", () => {
    const cfg = loadConfig({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k", PORT: "9000" });
    expect(cfg.PORT).toBe(9000);
  });
});
```

- [ ] **Step 5: 跑测试确认失败**

Run: `pnpm vitest run apps/server/test/config.test.ts`
Expected: FAIL —— 找不到 `../src/config.js`。

- [ ] **Step 6: 实现 `apps/server/src/config.ts`**

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gemini-3.1-pro"),
  FORGEAX_ROOT: z.string().default("../forgeax-studio"),
  PORT: z.coerce.number().default(8420),
});

export type ServerConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ServerConfig {
  return EnvSchema.parse(env);
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run apps/server/test/config.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 8: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/src/config.ts apps/server/test/config.test.ts pnpm-lock.yaml
git commit -m "feat(server): scaffold @cq/server + env config loader"
```

---

## Task 3: 线缆 DTO + SSE 帧助手

**Files:**
- Create: `apps/server/src/wire.ts`
- Create: `apps/server/src/sse.ts`
- Test: `apps/server/test/sse.helper.test.ts`

- [ ] **Step 1: 写 `apps/server/src/wire.ts`**

```typescript
import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { ConversationState } from "@cq/conversation";

/** SSE 事件名（与 web 端约定一致）。 */
export const SSE_EVENTS = {
  token: "token",
  warning: "warning",
  state: "state",
  stage: "stage",
  synthesis: "synthesis",
  error: "error",
  done: "done",
} as const;

export interface TokenEvent { text: string }
export interface WarningEvent { messages: string[] }
export type StateEvent = ConversationState;
export interface StageEvent { stage: number; label: string; readyForSynthesis: boolean }
export interface SynthesisEvent { gddMarkdown: string; dsl: GameDSL; resolution: ResolutionResult }
export interface ErrorEvent { message: string }
export interface DoneEvent { readyForSynthesis: boolean }

/** POST /api/session 返回 */
export interface CreateSessionResponse { id: string; opening: string }
/** POST /api/session/:id/export 返回 */
export interface ExportResponse { dir: string; gddMarkdown: string; dsl: GameDSL; resolution: ResolutionResult }
```

- [ ] **Step 2: 写失败测试 `apps/server/test/sse.helper.test.ts`**（用假 reply 捕获写出的帧）

```typescript
import { describe, it, expect } from "vitest";
import { sendEvent } from "../src/sse.js";

function fakeReply() {
  const chunks: string[] = [];
  return { chunks, raw: { write: (s: string) => { chunks.push(s); return true; } } } as any;
}

describe("sendEvent", () => {
  it("写出标准 SSE 帧 event:/data:/空行", () => {
    const reply = fakeReply();
    sendEvent(reply, "token", { text: "你好" });
    expect(reply.chunks.join("")).toBe(`event: token\ndata: ${JSON.stringify({ text: "你好" })}\n\n`);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run apps/server/test/sse.helper.test.ts`
Expected: FAIL —— 找不到 `../src/sse.js`。

- [ ] **Step 4: 实现 `apps/server/src/sse.ts`**

```typescript
import type { FastifyReply } from "fastify";

export function initSse(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

export function sendEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function endSse(reply: FastifyReply): void {
  reply.raw.end();
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run apps/server/test/sse.helper.test.ts`
Expected: PASS（1 个用例）。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/wire.ts apps/server/src/sse.ts apps/server/test/sse.helper.test.ts
git commit -m "feat(server): SSE frame helpers + wire DTOs"
```

---

## Task 4: 文件型会话存储

**Files:**
- Create: `apps/server/src/sessionStore.ts`
- Test: `apps/server/test/sessionStore.test.ts`

- [ ] **Step 1: 写失败测试 `apps/server/test/sessionStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-sess-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("FileSessionStore", () => {
  it("create 返回 id，load 取回同一状态", async () => {
    const store = new FileSessionStore(dir);
    const s = createInitialState();
    s.spark = "猫咪连连看";
    const id = await store.create(s);
    expect(id).toMatch(/[0-9a-f-]{36}/);
    const loaded = await store.load(id);
    expect(loaded?.spark).toBe("猫咪连连看");
  });

  it("load 未知 id 返回 null", async () => {
    const store = new FileSessionStore(dir);
    expect(await store.load("nope")).toBeNull();
  });

  it("save 覆盖后 load 反映更新", async () => {
    const store = new FileSessionStore(dir);
    const id = await store.create(createInitialState());
    const s = (await store.load(id))!;
    s.stage = 3;
    await store.save(id, s);
    expect((await store.load(id))!.stage).toBe(3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run apps/server/test/sessionStore.test.ts`
Expected: FAIL —— 找不到 `../src/sessionStore.js`。

- [ ] **Step 3: 实现 `apps/server/src/sessionStore.ts`**

```typescript
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationState } from "@cq/conversation";

export interface SessionStore {
  create(state: ConversationState): Promise<string>;
  load(id: string): Promise<ConversationState | null>;
  save(id: string, state: ConversationState): Promise<void>;
}

/** 把每个会话状态落盘为 <dataDir>/sessions/<id>.json，可续聊。 */
export class FileSessionStore implements SessionStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = resolve(dataDir, "sessions");
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async create(state: ConversationState): Promise<string> {
    const id = randomUUID();
    await this.save(id, state);
    return id;
  }

  async load(id: string): Promise<ConversationState | null> {
    const p = this.path(id);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as ConversationState;
    } catch {
      return null;
    }
  }

  async save(id: string, state: ConversationState): Promise<void> {
    writeFileSync(this.path(id), JSON.stringify(state, null, 2) + "\n");
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run apps/server/test/sessionStore.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sessionStore.ts apps/server/test/sessionStore.test.ts
git commit -m "feat(server): file-based session store"
```

---

## Task 5: `buildServer` 路由（health / 会话 / SSE / 导出）

**Files:**
- Create: `apps/server/test/fixtures/fakeLlm.ts`
- Create: `apps/server/test/fixtures/catalog.ts`
- Create: `apps/server/src/server.ts`
- Test: `apps/server/test/routes.test.ts`

- [ ] **Step 1: 写罐装 LLM fixture `apps/server/test/fixtures/fakeLlm.ts`**

```typescript
import type { ChatMessage, LlmClient } from "@cq/conversation";

/** 顺序流出脚本里的整轮文本（含 reply + <<<STATE>>> + JSON）；分片产出。 */
export function fakeLlm(rawTurns: string[]): LlmClient {
  let i = 0;
  return {
    async *stream(_m: ChatMessage[]): AsyncIterable<string> {
      const raw = rawTurns[i] ?? "";
      i += 1;
      for (let p = 0; p < raw.length; p += 16) yield raw.slice(p, p + 16);
    },
  };
}

/** 总是抛错的 LLM，用于 error 事件测试。 */
export function throwingLlm(message = "llm boom"): LlmClient {
  return {
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<string> {
      throw new Error(message);
    },
  };
}
```

- [ ] **Step 2: 写罐装 catalog fixture `apps/server/test/fixtures/catalog.ts`**（含 basic/pixijs-2d，让 resolve 走通）

```typescript
import type { CatalogIndex } from "@cq/resolver";

export function fixtureCatalog(): CatalogIndex {
  return {
    generatedAt: "2026-06-02T00:00:00.000Z",
    forgeaxRoot: "/fake/forgeax",
    templates: [
      {
        id: "basic/pixijs-2d", kind: "basic", desc: "2D 基础模板",
        dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true,
        intentTerms: [], signatureTerms: [],
      },
      {
        id: "match3-candy", kind: "gameplay", desc: "三消糖果",
        dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true,
        intentTerms: ["消除", "连连看"], signatureTerms: ["三消"],
      },
    ],
    skills: [],
    mcp: [{ server: "as-mate-tools", port: "15200" }],
  };
}
```

- [ ] **Step 3: 写失败测试 `apps/server/test/routes.test.ts`**（非 SSE 路由用 `app.inject`）

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { createInitialState } from "@cq/conversation";
import { fakeLlm } from "./fixtures/fakeLlm.js";
import { fixtureCatalog } from "./fixtures/catalog.js";

let dir: string;
function makeApp() {
  const store = new FileSessionStore(dir);
  return {
    app: buildServer({
      llm: fakeLlm([]), store, catalog: fixtureCatalog(),
      systemPrompt: "SYS", profile: "workbench", exportDir: join(dir, "exports"),
    }),
    store,
  };
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-routes-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("routes", () => {
  it("GET /api/health → ok", async () => {
    const { app } = makeApp();
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });

  it("POST /api/session 创建并返回开场白", async () => {
    const { app } = makeApp();
    const r = await app.inject({ method: "POST", url: "/api/session" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.opening).toContain("NewBee");
    await app.close();
  });

  it("GET /api/session/:id 取快照；未知 id → 404", async () => {
    const { app } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();
    const ok = await app.inject({ method: "GET", url: `/api/session/${created.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stage).toBe(0);
    const miss = await app.inject({ method: "GET", url: "/api/session/nope" });
    expect(miss.statusCode).toBe(404);
    await app.close();
  });

  it("POST export：工程信号不全 → 409；齐全 → 200 含 resolution", async () => {
    const { app, store } = makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/session" })).json();

    const notReady = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(notReady.statusCode).toBe(409);

    const s = createInitialState();
    s.workingTitle = "三消糖果";
    s.pitch = "三消糖果消除小游戏";
    s.mvpScope = { must: ["核心循环"], cut: [] };
    s.engineering = {
      dimension: "2D", engine: "pixijs", platform: ["mobile"],
      modalities: ["image"], genre: "match-3", mechanics: ["swap-match"],
      artStyle: "cartoon", intentTerms: ["消除"], signatureTerms: [],
    };
    await store.save(created.id, s);

    const ok = await app.inject({ method: "POST", url: `/api/session/${created.id}/export` });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.dsl.constraints.dimension).toBe("2D");
    expect(body.resolution.template.primary).toBeTruthy();
    expect(body.gddMarkdown).toContain("三消糖果");
    await app.close();
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run apps/server/test/routes.test.ts`
Expected: FAIL —— 找不到 `../src/server.js`。

- [ ] **Step 5: 实现 `apps/server/src/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  advance, createInitialState, toGddModel, toGameDsl, OPENING_MESSAGE, STAGE_LABELS,
  type ConversationState, type LlmClient,
} from "@cq/conversation";
import { renderGdd } from "@cq/gdd";
import { resolve as resolveCatalog, writeBundle, type CatalogIndex } from "@cq/resolver";
import type { SessionStore } from "./sessionStore.js";
import { initSse, sendEvent, endSse } from "./sse.js";
import { SSE_EVENTS } from "./wire.js";

export interface ServerDeps {
  llm: LlmClient;
  store: SessionStore;
  catalog: CatalogIndex;
  systemPrompt: string;
  profile?: string;
  /** 导出 bundle 落盘根目录，默认 ./data/exports */
  exportDir?: string;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const profile = deps.profile ?? "workbench";
  const exportRoot = deps.exportDir ?? resolve(process.cwd(), "data", "exports");

  app.get("/api/health", async () => ({ ok: true }));

  // 新建会话：state 起于 stage 0，并把开场白记入历史（assistant 角色）
  app.post("/api/session", async () => {
    const state = createInitialState();
    state.history.push({ role: "assistant", content: OPENING_MESSAGE });
    const id = await deps.store.create(state);
    return { id, opening: OPENING_MESSAGE };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id", async (req, reply) => {
    const state = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    return state;
  });

  // 一轮对话：SSE 流式
  app.post<{ Params: { id: string }; Body: { message: string } }>(
    "/api/session/:id/message",
    async (req, reply) => {
      const state = await deps.store.load(req.params.id);
      if (!state) return reply.code(404).send({ error: "session not found" });
      const message = req.body?.message ?? "";

      reply.hijack();
      initSse(reply);
      try {
        const res = await advance(state, message, {
          llm: deps.llm,
          systemPrompt: deps.systemPrompt,
          onToken: (text) => sendEvent(reply, SSE_EVENTS.token, { text }),
        });
        await deps.store.save(req.params.id, res.state);

        if (res.warnings.length) sendEvent(reply, SSE_EVENTS.warning, { messages: res.warnings });
        sendEvent(reply, SSE_EVENTS.state, res.state);
        sendEvent(reply, SSE_EVENTS.stage, {
          stage: res.state.stage,
          label: STAGE_LABELS[res.state.stage] ?? String(res.state.stage),
          readyForSynthesis: res.readyForSynthesis,
        });

        if (res.readyForSynthesis) {
          const { dsl } = toGameDsl(res.state);
          if (dsl) {
            const gddMarkdown = renderGdd(toGddModel(res.state));
            const resolution = resolveCatalog(dsl, deps.catalog, { profile });
            sendEvent(reply, SSE_EVENTS.synthesis, { gddMarkdown, dsl, resolution });
          }
        }
        sendEvent(reply, SSE_EVENTS.done, { readyForSynthesis: res.readyForSynthesis });
      } catch (err) {
        sendEvent(reply, SSE_EVENTS.error, {
          message: err instanceof Error ? err.message : String(err),
        });
        sendEvent(reply, SSE_EVENTS.done, { readyForSynthesis: false });
      } finally {
        endSse(reply);
      }
    },
  );

  // 导出 bundle：缺工程信号 → 409；否则写 {gdd.md, dsl.json, resolution.json}
  app.post<{ Params: { id: string } }>("/api/session/:id/export", async (req, reply) => {
    const state: ConversationState | null = await deps.store.load(req.params.id);
    if (!state) return reply.code(404).send({ error: "session not found" });

    const { dsl, missing } = toGameDsl(state);
    if (!dsl) return reply.code(409).send({ error: "DSL incomplete", missing });

    const gddMarkdown = renderGdd(toGddModel(state));
    const resolution = resolveCatalog(dsl, deps.catalog, { profile });
    const dir = resolve(exportRoot, req.params.id);
    mkdirSync(dir, { recursive: true });
    writeBundle(dir, { gddMarkdown, dsl, resolution });
    return { dir, gddMarkdown, dsl, resolution };
  });

  return app;
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run apps/server/test/routes.test.ts`
Expected: PASS（4 个用例）。若 export 200 用例失败，确认 fixture catalog 含 `basic/pixijs-2d`（resolve 回退用）。

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/server.ts apps/server/test/routes.test.ts apps/server/test/fixtures/fakeLlm.ts apps/server/test/fixtures/catalog.ts
git commit -m "feat(server): buildServer routes (health/session/SSE/export)"
```

---

## Task 6: SSE 端到端冒烟（真实 listen + fetch）

**Files:**
- Test: `apps/server/test/sse.test.ts`

`app.inject` 不适合流式断言，故起真实 server（`port:0`）+ 全局 `fetch` 读流。

- [ ] **Step 1: 写测试 `apps/server/test/sse.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { buildServer } from "../src/server.js";
import { FileSessionStore } from "../src/sessionStore.js";
import { fakeLlm, throwingLlm } from "./fixtures/fakeLlm.js";
import { fixtureCatalog } from "./fixtures/catalog.js";
import type { LlmClient } from "@cq/conversation";

const STATE_SENTINEL = "<<<STATE>>>";
const turn = (reply: string, control: object) => `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cq-sse-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function start(llm: LlmClient) {
  const app = buildServer({ llm, store: new FileSessionStore(dir), catalog: fixtureCatalog(), systemPrompt: "SYS" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as AddressInfo).port;
  return { app, base: `http://127.0.0.1:${port}` };
}

async function readSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe("SSE /api/session/:id/message", () => {
  it("正常一轮：发 token / state / stage / done", async () => {
    const llm = fakeLlm([turn("听起来很治愈！你更想连猫还是连甜点？", { state_delta: { spark: "猫咪连连看" }, stage_complete: false })]);
    const { app, base } = await start(llm);
    const created = await (await fetch(`${base}/api/session`, { method: "POST" })).json();
    const res = await fetch(`${base}/api/session/${created.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "我想做个治愈小游戏" }),
    });
    const text = await readSse(res);
    expect(text).toContain("event: token");
    expect(text).toContain("event: state");
    expect(text).toContain("event: stage");
    expect(text).toContain("event: done");
    expect(text).not.toContain(STATE_SENTINEL); // 哨兵不外泄
    await app.close();
  });

  it("LLM 抛错：发 error 事件且仍收尾 done", async () => {
    const { app, base } = await start(throwingLlm("proxy down"));
    const created = await (await fetch(`${base}/api/session`, { method: "POST" })).json();
    const res = await fetch(`${base}/api/session/${created.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    const text = await readSse(res);
    expect(text).toContain("event: error");
    expect(text).toContain("proxy down");
    expect(text).toContain("event: done");
    await app.close();
  });
});
```

- [ ] **Step 2: 跑测试确认通过**

Run: `pnpm vitest run apps/server/test/sse.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/sse.test.ts
git commit -m "test(server): SSE smoke (token/state/stage/done + error)"
```

---

## Task 7: 真实 LLM 客户端 + 入口 `main.ts`

**Files:**
- Create: `apps/server/src/llm/openaiClient.ts`
- Create: `apps/server/src/main.ts`

> 本任务不写自动化测试（涉及真实代理/网络）；用一次手动冒烟验证。逻辑已被 fakeLlm 路径覆盖。

- [ ] **Step 1: 实现 `apps/server/src/llm/openaiClient.ts`**

```typescript
import OpenAI from "openai";
import type { ChatMessage, LlmClient } from "@cq/conversation";

export interface OpenAiOptions {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** 用 OpenAI 兼容客户端（指向 LiteLLM Proxy）实现 LlmClient.stream。 */
export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: OpenAiOptions) {
    this.client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });
    for await (const part of completion) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
```

- [ ] **Step 2: 实现 `apps/server/src/main.ts`**

```typescript
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

  const app = buildServer({ llm, store, catalog, systemPrompt, profile: "workbench" });
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
  console.log(`[server] listening on http://localhost:${cfg.PORT} — ${catalog.templates.length} templates`);
}

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 3: 手动冒烟（需有效 `.env`）**

Run: `cp .env.example .env`（若无），填入 `LLM_API_KEY`，然后 `pnpm dev:server`
Expected: 打印 `[server] listening on http://localhost:8420 — N templates`。
Run（另开终端）: `curl -s localhost:8420/api/health`
Expected: `{"ok":true}`

- [ ] **Step 4: typecheck**

Run: `tsc --noEmit -p tsconfig.json`
Expected: 干净退出（server 源被根 tsconfig 校验）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/llm/openaiClient.ts apps/server/src/main.ts
git commit -m "feat(server): OpenAI-compatible LLM client + main entry"
```

---

## Task 8: web 脚手架 + SSE 解析纯函数

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/types.ts`
- Create: `apps/web/src/sse.ts`
- Test: `apps/web/test/sse.test.ts`

- [ ] **Step 1: 写 `apps/web/package.json`**

```json
{
  "name": "@cq/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 2: 写 `apps/web/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NewBee · 游戏共创</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 写 `apps/web/vite.config.ts`**（dev 代理 /api → server）

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8420" },
  },
});
```

- [ ] **Step 4: 写 `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: 写 `apps/web/src/types.ts`**（自描述线缆 DTO，运行时不引 workspace 包）

```typescript
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** ConversationState 的渲染子集（与 server 的完整快照结构兼容，取所需字段）。 */
export interface RecognizedState {
  stage: number;
  spark?: string;
  coreEmotion?: string;
  coreFantasy?: string;
  coreAction?: string;
  theme?: string;
  world?: string;
  aesthetic?: string;
  pitch?: string;
  loop?: { thirtySec?: string; fiveMin?: string; thirtyMin?: string; longTerm?: string };
  keywordPools?: Record<string, string[]>;
  mvpScope?: { must: string[]; cut: string[] };
  engineering?: {
    dimension?: string;
    engine?: string;
    platform?: string[];
    modalities?: string[];
    genre?: string;
    mechanics?: string[];
    artStyle?: string;
  };
  constitution?: string[];
}

export interface StageInfo { stage: number; label: string; readyForSynthesis: boolean }

export interface ResolvedItem { id?: string; server?: string; layer?: string; phase?: string; load?: string; trigger?: string }
export interface ResolutionView {
  template: { primary: string; references: string[] };
  skills: ResolvedItem[];
  mcp: ResolvedItem[];
  packages: ResolvedItem[];
  warnings: string[];
}
export interface SynthesisPayload {
  gddMarkdown: string;
  dsl: unknown;
  resolution: ResolutionView;
}
```

- [ ] **Step 6: 写失败测试 `apps/web/test/sse.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseSseEvents } from "../src/sse.js";

describe("parseSseEvents", () => {
  it("解析完整帧，残片留在 rest", () => {
    const buf =
      `event: token\ndata: {"text":"你好"}\n\n` +
      `event: stage\ndata: {"stage":2,"label":"核心体验+四元素","readyForSynthesis":false}\n\n` +
      `event: token\ndata: {"text":"未完`;
    const { events, rest } = parseSseEvents(buf);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "token", data: { text: "你好" } });
    expect(events[1].data).toMatchObject({ stage: 2 });
    expect(rest.startsWith("event: token")).toBe(true);
  });

  it("无完整帧时 events 空、rest 原样", () => {
    const { events, rest } = parseSseEvents("event: token\ndata: {");
    expect(events).toEqual([]);
    expect(rest).toBe("event: token\ndata: {");
  });
});
```

- [ ] **Step 7: 跑测试确认失败**

Run: `pnpm vitest run apps/web/test/sse.test.ts`
Expected: FAIL —— 找不到 `../src/sse.js`。

- [ ] **Step 8: 实现 `apps/web/src/sse.ts`**

```typescript
export interface SseEvent {
  event: string;
  data: unknown;
}

/** 从累积缓冲里切出完整 SSE 帧（以空行分隔），剩余残片回传 rest。 */
export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
    } catch {
      // 跳过无法解析的帧（残缺/非 JSON）
    }
  }
  return { events, rest };
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `pnpm vitest run apps/web/test/sse.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 10: 装依赖 + Commit**

```bash
pnpm install
git add apps/web/package.json apps/web/index.html apps/web/vite.config.ts apps/web/tsconfig.json apps/web/src/types.ts apps/web/src/sse.ts apps/web/test/sse.test.ts pnpm-lock.yaml
git commit -m "feat(web): scaffold Vite+React app + SSE frame parser"
```

---

## Task 9: web API 客户端 + 会话 hook

**Files:**
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/hooks/useSession.ts`

> 本任务为浏览器运行时逻辑（fetch/stream/React state），不写自动化测试；纯函数 `parseSseEvents` 已在 Task 8 覆盖。手动验证在 Task 11。

- [ ] **Step 1: 实现 `apps/web/src/api.ts`**

```typescript
import { parseSseEvents, type SseEvent } from "./sse.js";
import type { RecognizedState, SynthesisPayload } from "./types.js";

const BASE = "/api";

export async function createSession(): Promise<{ id: string; opening: string }> {
  const r = await fetch(`${BASE}/session`, { method: "POST" });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  return r.json();
}

export async function getSession(id: string): Promise<RecognizedState> {
  const r = await fetch(`${BASE}/session/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

export interface SseHandlers {
  onToken?: (text: string) => void;
  onState?: (state: RecognizedState) => void;
  onStage?: (info: { stage: number; label: string; readyForSynthesis: boolean }) => void;
  onSynthesis?: (payload: SynthesisPayload) => void;
  onWarning?: (messages: string[]) => void;
  onError?: (message: string) => void;
  onDone?: (readyForSynthesis: boolean) => void;
}

function dispatch(ev: SseEvent, h: SseHandlers): void {
  switch (ev.event) {
    case "token": h.onToken?.((ev.data as { text: string }).text); break;
    case "state": h.onState?.(ev.data as RecognizedState); break;
    case "stage": h.onStage?.(ev.data as { stage: number; label: string; readyForSynthesis: boolean }); break;
    case "synthesis": h.onSynthesis?.(ev.data as SynthesisPayload); break;
    case "warning": h.onWarning?.((ev.data as { messages: string[] }).messages); break;
    case "error": h.onError?.((ev.data as { message: string }).message); break;
    case "done": h.onDone?.((ev.data as { readyForSynthesis: boolean }).readyForSynthesis); break;
  }
}

/** POST 一条消息并消费 SSE 流。 */
export async function sendMessage(id: string, message: string, handlers: SseHandlers): Promise<void> {
  const res = await fetch(`${BASE}/session/${id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) throw new Error(`sendMessage failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(buffer);
    buffer = rest;
    for (const ev of events) dispatch(ev, handlers);
  }
}

export async function exportBundle(id: string): Promise<SynthesisPayload & { dir: string }> {
  const r = await fetch(`${BASE}/session/${id}/export`, { method: "POST" });
  if (!r.ok) throw new Error(`export failed: ${r.status}`);
  return r.json();
}
```

- [ ] **Step 2: 实现 `apps/web/src/hooks/useSession.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, getSession, sendMessage, exportBundle } from "../api.js";
import type { ChatMessage, RecognizedState, StageInfo, SynthesisPayload } from "../types.js";

export interface UseSession {
  messages: ChatMessage[];
  state: RecognizedState | null;
  stage: StageInfo | null;
  synthesis: SynthesisPayload | null;
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  doExport: () => Promise<void>;
}

export function useSession(): UseSession {
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<RecognizedState | null>(null);
  const [stage, setStage] = useState<StageInfo | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef<string>("");

  useEffect(() => {
    createSession()
      .then(({ id, opening }) => {
        setId(id);
        setMessages([{ role: "assistant", content: opening }]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    streamingRef.current = "";

    await sendMessage(id, text, {
      onToken: (t) => {
        streamingRef.current += t;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: streamingRef.current };
          return copy;
        });
      },
      onState: (s) => setState(s),
      onStage: (info) => setStage(info),
      onSynthesis: (p) => setSynthesis(p),
      onError: (msg) => setError(msg),
      onDone: () => setBusy(false),
    }).catch((e) => {
      setError(String(e));
      setBusy(false);
    });
  }, [id, busy]);

  const doExport = useCallback(async () => {
    if (!id) return;
    try {
      const res = await exportBundle(id);
      setSynthesis(res);
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  // 刷新页面后可按需补拉快照（保留 hook，UI 暂不触发）
  void getSession;

  return { messages, state, stage, synthesis, busy, error, send, doExport };
}
```

- [ ] **Step 3: typecheck（web）**

Run: `pnpm --filter @cq/web typecheck`
Expected: 干净退出。若报 React 类型缺失，确认 `@types/react`/`@types/react-dom` 已装（Task 8 Step 10）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/hooks/useSession.ts
git commit -m "feat(web): API client + useSession hook (SSE streaming)"
```

---

## Task 10: web UI 组件 + 应用壳

**Files:**
- Create: `apps/web/src/components/ChatPanel.tsx`
- Create: `apps/web/src/components/StatePanel.tsx`
- Create: `apps/web/src/components/ResolutionPreview.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: 实现 `apps/web/src/components/ChatPanel.tsx`**（左：对话流 + 输入）

```tsx
import { useState } from "react";
import type { ChatMessage } from "../types.js";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft("");
  };
  return (
    <div className="chat">
      <div className="chat-stream">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-role">{m.role === "user" ? "你" : "NewBee"}</div>
            <div className="bubble-text">{m.content || (busy ? "…" : "")}</div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={draft}
          placeholder="说说你的脑洞…（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button disabled={busy} onClick={submit}>{busy ? "思考中…" : "发送"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 `apps/web/src/components/StatePanel.tsx`**（右：阶段进度 + 已识别状态 + GDD 草稿）

```tsx
import type { RecognizedState, StageInfo } from "../types.js";

interface Props {
  state: RecognizedState | null;
  stage: StageInfo | null;
}

function Row({ label, value }: { label: string; value?: string | string[] }) {
  const text = Array.isArray(value) ? value.join(" / ") : value;
  if (!text) return null;
  return (
    <div className="state-row">
      <span className="state-label">{label}</span>
      <span className="state-value">{text}</span>
    </div>
  );
}

export function StatePanel({ state, stage }: Props) {
  const eng = state?.engineering;
  return (
    <div className="state-panel">
      <h3>实时识别状态{stage ? ` · 阶段 ${stage.stage}（${stage.label}）` : ""}</h3>
      {!state && <p className="muted">开始对话后，这里会实时显示游戏正在成形的样子。</p>}
      {state && (
        <>
          <Row label="一句话" value={state.pitch} />
          <Row label="火花" value={state.spark} />
          <Row label="核心情绪" value={state.coreEmotion} />
          <Row label="核心动作" value={state.coreAction} />
          <Row label="核心幻想" value={state.coreFantasy} />
          <Row label="主题/世界" value={state.theme ?? state.world} />
          <Row label="视听" value={state.aesthetic} />
          <Row label="30s 循环" value={state.loop?.thirtySec} />
          <Row label="维度/引擎" value={eng ? [eng.dimension, eng.engine].filter(Boolean).join(" · ") : undefined} />
          <Row label="平台" value={eng?.platform} />
          <Row label="题材" value={eng?.genre} />
          <Row label="机制" value={eng?.mechanics} />
          <Row label="模态" value={eng?.modalities} />
          <Row label="MVP 必做" value={state.mvpScope?.must} />
          <Row label="宪法" value={state.constitution} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 实现 `apps/web/src/components/ResolutionPreview.tsx`**（收敛后：精确选择预览 + 导出）

```tsx
import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload | null;
  canExport: boolean;
  onExport: () => void;
}

export function ResolutionPreview({ synthesis, canExport, onExport }: Props) {
  return (
    <div className="resolution">
      <div className="resolution-head">
        <h3>精确选择预览</h3>
        <button disabled={!canExport} onClick={onExport}>导出 bundle</button>
      </div>
      {!synthesis && <p className="muted">聊到收敛后，这里会显示要做什么 + 精确取的 template/skill/mcp。</p>}
      {synthesis && (
        <div className="resolution-body">
          <div className="res-block">
            <strong>主模板</strong> {synthesis.resolution.template.primary}
            {synthesis.resolution.template.references.length > 0 && (
              <span className="muted">（参考：{synthesis.resolution.template.references.join(", ")}）</span>
            )}
          </div>
          <div className="res-block">
            <strong>Skills（{synthesis.resolution.skills.length}）</strong>
            <ul>{synthesis.resolution.skills.map((s) => <li key={s.id}>{s.id} · {s.layer}/{s.load}{s.trigger ? ` · ${s.trigger}` : ""}</li>)}</ul>
          </div>
          <div className="res-block">
            <strong>MCP（{synthesis.resolution.mcp.length}）</strong>
            <ul>{synthesis.resolution.mcp.map((m) => <li key={m.server}>{m.server} · {m.layer}/{m.phase}</li>)}</ul>
          </div>
          {synthesis.resolution.warnings.length > 0 && (
            <div className="res-warn">⚠ {synthesis.resolution.warnings.join("；")}</div>
          )}
          <details className="gdd-draft">
            <summary>GDD 草稿（Markdown）</summary>
            <pre>{synthesis.gddMarkdown}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 实现 `apps/web/src/App.tsx`**

```tsx
import { useSession } from "./hooks/useSession.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { StatePanel } from "./components/StatePanel.js";
import { ResolutionPreview } from "./components/ResolutionPreview.js";
import "./styles.css";

export function App() {
  const s = useSession();
  return (
    <div className="app">
      <header className="app-header">
        <h1>NewBee · 游戏共创</h1>
        {s.error && <span className="err">出错：{s.error}</span>}
      </header>
      <main className="app-main">
        <section className="col col-left">
          <ChatPanel messages={s.messages} busy={s.busy} onSend={s.send} />
        </section>
        <section className="col col-right">
          <StatePanel state={s.state} stage={s.stage} />
          <ResolutionPreview
            synthesis={s.synthesis}
            canExport={Boolean(s.stage?.readyForSynthesis)}
            onExport={s.doExport}
          />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: 实现 `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: 实现 `apps/web/src/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0f1115; color: #e6e8ec; }
.app { display: flex; flex-direction: column; height: 100vh; }
.app-header { padding: 12px 20px; border-bottom: 1px solid #232734; display: flex; align-items: center; gap: 16px; }
.app-header h1 { font-size: 16px; margin: 0; }
.err { color: #ff6b6b; font-size: 13px; }
.app-main { flex: 1; display: grid; grid-template-columns: 1fr 420px; min-height: 0; }
.col { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.col-right { border-left: 1px solid #232734; overflow-y: auto; }

.chat { display: flex; flex-direction: column; height: 100%; }
.chat-stream { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.bubble { max-width: 78%; padding: 10px 14px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; }
.bubble.user { align-self: flex-end; background: #2b6ef2; }
.bubble.assistant { align-self: flex-start; background: #1b1f29; }
.bubble-role { font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
.chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #232734; }
.chat-input textarea { flex: 1; resize: none; height: 56px; background: #1b1f29; color: inherit; border: 1px solid #2c3344; border-radius: 8px; padding: 8px; }
.chat-input button { padding: 0 18px; background: #2b6ef2; color: #fff; border: 0; border-radius: 8px; cursor: pointer; }
.chat-input button:disabled { opacity: 0.5; cursor: default; }

.state-panel, .resolution { padding: 16px 18px; border-bottom: 1px solid #232734; }
.state-panel h3, .resolution h3 { font-size: 14px; margin: 0 0 10px; }
.muted { opacity: 0.5; font-size: 13px; }
.state-row { display: flex; gap: 10px; padding: 4px 0; font-size: 13px; }
.state-label { min-width: 72px; opacity: 0.6; }
.state-value { flex: 1; }
.resolution-head { display: flex; justify-content: space-between; align-items: center; }
.resolution-head button { background: #2bb673; color: #fff; border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.resolution-head button:disabled { opacity: 0.4; cursor: default; }
.res-block { font-size: 13px; margin: 8px 0; }
.res-block ul { margin: 4px 0 0; padding-left: 18px; }
.res-warn { color: #ffb454; font-size: 12px; margin-top: 8px; }
.gdd-draft pre { max-height: 240px; overflow: auto; background: #0b0d12; padding: 10px; border-radius: 8px; font-size: 12px; }
```

- [ ] **Step 7: typecheck（web）**

Run: `pnpm --filter @cq/web typecheck`
Expected: 干净退出。

- [ ] **Step 8: 构建确认 web 可打包**

Run: `pnpm --filter @cq/web build`
Expected: Vite 产出 `apps/web/dist/`，无类型/打包错误。

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components apps/web/src/App.tsx apps/web/src/main.tsx apps/web/src/styles.css
git commit -m "feat(web): chat/state/resolution UI + app shell"
```

---

## Task 11: 端到端联调 + 全量回归

**Files:**
- 无新增（验证 + 文档勾选）

- [ ] **Step 1: 全量自动化测试**

Run: `pnpm test`
Expected: 全绿——含 M0/M1、M2（conversation + dsl schema）、M3（server config/sse helper/sessionStore/routes/sse + web sse parser）。

- [ ] **Step 2: 全量 typecheck（含 web）**

Run: `pnpm typecheck`
Expected: 两个 tsc 调用都干净退出（根 + web）。

- [ ] **Step 3: 手动端到端（需有效 `.env`）**

Run（终端 A）: `pnpm dev:server`
Run（终端 B）: `pnpm dev:web`
打开 `http://localhost:5173`：
- 左栏出现 NewBee 开场白；输入一句脑洞 → 看到 token 流式回复；
- 右栏「实时识别状态」随对话增量刷新（spark/情绪/动作/维度…）；
- 多轮聊到工程信号齐全 → 阶段推进到收敛、`readyForSynthesis` 为真 → 「精确选择预览」出现主模板/skills/mcp；
- 点「导出 bundle」→ `data/exports/<id>/` 下生成 `gdd.md`/`dsl.json`/`resolution.json`。

Expected: 全链路打通（spec §5 数据流）。

- [ ] **Step 4: Commit（若有遗留改动）**

```bash
git add -A
git commit -m "chore: M3 green — full regression + e2e wiring"
```

---

## Self-Review（写完计划后自查，见文末汇总）

M3 覆盖 spec：§4 目录结构（apps/web + apps/server，依赖方向单向：T1/T2/T8） · §5 数据流（POST message→SSE→advance→收敛调 gdd/dsl/resolver→预览/导出：T5/T9/T10） · §6.5 web（左对话流 SSE + 右实时 GDD/状态 + resolution 预览 + 一键导出：T8–T10） · §6.6 server（会话生命周期/SSE/LLM 客户端 env/收敛调 gdd-dsl-resolver/本地落盘可续：T2–T7） · §7 交接 bundle（export 端点调 `writeBundle`：T5） · §8 错误处理（LLM 失败发 error 事件且状态已落盘可续：T5/T6；DSL 必填缺失 export 409、引擎不导半截：T5） · §9 测试（server SSE 连通 + error 冒烟：T6；web SSE 解析单测：T8） · §10 里程碑 M3。LLM 真实接入（§6.6 / D6）：`OpenAiLlmClient` 指向 LiteLLM Proxy、参数走 env（T7）。
