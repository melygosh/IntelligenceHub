CREATE TABLE "regeneration_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"config_hash" text NOT NULL,
	"articles_total" integer DEFAULT 0 NOT NULL,
	"articles_processed" integer DEFAULT 0 NOT NULL,
	"articles_cache_hit" integer DEFAULT 0 NOT NULL,
	"articles_llm_called" integer DEFAULT 0 NOT NULL,
	"articles_errored" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "regeneration_run" ADD CONSTRAINT "regeneration_run_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regeneration_run_user_active_idx" ON "regeneration_run" USING btree ("user_id") WHERE "status" = 'running';