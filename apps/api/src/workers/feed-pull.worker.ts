import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { and, eq, inArray, or } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import {
  feedPullJobOpts,
  isFeedPullInFlight,
  type FeedPullJobData,
} from '../feeds/feeds.service';
// value import required for Nest DI metadata
import { FeedFetcher, type FetchedItem } from '../feeds/feed-fetcher.service';
import { runPreFilter } from '../articles/pre-filter';
import { decideDedupAction } from '../articles/dedup-decision';
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

type SweepResult = { enqueued: number; skippedInFlight: number };

// Job name for the scheduled sweep (vs the per-feed 'pull'). The sweep fans
// out a 'pull' for every active feed across ALL users — it runs without a
// request context, so it must read userId from each row to preserve per-user
// isolation (never enqueue a bare feedId).
export const FEED_PULL_SWEEP_JOB = 'sweep';

// Feed pull is network-bound (HTTP fetch + parse); this bounds how many feeds
// are fetched in parallel. Independent of LLM_CONCURRENCY (the downstream LLM
// gate), so raising it never affects LLM cost. Default 1 (serial) so two feeds
// carrying the same story can't interleave their dedup check and under-count
// the cross-source similar counter — see env.ts for the trade-off.
const CONCURRENCY = Number(process.env.FEED_PULL_CONCURRENCY) || 1;

@Processor(QUEUE_NAMES.FEED_PULL, { concurrency: CONCURRENCY })
export class FeedPullWorker extends WorkerHost {
  private readonly log = new Logger(FeedPullWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fetcher: FeedFetcher,
    private readonly processor: ArticleProcessor,
    private readonly events: EventsService,
    @InjectQueue(QUEUE_NAMES.FEED_PULL)
    private readonly feedPullQueue: Queue<FeedPullJobData>,
    @InjectQueue(QUEUE_NAMES.ARTICLE_ANALYZE)
    private readonly analyzeQueue: Queue<AnalyzeJobData>,
  ) {
    super();
  }

  async process(
    job: Job<FeedPullJobData>,
  ): Promise<ProcessResult | SweepResult> {
    if (job.name === FEED_PULL_SWEEP_JOB) {
      return this.runSweep(job);
    }
    return this.runPull(job);
  }

  /**
   * Scheduled fan-out: enqueue a 'pull' for every active OR errored feed
   * across all users. Each enqueue carries the per-(user,feed) deduplication
   * id, so a feed still being pulled from a prior tick is skipped rather than
   * piling up a second job. `error` feeds ARE swept so a transient failure
   * (timeout/5xx/DNS blip) self-heals on the next tick — a successful pull
   * flips them back to 'active'. Without this, one blip would silently drop a
   * feed from automation until a manual pull. Only `paused` (explicit user
   * action) is excluded.
   */
  private async runSweep(job: Job<FeedPullJobData>): Promise<SweepResult> {
    const active = await this.db
      .select({ id: feeds.id, userId: feeds.userId })
      .from(feeds)
      .where(inArray(feeds.status, ['active', 'error']));

    let enqueued = 0;
    let skippedInFlight = 0;
    for (const f of active) {
      const inFlight = await isFeedPullInFlight(
        this.feedPullQueue,
        f.userId,
        f.id,
      );
      await this.feedPullQueue.add(
        'pull',
        { feedId: f.id, userId: f.userId },
        feedPullJobOpts(f.userId, f.id),
      );
      if (inFlight) skippedInFlight += 1;
      else enqueued += 1;
    }

    this.log.log(
      JSON.stringify({
        event: 'feed.pull.sweep',
        jobId: job.id,
        activeFeeds: active.length,
        enqueued,
        skippedInFlight,
      }),
    );
    await job.log(
      `swept ${active.length} active feeds · enqueued ${enqueued} · skipped ${skippedInFlight} in-flight`,
    );
    return { enqueued, skippedInFlight };
  }

  private async runPull(job: Job<FeedPullJobData>): Promise<ProcessResult> {
    const { feedId, userId } = job.data;
    this.log.log(
      JSON.stringify({
        event: 'feed.pull.start',
        feedId,
        userId,
        jobId: job.id,
      }),
    );
    await job.log(`pull feed ${feedId}`);

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
      await job.log(
        `done: ${fetched.items.length} fetched · inserted ${inserted} · filtered ${filtered} · duplicates ${duplicates} · llmErrors ${llmErrors}`,
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
    // Sibling search over ALL already-stored rows for this user matching the
    // URL or content hash, across every status AND feed. decideDedupAction
    // needs the full set: a same-feed sibling of ANY status (incl. a prior
    // 'duplicate'/'filtered' row) means this is a re-pull and must NOT insert
    // again — otherwise a feed's own duplicate/filtered rows multiply on every
    // sweep (FR-5).
    const siblings = await this.db
      .select({
        id: articles.id,
        status: articles.status,
        feedId: articles.feedId,
      })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          inArray(articles.status, [
            'ready',
            'pending',
            'failed',
            'duplicate',
            'filtered',
          ]),
          or(
            eq(articles.url, item.normalisedUrl),
            eq(articles.contentHash, item.contentHash),
          ),
        ),
      );
    const decision = decideDedupAction(siblings, feedId);
    if (decision.kind === 'insert-duplicate-row') {
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        body: item.body,
        status: 'duplicate',
        duplicateOf: decision.originalId,
        ts: item.ts,
      });
      this.log.log(
        JSON.stringify({
          event: 'feed.pull.duplicate',
          feedId,
          userId,
          originalId: decision.originalId,
          url: item.normalisedUrl,
        }),
      );
      return 'duplicate';
    }
    if (decision.kind === 'mark-duplicate') return 'duplicate';

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
