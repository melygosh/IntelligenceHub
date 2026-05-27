import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles } from '../db/schema';
import {
  ANALYZE_JOB_OPTS,
  type AnalyzeJobData,
} from './article-analyze.worker';

/**
 * Runs once on app boot. Postgres is the durable source of truth for which
 * articles still need analysis (status='pending'); the BullMQ queue is the
 * (Redis-backed, ephemeral) execution layer. If Redis was flushed or the
 * process died between insert and enqueue, a 'pending' article can be left
 * with no live analyze job. Re-enqueue one for every pending article — jobId =
 * articleId makes this a no-op when a job is already waiting/delayed/active,
 * so it only fills genuine gaps.
 */
@Injectable()
export class PendingAnalyzeReconcile implements OnApplicationBootstrap {
  private readonly log = new Logger(PendingAnalyzeReconcile.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE_NAMES.ARTICLE_ANALYZE)
    private readonly analyzeQueue: Queue<AnalyzeJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.db
      .select({ id: articles.id, userId: articles.userId })
      .from(articles)
      .where(eq(articles.status, 'pending'));
    if (pending.length === 0) return;

    for (const a of pending) {
      // jobId = articleId: a no-op when a job already exists for this article,
      // so this fills only genuine gaps without double-enqueuing.
      await this.analyzeQueue.add(
        'analyze',
        { articleId: a.id, userId: a.userId },
        { jobId: a.id, ...ANALYZE_JOB_OPTS },
      );
    }

    this.log.log(
      JSON.stringify({
        event: 'analyze.startup_reconcile',
        pending: pending.length,
      }),
    );
  }
}
