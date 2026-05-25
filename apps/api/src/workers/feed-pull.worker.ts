import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, count, eq, or } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities, feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import type { FeedPullJobData } from '../feeds/feeds.service';
import { FeedFetcher, type FetchedItem } from '../feeds/feed-fetcher.service';
import { runPreFilter } from '../articles/pre-filter';

const STUB_ENTITIES: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'Microsoft', type: 'company' },
  { name: 'Anthropic', type: 'company' },
  { name: 'OpenAI', type: 'company' },
];

type ProcessResult = {
  feedId: string;
  itemsConsidered: number;
  inserted: number;
  filtered: number;
};

@Processor(QUEUE_NAMES.FEED_PULL)
export class FeedPullWorker extends WorkerHost {
  private readonly log = new Logger(FeedPullWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fetcher: FeedFetcher,
  ) {
    super();
  }

  async process(job: Job<FeedPullJobData>): Promise<ProcessResult> {
    const { feedId, userId } = job.data;
    this.log.log(JSON.stringify({ event: 'feed.pull.start', feedId, userId, jobId: job.id }));

    const [feed] = await this.db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .limit(1);
    if (!feed) {
      this.log.warn(JSON.stringify({ event: 'feed.pull.feed_missing', feedId, userId }));
      throw new Error(`Feed ${feedId} not found for user ${userId}`);
    }

    if (feed.status === 'paused') {
      this.log.log(JSON.stringify({ event: 'feed.pull.skipped_paused', feedId, userId }));
      return { feedId, itemsConsidered: 0, inserted: 0, filtered: 0 };
    }

    try {
      const fetched = await this.fetcher.fetch(feed.url);
      let inserted = 0;
      let filtered = 0;

      for (const item of fetched.items) {
        const persisted = await this.persistItem(userId, feedId, item);
        if (persisted === 'inserted') inserted += 1;
        else filtered += 1;
      }

      await this.db
        .update(feeds)
        .set({
          title: fetched.title,
          status: 'active',
          lastPullAt: new Date(),
          lastPullError: null,
        })
        .where(eq(feeds.id, feedId));

      this.log.log(
        JSON.stringify({
          event: 'feed.pull.done',
          feedId,
          userId,
          jobId: job.id,
          itemsConsidered: fetched.items.length,
          inserted,
          filtered,
        }),
      );

      return { feedId, itemsConsidered: fetched.items.length, inserted, filtered };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db
        .update(feeds)
        .set({ status: 'error', lastPullAt: new Date(), lastPullError: msg })
        .where(eq(feeds.id, feedId));
      this.log.error(
        JSON.stringify({ event: 'feed.pull.failed', feedId, userId, error: msg }),
      );
      throw err;
    }
  }

  private async persistItem(
    userId: string,
    feedId: string,
    item: FetchedItem,
  ): Promise<'inserted' | 'filtered'> {
    const [dup] = await this.db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          or(eq(articles.url, item.normalisedUrl), eq(articles.contentHash, item.contentHash)),
        ),
      )
      .limit(1);
    if (dup) {
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        status: 'filtered',
        filterReason: 'duplicate_url',
        ts: item.ts,
      });
      return 'filtered';
    }

    const verdict = runPreFilter({ title: item.title, body: item.body });
    if (verdict.filtered) {
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        status: 'filtered',
        filterReason: verdict.reason,
        ts: item.ts,
      });
      return 'filtered';
    }

    const [{ value: existingReadyCount }] = await this.db
      .select({ value: count() })
      .from(articles)
      .where(and(eq(articles.userId, userId), eq(articles.status, 'ready')));
    const stub = STUB_ENTITIES[existingReadyCount % STUB_ENTITIES.length];

    const [article] = await this.db
      .insert(articles)
      .values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        status: 'ready',
        ts: item.ts,
      })
      .returning({ id: articles.id });

    const [entity] = await this.db
      .insert(entities)
      .values({ userId, canonicalName: stub.name, type: stub.type })
      .returning({ id: entities.id });

    await this.db.insert(articleEntity).values({ articleId: article.id, entityId: entity.id });

    return 'inserted';
  }
}
