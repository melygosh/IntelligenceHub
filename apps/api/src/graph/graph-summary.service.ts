import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articles, feeds } from '../db/schema';
import type {
  GraphPeriod,
  GraphSummaryArticle,
  GraphSummaryEntity,
  GraphSummaryResponse,
} from '@intelligencehub/shared';
import { GraphService } from './graph.service';

export type SummaryOpts = {
  period: GraphPeriod;
  from?: Date;
  to?: Date;
  categoryId?: string;
};

const TOP_ENTITIES = 5;
const TOP_ARTICLES = 5;

@Injectable()
export class GraphSummaryService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly graph: GraphService,
  ) {}

  async buildMine(
    userId: string,
    opts: SummaryOpts,
  ): Promise<GraphSummaryResponse> {
    const fromDate = periodToFromDate(opts.period, opts.from);
    const toDate = opts.period === 'custom' ? (opts.to ?? null) : null;

    // Top-5 entities — reuse the same selection helper as the canvas.
    const topEntityRows = await this.graph.selectTopEntities(
      userId,
      fromDate,
      toDate,
      TOP_ENTITIES,
      opts.categoryId,
    );
    const topEntities: GraphSummaryEntity[] = topEntityRows.map((r) => ({
      id: r.id,
      canonicalName: r.canonicalName,
      mentionCount: r.mentionCount,
      dominantCategoryId: r.dominantCategoryId,
    }));

    // Top-5 articles — prefer importance='high'; fill from 'normal'; never 'junk'.
    const topArticles = await this.selectTopArticles(
      userId,
      fromDate,
      toDate,
      opts.categoryId,
    );

    return { topEntities, topArticles };
  }

  private async selectTopArticles(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
    categoryId?: string,
  ): Promise<GraphSummaryArticle[]> {
    const baseConditions = [
      eq(articles.userId, userId),
      eq(articles.status, 'ready'),
    ];
    if (fromDate) baseConditions.push(gte(articles.ts, fromDate));
    if (toDate) baseConditions.push(lte(articles.ts, toDate));
    if (categoryId)
      baseConditions.push(
        sql`EXISTS (
          SELECT 1 FROM article_category ac
          WHERE ac.article_id = ${articles.id} AND ac.category_id = ${categoryId}
        )`,
      );

    // Pull high + normal in one query (junk excluded), then sort in JS so high
    // always precedes normal. Cheaper than two queries; the row volume is
    // bounded by the window so the in-memory sort is fine.
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        ts: articles.ts,
        importance: articles.importance,
        feedTitle: feeds.title,
      })
      .from(articles)
      .leftJoin(feeds, eq(feeds.id, articles.feedId)) // left: US-3 detach
      .where(
        and(
          ...baseConditions,
          inArray(articles.importance, ['high', 'normal']),
        ),
      )
      .orderBy(desc(articles.ts));

    rows.sort((a, b) => {
      // high before normal, then ts desc (already from query)
      const ai = a.importance === 'high' ? 0 : 1;
      const bi = b.importance === 'high' ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return b.ts.getTime() - a.ts.getTime();
    });

    return rows.slice(0, TOP_ARTICLES).map(
      (r): GraphSummaryArticle => ({
        id: r.id,
        title: r.title,
        feedTitle: r.feedTitle ?? null,
        ts: r.ts.toISOString(),
        importance:
          (r.importance as 'high' | 'normal' | 'junk' | null) ?? null,
      }),
    );
  }
}

// Duplicated identically from graph.service.ts (Task 14 includes a `diff`
// check to confirm both copies stay in sync). Extraction to a shared util
// module is a follow-up — for now, two services own the same helper.
function periodToFromDate(
  period: GraphPeriod,
  customFrom?: Date,
): Date | null {
  if (period === 'all') return null;
  if (period === 'custom') return customFrom ?? null;
  const offsets: Record<string, number> = {
    '24h': 24 * 3600_000,
    '7d': 7 * 24 * 3600_000,
    '30d': 30 * 24 * 3600_000,
  };
  const ms = offsets[period];
  if (ms === undefined) {
    throw new Error(`Unhandled period: ${period}`);
  }
  return new Date(Date.now() - ms);
}
