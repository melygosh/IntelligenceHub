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

  async process(job: Job<EmbedBackfillJobData>): Promise<void> {
    const { articleId, userId } = job.data;
    const wrote = await this.processor.backfillEmbedding(articleId, userId);
    if (wrote) {
      // Article transitioned NULL → embedded. Fire SSE so the detail page
      // (if open) flips its "computing embedding…" placeholder to the real
      // neighbour list without polling.
      this.events.publish(userId, {
        type: 'article.embedded',
        payload: { articleId },
      });
    }
    this.log.log(
      JSON.stringify({
        event: 'embed.backfill.done',
        articleId,
        userId,
        jobId: job.id,
        wrote,
      }),
    );
  }
}
