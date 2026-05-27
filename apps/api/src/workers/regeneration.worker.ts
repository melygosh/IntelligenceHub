import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, regenerationRun } from '../db/schema';
// value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';
// value import required for Nest DI metadata
import { UserConfigService } from '../articles/user-config.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';

type JobData = { runId: string; userId: string };

const PROGRESS_FLUSH_EVERY = 5;

@Processor(QUEUE_NAMES.REGENERATION)
export class RegenerationWorker extends WorkerHost {
  private readonly log = new Logger(RegenerationWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly userConfig: UserConfigService,
    private readonly processor: ArticleProcessor,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const { runId, userId } = job.data;
    const t0 = Date.now();
    this.log.log(
      JSON.stringify({ event: 'regen.start', runId, userId, jobId: job.id }),
    );

    const [run] = await this.db
      .select()
      .from(regenerationRun)
      .where(eq(regenerationRun.id, runId))
      .limit(1);
    if (!run) {
      this.log.error(
        JSON.stringify({ event: 'regen.run_missing', runId, userId }),
      );
      return;
    }

    try {
      const config = await this.userConfig.snapshotFor(userId);

      // Re-query stale articles against the run's snapshot hash (NOT against
      // config.hash, which may have changed since enqueue if the user toggled
      // config again). Snapshot semantics: the run targets exactly the
      // articles that were stale at start-time.
      const articleRows = await this.db
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.userId, userId),
            eq(articles.status, 'ready'),
            sql`${articles.configHash} IS DISTINCT FROM ${run.configHash}`,
          ),
        );

      let processed = 0;
      let cacheHits = 0;
      let llmCalls = 0;
      let errors = 0;

      for (const { id } of articleRows) {
        try {
          const outcome = await this.processor.retag(id, userId, config);
          if (outcome === 'cache_hit') cacheHits += 1;
          else if (outcome === 'llm_called') llmCalls += 1;
          else errors += 1;
        } catch (err) {
          this.log.warn(
            JSON.stringify({
              event: 'regen.article_unexpected_error',
              runId,
              articleId: id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          errors += 1;
        }
        processed += 1;

        if (processed % PROGRESS_FLUSH_EVERY === 0) {
          await this.db
            .update(regenerationRun)
            .set({
              articlesProcessed: processed,
              articlesCacheHit: cacheHits,
              articlesLlmCalled: llmCalls,
              articlesErrored: errors,
            })
            .where(eq(regenerationRun.id, runId));
          this.events.publish(userId, {
            type: 'regeneration.progress',
            payload: {
              runId,
              articlesProcessed: processed,
              articlesTotal: articleRows.length,
              articlesCacheHit: cacheHits,
            },
          });
        }
      }

      await this.db
        .update(regenerationRun)
        .set({
          status: 'completed',
          finishedAt: new Date(),
          articlesProcessed: processed,
          articlesCacheHit: cacheHits,
          articlesLlmCalled: llmCalls,
          articlesErrored: errors,
        })
        .where(eq(regenerationRun.id, runId));

      this.events.publish(userId, {
        type: 'regeneration.completed',
        payload: {
          runId,
          articlesProcessed: processed,
          articlesCacheHit: cacheHits,
          articlesLlmCalled: llmCalls,
          articlesErrored: errors,
        },
      });

      this.log.log(
        JSON.stringify({
          event: 'regen.done',
          runId,
          userId,
          jobId: job.id,
          totals: { processed, cacheHits, llmCalls, errors },
          durationMs: Date.now() - t0,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        JSON.stringify({ event: 'regen.failed', runId, userId, error: msg }),
      );
      await this.db
        .update(regenerationRun)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: msg,
        })
        .where(eq(regenerationRun.id, runId));
      this.events.publish(userId, {
        type: 'regeneration.failed',
        payload: { runId, errorMessage: msg },
      });
      throw err;
    }
  }
}
