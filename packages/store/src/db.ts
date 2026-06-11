import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Database;
  /** 关闭底层连接池（测试/优雅退出用） */
  close(): Promise<void>;
}

/**
 * 建立 Postgres 连接并绑定 drizzle。
 * @param connectionString 形如 postgres://user:pass@host:5432/dbname
 */
export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(connectionString, { max: opts.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
