import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { JobsOptions, Queue } from 'bullmq';
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

// Shared job options for every per-feed pull enqueue. `deduplication.id` keys
// the in-flight guard on (user, feed): while a job with this id is unfinished
// (waiting/active/delayed) a second add() is ignored Redis-side and returns
// the existing job, so overlapping manual clicks or scheduled ticks collapse
// into one. The id is released once the job completes, so the next pull after
// completion enqueues normally. Note: this is BullMQ's `deduplication`, NOT a
// fixed `jobId` — a retained completed job under a fixed jobId would silently
// swallow the next add until eviction, which we explicitly avoid.
export function feedPullJobOpts(userId: string, feedId: string): JobsOptions {
  return {
    deduplication: { id: `${userId}:${feedId}` },
    removeOnComplete: 100,
    removeOnFail: 100,
  };
}

/**
 * Whether a pull for this (user, feed) is currently in flight. BullMQ 5.77 has
 * no public getter for the active deduplication job, so we read the dedup key
 * directly — the same key the `deduplication` option writes:
 * `<prefix>:<queue>:de:<id>`. A non-null value means a job holding this id is
 * unfinished (waiting/active/delayed); the key is released on completion. This
 * mirrors the internal lookup later BullMQ versions expose as
 * getDeduplicationJobId().
 */
export async function isFeedPullInFlight(
  queue: Queue<FeedPullJobData>,
  userId: string,
  feedId: string,
): Promise<boolean> {
  const client = await queue.client;
  const value = await client.get(`${queue.toKey('de')}:${userId}:${feedId}`);
  return value !== null;
}

@Injectable()
export class FeedsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE_NAMES.FEED_PULL)
    private readonly feedPullQueue: Queue<FeedPullJobData>,
    private readonly fetcher: FeedFetcher,
  ) {}

  /**
   * Enqueue a pull, returning whether a NEW job was created. When a pull for
   * this (user, feed) is already in flight, BullMQ deduplication returns the
   * existing job — detectable because its deduplication id is already taken —
   * and we report `false` so callers can soft-reject without erroring.
   */
  private async enqueuePullJob(
    userId: string,
    feedId: string,
  ): Promise<boolean> {
    // Check in-flight state before adding so we can report the soft-reject.
    // The add() itself is a Redis-side no-op when a job already holds this
    // deduplication id (it returns the existing job); the worker releases the
    // id on completion. The check+add is not a transaction, but the only race
    // is a redundant pull enqueued moments apart — harmless given article-level
    // dedup downstream.
    const inFlight = await isFeedPullInFlight(
      this.feedPullQueue,
      userId,
      feedId,
    );
    await this.feedPullQueue.add(
      'pull',
      { feedId, userId },
      feedPullJobOpts(userId, feedId),
    );
    return !inFlight;
  }

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
    await this.enqueuePullJob(userId, created.id);
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

  /**
   * Enqueue a single pull. Returns `{ enqueued: false }` when a pull for this
   * feed is already in flight (soft-reject) rather than throwing.
   */
  async enqueuePull(
    userId: string,
    feedId: string,
  ): Promise<{ enqueued: boolean }> {
    const [found] = await this.db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
      .limit(1);
    if (!found) {
      throw new NotFoundException('Feed not found');
    }
    const enqueued = await this.enqueuePullJob(userId, feedId);
    return { enqueued };
  }

  /**
   * Fan out a pull for every non-paused feed of this user. Paused feeds are
   * intentionally skipped — the user explicitly opted them out of pulls.
   * Feeds whose pull is already in flight are counted as `skippedInFlight`
   * (soft-rejected via queue deduplication) rather than re-enqueued.
   */
  async enqueuePullAll(userId: string): Promise<{
    enqueued: number;
    skippedPaused: number;
    skippedInFlight: number;
  }> {
    const rows = await this.db
      .select({ id: feeds.id, status: feeds.status })
      .from(feeds)
      .where(eq(feeds.userId, userId));
    let enqueued = 0;
    let skippedPaused = 0;
    let skippedInFlight = 0;
    for (const row of rows) {
      if (row.status === 'paused') {
        skippedPaused += 1;
        continue;
      }
      const created = await this.enqueuePullJob(userId, row.id);
      if (created) enqueued += 1;
      else skippedInFlight += 1;
    }
    return { enqueued, skippedPaused, skippedInFlight };
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
