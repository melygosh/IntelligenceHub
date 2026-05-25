ALTER TABLE "llm_response_cache" ADD COLUMN "config_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_response_cache" DROP CONSTRAINT "llm_response_cache_pkey";--> statement-breakpoint
ALTER TABLE "llm_response_cache" ADD CONSTRAINT "llm_response_cache_content_hash_config_hash_pk" PRIMARY KEY("content_hash","config_hash");
