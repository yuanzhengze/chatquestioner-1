CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"card_summary" jsonb NOT NULL,
	"gdd_markdown" text NOT NULL,
	"dsl" jsonb NOT NULL,
	"resolution" jsonb NOT NULL,
	"gamedef" jsonb,
	"export_dir" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"working_title" text,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_session_idx" ON "artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_created_idx" ON "artifacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_updated_idx" ON "sessions" USING btree ("updated_at");