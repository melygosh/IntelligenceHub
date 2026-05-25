import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities } from '../db/schema';
import { LlmService } from '../llm/llm.service';
import type { FetchedItem } from '../feeds/feed-fetcher.service';

type ProcessOutcome = 'inserted' | 'llm_error';

@Injectable()
export class ArticleProcessor {
  private readonly log = new Logger(ArticleProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly llm: LlmService,
  ) {}

  /**
   * Called by FeedPullWorker for items that passed pre-filter + dedup.
   * Drives the real LLM extraction pipeline.
   *
   * Flow: insert article (status='ready') -> call LlmService.analyzeArticle ->
   *   on success: update with summary + importance, insert entities (trivial dedup
   *               via ON CONFLICT on entities_user_canonical_unique), insert mentions
   *   on error:   flip status to 'llm_error'; entity inserts skipped
   */
  async process(
    userId: string,
    feedId: string,
    item: FetchedItem,
  ): Promise<ProcessOutcome> {
    // 1. Insert article with status='ready'; we may flip to 'llm_error' below
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

    // 2. Call LLM (cache lookup happens inside LlmService)
    let analysis;
    try {
      analysis = await this.llm.analyzeArticle({
        title: item.title || 'Untitled',
        body: item.body,
        articleId: article.id,
        userId,
        contentHash: item.contentHash,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        JSON.stringify({ event: 'article.llm_error', articleId: article.id, userId, error: msg }),
      );
      await this.db
        .update(articles)
        .set({ status: 'llm_error' })
        .where(eq(articles.id, article.id));
      return 'llm_error';
    }

    // 3. Update article with summary + importance
    await this.db
      .update(articles)
      .set({ summary: analysis.summary, importance: analysis.importance })
      .where(eq(articles.id, article.id));

    // 4. Insert entities (trivial dedup via the entities_user_canonical_unique index)
    for (const e of analysis.entities) {
      // Try insert; on conflict (same user, same canonical name) skip and fetch existing
      const inserted = await this.db
        .insert(entities)
        .values({ userId, canonicalName: e.canonicalName, type: e.type })
        .onConflictDoNothing()
        .returning({ id: entities.id });

      let entityId = inserted[0]?.id;
      if (!entityId) {
        // Conflict path: look up the existing row
        const [existing] = await this.db
          .select({ id: entities.id })
          .from(entities)
          .where(
            and(
              eq(entities.userId, userId),
              eq(entities.canonicalName, e.canonicalName),
            ),
          )
          .limit(1);
        entityId = existing?.id;
      }
      if (!entityId) continue; // defensive; shouldn't happen

      await this.db
        .insert(articleEntity)
        .values({ articleId: article.id, entityId })
        .onConflictDoNothing();
    }

    return 'inserted';
  }
}
