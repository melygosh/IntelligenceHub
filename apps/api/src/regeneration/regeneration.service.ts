import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES, type RegenerationRun } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, regenerationRun } from '../db/schema';
import { UserConfigService } from '../articles/user-config.service';
import { EventsService } from '../events/events.service';

type StartResult = { run: RegenerationRun; eligibleArticles: number };

@Injectable()
export class RegenerationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly userConfig: UserConfigService,
    private readonly events: EventsService,
    @InjectQueue(QUEUE_NAMES.REGENERATION) private readonly queue: Queue,
  ) {}

  async start(userId: string): Promise<StartResult> {
    const config = await this.userConfig.snapshotFor(userId);

    const [{ count: eligible }] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          eq(articles.status, 'ready'),
          sql`${articles.configHash} IS DISTINCT FROM ${config.hash}`,
        ),
      );

    if (eligible === 0) {
      const [run] = await this.db
        .insert(regenerationRun)
        .values({
          userId,
          status: 'completed',
          configHash: config.hash,
          articlesTotal: 0,
          finishedAt: new Date(),
        })
        .returning();
      return { run: this.toResponse(run), eligibleArticles: 0 };
    }

    let inserted;
    try {
      const [row] = await this.db
        .insert(regenerationRun)
        .values({
          userId,
          status: 'running',
          configHash: config.hash,
          articlesTotal: eligible,
        })
        .returning();
      inserted = row;
    } catch (err) {
      const cause = (err as { cause?: { code?: string; constraint?: string } })
        .cause;
      if (
        cause?.code === '23505' &&
        cause.constraint === 'regeneration_run_user_active_idx'
      ) {
        throw new ConflictException({ error: 'already_running' });
      }
      throw err;
    }

    await this.queue.add(
      'regenerate',
      { runId: inserted.id, userId },
      { removeOnComplete: true, removeOnFail: false },
    );

    this.events.publish(userId, {
      type: 'regeneration.started',
      payload: { runId: inserted.id, articlesTotal: eligible },
    });

    return { run: this.toResponse(inserted), eligibleArticles: eligible };
  }

  async current(userId: string): Promise<RegenerationRun> {
    const [row] = await this.db
      .select()
      .from(regenerationRun)
      .where(eq(regenerationRun.userId, userId))
      .orderBy(desc(regenerationRun.startedAt))
      .limit(1);
    if (!row) {
      throw new NotFoundException('No regeneration runs');
    }
    return this.toResponse(row);
  }

  private toResponse(
    row: typeof regenerationRun.$inferSelect,
  ): RegenerationRun {
    return {
      id: row.id,
      status: row.status as RegenerationRun['status'],
      configHash: row.configHash,
      articlesTotal: row.articlesTotal,
      articlesProcessed: row.articlesProcessed,
      articlesCacheHit: row.articlesCacheHit,
      articlesLlmCalled: row.articlesLlmCalled,
      articlesErrored: row.articlesErrored,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage ?? null,
    };
  }
}
