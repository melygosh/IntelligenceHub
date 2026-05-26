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
  llmCalls,
} from '../db/schema';
import { LlmService } from '../llm/llm.service';
import { EntityResolverService } from '../entities/entity-resolver.service';
import {
  UserConfigService,
  type UserConfigSnapshot,
} from './user-config.service';
import type { ArticleAnalysisResult } from '@intelligencehub/shared';
import type { FetchedItem } from '../feeds/feed-fetcher.service';

type ProcessOutcome = 'inserted' | 'llm_error';
export type RetagOutcome = 'cache_hit' | 'llm_called' | 'error';

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
    const config =
      configSnapshot ?? (await this.userConfig.snapshotFor(userId));

    const [article] = await this.db
      .insert(articles)
      .values({
        userId,
        feedId,
        url: item.normalisedUrl,
        title: item.title || 'Untitled',
        contentHash: item.contentHash,
        body: item.body, // persist body so retag (Day 8b) can re-run analysis
        status: 'ready',
        ts: item.ts,
      })
      .returning({ id: articles.id });

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
        JSON.stringify({
          event: 'article.llm_error',
          articleId: article.id,
          userId,
          error: msg,
        }),
      );
      await this.db
        .update(articles)
        .set({ status: 'llm_error' })
        .where(eq(articles.id, article.id));
      return 'llm_error';
    }

    await this.db
      .update(articles)
      .set({
        summary: analysis.summary,
        importance: analysis.importance,
        configHash: config.hash,
      })
      .where(eq(articles.id, article.id));

    // Entity resolution stays in process() — it's insert-time (Day 6 pipeline).
    for (const e of analysis.entities) {
      const entityId = await this.resolver.resolveOrInsertEntity(userId, e);
      await this.db
        .insert(articleEntity)
        .values({ articleId: article.id, entityId })
        .onConflictDoNothing();
    }

    // Category + axis-value tagging lifted into writeTagsFor for reuse by retag().
    await this.writeTagsFor(article.id, userId, analysis);

    return 'inserted';
  }

  /**
   * Re-tag an existing article under the given config snapshot. Used by
   * RegenerationWorker. Wipes existing article_category + article_axis_value
   * rows for the article and rewrites from a fresh analyzeArticle call.
   * Updates summary + importance + config_hash on the article row.
   *
   * Returns 'cache_hit' if the LLM call was served from the response cache,
   * 'llm_called' if a real LLM round-trip happened, or 'error' if the article
   * was missing OR the LLM call failed (after the Day 5 retry).
   */
  async retag(
    articleId: string,
    userId: string,
    configSnapshot: UserConfigSnapshot,
  ): Promise<RetagOutcome> {
    const [article] = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        body: articles.body,
        contentHash: articles.contentHash,
      })
      .from(articles)
      .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
      .limit(1);
    if (!article) {
      this.log.warn(
        JSON.stringify({ event: 'regen.article_missing', articleId, userId }),
      );
      return 'error';
    }
    if (!article.contentHash) {
      this.log.warn(
        JSON.stringify({ event: 'regen.no_content_hash', articleId, userId }),
      );
      return 'error';
    }

    // Detect whether the LLM call resulted in a new llm_calls row (LLM was
    // actually invoked) or whether the response came from cache (no row).
    const beforeRows = await this.db
      .select({ id: llmCalls.id })
      .from(llmCalls)
      .where(
        and(eq(llmCalls.articleId, articleId), eq(llmCalls.status, 'success')),
      );
    const beforeCount = beforeRows.length;

    let analysis: ArticleAnalysisResult;
    try {
      analysis = await this.llm.analyzeArticle({
        title: article.title,
        // Legacy articles (pre-Day-8b) have NULL body. They can still cache-hit
        // (lookup keyed on content_hash only); cache-miss degrades to title-only
        // LLM input — accepted as a one-time-cost for pre-existing rows.
        body: article.body ?? '',
        articleId: article.id,
        userId,
        contentHash: article.contentHash,
        userCategories: configSnapshot.categories,
        userAxes: configSnapshot.axes,
        configHash: configSnapshot.hash,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        JSON.stringify({
          event: 'regen.llm_error',
          articleId,
          userId,
          error: msg,
        }),
      );
      return 'error';
    }

    const afterRows = await this.db
      .select({ id: llmCalls.id })
      .from(llmCalls)
      .where(
        and(eq(llmCalls.articleId, articleId), eq(llmCalls.status, 'success')),
      );
    const afterCount = afterRows.length;
    const wasLlmCall = afterCount > beforeCount;

    await this.db
      .update(articles)
      .set({
        summary: analysis.summary,
        importance: analysis.importance,
        configHash: configSnapshot.hash,
      })
      .where(eq(articles.id, articleId));

    await this.writeTagsFor(articleId, userId, analysis);

    return wasLlmCall ? 'llm_called' : 'cache_hit';
  }

  /**
   * Persist category + axis-value assignments for an article. Wipes existing
   * rows first so re-tagging is idempotent. Silently drops unknown names
   * (LLM drift defense) and ON CONFLICT DO NOTHING defends against duplicate
   * axis assignments.
   */
  private async writeTagsFor(
    articleId: string,
    userId: string,
    analysis: ArticleAnalysisResult,
  ): Promise<void> {
    // Wipe existing tag assignments (idempotent re-tag).
    await this.db
      .delete(articleCategory)
      .where(eq(articleCategory.articleId, articleId));
    await this.db
      .delete(articleAxisValue)
      .where(eq(articleAxisValue.articleId, articleId));

    // Categories — resolve name -> id; silently drop unknowns.
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
            articleId,
            kind: 'category',
            llmName: name,
          }),
        );
        continue;
      }
      await this.db
        .insert(articleCategory)
        .values({ articleId, categoryId: row.id })
        .onConflictDoNothing();
    }

    // Axis assignments — resolve axisName -> axis_id, value -> axis_value_id;
    // ON CONFLICT defends against the LLM emitting multiple values for the
    // same axis (only the first wins per the PK (article_id, axis_id)).
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
            articleId,
            kind: 'axis',
            llmName: assignment.axisName,
          }),
        );
        continue;
      }
      const [valueRow] = await this.db
        .select({ id: axisValue.id })
        .from(axisValue)
        .where(
          and(
            eq(axisValue.axisId, axisRow.id),
            eq(axisValue.value, assignment.value),
          ),
        )
        .limit(1);
      if (!valueRow) {
        this.log.debug(
          JSON.stringify({
            event: 'article.tag_drift',
            articleId,
            kind: 'axis_value',
            llmAxis: assignment.axisName,
            llmValue: assignment.value,
          }),
        );
        continue;
      }
      await this.db
        .insert(articleAxisValue)
        .values({ articleId, axisId: axisRow.id, axisValueId: valueRow.id })
        .onConflictDoNothing();
    }
  }
}
