/**
 * 一次性脚本：把 data/sessions/<id>.json 文件会话迁移进 Postgres，保留原 UUID。
 * 用法：DATABASE_URL=... tsx packages/store/src/migrate-sessions.ts [dataDir]
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import type { ConversationState } from "@cq/conversation";
import { createDb } from "./db.js";
import { Repository } from "./repository.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未设置");
  process.exit(1);
}

const dataDir = process.argv[2] ?? "data";
const sessionsDir = resolve(dataDir, "sessions");

const { db, close } = createDb(url, { max: 1 });
const repo = new Repository(db);

let ok = 0;
let skip = 0;
for (const f of readdirSync(sessionsDir)) {
  if (!f.endsWith(".json")) continue;
  const id = basename(f, ".json");
  try {
    const state = JSON.parse(readFileSync(join(sessionsDir, f), "utf8")) as ConversationState;
    await repo.createSessionWithId(id, state);
    ok++;
  } catch (err) {
    console.warn(`[migrate-sessions] 跳过 ${f}:`, err);
    skip++;
  }
}

await close();
console.log(`[migrate-sessions] 完成：导入 ${ok}，跳过 ${skip}`);
