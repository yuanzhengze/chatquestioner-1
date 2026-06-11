import { z } from "zod";

const EnvSchema = z.object({
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gemini-3.1-pro"),
  FORGEAX_ROOT: z.string().default("../forgeax-studio"),
  PORT: z.coerce.number().default(8420),
  /** Postgres 连接串；配置后会话入库 + 启用产出物/后台 API，否则回退文件存储 */
  DATABASE_URL: z.string().optional(),
  KB_EMBEDDING_MODEL: z.string().optional(),
  KB_TOP_K: z.coerce.number().default(3),
});

export type ServerConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ServerConfig {
  return EnvSchema.parse(env);
}
