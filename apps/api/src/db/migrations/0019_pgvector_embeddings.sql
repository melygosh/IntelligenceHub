-- Semantic similarity (ADR-7 / FR-5 Could-tier bonus).
-- Adds the pgvector extension, a 1536-dim embedding column on articles
-- (matches OpenAI's text-embedding-3-small output), an HNSW index for
-- cosine-distance kNN queries, and a content-hash-keyed cache so a repeated
-- article body short-circuits the embedding API call (same shape as the
-- llm_response_cache pattern).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "articles" ADD COLUMN "embedding" vector(1536);

-- HNSW index for cosine-distance kNN (`embedding <=> $1` operator).
-- Default HNSW parameters are fine at MVP scale; tune m/ef_construction
-- later if recall/latency become an issue.
CREATE INDEX "articles_embedding_hnsw" ON "articles"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "embedding_cache" (
  "content_hash" text PRIMARY KEY,
  "embedding" vector(1536) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
