import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";
import { Repository } from "./repository.js";

/**
 * 起一个进程内 pglite（内存 Postgres），跑迁移后给出 Repository。
 * 供集成测试用，零外部依赖。
 */
export async function createTestRepo(): Promise<{ repo: Repository; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./packages/store/drizzle" });
  // drizzle<pglite> 与 drizzle<postgres-js> 类型同构，Repository 只用通用查询 API。
  const repo = new Repository(db as unknown as ConstructorParameters<typeof Repository>[0]);
  return {
    repo,
    async close() {
      await client.close();
    },
  };
}
