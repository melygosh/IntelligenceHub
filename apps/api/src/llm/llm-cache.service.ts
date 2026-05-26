import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { llmResponseCache } from '../db/schema';
import type {
  ArticleAnalysisResult,
  BuildDigestLlmResult,
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
}
