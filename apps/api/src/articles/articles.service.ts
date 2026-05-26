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
  AxisAssignmentSummary,
  EntityKind,
  SimilarArticleSummary,
} from '@intelligencehub/shared';

@Injectable()
export class ArticlesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(
    userId: string,
    opts: {
      categoryIds?: string[];
      importances?: ('high' | 'normal' | 'junk')[];
      windowFrom?: Date;
      windowTo?: Date;
      q?: string;
    } = {},
  ): Promise<ArticleListItem[]> {
    const conditions = [
      eq(articles.userId, userId),
      eq(articles.status, 'ready'),
    ];
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

    const orderBy = opts.q
      ? sql`ts_rank(${articles.searchVector}, plainto_tsquery('english', ${opts.q})) DESC`
      : desc(articles.ts);

    const projection = {
      id: articles.id,
      title: articles.title,
      url: articles.url,
      summary: articles.summary,
      importance: articles.importance,
      ts: articles.ts,
      feedId: articles.feedId,
      contentHash: articles.contentHash,
    };

    const articleRows = await this.db
      .select(projection)
      .from(articles)
      .where(and(...conditions))
      .orderBy(orderBy);

    if (articleRows.length === 0) return [];
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
      .where(and(eq(entities.userId, userId), inArray(articleEntity.articleId, articleIds)));

    const entitiesByArticle = new Map<string, ArticleListItem['entities']>();
    for (const e of entityRows) {
      const list = entitiesByArticle.get(e.articleId) ?? [];
      list.push({ id: e.id, canonicalName: e.canonicalName, type: e.type as EntityKind });
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

    const similarCounts = await this.findSiblingsForMany(userId, articleRows);

    return articleRows.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      summary: a.summary,
      importance: a.importance as ArticleListItem['importance'],
      ts: a.ts.toISOString(),
      feedId: a.feedId,
      entities: entitiesByArticle.get(a.id) ?? [],
      categoryNames: categoriesByArticle.get(a.id) ?? [],
      similarCount: similarCounts.get(a.id) ?? 0,
    }));
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

    const [feedRow] = await this.db
      .select({ title: feeds.title })
      .from(feeds)
      .where(eq(feeds.id, a.feedId))
      .limit(1);

    const siblings = await this.findSiblings(userId, a.id, a.contentHash, a.url);

    return {
      id: a.id,
      title: a.title,
      url: a.url,
      summary: a.summary,
      importance: a.importance as ArticleListItem['importance'],
      ts: a.ts.toISOString(),
      feedId: a.feedId,
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
        (r): AxisAssignmentSummary => ({ axisName: r.axisName, value: r.value }),
      ),
      similarArticles: siblings,
    };
  }

  /**
   * Siblings for one article — used by getById. Returns rows with the same
   * user, status in ('ready', 'duplicate'), and matching content_hash OR url,
   * excluding the article itself. Sorted by ts DESC. Backed by
   * articles_user_contenthash_idx + articles_user_url_idx from migration 0010.
   */
  private async findSiblings(
    userId: string,
    articleId: string,
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
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .where(
        and(
          eq(articles.userId, userId),
          ne(articles.id, articleId),
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

  /**
   * Batched sibling counts for the list endpoint — one query for the whole
   * page. Returns a Map<articleId, count>. Self-join on content_hash + url
   * scoped to (user, status in (ready, duplicate)); excludes self via id <> id.
   */
  private async findSiblingsForMany(
    userId: string,
    rows: Array<{ id: string; contentHash: string | null; url: string }>,
  ): Promise<Map<string, number>> {
    if (rows.length === 0) return new Map();

    // Single SQL: for each input id, count other articles sharing its
    // content_hash or url (same user, status in (ready, duplicate)).
    const ids = rows.map((r) => r.id);
    const result = await this.db.execute<{ article_id: string; count: number }>(sql`
      SELECT a.id AS article_id, COUNT(b.id)::int AS count
      FROM articles a
      LEFT JOIN articles b
        ON b.user_id = a.user_id
       AND b.id <> a.id
       AND b.status IN ('ready', 'duplicate')
       AND (
         (a.content_hash IS NOT NULL AND b.content_hash = a.content_hash)
         OR b.url = a.url
       )
      WHERE a.user_id = ${userId}
        AND a.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
      GROUP BY a.id
    `);
    const resultRows = (result as unknown as {
      rows: Array<{ article_id: string; count: number }>;
    }).rows;

    const out = new Map<string, number>();
    for (const r of resultRows) out.set(r.article_id, r.count);
    for (const r of rows) if (!out.has(r.id)) out.set(r.id, 0);
    return out;
  }
}
