import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles } from '../db/schema';
import { LlmService } from '../llm/llm.service';
import { EntityResolverService } from '../entities/entity-resolver.service';
import type { FetchedItem } from '../feeds/feed-fetcher.service';

type ProcessOutcome = 'inserted' | 'llm_error';

@Injectable()
export class ArticleProcessor {
  private readonly log = new Logger(ArticleProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly llm: LlmService,
    private readonly resolver: EntityResolverService,
  ) {}

  async process(
    userId: string,
    feedId: string,
    item: FetchedItem,
  ): Promise<ProcessOutcome> {
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
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(
        JSON.stringify({ event: 'article.llm_error', articleId: article.id, userId, error: msg }),
      );
      await this.db.update(articles).set({ status: 'llm_error' }).where(eq(articles.id, article.id));
      return 'llm_error';
    }

    // 3. Update article with summary + importance.
    await this.db
      .update(articles)
      .set({ summary: analysis.summary, importance: analysis.importance })
      .where(eq(articles.id, article.id));

    // 4. Resolve each LLM-emitted entity through EntityResolver (handles dedup +
    //    alias ingest), then record the article<->entity mention.
    for (const e of analysis.entities) {
      const entityId = await this.resolver.resolveOrInsertEntity(userId, e);
      await this.db
        .insert(articleEntity)
        .values({ articleId: article.id, entityId })
        .onConflictDoNothing();
    }

    return 'inserted';
  }
}
