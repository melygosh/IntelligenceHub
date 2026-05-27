import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import {
  QUEUE_NAMES,
  type BuildDigestRequest,
  type DigestDetail,
  type DigestKeyArticle,
  type DigestPeriod,
  type DigestScopeKind,
  type DigestStatus,
  type DigestSummary,
  type DigestTopCategory,
  type DigestTopEntity,
} from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { digestRun } from '../db/schema';
import { EventsService } from '../events/events.service';
import { resolveWindow } from './period-window';

@Injectable()
export class DigestService {
  private readonly log = new Logger(DigestService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUE_NAMES.DIGEST_BUILD) private readonly queue: Queue,
    private readonly events: EventsService,
  ) {}

  async start(
    userId: string,
    request: BuildDigestRequest,
  ): Promise<DigestSummary> {
    const { windowFrom, windowTo } = resolveWindow(request.period);
    const [row] = await this.db
      .insert(digestRun)
      .values({
        userId,
        period: request.period,
        scopeKind: request.scopeKind,
        scopeFilterIds: request.scopeFilterIds,
        windowFrom,
        windowTo,
        status: 'building',
      })
      .returning();

    await this.queue.add(
      'build',
      { digestRunId: row.id },
      { removeOnComplete: true, removeOnFail: false },
    );

    this.events.publish(userId, {
      type: 'digest.status_changed',
      payload: { digestId: row.id, status: 'building' },
    });

    this.log.log(
      JSON.stringify({
        event: 'digest.started',
        userId,
        digestRunId: row.id,
      }),
    );

    return this.toSummary(row);
  }

  async list(userId: string): Promise<DigestSummary[]> {
    const rows = await this.db
      .select()
      .from(digestRun)
      .where(eq(digestRun.userId, userId))
      .orderBy(desc(digestRun.createdAt))
      .limit(50);
    return rows.map((r) => this.toSummary(r));
  }

  async getById(id: string, userId: string): Promise<DigestDetail | null> {
    const [row] = await this.db
      .select()
      .from(digestRun)
      .where(and(eq(digestRun.id, id), eq(digestRun.userId, userId)))
      .limit(1);
    if (!row) return null;
    return this.toDetail(row);
  }

  private toSummary(row: typeof digestRun.$inferSelect): DigestSummary {
    return {
      id: row.id,
      period: row.period as DigestPeriod,
      scopeKind: row.scopeKind as DigestScopeKind,
      scopeFilterIds: (row.scopeFilterIds ?? []) as string[],
      windowFrom: row.windowFrom.toISOString(),
      windowTo: row.windowTo.toISOString(),
      status: row.status as DigestStatus,
      title: row.title ?? null,
      articleCount: row.articleCount,
      entityCount: row.entityCount,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  private toDetail(row: typeof digestRun.$inferSelect): DigestDetail {
    let summary: string[] | null = null;
    if (row.summary) {
      try {
        const parsed: unknown = JSON.parse(row.summary);
        if (
          Array.isArray(parsed) &&
          parsed.every((p): p is string => typeof p === 'string')
        ) {
          summary = parsed;
        }
      } catch {
        summary = null;
      }
    }
    return {
      ...this.toSummary(row),
      summary,
      topEntities: (row.topEntitiesJson ?? []) as DigestTopEntity[],
      topCategories: (row.topCategoriesJson ?? []) as DigestTopCategory[],
      keyArticles: (row.keyArticlesJson ?? []) as DigestKeyArticle[],
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      model: row.model,
      errorMessage: row.errorMessage,
    };
  }
}
