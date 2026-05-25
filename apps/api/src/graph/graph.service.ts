import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleCategory, articleEntity, articles, entities } from '../db/schema';
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
          and(eq(articles.userId, userId), eq(articleCategory.categoryId, categoryId)),
        );
    } else {
      articleRows = await this.db
        .select({ id: articles.id, title: articles.title, ts: articles.ts })
        .from(articles)
        .where(eq(articles.userId, userId));
    }
    const articleIds = articleRows.map((a) => a.id);

    // Step 2 — edges = article_entity rows whose article is in scope.
    let edgeRows: Array<{ from: string; to: string }> = [];
    if (articleIds.length > 0) {
      edgeRows = await this.db
        .select({ from: articleEntity.articleId, to: articleEntity.entityId })
        .from(articleEntity)
        .where(inArray(articleEntity.articleId, articleIds));
    }

    // Step 3 — entities referenced by the filtered article set.
    let entityRows: Array<{ id: string; canonicalName: string; type: string }> = [];
    if (edgeRows.length > 0) {
      const entityIds = Array.from(new Set(edgeRows.map((e) => e.to)));
      entityRows = await this.db
        .select({
          id: entities.id,
          canonicalName: entities.canonicalName,
          type: entities.type,
        })
        .from(entities)
        .where(and(eq(entities.userId, userId), inArray(entities.id, entityIds)));
    }

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

    const edges: GraphEdge[] = edgeRows.map((e) => ({
      from: e.from,
      to: e.to,
      kind: 'mentions',
      weight: null,
    }));

    return { nodes, edges };
  }
}
