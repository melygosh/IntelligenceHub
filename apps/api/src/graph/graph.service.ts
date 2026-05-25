import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities } from '../db/schema';
import type {
  EntityKind,
  GraphEdge,
  GraphNode,
  GraphResponse,
} from '@intelligencehub/shared';

@Injectable()
export class GraphService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async buildMine(userId: string): Promise<GraphResponse> {
    const [articleRows, entityRows, edgeRows] = await Promise.all([
      this.db
        .select({ id: articles.id, title: articles.title, ts: articles.ts })
        .from(articles)
        .where(eq(articles.userId, userId)),
      this.db
        .select({ id: entities.id, canonicalName: entities.canonicalName, type: entities.type })
        .from(entities)
        .where(eq(entities.userId, userId)),
      this.db
        .select({ from: articleEntity.articleId, to: articleEntity.entityId })
        .from(articleEntity)
        .innerJoin(articles, eq(articles.id, articleEntity.articleId))
        .where(eq(articles.userId, userId)),
    ]);

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
