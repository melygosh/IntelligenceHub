import { Injectable, Logger, Optional } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadEnv } from '../common/config/env';
import type { FetchedFeed } from './feed-fetcher.service';

// Versioned key prefix so a future change to the cached shape can't collide
// with stale entries (bump v1 → v2 to invalidate everything at once).
const KEY_PREFIX = 'feedfetch:v1:';

/** The slice of ioredis this cache needs — narrows the surface for testing. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
}

/**
 * Read-through cache for a fetched + parsed feed, keyed by URL.
 *
 * Feeds are per-user rows, so a feed subscribed by N users is N rows with the
 * same URL — and the scheduled sweep fans out one pull per row, re-fetching the
 * same RSS N times per tick. This cache collapses that: within the TTL, the
 * first subscriber's pull populates the cache and every other subscriber's pull
 * of the same URL reuses it. Per-user dedup/filter/insert still run on each
 * pull (they read each user's own DB rows) — only the network fetch + parse is
 * shared, the same global-vs-per-user boundary as the LLM extract cache.
 *
 * Safety properties:
 * - **Successes only.** A failed loader rethrows uncached, so one transient blip
 *   isn't pinned across all subscribers for the whole TTL.
 * - **Best-effort.** Any Redis error falls back to a live fetch; caching can
 *   never break ingestion.
 * - **TTL < sweep interval (enforced by config default 120s « 15min cron).**
 *   Guarantees every scheduled sweep still does one genuine fresh fetch — the
 *   cache only deduplicates the within-sweep fan-out, never staleness across
 *   ticks. TTL <= 0 disables the cache entirely.
 */
@Injectable()
export class FeedFetchCache {
  private readonly log = new Logger(FeedFetchCache.name);
  private readonly redis: RedisLike;
  private readonly ttlSeconds: number;

  // Params are @Optional() so Nest DI (which can't resolve a RedisLike/number)
  // passes undefined and the constructor builds the real client + reads the env
  // TTL. Tests construct directly with a fake Redis + explicit TTL.
  constructor(@Optional() redis?: RedisLike, @Optional() ttlSeconds?: number) {
    if (redis) {
      this.redis = redis;
    } else {
      const url = new URL(process.env.REDIS_URL ?? 'redis://redis:6379');
      const client = new Redis({
        host: url.hostname,
        port: Number(url.port || 6379),
      });
      client.on('error', (e) =>
        this.log.error(`feed-fetch-cache redis: ${e.message}`),
      );
      this.redis = client;
    }
    this.ttlSeconds = ttlSeconds ?? loadEnv().FEED_FETCH_CACHE_TTL_SECONDS;
  }

  async getOrFetch(
    url: string,
    loader: () => Promise<FetchedFeed>,
  ): Promise<FetchedFeed> {
    if (this.ttlSeconds <= 0) return loader(); // cache disabled

    const key = KEY_PREFIX + url;

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.log.log(JSON.stringify({ event: 'feed.fetch.cache_hit', url }));
        return reviveFeed(JSON.parse(cached) as FetchedFeed);
      }
    } catch (e) {
      // Read failure → fall through to a live fetch. Never throw from caching.
      this.log.warn(
        `feed-fetch-cache read failed for ${url}: ${(e as Error).message}`,
      );
    }

    // Miss (or read error): do the real fetch. If it throws, propagate WITHOUT
    // caching — the next subscriber gets a fresh attempt instead of a pinned
    // error.
    const feed = await loader();
    this.log.log(JSON.stringify({ event: 'feed.fetch.cache_miss', url }));

    try {
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(feed));
    } catch (e) {
      this.log.warn(
        `feed-fetch-cache write failed for ${url}: ${(e as Error).message}`,
      );
    }
    return feed;
  }
}

/**
 * `FetchedItem.ts` is a Date; JSON.stringify turns it into an ISO string, so a
 * cache hit must revive it to a Date — downstream article inserts call Date
 * methods / pass it to Drizzle expecting the same shape as a live fetch.
 */
function reviveFeed(raw: FetchedFeed): FetchedFeed {
  return {
    title: raw.title,
    iconUrl: raw.iconUrl,
    items: raw.items.map((it) => ({ ...it, ts: new Date(it.ts) })),
  };
}
