-- Widen llm_response_cache PK to match the full read/write key.
-- read()/write() filter on (content_hash, provider, model, operation,
-- config_hash); the old (content_hash, config_hash) PK let onConflictDoNothing
-- silently drop writes that differed only by provider/model/operation —
-- a cache-miss-forever cost leak after a provider or model switch.
-- (drizzle-kit also re-emitted the pre-existing embedding_cache table and
-- articles.embedding column due to snapshot drift from the hand-written
-- 0019 migration; those statements are intentionally omitted here since the
-- objects already exist. The 0020 snapshot heals the drift going forward.)
ALTER TABLE "llm_response_cache" DROP CONSTRAINT "llm_response_cache_content_hash_config_hash_pk";--> statement-breakpoint
ALTER TABLE "llm_response_cache" ADD CONSTRAINT "llm_response_cache_content_hash_provider_model_operation_config_hash_pk" PRIMARY KEY("content_hash","provider","model","operation","config_hash");
