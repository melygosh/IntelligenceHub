import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, JobsOptions } from 'bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
// value import required for Nest DI metadata
import { ArticleProcessor } from '../articles/article-processor.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';

export type AnalyzeJobData = { articleId: string; userId: string };

// Retry/backoff for analysis, tunable via env (mirrored + validated in the
// EnvSchema; read raw here because the @Processor concurrency and the job
// options are needed at module-load, before any constructor / loadEnv()).
// A transient LLM outage recovers within a few fixed-delay attempts; a
// permanently-unprocessable article exhausts all of them and lands in
// 'failed'. Fixed (not exponential) backoff keeps recovery snappy once the
// provider is healthy. Between attempts the job sits in the queue's `delayed`
// set — visible in Bull Board.
export const ANALYZE_ATTEMPTS = Number(process.env.ANALYZE_MAX_ATTEMPTS) || 20;
const ANALYZE_BACKOFF_MS =
  (Number(process.env.ANALYZE_BACKOFF_SECONDS) || 60) * 1000;
export const ANALYZE_JOB_OPTS: JobsOptions = {
  attempts: ANALYZE_ATTEMPTS,
  backoff: { type: 'fixed', delay: ANALYZE_BACKOFF_MS },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

// Worker slot concurrency — bounds how many analyze jobs are 'active' at once
// (the LlmService semaphore is the real LLM rate gate).
const CONCURRENCY = Number(process.env.ANALYZE_CONCURRENCY) || 2;

@Processor(QUEUE_NAMES.ARTICLE_ANALYZE, { concurrency: CONCURRENCY })
export class ArticleAnalyzeWorker extends WorkerHost {
  private readonly log = new Logger(ArticleAnalyzeWorker.name);

  constructor(
    private readonly processor: ArticleProcessor,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<AnalyzeJobData>): Promise<void> {
    const { articleId, userId } = job.data;
    const outcome = await this.processor.analyzePending(articleId, userId);
    if (outcome === 'analyzed') {
      this.log.log(
        JSON.stringify({ event: 'article.analyze.ready', articleId, userId }),
      );
      this.events.publish(userId, {
        type: 'article.analyzed',
        payload: { articleId, status: 'ready' },
      });
    }
    // 'skipped' (already ready / gone) is a silent idempotent no-op.
  }

  /**
   * Fires on every failed attempt. Only the final one (retries exhausted)
   * is terminal: mark the article 'failed' and notify. Intermediate failures
   * are left alone — BullMQ re-schedules the job into `delayed` for its next
   * attempt.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AnalyzeJobData>, err: Error): Promise<void> {
    const { articleId, userId } = job.data;
    const attempts = job.opts.attempts ?? ANALYZE_ATTEMPTS;
    const exhausted = job.attemptsMade >= attempts;
    if (!exhausted) {
      this.log.warn(
        JSON.stringify({
          event: 'article.analyze.retry',
          articleId,
          userId,
          attempt: job.attemptsMade,
          attempts,
          error: err.message,
        }),
      );
      return;
    }
    await this.processor.markFailed(articleId, userId);
    this.log.error(
      JSON.stringify({
        event: 'article.analyze.gave_up',
        articleId,
        userId,
        attempts,
        error: err.message,
      }),
    );
    this.events.publish(userId, {
      type: 'article.analyzed',
      payload: { articleId, status: 'failed' },
    });
  }
}
