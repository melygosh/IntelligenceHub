import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities } from '../db/schema';
import type { ArticleListItem, EntityKind } from '@intelligencehub/shared';

@Injectable()
export class ArticlesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(userId: string): Promise<ArticleListItem[]> {
    const articleRows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        url: articles.url,
        summary: articles.summary,
        importance: articles.importance,
        ts: articles.ts,
        feedId: articles.feedId,
      })
      .from(articles)
      .where(eq(articles.userId, userId))
      .orderBy(desc(articles.ts));

    if (articleRows.length === 0) return [];

    const entityRows = await this.db
      .select({
        articleId: articleEntity.articleId,
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(articleEntity)
      .innerJoin(entities, eq(entities.id, articleEntity.entityId))
      .where(eq(entities.userId, userId));

    const byArticle = new Map<string, ArticleListItem['entities']>();
    for (const e of entityRows) {
      const list = byArticle.get(e.articleId) ?? [];
      list.push({ id: e.id, canonicalName: e.canonicalName, type: e.type as EntityKind });
      byArticle.set(e.articleId, list);
    }

    return articleRows.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      summary: a.summary,
      importance: (a.importance as ArticleListItem['importance']) ?? null,
      ts: a.ts.toISOString(),
      feedId: a.feedId,
      entities: byArticle.get(a.id) ?? [],
    }));
  }
}
