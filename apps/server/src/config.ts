import { z } from "zod";

const EnvSchema = z.object({
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gpt-5.5"),
  /** 封面生图。默认跟对话同一 LiteLLM 代理。 */
  IMAGE_BASE_URL: z.string().url().optional(),
  IMAGE_API_KEY: z.string().optional(),
  /** LiteLLM 上的出图模型。空字符串则关闭生图，结果页用色块封面。 */
  IMAGE_MODEL: z.string().default("gpt-image-2"),
  IMAGE_SIZE: z.string().default("1024x1024"),
  PORT: z.coerce.number().default(8420),
  /** Postgres 连接串；配置后会话入库 + 启用产出物/后台 API，否则回退文件存储 */
  DATABASE_URL: z.string().optional(),
  KB_EMBEDDING_MODEL: z.string().optional(),
  KB_TOP_K: z.coerce.number().default(3),
});

export type ServerConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ServerConfig {
  const cfg = EnvSchema.parse(env);
  return {
    ...cfg,
    IMAGE_BASE_URL: cfg.IMAGE_BASE_URL || cfg.LLM_BASE_URL,
    IMAGE_API_KEY: cfg.IMAGE_API_KEY || cfg.LLM_API_KEY,
  };
}
