import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { feeds } from '../db/schema';
import { QUEUE_NAMES } from '@intelligencehub/shared';

export type FeedPullJobData = { feedId: string; userId: string };

@Injectable()
export class FeedsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE_NAMES.FEED_PULL) private readonly feedPullQueue: Queue<FeedPullJobData>,
  ) {}

  async create(userId: string, url: string): Promise<{ id: string; url: string; createdAt: string }> {
    const [created] = await this.db
      .insert(feeds)
      .values({ userId, url })
      .returning({ id: feeds.id, url: feeds.url, createdAt: feeds.createdAt });
    return { id: created.id, url: created.url, createdAt: created.createdAt.toISOString() };
  }

  async listMine(userId: string): Promise<Array<{ id: string; url: string; createdAt: string }>> {
    const rows = await this.db
      .select({ id: feeds.id, url: feeds.url, createdAt: feeds.createdAt })
      .from(feeds)
      .where(eq(feeds.userId, userId));
    return rows.map((r) => ({ id: r.id, url: r.url, createdAt: r.createdAt.toISOString() }));
  }

  async deleteMine(userId: string, feedId: string): Promise<void> {
    const result = await this.db
      .delete(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .returning({ id: feeds.id });
    if (result.length === 0) {
      throw new NotFoundException('Feed not found');
    }
  }

  async enqueuePull(userId: string, feedId: string): Promise<void> {
    const [found] = await this.db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .limit(1);
    if (!found) {
      throw new NotFoundException('Feed not found');
    }
    await this.feedPullQueue.add('pull', { feedId, userId }, { removeOnComplete: 100, removeOnFail: 100 });
  }
}
