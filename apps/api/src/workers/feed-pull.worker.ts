import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, count, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities, feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import type { FeedPullJobData } from '../feeds/feeds.service';

const STUB_ENTITIES: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'Microsoft', type: 'company' },
  { name: 'Anthropic', type: 'company' },
  { name: 'OpenAI', type: 'company' },
];

@Processor(QUEUE_NAMES.FEED_PULL)
export class FeedPullWorker extends WorkerHost {
  private readonly log = new Logger(FeedPullWorker.name);

  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async process(job: Job<FeedPullJobData>): Promise<{ articleId: string; entityId: string; entityName: string }> {
    const { feedId, userId } = job.data;
    this.log.log(JSON.stringify({ event: 'feed.pull.start', feedId, userId, jobId: job.id }));

    const [feed] = await this.db
      .select({ id: feeds.id, url: feeds.url })
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .limit(1);
    if (!feed) {
      this.log.warn(JSON.stringify({ event: 'feed.pull.feed_missing', feedId, userId }));
      throw new Error(`Feed ${feedId} not found for user ${userId}`);
    }

    const [{ value: existingCount }] = await this.db
      .select({ value: count() })
      .from(articles)
      .where(eq(articles.userId, userId));
    const stub = STUB_ENTITIES[existingCount % STUB_ENTITIES.length];

    const now = new Date();
    const [article] = await this.db
      .insert(articles)
      .values({
        userId,
        feedId,
        url: `${feed.url}#stub-${existingCount + 1}`,
        title: `Stub article ${existingCount + 1} mentioning ${stub.name}`,
        ts: now,
      })
      .returning({ id: articles.id });

    const [entity] = await this.db
      .insert(entities)
      .values({ userId, canonicalName: stub.name, type: stub.type })
      .returning({ id: entities.id });

    await this.db.insert(articleEntity).values({ articleId: article.id, entityId: entity.id });

    this.log.log(
      JSON.stringify({
        event: 'feed.pull.done',
        feedId,
        userId,
        jobId: job.id,
        articleId: article.id,
        entityId: entity.id,
        entityName: stub.name,
      }),
    );

    return { articleId: article.id, entityId: entity.id, entityName: stub.name };
  }
}
