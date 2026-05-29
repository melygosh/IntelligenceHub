import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  DashboardPeriod,
  DashboardResponse,
  DashboardTopCategory,
  DashboardTopFeed,
} from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { GraphService } from '../graph/graph.service';

const TOP_ENTITIES = 10;
const TOP_CATEGORIES = 5;
const TOP_FEEDS = 5;

export type BuildDashboardOpts = {
  period: DashboardPeriod;
  from?: Date;
  to?: Date;
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly graph: GraphService,
  ) {}

  async buildMine(
    userId: string,
    opts: BuildDashboardOpts,
  ): Promise<DashboardResponse> {
    const fromDate = periodToFromDate(opts.period, opts.from);
    const toDate = opts.period === 'custom' ? (opts.to ?? null) : null;

    // Run the four aggregations in parallel — each query is independent and
    // already narrow (small LIMITs, indexed user_id + ts joins).
    const [topEntities, topCategories, topFeeds, totalRow] = await Promise.all([
      // selectTopEntities matches the graph's top-N query exactly — same
      // canonical name + dominant category resolution. categoryIds=[] means
      // "no filter": dashboard surfaces the global top, the user can drill
      // into /articles?category=:id from there.
      this.graph.selectTopEntities(userId, fromDate, toDate, TOP_ENTITIES, []),
      this.topCategories(userId, fromDate, toDate),
      this.topFeeds(userId, fromDate, toDate),
      this.totalArticles(userId, fromDate, toDate),
    ]);

    return {
      window: {
        period: opts.period,
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
      totalArticles: totalRow,
      topEntities: topEntities.map((r) => ({
        id: r.id,
        canonicalName: r.canonicalName,
        // selectTopEntities returns `type: string`; cast back to the EntityKind
        // union — the column is enum-constrained at the DB level so this is
        // safe, and the dashboard schema requires the narrowed type.
        type: r.type as DashboardResponse['topEntities'][number]['type'],
        mentionCount: r.mentionCount,
        dominantCategoryId: r.dominantCategoryId,
      })),
      topCategories,
      topFeeds,
    };
  }

  private async topCategories(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
  ): Promise<DashboardTopCategory[]> {
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;
    const result = await this.db.execute<{
      id: string;
      name: string;
      article_count: number;
    }>(sql`
      SELECT c.id, c.name, COUNT(*)::int AS article_count
      FROM article_category ac
      JOIN articles a ON a.id = ac.article_id
      JOIN category c ON c.id = ac.category_id
      WHERE a.user_id = ${userId}
        AND a.status = 'ready'
        ${fromFilter}
        ${toFilter}
      GROUP BY c.id, c.name
      ORDER BY article_count DESC, c.name ASC
      LIMIT ${TOP_CATEGORIES}
    `);
    const rows = (
      result as unknown as {
        rows: Array<{ id: string; name: string; article_count: number }>;
      }
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      articleCount: r.article_count,
    }));
  }

  private async topFeeds(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
  ): Promise<DashboardTopFeed[]> {
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;
    // LEFT JOIN to feeds: a detached article (feed_id = NULL after US-3 delete)
    // still counts toward the user's totals; it surfaces as a "(deleted)" feed
    // row in the card, distinct from a feed that still exists with 0 articles
    // in the window (which simply won't show up — no row in the join).
    const result = await this.db.execute<{
      id: string | null;
      title: string | null;
      status: string | null;
      article_count: number;
    }>(sql`
      SELECT a.feed_id AS id, f.title, f.status, COUNT(*)::int AS article_count
      FROM articles a
      LEFT JOIN feeds f ON f.id = a.feed_id
      WHERE a.user_id = ${userId}
        AND a.status = 'ready'
        ${fromFilter}
        ${toFilter}
      GROUP BY a.feed_id, f.title, f.status
      ORDER BY article_count DESC, f.title ASC NULLS LAST
      LIMIT ${TOP_FEEDS}
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string | null;
          title: string | null;
          status: string | null;
          article_count: number;
        }>;
      }
    ).rows;
    return rows
      .filter(
        (
          r,
        ): r is {
          id: string;
          title: string | null;
          status: string | null;
          article_count: number;
        } => r.id !== null,
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        // status is the same 'active' | 'paused' | 'error' enum the column is
        // constrained to; narrow here for the response schema.
        status: r.status as DashboardTopFeed['status'],
        articleCount: r.article_count,
      }));
  }

  private async totalArticles(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
  ): Promise<number> {
    const fromFilter = fromDate ? sql`AND ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND ts <= ${toDate}` : sql``;
    const result = await this.db.execute<{ total: number }>(sql`
      SELECT COUNT(*)::int AS total
      FROM articles
      WHERE user_id = ${userId}
        AND status = 'ready'
        ${fromFilter}
        ${toFilter}
    `);
    const rows = (result as unknown as { rows: Array<{ total: number }> }).rows;
    return rows[0]?.total ?? 0;
  }
}

// Same helper as graph.service's periodToFromDate; duplicated here to keep
// the two services decoupled (graph's is file-private). If a third caller
// shows up, lift to a shared utility module.
function periodToFromDate(
  period: DashboardPeriod,
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
