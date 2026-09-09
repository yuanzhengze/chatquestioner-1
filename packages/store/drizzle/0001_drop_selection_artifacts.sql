--> 精简为「灵感引导 → GDD」：移除选型 DSL / catalog 解析 / 可运行 GameDef 三列。
--> 这三者由已剔除的 resolver / orchestrator 产出，artifacts 现在只保留 GDD 原文。
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "dsl";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "resolution";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "gamedef";
