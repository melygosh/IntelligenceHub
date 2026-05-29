import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, JobsOptions } from 'bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
// value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';

export type EmbedBackfillJobData = { articleId: string; userId: string };

// Modest retry — embedding API hiccups recover quickly. No exponential
// backoff: missing embeddings only hide the UI section, never block.
export const EMBED_BACKFILL_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'fixed', delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 200,
};

@Processor(QUEUE_NAMES.EMBED_BACKFILL, { concurrency: 2 })
export class EmbedBackfillWorker extends WorkerHost {
  private readonly log = new Logger(EmbedBackfillWorker.name);

  constructor(
    private readonly processor: ArticleProcessor,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<EmbedBackfillJobData>): Promise<{
    wrote: boolean;
    totalMs: number;
  }> {
    const { articleId, userId } = job.data;
    const start = Date.now();
    // Bull Board surfaces job.log() lines per-job under the Logs tab,
    // which is much more useful for debugging a single article than
    // grepping the api stdout. Mirror the most operationally-useful
    // signals here (article identity, cache hit/miss, api latency,
    // outcome) — the processor + embed-service forward into this same
    // logger via the onLog callback.
    await job.log(
      `start: articleId=${articleId} userId=${userId.slice(0, 8)}… ` +
        `attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    );

    const wrote = await this.processor.backfillEmbedding(articleId, userId, {
      onLog: (m) => job.log(m),
    });

    if (wrote) {
      // Article transitioned NULL → embedded. Fire SSE so the detail page
      // (if open) flips its "computing embedding…" placeholder to the real
      // neighbour list without polling.
      this.events.publish(userId, {
        type: 'article.embedded',
        payload: { articleId },
      });
      await job.log('emit: article.embedded SSE event');
    }

    const totalMs = Date.now() - start;
    await job.log(`done: wrote=${wrote} totalMs=${totalMs}`);
    this.log.log(
      JSON.stringify({
        event: 'embed.backfill.done',
        articleId,
        userId,
        jobId: job.id,
        wrote,
        totalMs,
        attempts: job.attemptsMade + 1,
      }),
    );
    // The return value also shows in Bull Board's "Return Value" tab.
    return { wrote, totalMs };
  }
}
