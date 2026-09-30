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
  /**
   * gpt-image-2 接受任意 WIDTHxHEIGHT：两边都是 16 的倍数，长短边不超过 3:1，
   * 总像素在 655360 和 8294400 之间，单边小于 3840。
   * 1536x864 是和原先横向宽度同一档的严格 16:9。封面仍用 IMAGE_SIZE。
   */
  GAMEPLAY_IMAGE_SIZE: z.string().default("1536x864"),
  /** 封面和玩法图共用的生图并发。封面优先级更高，不会被还没开始的玩法图堵住。 */
  IMAGE_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(2),
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
