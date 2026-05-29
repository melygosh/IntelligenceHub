import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { embeddingCache } from '../db/schema';
import { loadEnv } from '../common/config/env';

const EMBEDDING_DIM = 1536;

@Injectable()
export class EmbeddingService {
  private readonly log = new Logger(EmbeddingService.name);
  // Lazy: only constructed when the first embed call lands AND a key resolves.
  // Keeps the service injectable in environments where embeddings are disabled.
  private client: OpenAI | null = null;
  private clientChecked = false;

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * True when the feature toggle is ON and an API key is configured. Both
   * gates must pass — the toggle authorises the cost, the key makes calls
   * work. The Zod superRefine in env.ts requires the key when ENABLED=true,
   * so this just defensively re-checks. Cheap — reads from the env cache.
   */
  isEnabled(): boolean {
    const env = loadEnv();
    return env.SEMANTIC_SIMILARITY_ENABLED && !!env.SEMANTIC_SIMILARITY_API_KEY;
  }

  /**
   * Embed one article body, content-hash-keyed cache in front of the API call.
   * Returns null when the feature is disabled OR the call fails — never
   * throws into the worker. A null return means "skip the persist step";
   * the lazy backfill path will retry on next view.
   */
  async embed(contentHash: string, body: string): Promise<number[] | null> {
    if (!this.isEnabled()) return null;

    const [cached] = await this.db
      .select({ embedding: embeddingCache.embedding })
      .from(embeddingCache)
      .where(eq(embeddingCache.contentHash, contentHash))
      .limit(1);
    if (cached) {
      this.log.log(JSON.stringify({ event: 'embed.cache.hit', contentHash }));
      return cached.embedding;
    }

    const client = this.getClient();
    if (!client) return null;

    const env = loadEnv();
    const start = Date.now();
    try {
      const res = await client.embeddings.create({
        model: env.SEMANTIC_SIMILARITY_MODEL,
        input: body,
      });
      const vec = res.data[0]?.embedding;
      if (!vec || vec.length !== EMBEDDING_DIM) {
        this.log.warn(
          JSON.stringify({
            event: 'embed.invalid_response',
            contentHash,
            got: vec?.length,
          }),
        );
        return null;
      }
      // Cache. ON CONFLICT DO NOTHING — concurrent embeds of the same body
      // would otherwise raise; one of them wins, both return the same data.
      await this.db
        .insert(embeddingCache)
        .values({ contentHash, embedding: vec })
        .onConflictDoNothing();
      this.log.log(
        JSON.stringify({
          event: 'embed.api.ok',
          contentHash,
          latencyMs: Date.now() - start,
        }),
      );
      return vec;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        JSON.stringify({
          event: 'embed.api.failed',
          contentHash,
          latencyMs: Date.now() - start,
          error: msg,
        }),
      );
      return null;
    }
  }

  private getClient(): OpenAI | null {
    if (this.clientChecked) return this.client;
    this.clientChecked = true;
    const apiKey = loadEnv().SEMANTIC_SIMILARITY_API_KEY;
    if (!apiKey) {
      this.client = null;
      return null;
    }
    // Provider enum is constrained to 'openai' today; when a second
    // provider lands, switch on env.SEMANTIC_SIMILARITY_PROVIDER and
    // construct the right client here.
    this.client = new OpenAI({ apiKey });
    return this.client;
  }
}
