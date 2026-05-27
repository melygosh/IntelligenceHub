import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import {
  articleCategory,
  articleEntity,
  articles,
  entities,
} from '../db/schema';
import type {
  EntityKind,
  GraphEdge,
  GraphNode,
  GraphResponse,
} from '@intelligencehub/shared';

@Injectable()
export class GraphService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async buildMine(userId: string, categoryId?: string): Promise<GraphResponse> {
    // Step 1 — figure out which article rows are in scope.
    let articleRows: Array<{ id: string; title: string; ts: Date }>;
    if (categoryId) {
      articleRows = await this.db
        .select({ id: articles.id, title: articles.title, ts: articles.ts })
        .from(articles)
        .innerJoin(articleCategory, eq(articleCategory.articleId, articles.id))
        .where(
          and(
            eq(articles.userId, userId),
            eq(articleCategory.categoryId, categoryId),
          ),
        );
    } else {
      articleRows = await this.db
        .select({ id: articles.id, title: articles.title, ts: articles.ts })
        .from(articles)
        .where(eq(articles.userId, userId));
    }
    const articleIds = articleRows.map((a) => a.id);

    // Step 2 — mention edges = article_entity rows whose article is in scope.
    let mentionEdgeRows: Array<{ from: string; to: string }> = [];
    if (articleIds.length > 0) {
      mentionEdgeRows = await this.db
        .select({ from: articleEntity.articleId, to: articleEntity.entityId })
        .from(articleEntity)
        .where(inArray(articleEntity.articleId, articleIds));
    }

    // Step 3 — entities referenced by the filtered article set.
    let entityRows: Array<{ id: string; canonicalName: string; type: string }> =
      [];
    if (mentionEdgeRows.length > 0) {
      const entityIds = Array.from(new Set(mentionEdgeRows.map((e) => e.to)));
      entityRows = await this.db
        .select({
          id: entities.id,
          canonicalName: entities.canonicalName,
          type: entities.type,
        })
        .from(entities)
        .where(
          and(eq(entities.userId, userId), inArray(entities.id, entityIds)),
        );
    }

    // Step 4 — co-mention edges (entity <-> entity, weighted by shared articles).
    const coMentionEdges = await this.buildCoMentionEdges(userId, categoryId);

    const nodes: GraphNode[] = [
      ...articleRows.map(
        (a): GraphNode => ({
          id: a.id,
          kind: 'article',
          label: a.title,
          ts: Math.floor(a.ts.getTime() / 1000),
          entityType: null,
        }),
      ),
      ...entityRows.map(
        (e): GraphNode => ({
          id: e.id,
          kind: 'entity',
          label: e.canonicalName,
          ts: null,
          entityType: e.type as EntityKind,
        }),
      ),
    ];

    const edges: GraphEdge[] = [
      ...mentionEdgeRows.map(
        (e): GraphEdge => ({
          from: e.from,
          to: e.to,
          kind: 'mentions',
          weight: null,
        }),
      ),
      ...coMentionEdges,
    ];

    return { nodes, edges };
  }

  /**
   * Self-join article_entity on shared article_id. Each unordered entity pair
   * {A,B} appears twice in the join (A,B and B,A); the `ae1.entity_id <
   * ae2.entity_id` filter keeps one direction, and LEAST/GREATEST give stable
   * from/to ordering for React keys. Scoped to the user via the articles join;
   * when categoryId is passed, additionally restricted to articles in that
   * category. Returns empty array when no co-mentions exist.
   */
  private async buildCoMentionEdges(
    userId: string,
    categoryId?: string,
  ): Promise<GraphEdge[]> {
    const result = categoryId
      ? await this.db.execute<{
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
          JOIN article_category ac ON ac.article_id = a.id AND ac.category_id = ${categoryId}
          WHERE ae1.entity_id < ae2.entity_id
          GROUP BY from_id, to_id
        `)
      : await this.db.execute<{
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
          WHERE ae1.entity_id < ae2.entity_id
          GROUP BY from_id, to_id
        `);

    // Drizzle's `execute` returns a result object with `.rows` for pg.
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
}
