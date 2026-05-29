import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { and, eq, inArray, or } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import type { FeedPullJobData } from '../feeds/feeds.service';
// value import required for Nest DI metadata
import { FeedFetcher, type FetchedItem } from '../feeds/feed-fetcher.service';
import { runPreFilter } from '../articles/pre-filter';
// value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';
import {
  ANALYZE_JOB_OPTS,
  type AnalyzeJobData,
} from './article-analyze.worker';

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
    private readonly events: EventsService,
    @InjectQueue(QUEUE_NAMES.ARTICLE_ANALYZE)
    private readonly analyzeQueue: Queue<AnalyzeJobData>,
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
      // Analysis is async now (enqueued per article), so the pull never knows
      // an LLM outcome at done-time. Kept at 0 for the event's stable shape;
      // analysis results surface via article.analyzed events instead.
      const llmErrors = 0;

      for (const item of fetched.items) {
        const outcome = await this.handleItem(userId, feedId, item);
        if (outcome === 'inserted') inserted += 1;
        else if (outcome === 'filtered') filtered += 1;
        else duplicates += 1;
      }

      await this.db
        .update(feeds)
        .set({
          title: fetched.title,
          iconUrl: fetched.iconUrl,
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

      this.events.publish(userId, {
        type: 'feed.pull.done',
        payload: { feedId, inserted, filtered, duplicates, llmErrors },
      });

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
      this.events.publish(userId, {
        type: 'feed.pull.failed',
        payload: { feedId, error: msg },
      });
      throw err;
    }
  }

  private async handleItem(
    userId: string,
    feedId: string,
    item: FetchedItem,
  ): Promise<'inserted' | 'filtered' | 'duplicate'> {
    // Sibling search over already-handled rows: 'ready' originals anchor the
    // cross-source "similar" feature, while 'pending'/'failed' siblings mean a
    // prior attempt already exists — matching them stops a re-pull from
    // re-inserting and re-enqueuing the same item (the article-analyze queue
    // owns the retry). Legacy 'filtered'/'duplicate' rows are ignored by design.
    const [existing] = await this.db
      .select({
        id: articles.id,
        status: articles.status,
        feedId: articles.feedId,
      })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          inArray(articles.status, ['ready', 'pending', 'failed']),
          or(
            eq(articles.url, item.normalisedUrl),
            eq(articles.contentHash, item.contentHash),
          ),
        ),
      )
      .limit(1);
    if (existing) {
      // Only 'ready' originals from a *different* feed get a duplicate row
      // (the cross-source similar-articles anchor). Same-feed re-pulls are
      // just the next poll seeing the same item — inserting a duplicate row
      // would inflate similarCount on every poll. Pending/failed siblings
      // also skip; the article-analyze queue owns retry.
      if (existing.status === 'ready' && existing.feedId !== feedId) {
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
      }
      return 'duplicate';
    }

    const verdict = runPreFilter({ title: item.title, body: item.body });
    if (verdict.filtered) {
      // Persist body even for filtered rows so a later threshold tweak can
      // re-analyse without re-fetching from source (which may 404 or paywall).
      // The LLM never sees this body unless status is bumped back to 'pending'.
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        body: item.body,
        status: 'filtered',
        filterReason: verdict.reason,
        ts: item.ts,
      });
      this.log.log(
        JSON.stringify({
          event: 'feed.pull.filtered',
          feedId,
          userId,
          url: item.normalisedUrl,
          title: item.title || '(untitled)',
          reason: verdict.reason,
          detail: verdict.detail,
        }),
      );
      return 'filtered';
    }

    // Persist as 'pending' and hand analysis off to the article-analyze queue.
    // jobId = articleId makes the enqueue idempotent (a boot reconcile or a
    // re-pull can't create a second analyze job for the same article).
    const articleId = await this.processor.insertPending(userId, feedId, item);
    await this.analyzeQueue.add(
      'analyze',
      { articleId, userId },
      { jobId: articleId, ...ANALYZE_JOB_OPTS },
    );
    return 'inserted';
  }
}
