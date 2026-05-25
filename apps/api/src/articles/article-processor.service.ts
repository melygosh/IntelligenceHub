import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
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
} from '../db/schema';
import { LlmService } from '../llm/llm.service';
import { EntityResolverService } from '../entities/entity-resolver.service';
import { UserConfigService, type UserConfigSnapshot } from './user-config.service';
import type { FetchedItem } from '../feeds/feed-fetcher.service';

type ProcessOutcome = 'inserted' | 'llm_error';

@Injectable()
export class ArticleProcessor {
  private readonly log = new Logger(ArticleProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly llm: LlmService,
    private readonly resolver: EntityResolverService,
    private readonly userConfig: UserConfigService,
  ) {}

  async process(
    userId: string,
    feedId: string,
    item: FetchedItem,
    configSnapshot?: UserConfigSnapshot,
  ): Promise<ProcessOutcome> {
    const config = configSnapshot ?? (await this.userConfig.snapshotFor(userId));

    // 1. Insert article with status='ready'; we may flip to 'llm_error' below.
    const [article] = await this.db
      .insert(articles)
      .values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        status: 'ready',
        ts: item.ts,
      })
      .returning({ id: articles.id });

    // 2. Call LLM (cache lookup happens inside LlmService).
    let analysis;
    try {
      analysis = await this.llm.analyzeArticle({
        title: item.title || 'Untitled',
        body: item.body,
        articleId: article.id,
        userId,
        contentHash: item.contentHash,
        userCategories: config.categories,
        userAxes: config.axes,
        configHash: config.hash,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        JSON.stringify({ event: 'article.llm_error', articleId: article.id, userId, error: msg }),
      );
      await this.db.update(articles).set({ status: 'llm_error' }).where(eq(articles.id, article.id));
      return 'llm_error';
    }

    // 3. Update article with summary + importance + config_hash.
    await this.db
      .update(articles)
      .set({
        summary: analysis.summary,
        importance: analysis.importance,
        configHash: config.hash,
      })
      .where(eq(articles.id, article.id));

    // 4. Entities (Day 6 path, unchanged).
    for (const e of analysis.entities) {
      const entityId = await this.resolver.resolveOrInsertEntity(userId, e);
      await this.db
        .insert(articleEntity)
        .values({ articleId: article.id, entityId })
        .onConflictDoNothing();
    }

    // 5. Categories — resolve name -> id; silently drop unknowns (LLM drift defense).
    for (const name of analysis.categoryNames) {
      const [row] = await this.db
        .select({ id: category.id })
        .from(category)
        .where(and(eq(category.userId, userId), eq(category.name, name)))
        .limit(1);
      if (!row) {
        this.log.debug(
          JSON.stringify({
            event: 'article.tag_drift',
            articleId: article.id,
            kind: 'category',
            llmName: name,
          }),
        );
        continue;
      }
      await this.db
        .insert(articleCategory)
        .values({ articleId: article.id, categoryId: row.id })
        .onConflictDoNothing();
    }

    // 6. Axis assignments — resolve axisName -> axis_id, value -> axis_value_id;
    //    silently drop unknowns. ON CONFLICT defends against duplicate axis assignment.
    for (const assignment of analysis.axisAssignments) {
      const [axisRow] = await this.db
        .select({ id: axis.id })
        .from(axis)
        .where(and(eq(axis.userId, userId), eq(axis.name, assignment.axisName)))
        .limit(1);
      if (!axisRow) {
        this.log.debug(
          JSON.stringify({
            event: 'article.tag_drift',
            articleId: article.id,
            kind: 'axis',
            llmName: assignment.axisName,
          }),
        );
        continue;
      }
      const [valueRow] = await this.db
        .select({ id: axisValue.id })
        .from(axisValue)
        .where(and(eq(axisValue.axisId, axisRow.id), eq(axisValue.value, assignment.value)))
        .limit(1);
      if (!valueRow) {
        this.log.debug(
          JSON.stringify({
            event: 'article.tag_drift',
            articleId: article.id,
            kind: 'axis_value',
            llmAxis: assignment.axisName,
            llmValue: assignment.value,
          }),
        );
        continue;
      }
      await this.db
        .insert(articleAxisValue)
        .values({ articleId: article.id, axisId: axisRow.id, axisValueId: valueRow.id })
        .onConflictDoNothing();
    }

    return 'inserted';
  }
}
