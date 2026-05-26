import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, eq, or } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import type { FeedPullJobData } from '../feeds/feeds.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- value import required for Nest DI metadata
import { FeedFetcher, type FetchedItem } from '../feeds/feed-fetcher.service';
import { runPreFilter } from '../articles/pre-filter';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';

type ProcessResult = {
  feedId: string;
  itemsConsidered: number;
  inserted: number;
  filtered: number;
  duplicates: number;
  llmErrors: number;
};

@Processor(QUEUE_NAMES.FEED_PULL)
export class FeedPullWorker extends WorkerHost {
  private readonly log = new Logger(FeedPullWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fetcher: FeedFetcher,
    private readonly processor: ArticleProcessor,
  ) {
    super();
  }

  async process(job: Job<FeedPullJobData>): Promise<ProcessResult> {
    const { feedId, userId } = job.data;
    this.log.log(
      JSON.stringify({
        event: 'feed.pull.start',
        feedId,
        userId,
        jobId: job.id,
      }),
    );

    const [feed] = await this.db
      .select()
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .limit(1);
    if (!feed) {
      throw new Error(`Feed ${feedId} not found for user ${userId}`);
    }

    if (feed.status === 'paused') {
      this.log.log(
        JSON.stringify({ event: 'feed.pull.skipped_paused', feedId, userId }),
      );
      return {
        feedId,
        itemsConsidered: 0,
        inserted: 0,
        filtered: 0,
        duplicates: 0,
        llmErrors: 0,
      };
    }

    try {
      const fetched = await this.fetcher.fetch(feed.url);
      let inserted = 0;
      let filtered = 0;
      let duplicates = 0;
      let llmErrors = 0;

      for (const item of fetched.items) {
        const outcome = await this.handleItem(userId, feedId, item);
        if (outcome === 'inserted') inserted += 1;
        else if (outcome === 'filtered') filtered += 1;
        else if (outcome === 'duplicate') duplicates += 1;
        else llmErrors += 1;
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
          duplicates,
          llmErrors,
        }),
      );

      return {
        feedId,
        itemsConsidered: fetched.items.length,
        inserted,
        filtered,
        duplicates,
        llmErrors,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db
        .update(feeds)
        .set({ status: 'error', lastPullAt: new Date(), lastPullError: msg })
        .where(eq(feeds.id, feedId));
      this.log.error(
        JSON.stringify({
          event: 'feed.pull.failed',
          feedId,
          userId,
          error: msg,
        }),
      );
      throw err;
    }
  }

  private async handleItem(
    userId: string,
    feedId: string,
    item: FetchedItem,
  ): Promise<'inserted' | 'filtered' | 'duplicate' | 'llm_error'> {
    // Sibling search restricted to 'ready' rows — only original articles
    // count as the canonical "first seen". Pre-existing legacy duplicates
    // (status='filtered', filter_reason='duplicate_url') are ignored here
    // by design.
    const [existing] = await this.db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          eq(articles.status, 'ready'),
          or(
            eq(articles.url, item.normalisedUrl),
            eq(articles.contentHash, item.contentHash),
          ),
        ),
      )
      .limit(1);
    if (existing) {
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        body: item.body,
        status: 'duplicate',
        duplicateOf: existing.id,
        ts: item.ts,
      });
      this.log.log(
        JSON.stringify({
          event: 'feed.pull.duplicate',
          feedId,
          userId,
          originalId: existing.id,
          url: item.normalisedUrl,
        }),
      );
      return 'duplicate';
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

    return this.processor.process(userId, feedId, item);
  }
}
