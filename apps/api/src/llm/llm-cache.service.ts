import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { llmResponseCache } from '../db/schema';
import type {
  ArticleAnalysisResult,
  BuildDigestLlmResult,
  CategorizeResult,
  ExtractResult,
  LlmOperation,
  LlmProvider,
} from '@intelligencehub/shared';

@Injectable()
export class LlmResponseCacheService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async read(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    operation: LlmOperation,
    configHash: string,
  ): Promise<ArticleAnalysisResult | null> {
    const [row] = await this.db
      .select({ responseJson: llmResponseCache.responseJson })
      .from(llmResponseCache)
      .where(
        and(
          eq(llmResponseCache.contentHash, contentHash),
          eq(llmResponseCache.provider, provider),
          eq(llmResponseCache.model, model),
          eq(llmResponseCache.operation, operation),
          eq(llmResponseCache.configHash, configHash),
        ),
      )
      .limit(1);
    return (row?.responseJson ?? null) as ArticleAnalysisResult | null;
  }

  async write(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    operation: LlmOperation,
    configHash: string,
    response: ArticleAnalysisResult,
  ): Promise<void> {
    await this.db
      .insert(llmResponseCache)
      .values({
        contentHash,
        provider,
        model,
        operation,
        responseJson: response,
        configHash,
      })
      .onConflictDoNothing();
  }

  /**
   * Digest cache reuse. Digests are not user-config-dependent, so configHash is
   * always the empty-string sentinel (matches the column default).
   */
  async readDigest(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    operation: LlmOperation,
  ): Promise<BuildDigestLlmResult | null> {
    const [row] = await this.db
      .select({ responseJson: llmResponseCache.responseJson })
      .from(llmResponseCache)
      .where(
        and(
          eq(llmResponseCache.contentHash, contentHash),
          eq(llmResponseCache.provider, provider),
          eq(llmResponseCache.model, model),
          eq(llmResponseCache.operation, operation),
          eq(llmResponseCache.configHash, ''),
        ),
      )
      .limit(1);
    return (row?.responseJson ?? null) as BuildDigestLlmResult | null;
  }

  async writeDigest(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    operation: LlmOperation,
    response: BuildDigestLlmResult,
  ): Promise<void> {
    await this.db
      .insert(llmResponseCache)
      .values({
        contentHash,
        provider,
        model,
        operation,
        responseJson: response,
        configHash: '',
      })
      .onConflictDoNothing();
  }

  // Article-specific extract: cached by content alone (configHash='').
  async readExtract(
    contentHash: string,
    provider: LlmProvider,
    model: string,
  ): Promise<ExtractResult | null> {
    // 1. A dedicated extract row.
    const [row] = await this.db
      .select({ responseJson: llmResponseCache.responseJson })
      .from(llmResponseCache)
      .where(
        and(
          eq(llmResponseCache.contentHash, contentHash),
          eq(llmResponseCache.provider, provider),
          eq(llmResponseCache.model, model),
          eq(llmResponseCache.operation, 'extract_article_v1'),
          eq(llmResponseCache.configHash, ''),
        ),
      )
      .limit(1);
    if (row) return row.responseJson as ExtractResult;

    // 2. Historical bootstrap: any full analyze_article_v4 row for this content
    //    (under any config) already contains the extract subset.
    const [full] = await this.db
      .select({ responseJson: llmResponseCache.responseJson })
      .from(llmResponseCache)
      .where(
        and(
          eq(llmResponseCache.contentHash, contentHash),
          eq(llmResponseCache.provider, provider),
          eq(llmResponseCache.model, model),
          eq(llmResponseCache.operation, 'analyze_article_v4'),
        ),
      )
      .limit(1);
    if (full) {
      return extractFromFull(full.responseJson as ArticleAnalysisResult);
    }
    return null;
  }

  async writeExtract(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    extract: ExtractResult,
  ): Promise<void> {
    await this.db
      .insert(llmResponseCache)
      .values({
        contentHash,
        provider,
        model,
        operation: 'extract_article_v1',
        responseJson: extract,
        configHash: '',
      })
      .onConflictDoNothing();
  }

  async readCategorize(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    configHash: string,
  ): Promise<CategorizeResult | null> {
    const [row] = await this.db
      .select({ responseJson: llmResponseCache.responseJson })
      .from(llmResponseCache)
      .where(
        and(
          eq(llmResponseCache.contentHash, contentHash),
          eq(llmResponseCache.provider, provider),
          eq(llmResponseCache.model, model),
          eq(llmResponseCache.operation, 'categorize_article_v1'),
          eq(llmResponseCache.configHash, configHash),
        ),
      )
      .limit(1);
    return (row?.responseJson ?? null) as CategorizeResult | null;
  }

  async writeCategorize(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    configHash: string,
    categorize: CategorizeResult,
  ): Promise<void> {
    await this.db
      .insert(llmResponseCache)
      .values({
        contentHash,
        provider,
        model,
        operation: 'categorize_article_v1',
        responseJson: categorize,
        configHash,
      })
      .onConflictDoNothing();
  }
}

/** Project a full analysis result down to its extract subset (used by the
 * historical-bootstrap fallback in readExtract). Pure + unit-tested. */
export function extractFromFull(full: ArticleAnalysisResult): ExtractResult {
  return {
    summary: full.summary,
    importance: full.importance,
    entities: full.entities,
  };
}
