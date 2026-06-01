import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  QUEUE_NAMES,
  type DigestKeyArticle,
  type DigestPeriod,
  type DigestTopCategory,
  type DigestTopEntity,
  type EntityKind,
} from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import {
  articleCategory,
  articleEntity,
  articles,
  category,
  digestRun,
  entities,
  feeds,
} from '../db/schema';
// value import required for Nest DI metadata
import { LlmService } from '../llm/llm.service';
// value import required for Nest DI metadata
import { EventsService } from '../events/events.service';
import { loadEnv } from '../common/config/env';

type JobData = { digestRunId: string };

@Processor(QUEUE_NAMES.DIGEST_BUILD)
export class DigestBuilderWorker extends WorkerHost {
  private readonly log = new Logger(DigestBuilderWorker.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly llm: LlmService,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const { digestRunId } = job.data;
    const t0 = Date.now();

    const [run] = await this.db
      .select()
      .from(digestRun)
      .where(eq(digestRun.id, digestRunId))
      .limit(1);
    if (!run) {
      this.log.error(
        JSON.stringify({ event: 'digest.build.run_missing', digestRunId }),
      );
      return;
    }

    this.log.log(
      JSON.stringify({
        event: 'digest.build.start',
        digestRunId,
        userId: run.userId,
        jobId: job.id,
      }),
    );
    await job.log(
      `build digest · period=${run.period} · scope=${run.scopeKind}`,
    );

    try {
      // 1. Query in-scope articles
      const inScope = await this.queryInScope(run);
      await job.log(`${inScope.length} articles in scope`);
      if (inScope.length === 0) {
        await this.db
          .update(digestRun)
          .set({
            status: 'failed',
            errorMessage:
              'No articles in scope for the selected period and filters.',
            latencyMs: Date.now() - t0,
            finishedAt: new Date(),
          })
          .where(eq(digestRun.id, digestRunId));
        this.events.publish(run.userId, {
          type: 'digest.status_changed',
          payload: { digestId: digestRunId, status: 'failed' },
        });
        this.log.warn(
          JSON.stringify({ event: 'digest.build.empty_scope', digestRunId }),
        );
        await job.log('failed: no articles in scope for this period/filters');
        return;
      }

      const inScopeIds = inScope.map((a) => a.id);

      // 2. Aggregate top entities (top-20 by mention count in scope)
      const topEntities = await this.aggregateTopEntities(
        run.userId,
        inScopeIds,
      );

      // 3. Aggregate top categories (top-10 by article count in scope)
      const topCategories = await this.aggregateTopCategories(
        run.userId,
        inScopeIds,
      );

      // 4. Pick top-10 key articles by importance then recency, then enrich
      // each with its feed title + top-4 entities (used by the UI for the
      // source kicker and entities chip line under the title).
      const picked = this.pickKeyArticles(inScope, 10);
      const keyArticles = await this.enrichKeyArticles(run.userId, picked);

      // 5. Call LLM
      const scopeLabel = await this.buildScopeLabel(
        run,
        topCategories,
        topEntities,
      );
      // Cap the prose-summary prompt: a wide "month" digest can hold hundreds
      // of in-scope articles, and sending them all blows up prompt size + cost
      // for no editorial gain. Feed the LLM the top-N by importance then
      // recency (same ordering as the key-articles pick). Aggregations above
      // still ran over the full in-scope set, so the deterministic outputs are
      // unaffected — only the summary input is bounded.
      const promptArticles = this.pickPromptArticles(
        inScope,
        loadEnv().DIGEST_MAX_LLM_ARTICLES,
      );
      const llmInput = {
        userId: run.userId,
        period: run.period as DigestPeriod,
        scopeLabel,
        articles: promptArticles.map((a) => ({
          title: a.title,
          summary: a.summary,
        })),
      };
      const llmResult = await this.llm.buildDigest(llmInput);

      // 6. Persist
      await this.db
        .update(digestRun)
        .set({
          status: 'ready',
          title: llmResult.result.title,
          summary: JSON.stringify(llmResult.result.summary),
          topEntitiesJson: topEntities,
          topCategoriesJson: topCategories,
          keyArticlesJson: keyArticles,
          articleCount: inScope.length,
          entityCount: topEntities.length,
          inputTokens: llmResult.inputTokens,
          outputTokens: llmResult.outputTokens,
          latencyMs: Date.now() - t0,
          model: llmResult.model,
          finishedAt: new Date(),
        })
        .where(eq(digestRun.id, digestRunId));

      this.events.publish(run.userId, {
        type: 'digest.status_changed',
        payload: { digestId: digestRunId, status: 'ready' },
      });

      this.log.log(
        JSON.stringify({
          event: 'digest.build.done',
          digestRunId,
          userId: run.userId,
          jobId: job.id,
          articleCount: inScope.length,
          entityCount: topEntities.length,
          tokens: llmResult.inputTokens + llmResult.outputTokens,
          durationMs: Date.now() - t0,
        }),
      );
      const tokens = llmResult.inputTokens + llmResult.outputTokens;
      await job.log(
        `done: ${inScope.length} articles · ${topEntities.length} entities · ${tokens === 0 ? 'cache hit' : `${tokens} tokens`} · ${Date.now() - t0}ms`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db
        .update(digestRun)
        .set({
          status: 'failed',
          errorMessage: msg,
          latencyMs: Date.now() - t0,
          finishedAt: new Date(),
        })
        .where(eq(digestRun.id, digestRunId));
      this.events.publish(run.userId, {
        type: 'digest.status_changed',
        payload: { digestId: digestRunId, status: 'failed' },
      });
      this.log.error(
        JSON.stringify({
          event: 'digest.build.failed',
          digestRunId,
          error: msg,
        }),
      );
      await job.log(`failed: ${msg}`);
      throw err;
    }
  }

  private async queryInScope(run: typeof digestRun.$inferSelect): Promise<
    Array<{
      id: string;
      title: string;
      summary: string | null;
      ts: Date;
      importance: string | null;
    }>
  > {
    const scopeFilterIds = (run.scopeFilterIds ?? []) as string[];
    const hasFilter = scopeFilterIds.length > 0;
    const userId = run.userId;
    const from = run.windowFrom;
    const to = run.windowTo;

    if (!hasFilter) {
      return await this.db
        .select({
          id: articles.id,
          title: articles.title,
          summary: articles.summary,
          ts: articles.ts,
          importance: articles.importance,
        })
        .from(articles)
        .where(
          and(
            eq(articles.userId, userId),
            eq(articles.status, 'ready'),
            gte(articles.ts, from),
            lte(articles.ts, to),
          ),
        )
        .orderBy(desc(articles.ts));
    }

    if (run.scopeKind === 'category') {
      return await this.db
        .selectDistinct({
          id: articles.id,
          title: articles.title,
          summary: articles.summary,
          ts: articles.ts,
          importance: articles.importance,
        })
        .from(articles)
        .innerJoin(articleCategory, eq(articleCategory.articleId, articles.id))
        .where(
          and(
            eq(articles.userId, userId),
            eq(articles.status, 'ready'),
            gte(articles.ts, from),
            lte(articles.ts, to),
            inArray(articleCategory.categoryId, scopeFilterIds),
          ),
        )
        .orderBy(desc(articles.ts));
    }

    // scopeKind === 'entity'
    return await this.db
      .selectDistinct({
        id: articles.id,
        title: articles.title,
        summary: articles.summary,
        ts: articles.ts,
        importance: articles.importance,
      })
      .from(articles)
      .innerJoin(articleEntity, eq(articleEntity.articleId, articles.id))
      .where(
        and(
          eq(articles.userId, userId),
          eq(articles.status, 'ready'),
          gte(articles.ts, from),
          lte(articles.ts, to),
          inArray(articleEntity.entityId, scopeFilterIds),
        ),
      )
      .orderBy(desc(articles.ts));
  }

  private async aggregateTopEntities(
    userId: string,
    articleIds: string[],
  ): Promise<DigestTopEntity[]> {
    if (articleIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
        mentionCount: sql<number>`COUNT(${articleEntity.articleId})::int`,
      })
      .from(articleEntity)
      .innerJoin(entities, eq(entities.id, articleEntity.entityId))
      .where(
        and(
          eq(entities.userId, userId),
          inArray(articleEntity.articleId, articleIds),
        ),
      )
      .groupBy(entities.id, entities.canonicalName, entities.type)
      .orderBy(sql`COUNT(${articleEntity.articleId}) DESC`)
      .limit(20);
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonicalName,
      type: r.type as EntityKind,
      mentionCount: r.mentionCount,
    }));
  }

  private async aggregateTopCategories(
    userId: string,
    articleIds: string[],
  ): Promise<DigestTopCategory[]> {
    if (articleIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: category.id,
        name: category.name,
        articleCount: sql<number>`COUNT(${articleCategory.articleId})::int`,
      })
      .from(articleCategory)
      .innerJoin(category, eq(category.id, articleCategory.categoryId))
      .where(
        and(
          eq(category.userId, userId),
          inArray(articleCategory.articleId, articleIds),
        ),
      )
      .groupBy(category.id, category.name)
      .orderBy(sql`COUNT(${articleCategory.articleId}) DESC`)
      .limit(10);
    return rows;
  }

  // Top-N articles for the LLM prose prompt, ordered by importance then
  // recency. Unlike pickKeyArticles this keeps `summary` (the prompt needs it)
  // and returns the raw rows rather than the UI DigestKeyArticle shape.
  private pickPromptArticles<T extends { ts: Date; importance: string | null }>(
    inScope: T[],
    limit: number,
  ): T[] {
    const importanceRank = (i: string | null): number => {
      if (i === 'high') return 0;
      if (i === 'normal') return 1;
      if (i === 'junk') return 2;
      return 3;
    };
    return [...inScope]
      .sort((a, b) => {
        const r = importanceRank(a.importance) - importanceRank(b.importance);
        if (r !== 0) return r;
        return b.ts.getTime() - a.ts.getTime();
      })
      .slice(0, limit);
  }

  private pickKeyArticles(
    inScope: Array<{
      id: string;
      title: string;
      ts: Date;
      importance: string | null;
    }>,
    limit: number,
  ): DigestKeyArticle[] {
    const importanceRank = (i: string | null): number => {
      if (i === 'high') return 0;
      if (i === 'normal') return 1;
      if (i === 'junk') return 2;
      return 3;
    };
    return [...inScope]
      .sort((a, b) => {
        const r = importanceRank(a.importance) - importanceRank(b.importance);
        if (r !== 0) return r;
        return b.ts.getTime() - a.ts.getTime();
      })
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        title: a.title,
        ts: a.ts.toISOString(),
        importance: a.importance as 'high' | 'normal' | 'junk' | null,
        feedTitle: null,
        entities: [],
      }));
  }

  /**
   * Augment the picked key articles with their feed title and top-4 entities
   * (by mention count in the article). Two batched queries — feed via articles
   * JOIN feeds, entities via article_entity JOIN entities — then we collate in
   * JS. The point-in-time snapshot is intentional: digests record what was
   * true when built.
   */
  private async enrichKeyArticles(
    userId: string,
    picked: DigestKeyArticle[],
  ): Promise<DigestKeyArticle[]> {
    if (picked.length === 0) return picked;
    const ids = picked.map((a) => a.id);

    const feedRows = await this.db
      .select({ articleId: articles.id, feedTitle: feeds.title })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .where(and(eq(articles.userId, userId), inArray(articles.id, ids)));
    const feedByArticleId = new Map(
      feedRows.map((r) => [r.articleId, r.feedTitle]),
    );

    const entityRows = await this.db
      .select({
        articleId: articleEntity.articleId,
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(articleEntity)
      .innerJoin(entities, eq(entities.id, articleEntity.entityId))
      .where(
        and(eq(entities.userId, userId), inArray(articleEntity.articleId, ids)),
      );
    const entitiesByArticleId = new Map<
      string,
      Array<{ id: string; canonicalName: string; type: EntityKind }>
    >();
    for (const r of entityRows) {
      const list = entitiesByArticleId.get(r.articleId) ?? [];
      list.push({
        id: r.id,
        canonicalName: r.canonicalName,
        type: r.type as EntityKind,
      });
      entitiesByArticleId.set(r.articleId, list);
    }

    return picked.map((a) => ({
      ...a,
      feedTitle: feedByArticleId.get(a.id) ?? null,
      entities: (entitiesByArticleId.get(a.id) ?? []).slice(0, 4),
    }));
  }

  private async buildScopeLabel(
    run: typeof digestRun.$inferSelect,
    topCategories: DigestTopCategory[],
    topEntities: DigestTopEntity[],
  ): Promise<string> {
    const scopeFilterIds = (run.scopeFilterIds ?? []) as string[];
    if (scopeFilterIds.length === 0) {
      return `All articles (${topCategories.length} categories, ${topEntities.length} entities)`;
    }
    if (run.scopeKind === 'category') {
      const cats = await this.db
        .select({ name: category.name })
        .from(category)
        .where(
          and(
            eq(category.userId, run.userId),
            inArray(category.id, scopeFilterIds),
          ),
        );
      if (cats.length === 0) {
        return 'Categories: (none — all filter targets deleted)';
      }
      return `Categories: ${cats.map((c) => c.name).join(', ')}`;
    }
    const ents = await this.db
      .select({ name: entities.canonicalName })
      .from(entities)
      .where(
        and(
          eq(entities.userId, run.userId),
          inArray(entities.id, scopeFilterIds),
        ),
      );
    if (ents.length === 0) {
      return 'Entities: (none — all filter targets deleted)';
    }
    return `Entities: ${ents.map((e) => e.name).join(', ')}`;
  }
}
