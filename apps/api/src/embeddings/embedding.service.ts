import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { embeddingCache } from '../db/schema';
import { loadEnv } from '../common/config/env';

const EMBEDDING_DIM = 1536;

/**
 * Classify an OpenAI embeddings error as transient (worth retrying) or
 * permanent (won't help).
 *
 *   transient → network failure, timeout, 5xx, 429 rate-limit
 *   permanent → 4xx (except 429), malformed input, auth — retry pointless
 *
 * The OpenAI SDK exposes `.status` on API errors. Plain network errors
 * (DNS, connection-refused, socket hangup) have no status — we treat
 * those as transient by default.
 */
function isTransientEmbeddingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const status = (err as { status?: number }).status;
  if (typeof status !== 'number') return true; // network / unknown → retry
  if (status === 429) return true; // rate limit
  if (status >= 500 && status < 600) return true; // server error
  return false; // 4xx (auth, bad request, ...) — permanent
}

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
   *
   * `onLog`, when provided, receives narrative progress lines — e.g. from
   * a BullMQ worker passing `job.log` so each line is visible per-job in
   * Bull Board. Falls through to a no-op when absent.
   */
  async embed(
    contentHash: string,
    body: string,
    opts: { onLog?: (msg: string) => unknown } = {},
  ): Promise<number[] | null> {
    const log = opts.onLog ?? (() => undefined);
    if (!this.isEnabled()) {
      await log('skip: SEMANTIC_SIMILARITY_ENABLED=false or missing API key');
      return null;
    }

    const hashTag = contentHash.slice(0, 10);
    await log(`embed start: hash=${hashTag}… body_len=${body.length} chars`);

    const cacheStart = Date.now();
    const [cached] = await this.db
      .select({ embedding: embeddingCache.embedding })
      .from(embeddingCache)
      .where(eq(embeddingCache.contentHash, contentHash))
      .limit(1);
    if (cached) {
      this.log.log(JSON.stringify({ event: 'embed.cache.hit', contentHash }));
      await log(
        `cache hit (lookup ${Date.now() - cacheStart}ms) — skipping API`,
      );
      return cached.embedding;
    }
    await log(`cache miss (lookup ${Date.now() - cacheStart}ms)`);

    const client = this.getClient();
    if (!client) {
      await log('skip: no OpenAI client (key missing)');
      return null;
    }

    const env = loadEnv();
    const apiStart = Date.now();
    await log(
      `calling ${env.SEMANTIC_SIMILARITY_PROVIDER}:${env.SEMANTIC_SIMILARITY_MODEL}…`,
    );
    try {
      const res = await client.embeddings.create({
        model: env.SEMANTIC_SIMILARITY_MODEL,
        input: body,
      });
      const vec = res.data[0]?.embedding;
      const tokens = res.usage?.total_tokens;
      const apiMs = Date.now() - apiStart;
      if (!vec || vec.length !== EMBEDDING_DIM) {
        this.log.warn(
          JSON.stringify({
            event: 'embed.invalid_response',
            contentHash,
            got: vec?.length,
          }),
        );
        await log(
          `INVALID response: got ${vec?.length ?? 'no'} dims (need ${EMBEDDING_DIM})`,
        );
        return null;
      }
      await log(
        `api ok: ${vec.length} dims, ${tokens ?? '?'} tokens, ${apiMs}ms`,
      );
      // Cache. ON CONFLICT DO NOTHING — concurrent embeds of the same body
      // would otherwise raise; one of them wins, both return the same data.
      const cacheWriteStart = Date.now();
      await this.db
        .insert(embeddingCache)
        .values({ contentHash, embedding: vec })
        .onConflictDoNothing();
      this.log.log(
        JSON.stringify({
          event: 'embed.api.ok',
          contentHash,
          latencyMs: apiMs,
          tokens,
        }),
      );
      await log(`cache write ${Date.now() - cacheWriteStart}ms`);
      return vec;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      const transient = isTransientEmbeddingError(err);
      this.log.warn(
        JSON.stringify({
          event: 'embed.api.failed',
          contentHash,
          latencyMs: Date.now() - apiStart,
          transient,
          status,
          error: msg,
        }),
      );
      await log(
        `api FAILED: status=${status ?? 'network'} transient=${transient} after ${
          Date.now() - apiStart
        }ms — ${msg}`,
      );
      // Throw on transient errors so the backfill worker's BullMQ retry
      // (attempts:3, 30s backoff) actually kicks in. Return null on
      // permanent errors (bad key, malformed request) — retrying won't
      // help. Inline callers (analyzePending) wrap this in their own
      // best-effort try/catch and treat both the same: skip + move on.
      if (transient) throw err;
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
