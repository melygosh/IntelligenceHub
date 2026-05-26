CREATE TABLE "digest_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_filter_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"top_entities_json" jsonb,
	"top_categories_json" jsonb,
	"key_articles_json" jsonb,
	"article_count" integer DEFAULT 0 NOT NULL,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"model" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "digest_run" ADD CONSTRAINT "digest_run_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digest_run_user_created_idx" ON "digest_run" USING btree ("user_id","created_at" DESC NULLS LAST);