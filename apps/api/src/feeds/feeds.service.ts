import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { feeds } from '../db/schema';
import {
  QUEUE_NAMES,
  normaliseUrl,
  type Feed,
  type ValidateFeedResponse,
} from '@intelligencehub/shared';
import { FeedFetcher } from './feed-fetcher.service';

export type FeedPullJobData = { feedId: string; userId: string };

@Injectable()
export class FeedsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE_NAMES.FEED_PULL)
    private readonly feedPullQueue: Queue<FeedPullJobData>,
    private readonly fetcher: FeedFetcher,
  ) {}

  async create(
    userId: string,
    url: string,
    title?: string,
    iconUrl?: string,
  ): Promise<Feed> {
    const normalised = normaliseUrl(url);
    const [existing] = await this.db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.userId, userId), eq(feeds.url, normalised)))
      .limit(1);
    if (existing) {
      throw new ConflictException('Feed already added');
    }
    const [created] = await this.db
      .insert(feeds)
      .values({
        userId,
        url: normalised,
        status: 'active',
        title: title ?? null,
        iconUrl: iconUrl ?? null,
      })
      .returning();
    // Kick off an immediate pull so articles + future channel-title updates flow
    // within seconds instead of waiting for the next scheduled cycle.
    await this.feedPullQueue.add(
      'pull',
      { feedId: created.id, userId },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
    return this.toFeed(created);
  }

  async listMine(userId: string): Promise<Feed[]> {
    // Most-recently-pulled first; never-pulled (NULL lastPullAt) sort to the
    // bottom so the header label "sorted by last pull · desc" matches reality.
    const rows = await this.db
      .select()
      .from(feeds)
      .where(eq(feeds.userId, userId))
      .orderBy(sql`${feeds.lastPullAt} DESC NULLS LAST`, desc(feeds.createdAt));
    return rows.map((r) => this.toFeed(r));
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

  async updateStatus(
    userId: string,
    feedId: string,
    status: 'active' | 'paused',
  ): Promise<Feed> {
    const [updated] = await this.db
      .update(feeds)
      .set({ status })
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .returning();
    if (!updated) {
      throw new NotFoundException('Feed not found');
    }
    return this.toFeed(updated);
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
    await this.feedPullQueue.add(
      'pull',
      { feedId, userId },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
  }

  /**
   * Fan out a pull for every non-paused feed of this user. Paused feeds are
   * intentionally skipped — the user explicitly opted them out of pulls.
   */
  async enqueuePullAll(
    userId: string,
  ): Promise<{ enqueued: number; skippedPaused: number }> {
    const rows = await this.db
      .select({ id: feeds.id, status: feeds.status })
      .from(feeds)
      .where(eq(feeds.userId, userId));
    let enqueued = 0;
    let skippedPaused = 0;
    for (const row of rows) {
      if (row.status === 'paused') {
        skippedPaused += 1;
        continue;
      }
      await this.feedPullQueue.add(
        'pull',
        { feedId: row.id, userId },
        { removeOnComplete: 100, removeOnFail: 100 },
      );
      enqueued += 1;
    }
    return { enqueued, skippedPaused };
  }

  async validate(url: string): Promise<ValidateFeedResponse> {
    try {
      const fetched = await this.fetcher.fetch(url);
      return {
        ok: true,
        title: fetched.title,
        iconUrl: fetched.iconUrl,
        normalisedUrl: normaliseUrl(url),
        itemCount: fetched.items.length,
      };
    } catch (err) {
      const e = err as Error & { reason?: string; detail?: string };
      const reason =
        e.reason === 'unreachable' ||
        e.reason === 'not_a_feed' ||
        e.reason === 'malformed_url' ||
        e.reason === 'empty' ||
        e.reason === 'blocked'
          ? e.reason
          : 'unreachable';
      return { ok: false, reason, detail: e.detail ?? e.message };
    }
  }

  private toFeed(row: typeof feeds.$inferSelect): Feed {
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      iconUrl: row.iconUrl,
      status: row.status as Feed['status'],
      lastPullAt: row.lastPullAt?.toISOString() ?? null,
      lastPullError: row.lastPullError,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
