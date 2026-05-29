import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, JobsOptions } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { regenerationRun } from '../db/schema';
// value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';
// value import required for Nest DI metadata
import { UserConfigService } from '../articles/user-config.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';

export type RetagArticleJobData = {
  runId: string;
  userId: string;
  articleId: string;
};

// Per-article retry policy. Transient LLM errors recover within a couple of
// attempts; permanent failures (4xx) exhaust the budget quickly and land in
// the failed-event handler where the run counter is bumped.
const ATTEMPTS = 4;
const BACKOFF_MS = 30_000;
export const RETAG_ARTICLE_JOB_OPTS: JobsOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'fixed', delay: BACKOFF_MS },
  removeOnComplete: 1000,
  removeOnFail: 500,
};

const PROGRESS_FLUSH_EVERY = 5;

// Concurrency — bounded by LLM_CONCURRENCY semaphore inside LlmService.
const CONCURRENCY = Number(process.env.ANALYZE_CONCURRENCY) || 2;

@Processor(QUEUE_NAMES.RETAG_ARTICLE, { concurrency: CONCURRENCY })
export class RetagArticleWorker extends WorkerHost {
  private readonly log = new Logger(RetagArticleWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly processor: ArticleProcessor,
    private readonly userConfig: UserConfigService,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<RetagArticleJobData>): Promise<{
    outcome: 'cache_hit' | 'llm_called' | 'error' | 'cancelled';
  }> {
    const { runId, userId, articleId } = job.data;
    await job.log(
      `start: run=${runId.slice(0, 8)}… article=${articleId.slice(0, 8)}… ` +
        `attempt=${job.attemptsMade + 1}/${ATTEMPTS}`,
    );

    // Cancellation guard: if the run was already marked failed/completed
    // (e.g. another fanout overwrote it, startup cleanup failed it), bail
    // without touching anything. Counter is NOT bumped — the run already
    // reached a terminal state through another path.
    const [run] = await this.db
      .select({ status: regenerationRun.status })
      .from(regenerationRun)
      .where(eq(regenerationRun.id, runId))
      .limit(1);
    if (!run || run.status !== 'running') {
      await job.log(`cancelled: run status=${run?.status ?? 'missing'}`);
      return { outcome: 'cancelled' };
    }

    const config = await this.userConfig.snapshotFor(userId);
    const outcome = await this.processor.retag(articleId, userId, config);
    await job.log(`retag outcome: ${outcome}`);

    // Atomic counter bump + completion detection in one round-trip. RETURNING
    // gives us the post-update values so we can compare to total without a
    // second SELECT — race-free at the row level.
    const cacheInc = outcome === 'cache_hit' ? 1 : 0;
    const llmInc = outcome === 'llm_called' ? 1 : 0;
    const errInc = outcome === 'error' ? 1 : 0;
    await this.bumpCountersAndMaybeComplete(
      runId,
      userId,
      cacheInc,
      llmInc,
      errInc,
      job,
    );
    return { outcome };
  }

  // Final-failure path: BullMQ exhausted retries. Count the article as
  // errored so the run can converge to 'completed' instead of getting
  // stuck waiting for a counter that never reaches articles_total.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RetagArticleJobData>): Promise<void> {
    if (job.attemptsMade < ATTEMPTS) return; // mid-retry, not terminal
    const { runId, userId, articleId } = job.data;
    this.log.warn(
      JSON.stringify({
        event: 'retag.article.gave_up',
        runId,
        userId,
        articleId,
        attempts: job.attemptsMade,
      }),
    );
    await this.bumpCountersAndMaybeComplete(runId, userId, 0, 0, 1, job);
  }

  /**
   * Increments the run's counters atomically and, when this article was
   * the last one, marks the run completed + emits the completed event.
   * Otherwise emits a progress event every PROGRESS_FLUSH_EVERY-th tick.
   *
   * Race-safety: the entire update + completion check runs as a single
   * UPDATE...RETURNING — two concurrent finishes can't both observe the
   * "I am last" condition because each sees a distinct articles_processed.
   */
  private async bumpCountersAndMaybeComplete(
    runId: string,
    userId: string,
    cacheInc: number,
    llmInc: number,
    errInc: number,
    job: Job<RetagArticleJobData>,
  ): Promise<void> {
    const result = await this.db.execute<{
      articles_processed: number;
      articles_total: number;
      articles_cache_hit: number;
      articles_llm_called: number;
      articles_errored: number;
    }>(sql`
      UPDATE regeneration_run
      SET articles_processed = articles_processed + 1,
          articles_cache_hit = articles_cache_hit + ${cacheInc},
          articles_llm_called = articles_llm_called + ${llmInc},
          articles_errored = articles_errored + ${errInc}
      WHERE id = ${runId}::uuid
        AND status = 'running'
      RETURNING articles_processed, articles_total,
                articles_cache_hit, articles_llm_called, articles_errored
    `);
    const row = (
      result as unknown as {
        rows: Array<{
          articles_processed: number;
          articles_total: number;
          articles_cache_hit: number;
          articles_llm_called: number;
          articles_errored: number;
        }>;
      }
    ).rows[0];
    if (!row) {
      // Run no longer 'running' — likely cancelled / replaced. Silently bail.
      await job.log('counter bump skipped: run no longer running');
      return;
    }

    if (row.articles_processed >= row.articles_total) {
      // Last article. Convert run to completed in a guarded UPDATE so
      // re-entry (e.g. delayed retry winning a race) is a no-op.
      await this.db
        .update(regenerationRun)
        .set({ status: 'completed', finishedAt: new Date() })
        .where(eq(regenerationRun.id, runId));
      this.events.publish(userId, {
        type: 'regeneration.completed',
        payload: {
          runId,
          articlesProcessed: row.articles_processed,
          articlesCacheHit: row.articles_cache_hit,
          articlesLlmCalled: row.articles_llm_called,
          articlesErrored: row.articles_errored,
        },
      });
      await job.log(
        `run completed: ${row.articles_processed}/${row.articles_total}`,
      );
      this.log.log(
        JSON.stringify({
          event: 'regen.done',
          runId,
          userId,
          totals: {
            processed: row.articles_processed,
            cacheHits: row.articles_cache_hit,
            llmCalls: row.articles_llm_called,
            errors: row.articles_errored,
          },
        }),
      );
      return;
    }

    if (row.articles_processed % PROGRESS_FLUSH_EVERY === 0) {
      this.events.publish(userId, {
        type: 'regeneration.progress',
        payload: {
          runId,
          articlesProcessed: row.articles_processed,
          articlesTotal: row.articles_total,
          articlesCacheHit: row.articles_cache_hit,
        },
      });
    }
  }
}
