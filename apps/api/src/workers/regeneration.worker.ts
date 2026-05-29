import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, regenerationRun } from '../db/schema';
// value import required for Nest DI metadata
import { UserConfigService } from '../articles/user-config.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';
import {
  RETAG_ARTICLE_JOB_OPTS,
  type RetagArticleJobData,
} from './retag-article.worker';

type JobData = { runId: string; userId: string };

/**
 * Regeneration coordinator. Reads the set of stale articles for the run,
 * stamps the total on the row, and fans out one retag.article sub-job per
 * article — then returns. Each sub-job is small (~3-5s), well under
 * BullMQ's default lockDuration, so the stalled-after-30s failure mode
 * that the previous single-job pattern hit is no longer reachable.
 *
 * The sub-job worker (retag-article.worker) owns counter increments,
 * progress emission, and completion detection via UPDATE ... RETURNING.
 * This file only does the snapshot + fanout + edge case where there is
 * nothing to do.
 */
@Processor(QUEUE_NAMES.REGENERATION)
export class RegenerationWorker extends WorkerHost {
  private readonly log = new Logger(RegenerationWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly userConfig: UserConfigService,
    private readonly events: EventsService,
    @InjectQueue(QUEUE_NAMES.RETAG_ARTICLE)
    private readonly retagQueue: Queue<RetagArticleJobData>,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<{ enqueued: number }> {
    const { runId, userId } = job.data;
    await job.log(
      `start: runId=${runId.slice(0, 8)}… userId=${userId.slice(0, 8)}…`,
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
      await job.log(`run ${runId} not found — aborting`);
      return { enqueued: 0 };
    }
    if (run.status !== 'running') {
      // The startup-cleanup may have flipped this row to 'failed' before
      // the worker picked the job up. Silently bail.
      await job.log(`run status=${run.status} — aborting (not running)`);
      return { enqueued: 0 };
    }

    try {
      // Snapshot the user's current config so the run targets exactly the
      // articles stale at start-time. (If the user toggles config again
      // mid-run, the new snapshot won't retroactively widen the run.)
      const config = await this.userConfig.snapshotFor(userId);
      await job.log(`config snapshot hash=${config.hash.slice(0, 10)}…`);

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

      const total = articleRows.length;
      await this.db
        .update(regenerationRun)
        .set({ articlesTotal: total })
        .where(eq(regenerationRun.id, runId));

      this.events.publish(userId, {
        type: 'regeneration.started',
        payload: { runId, articlesTotal: total },
      });
      await job.log(`fanout target: ${total} articles`);

      if (total === 0) {
        // Nothing to retag — mark the run completed immediately so the UI
        // banner clears. Without this, the run sits at 'running' forever
        // (no sub-job will ever increment the counter to total=0).
        await this.db
          .update(regenerationRun)
          .set({ status: 'completed', finishedAt: new Date() })
          .where(eq(regenerationRun.id, runId));
        this.events.publish(userId, {
          type: 'regeneration.completed',
          payload: {
            runId,
            articlesProcessed: 0,
            articlesCacheHit: 0,
            articlesLlmCalled: 0,
            articlesErrored: 0,
          },
        });
        await job.log('completed: 0 stale articles');
        return { enqueued: 0 };
      }

      for (const { id } of articleRows) {
        await this.retagQueue.add(
          'retag-article',
          { runId, userId, articleId: id },
          {
            // jobId scoped by run AND article: re-running the same article
            // inside the same run is a no-op (dedup via BullMQ); a separate
            // run on the same article gets its own jobId.
            jobId: `retag-${runId}-${id}`,
            ...RETAG_ARTICLE_JOB_OPTS,
          },
        );
      }
      await job.log(`enqueued ${total} retag.article jobs`);
      this.log.log(
        JSON.stringify({
          event: 'regen.fanout',
          runId,
          userId,
          jobId: job.id,
          enqueued: total,
        }),
      );
      return { enqueued: total };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        JSON.stringify({ event: 'regen.failed', runId, userId, error: msg }),
      );
      await job.log(`FAILED during fanout: ${msg}`);
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
