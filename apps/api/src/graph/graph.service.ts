import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles } from '../db/schema';
import { loadEnv } from '../common/config/env';
import type {
  EntityKind,
  GraphEdge,
  GraphNode,
  GraphPeriod,
  GraphResponse,
} from '@intelligencehub/shared';

export type BuildGraphOpts = {
  period: GraphPeriod; // '24h' | '7d' | '30d' | 'all' | 'custom'
  from?: Date; // required when period === 'custom'
  to?: Date; // optional upper bound when period === 'custom'
  top: number; // entity cap
  // Empty array (default) = no category filter. Multi-select: an article
  // passes the filter when it has at least one of these categories
  // (OR semantics). Matches the articles list's `?category=a,b` convention.
  categoryIds: string[];
  // When set, canvas is anchored on this entity: shows [anchor + top-N
  // co-mentioned neighbours in scope] instead of the global top-N. The
  // anchor entity must belong to the user (silently empty if not).
  anchorEntityId?: string;
  // Explicit-set mode: when either list is non-empty, top-N selection is
  // skipped and the canvas renders exactly the union of these IDs plus the
  // edges among them. mentionCount + dominantCategoryId on entity nodes
  // still reflect the current window/category scope (may be 0 / null for
  // picks outside scope). Used by the GraphSelectionPanel.
  selectedEntityIds?: string[];
  selectedArticleIds?: string[];
};

export type TopEntityRow = {
  id: string;
  canonicalName: string;
  type: string;
  mentionCount: number;
  dominantCategoryId: string | null;
};

const DEFAULT_TOP = 20;

@Injectable()
export class GraphService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Build the graph response for one user, scoped to the given time window
   * (period) and capped at `top` entities by mention count. Articles are
   * included only when they mention at least one of those entities; their
   * mention edges are emitted; co-mention edges are restricted to the same
   * top-N entity set.
   *
   * Status filter: only 'ready' articles count toward mentions (pending /
   * failed rows have no entity links anyway, but explicit is safer).
   */
  async buildMine(
    userId: string,
    opts: BuildGraphOpts,
  ): Promise<GraphResponse> {
    const fromDate = periodToFromDate(opts.period, opts.from);
    const toDate = opts.period === 'custom' ? (opts.to ?? null) : null;

    const explicitMode =
      (opts.selectedEntityIds && opts.selectedEntityIds.length > 0) ||
      (opts.selectedArticleIds && opts.selectedArticleIds.length > 0);

    // 1. Entity selection.
    //    - Explicit-set mode: render exactly the entities the user picked,
    //      with mention_count + dominant_category in the current window.
    //    - Anchor mode: anchor + its top-N co-mentioned neighbours in window.
    //    - Default: top-N entities by mention count in window.
    const topEntities = explicitMode
      ? await this.selectEntitiesByIds(
          userId,
          opts.selectedEntityIds ?? [],
          fromDate,
          toDate,
          opts.categoryIds,
        )
      : opts.anchorEntityId
        ? await this.selectAnchorNeighbors(
            userId,
            fromDate,
            toDate,
            opts.top,
            opts.categoryIds,
            opts.anchorEntityId,
          )
        : await this.selectTopEntities(
            userId,
            fromDate,
            toDate,
            opts.top,
            opts.categoryIds,
          );

    const topEntityIds = topEntities.map((e) => e.id);

    // 2. Articles.
    //    - Explicit-set mode: render exactly the articles the user picked
    //      (no window/category gate on the picks themselves).
    //    - Default/anchor: articles in window that mention at least one of
    //      the displayed entities.
    const articleRows = explicitMode
      ? await this.selectArticlesByIds(userId, opts.selectedArticleIds ?? [])
      : topEntityIds.length === 0
        ? []
        : await this.selectArticlesConnectedToEntities(
            userId,
            fromDate,
            toDate,
            topEntityIds,
            opts.categoryIds,
          );
    const articleIds = articleRows.map((a) => a.id);

    if (topEntities.length === 0 && articleRows.length === 0) {
      return { nodes: [], edges: [] };
    }

    // 3. Mention edges = article_entity rows from those articles to those entities.
    const mentionEdges: GraphEdge[] =
      articleIds.length === 0
        ? []
        : (
            await this.db
              .select({
                from: articleEntity.articleId,
                to: articleEntity.entityId,
              })
              .from(articleEntity)
              .where(
                and(
                  inArray(articleEntity.articleId, articleIds),
                  inArray(articleEntity.entityId, topEntityIds),
                ),
              )
          ).map(
            (e): GraphEdge => ({
              from: e.from,
              to: e.to,
              kind: 'mentions',
              weight: null,
            }),
          );

    // 4. Co-mention edges between displayed entities, scoped to the same window.
    const coMentionEdges = await this.buildCoMentionEdges(
      userId,
      fromDate,
      toDate,
      topEntityIds,
      opts.categoryIds,
    );

    // 5. Semantic-similarity edges (FR-7 `similar`) between the article nodes
    //    already on the canvas. Off unless SEMANTIC_SIMILARITY_ENABLED.
    const similarEdges = await this.buildSimilarEdges(userId, articleIds);

    const nodes: GraphNode[] = [
      ...articleRows.map(
        (a): GraphNode => ({
          id: a.id,
          kind: 'article',
          label: a.title,
          ts: Math.floor(a.ts.getTime() / 1000),
          entityType: null,
          importance:
            (a.importance as 'high' | 'normal' | 'junk' | null) ?? null,
          mentionCount: null,
          dominantCategoryId: null,
        }),
      ),
      ...topEntities.map(
        (e): GraphNode => ({
          id: e.id,
          kind: 'entity',
          label: e.canonicalName,
          ts: null,
          entityType: e.type as EntityKind,
          importance: null,
          mentionCount: e.mentionCount,
          dominantCategoryId: e.dominantCategoryId,
        }),
      ),
    ];

    return {
      nodes,
      edges: [...mentionEdges, ...coMentionEdges, ...similarEdges],
    };
  }

  /**
   * Top-N entities by mention count in the window, scoped to the user (and
   * optionally a category). Each row also carries the entity's dominant
   * category in the same window. Exposed (public) so GraphSummaryService can
   * reuse the same selection with top=5.
   */
  async selectTopEntities(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
    top: number,
    categoryIds: string[],
  ): Promise<TopEntityRow[]> {
    // The top-N + dominant-category query is one round-trip via two CTEs:
    //  - top_entities: entity_id + mention_count (ordered, LIMIT top)
    //  - dom: for each top entity, the most-frequent category (tiebreak by
    //         category.created_at ASC for stable colours across reloads)
    // Then join entities for canonicalName + type.
    //
    // Why raw SQL instead of Drizzle's query builder: window functions +
    // chained CTEs are clearer in SQL than in fluent .with(...) chains here,
    // and this is one of the hottest queries on the page.
    //
    // Note: the category filter scopes `top_entities` (which entities qualify
    // for top-N) but NOT `cat_counts` (which categories' articles are counted
    // for dominant-category lookup). Spec phrasing in §3.4 is "most frequent
    // category among the entity's mentioning articles in the current window"
    // — window, not filter scope. This means with a category filter active,
    // a top-N entity's colour can reflect a category outside the filter,
    // surfacing the entity's overall dominant category rather than a trivially-
    // matching filter-scoped one. Deliberate.
    const categoryFilter = buildCategoryExists('a.id', categoryIds);
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;

    const result = await this.db.execute<{
      id: string;
      canonical_name: string;
      type: string;
      mention_count: number;
      dominant_category_id: string | null;
    }>(sql`
      WITH top_entities AS (
        SELECT ae.entity_id, COUNT(*)::int AS mention_count
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        WHERE a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
          ${categoryFilter}
        GROUP BY ae.entity_id
        ORDER BY COUNT(*) DESC
        LIMIT ${top}
      ),
      cat_counts AS (
        SELECT ae.entity_id, ac.category_id, c.created_at, COUNT(*) AS n
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        JOIN article_category ac ON ac.article_id = a.id
        JOIN category c ON c.id = ac.category_id
        WHERE ae.entity_id IN (SELECT entity_id FROM top_entities)
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
        GROUP BY ae.entity_id, ac.category_id, c.created_at
      ),
      dom AS (
        SELECT entity_id, category_id,
          ROW_NUMBER() OVER (
            PARTITION BY entity_id ORDER BY n DESC, created_at ASC
          ) AS rn
        FROM cat_counts
      )
      SELECT
        e.id,
        e.canonical_name,
        e.type,
        te.mention_count,
        (SELECT category_id FROM dom WHERE dom.entity_id = te.entity_id AND rn = 1)
          AS dominant_category_id
      FROM top_entities te
      JOIN entities e ON e.id = te.entity_id
      WHERE e.user_id = ${userId}
      ORDER BY te.mention_count DESC, e.canonical_name ASC
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string;
          canonical_name: string;
          type: string;
          mention_count: number;
          dominant_category_id: string | null;
        }>;
      }
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type,
      mentionCount: r.mention_count,
      dominantCategoryId: r.dominant_category_id,
    }));
  }

  /**
   * Anchored-graph selection: returns `[anchor entity + its top-N co-mentioned
   * neighbours in scope]` with the same `TopEntityRow` shape `selectTopEntities`
   * produces (mentionCount + dominantCategoryId in scope for each). Anchor is
   * always first (even with 0 in-scope mentions); neighbours are ranked by
   * co-mention weight (distinct articles shared with the anchor in scope).
   *
   * Silently returns `[]` if the anchor doesn't belong to the user — the same
   * "graceful empty" behaviour as the top-N path for unknown filters.
   */
  async selectAnchorNeighbors(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
    top: number,
    categoryIds: string[],
    anchorId: string,
  ): Promise<TopEntityRow[]> {
    const categoryFilter = buildCategoryExists('a.id', categoryIds);
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;

    // One round-trip via four CTEs:
    //   - partners: top-N entities ranked by co-mention weight with the anchor
    //   - display_set: anchor (first) UNION partners
    //   - mentions: per-displayed-entity mention count in scope
    //   - dom + cat_counts: per-displayed-entity dominant category (with the
    //     same tiebreak rule as selectTopEntities — category.created_at ASC)
    // Final SELECT joins entities for canonicalName + type and sorts anchor
    // to the top, then partners by co-mention weight.
    const result = await this.db.execute<{
      id: string;
      canonical_name: string;
      type: string;
      mention_count: number;
      dominant_category_id: string | null;
    }>(sql`
      WITH partners AS (
        SELECT ae2.entity_id AS partner_id,
               COUNT(DISTINCT ae1.article_id)::int AS weight
        FROM article_entity ae1
        JOIN article_entity ae2
          ON ae1.article_id = ae2.article_id
        JOIN articles a ON a.id = ae1.article_id
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
          ${categoryFilter}
        WHERE ae1.entity_id = ${anchorId}::uuid
          AND ae2.entity_id <> ${anchorId}::uuid
        GROUP BY ae2.entity_id
        ORDER BY weight DESC
        LIMIT ${top}
      ),
      display_set AS (
        SELECT ${anchorId}::uuid AS entity_id, 0::int AS is_partner
        UNION
        SELECT partner_id, 1 FROM partners
      ),
      mentions AS (
        SELECT ae.entity_id, COUNT(*)::int AS mention_count
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        WHERE ae.entity_id IN (SELECT entity_id FROM display_set)
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
          ${categoryFilter}
        GROUP BY ae.entity_id
      ),
      cat_counts AS (
        SELECT ae.entity_id, ac.category_id, c.created_at, COUNT(*) AS n
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        JOIN article_category ac ON ac.article_id = a.id
        JOIN category c ON c.id = ac.category_id
        WHERE ae.entity_id IN (SELECT entity_id FROM display_set)
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
        GROUP BY ae.entity_id, ac.category_id, c.created_at
      ),
      dom AS (
        SELECT entity_id, category_id,
          ROW_NUMBER() OVER (
            PARTITION BY entity_id ORDER BY n DESC, created_at ASC
          ) AS rn
        FROM cat_counts
      )
      SELECT
        e.id,
        e.canonical_name,
        e.type,
        COALESCE(m.mention_count, 0)::int AS mention_count,
        (SELECT category_id FROM dom WHERE dom.entity_id = e.id AND rn = 1)
          AS dominant_category_id
      FROM display_set ds
      JOIN entities e ON e.id = ds.entity_id
      LEFT JOIN mentions m ON m.entity_id = ds.entity_id
      WHERE e.user_id = ${userId}
      ORDER BY ds.is_partner ASC, m.mention_count DESC NULLS LAST,
               e.canonical_name ASC
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string;
          canonical_name: string;
          type: string;
          mention_count: number;
          dominant_category_id: string | null;
        }>;
      }
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type,
      mentionCount: r.mention_count,
      dominantCategoryId: r.dominant_category_id,
    }));
  }

  /**
   * Explicit-set mode helper: fetch the user's articles by ID, no
   * window/category gate. Renders exactly what the user picked even if
   * they're outside the current window.
   */
  private async selectArticlesByIds(
    userId: string,
    ids: string[],
  ): Promise<
    Array<{
      id: string;
      title: string;
      ts: Date;
      importance: string | null;
    }>
  > {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: articles.id,
        title: articles.title,
        ts: articles.ts,
        importance: articles.importance,
      })
      .from(articles)
      .where(and(eq(articles.userId, userId), inArray(articles.id, ids)));
  }

  /**
   * Explicit-set mode helper: fetch the given entities + decorate each with
   * its in-window mention_count and dominant category. Structurally similar
   * to selectAnchorNeighbors's display_set/mentions/dom CTEs but without
   * the partner expansion. Entities outside the window get mentionCount=0
   * and dominantCategoryId=null (still rendered — explicit picks aren't
   * filtered by scope).
   */
  private async selectEntitiesByIds(
    userId: string,
    ids: string[],
    fromDate: Date | null,
    toDate: Date | null,
    categoryIds: string[],
  ): Promise<TopEntityRow[]> {
    if (ids.length === 0) return [];
    const categoryFilter = buildCategoryExists('a.id', categoryIds);
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;
    const idArray = sql`ARRAY[${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]`;

    const result = await this.db.execute<{
      id: string;
      canonical_name: string;
      type: string;
      mention_count: number;
      dominant_category_id: string | null;
    }>(sql`
      WITH display_set AS (
        SELECT unnest(${idArray}) AS entity_id
      ),
      mentions AS (
        SELECT ae.entity_id, COUNT(*)::int AS mention_count
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        WHERE ae.entity_id IN (SELECT entity_id FROM display_set)
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
          ${categoryFilter}
        GROUP BY ae.entity_id
      ),
      cat_counts AS (
        SELECT ae.entity_id, ac.category_id, c.created_at, COUNT(*) AS n
        FROM article_entity ae
        JOIN articles a ON a.id = ae.article_id
        JOIN article_category ac ON ac.article_id = a.id
        JOIN category c ON c.id = ac.category_id
        WHERE ae.entity_id IN (SELECT entity_id FROM display_set)
          AND a.user_id = ${userId}
          AND a.status = 'ready'
          ${fromFilter}
          ${toFilter}
        GROUP BY ae.entity_id, ac.category_id, c.created_at
      ),
      dom AS (
        SELECT entity_id, category_id,
          ROW_NUMBER() OVER (
            PARTITION BY entity_id ORDER BY n DESC, created_at ASC
          ) AS rn
        FROM cat_counts
      )
      SELECT
        e.id,
        e.canonical_name,
        e.type,
        COALESCE(m.mention_count, 0)::int AS mention_count,
        (SELECT category_id FROM dom WHERE dom.entity_id = e.id AND rn = 1)
          AS dominant_category_id
      FROM display_set ds
      JOIN entities e ON e.id = ds.entity_id
      LEFT JOIN mentions m ON m.entity_id = ds.entity_id
      WHERE e.user_id = ${userId}
      ORDER BY m.mention_count DESC NULLS LAST, e.canonical_name ASC
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string;
          canonical_name: string;
          type: string;
          mention_count: number;
          dominant_category_id: string | null;
        }>;
      }
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type,
      mentionCount: r.mention_count,
      dominantCategoryId: r.dominant_category_id,
    }));
  }

  /**
   * Articles in the window that mention at least one of the given entity ids.
   * Used both for canvas article nodes (top-N path) and as a natural source
   * for "find articles in window" elsewhere if needed.
   */
  private async selectArticlesConnectedToEntities(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
    entityIds: string[],
    categoryIds: string[],
  ): Promise<
    Array<{
      id: string;
      title: string;
      ts: Date;
      importance: string | null;
    }>
  > {
    const baseConditions = [
      eq(articles.userId, userId),
      eq(articles.status, 'ready'),
      sql`${articles.id} IN (
        SELECT article_id FROM article_entity
        WHERE entity_id = ANY(ARRAY[${sql.join(
          entityIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])
      )`,
    ];
    if (fromDate) baseConditions.push(gte(articles.ts, fromDate));
    if (toDate) baseConditions.push(lte(articles.ts, toDate));
    if (categoryIds.length > 0) {
      baseConditions.push(
        sql`EXISTS (
          SELECT 1 FROM article_category ac
          WHERE ac.article_id = ${articles.id}
            AND ac.category_id = ${categoryAnyArray(categoryIds)}
        )`,
      );
    }

    return this.db
      .select({
        id: articles.id,
        title: articles.title,
        ts: articles.ts,
        importance: articles.importance,
      })
      .from(articles)
      .where(and(...baseConditions));
  }

  /**
   * Co-mention edges between the given entity set, scoped to the user + window
   * (+ optional category). Self-join article_entity on shared article_id; the
   * `ae1.entity_id < ae2.entity_id` filter keeps one direction; LEAST/GREATEST
   * give stable from/to ordering for React keys.
   */
  private async buildCoMentionEdges(
    userId: string,
    fromDate: Date | null,
    toDate: Date | null,
    entityIds: string[],
    categoryIds: string[],
  ): Promise<GraphEdge[]> {
    if (entityIds.length === 0) return [];
    const categoryJoin =
      categoryIds.length > 0
        ? sql`JOIN article_category ac ON ac.article_id = a.id
              AND ac.category_id = ${categoryAnyArray(categoryIds)}`
        : sql``;
    const fromFilter = fromDate ? sql`AND a.ts >= ${fromDate}` : sql``;
    const toFilter = toDate ? sql`AND a.ts <= ${toDate}` : sql``;
    // Built once + referenced twice below — pg rejects bare JS arrays on the
    // right of ANY, so we materialise an `ARRAY[$1::uuid, $2::uuid, ...]`
    // literal Drizzle can parameterise per element.
    const entityArray = sql`ARRAY[${sql.join(
      entityIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]`;

    const result = await this.db.execute<{
      from_id: string;
      to_id: string;
      weight: number;
    }>(sql`
      SELECT
        LEAST(ae1.entity_id, ae2.entity_id) AS from_id,
        GREATEST(ae1.entity_id, ae2.entity_id) AS to_id,
        COUNT(*)::int AS weight
      FROM article_entity ae1
      JOIN article_entity ae2 ON ae1.article_id = ae2.article_id
      JOIN articles a ON a.id = ae1.article_id AND a.user_id = ${userId}
        AND a.status = 'ready'
      ${categoryJoin}
      WHERE ae1.entity_id < ae2.entity_id
        AND ae1.entity_id = ANY(${entityArray})
        AND ae2.entity_id = ANY(${entityArray})
        ${fromFilter}
        ${toFilter}
      GROUP BY from_id, to_id
    `);
    const rows = (
      result as unknown as {
        rows: Array<{ from_id: string; to_id: string; weight: number }>;
      }
    ).rows;
    return rows.map(
      (r): GraphEdge => ({
        from: r.from_id,
        to: r.to_id,
        kind: 'co_mention',
        weight: r.weight,
      }),
    );
  }

  /**
   * Semantic-similarity edges (FR-7 `similar`, article→article) among the
   * article nodes already on the canvas. A pair gets an edge when the cosine
   * distance between their embeddings is below SEMANTIC_SIMILARITY_THRESHOLD —
   * the same pgvector operator + env threshold the article-dedup path uses.
   *
   * Cost discipline (FR-10 / Principle 1): this is a self-join restricted to
   * the *displayed* article IDs (already bounded by the entity cap), NOT the
   * whole corpus — so it is not quadratic in total articles and never calls an
   * LLM. `a1.id < a2.id` keeps one direction per pair for stable React keys.
   * Both sides are user-scoped (Principle 4). Returns [] when the feature is
   * off or fewer than two displayed articles carry an embedding.
   */
  private async buildSimilarEdges(
    userId: string,
    articleIds: string[],
  ): Promise<GraphEdge[]> {
    if (articleIds.length < 2) return [];
    const env = loadEnv();
    if (!env.SEMANTIC_SIMILARITY_ENABLED) return [];
    const threshold = env.SEMANTIC_SIMILARITY_THRESHOLD;
    const perNode = env.GRAPH_SIMILAR_EDGES_PER_NODE;
    const idArray = sql`ARRAY[${sql.join(
      articleIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]`;

    // Each displayed article keeps only its `perNode` nearest neighbours (by
    // cosine distance, under the threshold) within the displayed set; the union
    // is then deduped to undirected pairs (LEAST/GREATEST). This caps edge
    // density so the canvas doesn't hairball and client layout/render stays
    // responsive. Still a bounded self-join over the displayed IDs only (not
    // corpus-quadratic, FR-10) and no LLM (Principle 1).
    const result = await this.db.execute<{
      from_id: string;
      to_id: string;
    }>(sql`
      WITH ranked AS (
        SELECT a1.id AS src,
               a2.id AS dst,
               ROW_NUMBER() OVER (
                 PARTITION BY a1.id
                 ORDER BY (a1.embedding <=> a2.embedding) ASC
               ) AS rn
        FROM articles a1
        JOIN articles a2
          ON a1.id <> a2.id
         AND (a1.embedding <=> a2.embedding) < ${threshold}
        WHERE a1.user_id = ${userId}
          AND a2.user_id = ${userId}
          AND a1.id = ANY(${idArray})
          AND a2.id = ANY(${idArray})
          AND a1.embedding IS NOT NULL
          AND a2.embedding IS NOT NULL
      )
      SELECT DISTINCT
        LEAST(src, dst) AS from_id,
        GREATEST(src, dst) AS to_id
      FROM ranked
      WHERE rn <= ${perNode}
    `);
    const rows = (
      result as unknown as {
        rows: Array<{ from_id: string; to_id: string }>;
      }
    ).rows;
    return rows.map(
      (r): GraphEdge => ({
        from: r.from_id,
        to: r.to_id,
        kind: 'similar',
        // `weight` is the integer co-mention counter; similar edges carry no
        // count. (Spec allows an optional 0–1 `score` here — not emitted yet.)
        weight: null,
      }),
    );
  }
}

/**
 * Period → "from" Date used as a SQL `ts >=` filter. `null` means "no lower
 * bound" (period === 'all' or 'custom' without `from`).
 */
/**
 * SQL fragment: `ANY(ARRAY[$1::uuid, $2::uuid, ...])`. Materialises the JS
 * array as a typed Postgres array literal — Drizzle's `sql` template can
 * parameterise each element, and `pg` rejects a bare non-array on the right
 * of ANY/ALL.
 */
function categoryAnyArray(categoryIds: string[]) {
  return sql`ANY(ARRAY[${sql.join(
    categoryIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}])`;
}

/**
 * SQL fragment: `AND EXISTS (SELECT 1 FROM article_category ac2 WHERE
 * ac2.article_id = <articleColumn> AND ac2.category_id = ANY(ARRAY[...]))`
 * for the given article column reference (e.g. 'a.id'). Returns empty
 * fragment when no categories selected (no filter).
 *
 * Multi-select semantics: an article passes if it has AT LEAST ONE of the
 * given categories (OR across categories), matching the articles list.
 */
function buildCategoryExists(articleColumnSql: string, categoryIds: string[]) {
  if (categoryIds.length === 0) return sql``;
  return sql`AND EXISTS (
        SELECT 1 FROM article_category ac2
        WHERE ac2.article_id = ${sql.raw(articleColumnSql)}
          AND ac2.category_id = ${categoryAnyArray(categoryIds)}
      )`;
}

function periodToFromDate(period: GraphPeriod, customFrom?: Date): Date | null {
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

// Re-export for callers that don't need full BuildGraphOpts.
export { DEFAULT_TOP };
