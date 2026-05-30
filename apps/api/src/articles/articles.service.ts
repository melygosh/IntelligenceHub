import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import {
  articleAxisValue,
  articleCategory,
  articleEntity,
  articles,
  axis,
  axisValue,
  category,
  entities,
  feeds,
} from '../db/schema';
import type {
  ArticleDetail,
  ArticleListItem,
  ArticleSort,
  AxisAssignmentSummary,
  EntityKind,
  SimilarArticleSummary,
} from '@intelligencehub/shared';
import { groupAxisValuesByAxis } from './group-axis-values';

// US-7 processing-state default. Spec only requires the filter to expose
// pre-filtered ('filtered') and other states as options; default visibility
// stays at 'ready' so unfiltered loads don't suddenly grow rows for existing
// users. 'duplicate' is intentionally excluded from the catalog — those rows
// back the N-similar counter.
const DEFAULT_VISIBLE_STATUSES: ArticleListItem['status'][] = ['ready'];

/** Resolve the effective list of article statuses to show. When the caller
 * omits / passes an empty list, fall back to the default visible set. */
export function resolveStatuses(
  requested: ArticleListItem['status'][] | undefined,
): ArticleListItem['status'][] {
  if (!requested || requested.length === 0) {
    return [...DEFAULT_VISIBLE_STATUSES];
  }
  return [...requested];
}

@Injectable()
export class ArticlesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(
    userId: string,
    opts: {
      categoryIds?: string[];
      feedIds?: string[];
      importances?: ('high' | 'normal' | 'junk')[];
      axisValueIds?: string[];
      statuses?: ArticleListItem['status'][];
      windowFrom?: Date;
      windowTo?: Date;
      q?: string;
      offset?: number;
      limit?: number;
      sort?: ArticleSort;
    } = {},
  ): Promise<{ items: ArticleListItem[]; total: number }> {
    // US-7 processing-state filter. Default is `['ready']` (today's behaviour);
    // users opt into 'filtered' / 'pending' / 'failed' via the new dropdown.
    // 'duplicate' rows back the N-similar counter and stay hidden by default.
    const statuses = resolveStatuses(opts.statuses);
    const conditions = [
      eq(articles.userId, userId),
      inArray(articles.status, statuses),
    ];
    if (opts.feedIds && opts.feedIds.length > 0) {
      conditions.push(inArray(articles.feedId, opts.feedIds));
    }
    if (opts.importances && opts.importances.length > 0) {
      conditions.push(inArray(articles.importance, opts.importances));
    }
    if (opts.windowFrom) {
      conditions.push(gte(articles.ts, opts.windowFrom));
    }
    if (opts.windowTo) {
      conditions.push(lte(articles.ts, opts.windowTo));
    }
    if (opts.q) {
      conditions.push(
        sql`${articles.searchVector} @@ plainto_tsquery('english', ${opts.q})`,
      );
    }
    // Category filter via subquery (not JOIN). Avoids row duplication when an
    // article has multiple matching categories — so no SELECT DISTINCT needed,
    // which would otherwise fail with `ts_rank` in ORDER BY (Postgres requires
    // ORDER BY expressions to be in the SELECT list when DISTINCT is used).
    const categoryIds = opts.categoryIds ?? [];
    if (categoryIds.length > 0) {
      conditions.push(
        inArray(
          articles.id,
          this.db
            .select({ id: articleCategory.articleId })
            .from(articleCategory)
            .where(inArray(articleCategory.categoryId, categoryIds)),
        ),
      );
    }

    const axisValueIds = opts.axisValueIds ?? [];
    if (axisValueIds.length > 0) {
      // Pre-flight: verify ownership AND recover axis grouping in one round-trip.
      // Any submitted value-UUID that does not belong to a user-owned axis is
      // silently dropped (no 403) to match how unknown category IDs behave.
      const ownedRows = await this.db
        .select({ id: axisValue.id, axisId: axisValue.axisId })
        .from(axisValue)
        .innerJoin(axis, eq(axis.id, axisValue.axisId))
        .where(
          and(eq(axis.userId, userId), inArray(axisValue.id, axisValueIds)),
        );

      if (ownedRows.length === 0) {
        // Caller supplied only invalid / not-owned UUIDs → empty result set,
        // indistinguishable from any other empty filter.
        return { items: [], total: 0 };
      }

      const grouped = groupAxisValuesByAxis(ownedRows);
      for (const valueIdsForAxis of grouped.values()) {
        conditions.push(
          inArray(
            articles.id,
            this.db
              .select({ id: articleAxisValue.articleId })
              .from(articleAxisValue)
              .where(inArray(articleAxisValue.axisValueId, valueIdsForAxis)),
          ),
        );
      }
    }

    // Inline sibling-count subquery so the row carries similarCount AND the
    // `sort=duplicates` ORDER BY can reference it. Same predicate as the
    // standalone findSiblings* helpers: status in (ready, duplicate),
    // matching content_hash OR url, excluding self, AND from a different feed
    // — the label says "in other sources", so a same-feed re-pull must not
    // count. IS DISTINCT FROM treats a detached sibling (feed_id NULL) as a
    // different source. Costs one indexed scan per page row — at pageSize<=500
    // that's a non-issue.
    const similarCountExpr = sql<number>`(
      SELECT COUNT(*)::int FROM ${articles} b
      WHERE b.user_id = ${articles.userId}
        AND b.id <> ${articles.id}
        AND b.feed_id IS DISTINCT FROM ${articles.feedId}
        AND b.status IN ('ready', 'duplicate')
        AND (
          (${articles.contentHash} IS NOT NULL AND b.content_hash = ${articles.contentHash})
          OR b.url = ${articles.url}
        )
    )`;

    const sort: ArticleSort = opts.sort ?? 'newest';
    // ts DESC + id DESC as a deterministic tiebreak so pagination doesn't
    // shuffle when two rows share the same ts. Free-text search overrides
    // any sort with relevance ranking — feed/duplicates only matter when
    // browsing.
    const orderBy = opts.q
      ? sql`ts_rank(${articles.searchVector}, plainto_tsquery('english', ${opts.q})) DESC`
      : sort === 'feed'
        ? sql`${feeds.title} ASC NULLS LAST, ${articles.ts} DESC, ${articles.id} DESC`
        : sort === 'duplicates'
          ? sql`${similarCountExpr} DESC, ${articles.ts} DESC, ${articles.id} DESC`
          : sql`${articles.ts} DESC, ${articles.id} DESC`;

    const projection = {
      id: articles.id,
      title: articles.title,
      url: articles.url,
      summary: articles.summary,
      importance: articles.importance,
      ts: articles.ts,
      feedId: articles.feedId,
      contentHash: articles.contentHash,
      status: articles.status,
      filterReason: articles.filterReason,
      similarCount: similarCountExpr,
    };

    // Total under the active filters first — used for the pagination
    // envelope (totalPages = ceil(total/pageSize)). Same WHERE as the page
    // query, just COUNT(*); no ORDER BY / LIMIT / OFFSET.
    const [{ total: totalNum }] = await this.db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(articles)
      .where(and(...conditions));
    const total = Number(totalNum);

    // LEFT JOIN feeds is only required when ORDER BY references feeds.title;
    // for the other sorts we skip the join to keep the plan small.
    const pageQuery = this.db
      .select(projection)
      .from(articles)
      .leftJoin(feeds, eq(feeds.id, articles.feedId))
      .where(and(...conditions))
      .orderBy(orderBy);
    if (opts.limit !== undefined) pageQuery.limit(opts.limit);
    if (opts.offset !== undefined) pageQuery.offset(opts.offset);
    const articleRows = await pageQuery;

    if (articleRows.length === 0) return { items: [], total };
    const articleIds = articleRows.map((a) => a.id);

    const entityRows = await this.db
      .select({
        articleId: articleEntity.articleId,
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(articleEntity)
      .innerJoin(entities, eq(entities.id, articleEntity.entityId))
      .where(
        and(
          eq(entities.userId, userId),
          inArray(articleEntity.articleId, articleIds),
        ),
      );

    const entitiesByArticle = new Map<string, ArticleListItem['entities']>();
    for (const e of entityRows) {
      const list = entitiesByArticle.get(e.articleId) ?? [];
      list.push({
        id: e.id,
        canonicalName: e.canonicalName,
        type: e.type as EntityKind,
      });
      entitiesByArticle.set(e.articleId, list);
    }

    const catRows = await this.db
      .select({
        articleId: articleCategory.articleId,
        name: category.name,
      })
      .from(articleCategory)
      .innerJoin(category, eq(category.id, articleCategory.categoryId))
      .where(inArray(articleCategory.articleId, articleIds));

    const categoriesByArticle = new Map<string, string[]>();
    for (const c of catRows) {
      const list = categoriesByArticle.get(c.articleId) ?? [];
      list.push(c.name);
      categoriesByArticle.set(c.articleId, list);
    }

    const items: ArticleListItem[] = articleRows.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      summary: a.summary,
      importance: a.importance as ArticleListItem['importance'],
      ts: a.ts.toISOString(),
      feedId: a.feedId,
      status: a.status as ArticleListItem['status'],
      filterReason: a.filterReason,
      entities: entitiesByArticle.get(a.id) ?? [],
      categoryNames: categoriesByArticle.get(a.id) ?? [],
      similarCount: Number(a.similarCount),
    }));
    return { items, total };
  }

  async getById(id: string, userId: string): Promise<ArticleDetail | null> {
    const [a] = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        url: articles.url,
        summary: articles.summary,
        importance: articles.importance,
        ts: articles.ts,
        feedId: articles.feedId,
        body: articles.body,
        contentHash: articles.contentHash,
        status: articles.status,
        filterReason: articles.filterReason,
      })
      .from(articles)
      .where(and(eq(articles.id, id), eq(articles.userId, userId)))
      .limit(1);
    if (!a) return null;

    const entityRows = await this.db
      .select({
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(articleEntity)
      .innerJoin(entities, eq(entities.id, articleEntity.entityId))
      .where(and(eq(entities.userId, userId), eq(articleEntity.articleId, id)));

    const catRows = await this.db
      .select({ name: category.name })
      .from(articleCategory)
      .innerJoin(category, eq(category.id, articleCategory.categoryId))
      .where(eq(articleCategory.articleId, id));

    const axisRows = await this.db
      .select({
        axisName: axis.name,
        value: axisValue.value,
      })
      .from(articleAxisValue)
      .innerJoin(axis, eq(axis.id, articleAxisValue.axisId))
      .innerJoin(axisValue, eq(axisValue.id, articleAxisValue.axisValueId))
      .where(eq(articleAxisValue.articleId, id));

    // a.feedId is null once the source feed was deleted (US-3 detach).
    const [feedRow] = a.feedId
      ? await this.db
          .select({ title: feeds.title })
          .from(feeds)
          .where(eq(feeds.id, a.feedId))
          .limit(1)
      : [];

    const siblings = await this.findSiblings(
      userId,
      a.id,
      a.feedId,
      a.contentHash,
      a.url,
    );

    return {
      id: a.id,
      title: a.title,
      url: a.url,
      summary: a.summary,
      importance: a.importance as ArticleListItem['importance'],
      ts: a.ts.toISOString(),
      feedId: a.feedId,
      status: a.status as ArticleListItem['status'],
      filterReason: a.filterReason,
      entities: entityRows.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        type: e.type as EntityKind,
      })),
      categoryNames: catRows.map((c) => c.name),
      similarCount: siblings.length,
      body: a.body ?? null,
      feedTitle: feedRow?.title ?? '(untitled feed)',
      axisAssignments: axisRows.map(
        (r): AxisAssignmentSummary => ({
          axisName: r.axisName,
          value: r.value,
        }),
      ),
      similarArticles: siblings,
    };
  }

  /**
   * Siblings for one article — used by getById. Returns rows with the same
   * user, status in ('ready', 'duplicate'), matching content_hash OR url, from
   * a different feed (IS DISTINCT FROM, so a detached/NULL-feed sibling still
   * counts as another source), excluding the article itself. Sorted by ts DESC.
   * Backed by articles_user_contenthash_idx + articles_user_url_idx from
   * migration 0010.
   */
  private async findSiblings(
    userId: string,
    articleId: string,
    feedId: string | null,
    contentHash: string | null,
    url: string,
  ): Promise<SimilarArticleSummary[]> {
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        url: articles.url,
        ts: articles.ts,
        feedTitle: feeds.title,
      })
      .from(articles)
      // Left join: a sibling whose source feed was deleted (feedId NULL) must
      // still surface — its feedTitle just falls back below.
      .leftJoin(feeds, eq(feeds.id, articles.feedId))
      .where(
        and(
          eq(articles.userId, userId),
          ne(articles.id, articleId),
          sql`${articles.feedId} IS DISTINCT FROM ${feedId}`,
          inArray(articles.status, ['ready', 'duplicate']),
          contentHash
            ? or(eq(articles.contentHash, contentHash), eq(articles.url, url))
            : eq(articles.url, url),
        ),
      )
      .orderBy(desc(articles.ts));

    return rows.map(
      (r): SimilarArticleSummary => ({
        id: r.id,
        title: r.title,
        url: r.url,
        ts: r.ts.toISOString(),
        feedTitle: r.feedTitle ?? '(untitled feed)',
      }),
    );
  }
}
