import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles } from '../db/schema';
import { ArticleProcessor } from '../articles/article-processor.service';

// Re-analyze articles deferred to 'pending' by an LLM failure. The interval is
// the backoff between attempts; the batch caps work per tick so a large backlog
// (e.g. after a long outage) drains gradually without flooding the LLM.
const TICK_MS = 60_000;
const BATCH = 25;

@Injectable()
export class PendingRetryWorker {
  private readonly log = new Logger(PendingRetryWorker.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly processor: ArticleProcessor,
  ) {}

  @Interval('pending-retry', TICK_MS)
  async tick(): Promise<void> {
    if (this.running) return; // a previous (slow) tick is still working
    this.running = true;
    try {
      const pending = await this.db
        .select({ id: articles.id, userId: articles.userId })
        .from(articles)
        .where(eq(articles.status, 'pending'))
        .orderBy(asc(articles.createdAt))
        .limit(BATCH);
      if (pending.length === 0) return;

      let recovered = 0;
      let stillPending = 0;
      let gaveUp = 0;
      for (const a of pending) {
        try {
          const outcome = await this.processor.reprocessPending(a.id, a.userId);
          if (outcome === 'recovered') recovered += 1;
          else if (outcome === 'gave_up') gaveUp += 1;
          else stillPending += 1;
        } catch (err) {
          // One article's unexpected failure must not abort the whole tick.
          stillPending += 1;
          this.log.warn(
            JSON.stringify({
              event: 'pending.retry.item_error',
              articleId: a.id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }

      this.log.log(
        JSON.stringify({
          event: 'pending.retry.tick',
          considered: pending.length,
          recovered,
          stillPending,
          gaveUp,
        }),
      );
    } catch (err) {
      this.log.error(
        JSON.stringify({
          event: 'pending.retry.tick_error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
