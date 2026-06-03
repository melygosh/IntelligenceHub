import { FeedFetchCache, type RedisLike } from './feed-fetch-cache';
import type { FetchedFeed } from './feed-fetcher.service';

function sampleFeed(): FetchedFeed {
  return {
    title: 'BBC News',
    iconUrl: 'https://bbc.example/icon.png',
    items: [
      {
        url: 'https://bbc.example/a',
        normalisedUrl: 'https://bbc.example/a',
        title: 'A',
        body: 'body a',
        contentHash: 'hash-a',
        ts: new Date('2026-06-03T10:00:00.000Z'),
      },
    ],
  };
}

class FakeRedis implements RedisLike {
  store = new Map<string, string>();
  getCalls: string[] = [];
  setexCalls: Array<{ key: string; ttl: number; value: string }> = [];
  failGet = false;
  failSet = false;

  async get(key: string): Promise<string | null> {
    this.getCalls.push(key);
    if (this.failGet) throw new Error('redis down');
    return this.store.get(key) ?? null;
  }
  async setex(key: string, ttl: number, value: string): Promise<unknown> {
    this.setexCalls.push({ key, ttl, value });
    if (this.failSet) throw new Error('redis down');
    this.store.set(key, value);
    return 'OK';
  }
}

describe('FeedFetchCache', () => {
  const url = 'https://feeds.bbci.co.uk/news/rss.xml';

  it('on miss: calls loader once and caches the result with the configured TTL', async () => {
    const redis = new FakeRedis();
    const cache = new FeedFetchCache(redis, 120);
    const loader = jest.fn(async () => sampleFeed());

    const result = await cache.getOrFetch(url, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('BBC News');
    expect(redis.setexCalls).toHaveLength(1);
    expect(redis.setexCalls[0].ttl).toBe(120);
    expect(redis.setexCalls[0].key).toContain(url);
  });

  it('on hit: returns the cached feed and does NOT call the loader', async () => {
    const redis = new FakeRedis();
    const cache = new FeedFetchCache(redis, 120);
    await cache.getOrFetch(url, async () => sampleFeed()); // populate

    const loader = jest.fn(async () => sampleFeed());
    const result = await cache.getOrFetch(url, loader);

    expect(loader).not.toHaveBeenCalled();
    expect(result.title).toBe('BBC News');
  });

  it('revives item.ts to a Date on a cache hit (survives JSON round-trip)', async () => {
    const redis = new FakeRedis();
    const cache = new FeedFetchCache(redis, 120);
    await cache.getOrFetch(url, async () => sampleFeed());

    const result = await cache.getOrFetch(url, async () => sampleFeed());

    expect(result.items[0].ts).toBeInstanceOf(Date);
    expect(result.items[0].ts.toISOString()).toBe('2026-06-03T10:00:00.000Z');
  });

  it('does NOT cache when the loader throws (a transient failure is not pinned)', async () => {
    const redis = new FakeRedis();
    const cache = new FeedFetchCache(redis, 120);
    const loader = jest.fn(async () => {
      throw new Error('unreachable');
    });

    await expect(cache.getOrFetch(url, loader)).rejects.toThrow('unreachable');
    expect(redis.setexCalls).toHaveLength(0);
  });

  it('bypasses Redis entirely when TTL <= 0 (cache disabled)', async () => {
    const redis = new FakeRedis();
    const cache = new FeedFetchCache(redis, 0);
    const loader = jest.fn(async () => sampleFeed());

    const result = await cache.getOrFetch(url, loader);

    expect(result.title).toBe('BBC News');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.getCalls).toHaveLength(0);
    expect(redis.setexCalls).toHaveLength(0);
  });

  it('falls back to a live fetch when Redis read errors (best-effort cache)', async () => {
    const redis = new FakeRedis();
    redis.failGet = true;
    const cache = new FeedFetchCache(redis, 120);
    const loader = jest.fn(async () => sampleFeed());

    const result = await cache.getOrFetch(url, loader);

    expect(result.title).toBe('BBC News');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('still returns the feed when Redis write errors (write is best-effort)', async () => {
    const redis = new FakeRedis();
    redis.failSet = true;
    const cache = new FeedFetchCache(redis, 120);

    const result = await cache.getOrFetch(url, async () => sampleFeed());

    expect(result.title).toBe('BBC News');
  });
});
