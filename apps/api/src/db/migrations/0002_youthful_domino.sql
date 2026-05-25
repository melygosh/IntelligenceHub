ALTER TABLE "articles" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "filter_reason" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "last_pull_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "last_pull_error" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "pull_interval_seconds" integer DEFAULT 900 NOT NULL;