import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import {
  articleCategory,
  articleEntity,
  articles,
  category,
  entities,
} from '../db/schema';
import type { ArticleListItem, EntityKind } from '@intelligencehub/shared';

@Injectable()
export class ArticlesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(userId: string, categoryId?: string): Promise<ArticleListItem[]> {
    // Step 1 — base article query, optionally filtered by category.
    let articleRows;
    if (categoryId) {
      articleRows = await this.db
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
        .innerJoin(articleCategory, eq(articleCategory.articleId, articles.id))
        .where(
          and(eq(articles.userId, userId), eq(articleCategory.categoryId, categoryId)),
        )
        .orderBy(desc(articles.ts));
    } else {
      articleRows = await this.db
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
    }

    if (articleRows.length === 0) return [];
    const articleIds = articleRows.map((a) => a.id);

    // Step 2 — entities per article (Day 6 join).
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

    // Step 3 — category names per article (Day 8a addition).
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
    }));
  }
}
