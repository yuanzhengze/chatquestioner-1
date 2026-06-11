import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./db.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未设置");
  process.exit(1);
}

const { db, close } = createDb(url, { max: 1 });
await migrate(db, { migrationsFolder: "./drizzle" });
await close();
console.log("[store] 迁移完成");
