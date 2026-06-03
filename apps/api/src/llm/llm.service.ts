import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type ArticleAnalysisInput,
  type ArticleAnalysisResult,
  type BuildDigestLlmInput,
  type BuildDigestLlmResult,
  type CategorizeInput,
  type CategorizeResult,
  type ExtractResult,
  type LlmOperation,
  type LlmProvider,
  type LlmService as ILlmService,
  splitAnalysis,
  mergeAnalysis,
} from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { llmCalls } from '../db/schema';
import { loadEnv } from '../common/config/env';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiAdapter } from './openai.adapter';
import type { LlmCallTelemetry } from './llm-adapter.interface';
import { LlmResponseCacheService } from './llm-cache.service';

type TelemetryPayload = LlmCallTelemetry;

@Injectable()
export class LlmService implements ILlmService {
  private readonly log = new Logger(LlmService.name);
  private readonly provider: LlmProvider;
  private readonly fallbackProvider: LlmProvider | null;
  private readonly maxConcurrent: number;

  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly anthropic: AnthropicAdapter,
    private readonly openai: OpenAiAdapter,
    private readonly cache: LlmResponseCacheService,
  ) {
    const env = loadEnv();
    this.provider = env.LLM_PROVIDER;
    this.fallbackProvider = env.LLM_FALLBACK_PROVIDER ?? null;
    this.maxConcurrent = env.LLM_CONCURRENCY;
  }

  private get activeModel(): string {
    return this.provider === 'anthropic'
      ? this.anthropic.model
      : this.openai.model;
  }

  async analyzeArticle(
    input: ArticleAnalysisInput,
  ): Promise<ArticleAnalysisResult> {
    const provider = this.provider;
    const model = this.activeModel;
    const noConfig =
      input.userCategories.length === 0 && input.userAxes.length === 0;

    const extract = await this.cache.readExtract(
      input.contentHash,
      provider,
      model,
    );
    const categorize = noConfig
      ? { categoryNames: [], axisAssignments: [] }
      : await this.cache.readCategorize(
          input.contentHash,
          provider,
          model,
          input.configHash,
        );

    // Path 1: both halves known → 0 LLM calls.
    if (extract && categorize) {
      this.log.log(
        JSON.stringify({
          event: 'llm.split_cache_hit',
          articleId: input.articleId,
          contentHash: input.contentHash,
        }),
      );
      return mergeAnalysis(extract, categorize);
    }

    // Path 2: extract reused, categorize missing → cheap categorize-only call.
    if (extract && !noConfig) {
      const catInput: CategorizeInput = {
        title: input.title,
        body: input.body,
        articleId: input.articleId,
        userId: input.userId,
        contentHash: input.contentHash,
        userCategories: input.userCategories,
        userAxes: input.userAxes,
        configHash: input.configHash,
        operationTrigger: 'categorize_article_v1',
      };
      const cat = await this.withSemaphore(async () => {
        try {
          return await this.categorizeWithRetry(catInput);
        } catch (primaryErr) {
          // Mirror the cold path's failover: a rate-limit/timeout on the
          // categorize-only call (the common config-tuning path) should fail
          // over to the fallback provider, not drop straight to the BullMQ
          // retry. Without this, Path 2 silently lacked the FR-3 guarantee the
          // cold and digest paths both have.
          if (!this.fallbackProvider) throw primaryErr;
          const reason = this.classifyErrorToReason(primaryErr);
          this.log.warn(
            JSON.stringify({
              event: 'llm.failover.fire',
              articleId: input.articleId,
              primary: provider,
              fallback: this.fallbackProvider,
              reason,
              operation: 'categorize_article_v1',
            }),
          );
          return this.callOnceWithFallbackCategorize(catInput, reason);
        }
      });
      await this.safeWriteCategorize(
        input.contentHash,
        provider,
        model,
        input.configHash,
        cat,
      );
      return mergeAnalysis(extract, cat);
    }

    // Path 3 (cold): one full combined call; split + cache both halves.
    return this.withSemaphore(async () => {
      let full: ArticleAnalysisResult;
      try {
        full = await this.callWithRetry(input);
      } catch (primaryErr) {
        if (!this.fallbackProvider) throw primaryErr;
        const reason = this.classifyErrorToReason(primaryErr);
        this.log.warn(
          JSON.stringify({
            event: 'llm.failover.fire',
            articleId: input.articleId,
            primary: provider,
            fallback: this.fallbackProvider,
            reason,
          }),
        );
        full = await this.callOnceWithFallback(input, reason);
      }
      const { extract: ex, categorize: cat } = splitAnalysis(full);
      await this.safeWriteExtract(input.contentHash, provider, model, ex);
      if (!noConfig) {
        await this.safeWriteCategorize(
          input.contentHash,
          provider,
          model,
          input.configHash,
          cat,
        );
      }
      return full;
    });
  }

  private async categorizeWithRetry(
    input: CategorizeInput,
  ): Promise<CategorizeResult> {
    const adapter =
      this.provider === 'anthropic' ? this.anthropic : this.openai;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const result = await adapter.categorizeArticle(input);
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: result.model,
          status: 'success',
          telemetry: result.telemetry,
          operation: 'categorize_article_v1',
        });
        return result.data;
      } catch (err) {
        lastError = err as Error;
        const status = this.classifyError(err);
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: this.activeModel,
          status,
          telemetry: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            // Record real elapsed (a failed attempt still burned wall-clock).
            latencyMs: Date.now() - t0,
          },
          operation: 'categorize_article_v1',
          errorMessage: (err as Error).message,
        });
        // Retry only on validation failure (likely transient model wobble).
        // Rate limit / timeout / network errors break out here and hand off to
        // failover (if configured) or the BullMQ job retry — the SDK does not
        // retry (maxRetries: 0), so our layer owns all retry.
        if (status !== 'invalid_response') break;
        this.log.warn(
          JSON.stringify({
            event: 'llm.retry',
            articleId: input.articleId,
            attempt,
            reason: status,
          }),
        );
      }
    }
    throw lastError ?? new Error('LLM call failed');
  }

  private async safeWriteExtract(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    extract: ExtractResult,
  ): Promise<void> {
    try {
      await this.cache.writeExtract(contentHash, provider, model, extract);
    } catch (err) {
      this.log.warn(
        JSON.stringify({
          event: 'llm.extract_cache_write_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  private async safeWriteCategorize(
    contentHash: string,
    provider: LlmProvider,
    model: string,
    configHash: string,
    categorize: CategorizeResult,
  ): Promise<void> {
    try {
      await this.cache.writeCategorize(
        contentHash,
        provider,
        model,
        configHash,
        categorize,
      );
    } catch (err) {
      this.log.warn(
        JSON.stringify({
          event: 'llm.categorize_cache_write_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  async buildDigest(input: BuildDigestLlmInput): Promise<{
    result: BuildDigestLlmResult;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }> {
    const contentHash = this.hashDigestInput(input);

    const cached = await this.cache.readDigest(
      contentHash,
      this.provider,
      this.activeModel,
      'build_digest_v2',
    );
    if (cached) {
      this.log.log(
        JSON.stringify({
          event: 'llm.digest_cache_hit',
          userId: input.userId,
          contentHash,
        }),
      );
      return {
        result: cached,
        inputTokens: 0,
        outputTokens: 0,
        model: this.activeModel,
      };
    }

    return this.withSemaphore(async () => {
      try {
        const adapter =
          this.provider === 'anthropic' ? this.anthropic : this.openai;
        const t0 = Date.now();
        let lastErr: Error | null = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const { result, telemetry, model } =
              await adapter.buildDigest(input);
            await this.recordTelemetry({
              userId: input.userId,
              articleId: null,
              model,
              status: 'success',
              telemetry: {
                inputTokens: telemetry.inputTokens,
                outputTokens: telemetry.outputTokens,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                latencyMs: Date.now() - t0,
              },
              operation: 'build_digest_v2',
            });
            try {
              await this.cache.writeDigest(
                contentHash,
                this.provider,
                model,
                'build_digest_v2',
                result,
              );
            } catch (cacheErr) {
              this.log.warn(
                JSON.stringify({
                  event: 'llm.digest_cache_write_failed',
                  userId: input.userId,
                  provider: this.provider,
                  error:
                    cacheErr instanceof Error
                      ? cacheErr.message
                      : String(cacheErr),
                }),
              );
              // Swallow — primary call succeeded, result is valid even without cache.
            }
            return {
              result,
              inputTokens: telemetry.inputTokens,
              outputTokens: telemetry.outputTokens,
              model,
            };
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            const status = this.classifyError(err);
            await this.recordTelemetry({
              userId: input.userId,
              articleId: null,
              model: this.activeModel,
              status,
              telemetry: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                latencyMs: Date.now() - t0,
              },
              operation: 'build_digest_v2',
              errorMessage: lastErr.message,
            });
            this.log.warn(
              JSON.stringify({
                event: 'llm.digest_attempt_failed',
                userId: input.userId,
                attempt,
                reason: status,
                error: lastErr.message,
              }),
            );
            // Retry only on validation failure (likely transient model wobble).
            // Rate limit / timeout / network errors break out here and hand off
            // to failover (if configured) or the BullMQ job retry — the SDK does
            // not retry (maxRetries: 0), so our layer owns all retry.
            if (status !== 'invalid_response') break;
          }
        }

        throw lastErr ?? new Error('buildDigest failed without throwing');
      } catch (primaryErr) {
        if (!this.fallbackProvider) throw primaryErr;
        const reason = this.classifyErrorToReason(primaryErr);
        this.log.warn(
          JSON.stringify({
            event: 'llm.failover.fire',
            operation: 'build_digest_v2',
            userId: input.userId,
            primary: this.provider,
            fallback: this.fallbackProvider,
            reason,
          }),
        );
        return await this.callOnceWithFallbackDigest(
          input,
          contentHash,
          reason,
        );
      }
    });
  }

  private hashDigestInput(input: BuildDigestLlmInput): string {
    // Deterministic content hash: same period + scope + article subset → same hash.
    // Articles ordered by title to neutralise upstream ordering changes.
    const articles = [...input.articles].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    const canonical = JSON.stringify({
      period: input.period,
      scopeLabel: input.scopeLabel,
      articles: articles.map((a) => ({
        title: a.title,
        summary: a.summary ?? '',
      })),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async callWithRetry(
    input: ArticleAnalysisInput,
  ): Promise<ArticleAnalysisResult> {
    const adapter =
      this.provider === 'anthropic' ? this.anthropic : this.openai;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const result = await adapter.analyzeArticle(input);
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: result.model,
          status: 'success',
          telemetry: result.telemetry,
          operation: input.operationTrigger ?? 'analyze_article_v5',
        });
        return result.data;
      } catch (err) {
        lastError = err as Error;
        const status = this.classifyError(err);
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: this.activeModel,
          status,
          telemetry: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            // A failed attempt still burned wall-clock (a timeout burns up to
            // LLM_TIMEOUT_MS); record it so the dashboard doesn't read failures
            // as instant. Tokens stay 0 — the adapter throws before returning
            // usage.
            latencyMs: Date.now() - t0,
          },
          operation: input.operationTrigger ?? 'analyze_article_v5',
          errorMessage: (err as Error).message,
        });
        // Retry only on validation failure (likely transient model wobble).
        // Rate limit / timeout / network errors break out here and hand off to
        // failover (if configured) or the BullMQ job retry — the SDK does not
        // retry (maxRetries: 0), so our layer owns all retry.
        if (status !== 'invalid_response') break;
        this.log.warn(
          JSON.stringify({
            event: 'llm.retry',
            articleId: input.articleId,
            attempt,
            reason: status,
          }),
        );
      }
    }
    throw lastError ?? new Error('LLM call failed');
  }

  private classifyError(
    err: unknown,
  ): 'invalid_response' | 'timeout' | 'rate_limit' | 'error' {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Zod validation') ||
      msg.includes('not valid JSON') ||
      msg.includes('missing tool_use') ||
      msg.includes('had no content')
    ) {
      return 'invalid_response';
    }
    const status = (err as { status?: number })?.status;
    if (status === 429) return 'rate_limit';
    if (msg.toLowerCase().includes('timeout')) return 'timeout';
    return 'error';
  }

  private classifyErrorToReason(err: unknown): string {
    const status = (err as { status?: number })?.status;
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    const msg =
      err instanceof Error
        ? err.message.toLowerCase()
        : String(err).toLowerCase();
    if (msg.includes('timeout')) return 'timeout';
    if (
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('network')
    ) {
      return 'network';
    }
    if (
      msg.includes('zod validation') ||
      msg.includes('not valid json') ||
      msg.includes('missing tool_use')
    ) {
      return 'invalid_response';
    }
    return 'unknown';
  }

  private adapterFor(provider: LlmProvider) {
    return provider === 'anthropic' ? this.anthropic : this.openai;
  }

  private modelFor(provider: LlmProvider): string {
    return provider === 'anthropic' ? this.anthropic.model : this.openai.model;
  }

  private async callOnceWithFallback(
    input: ArticleAnalysisInput,
    failoverReason: string,
  ): Promise<ArticleAnalysisResult> {
    const provider = this.fallbackProvider!;
    const adapter = this.adapterFor(provider);
    const model = this.modelFor(provider);
    const t0 = Date.now();
    try {
      const result = await adapter.analyzeArticle(input);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: input.articleId,
        model: result.model,
        status: 'success',
        telemetry: result.telemetry,
        operation: input.operationTrigger ?? 'analyze_article_v5',
        provider,
        failoverReason,
      });
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: input.articleId,
        model,
        status: 'error',
        telemetry: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: Date.now() - t0,
        },
        operation: input.operationTrigger ?? 'analyze_article_v5',
        provider,
        failoverReason,
        errorMessage: msg,
      });
      throw err;
    }
  }

  private async callOnceWithFallbackCategorize(
    input: CategorizeInput,
    failoverReason: string,
  ): Promise<CategorizeResult> {
    const provider = this.fallbackProvider!;
    const adapter = this.adapterFor(provider);
    const model = this.modelFor(provider);
    const t0 = Date.now();
    try {
      const result = await adapter.categorizeArticle(input);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: input.articleId,
        model: result.model,
        status: 'success',
        telemetry: result.telemetry,
        operation: 'categorize_article_v1',
        provider,
        failoverReason,
      });
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: input.articleId,
        model,
        status: 'error',
        telemetry: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: Date.now() - t0,
        },
        operation: 'categorize_article_v1',
        provider,
        failoverReason,
        errorMessage: msg,
      });
      throw err;
    }
  }

  private async callOnceWithFallbackDigest(
    input: BuildDigestLlmInput,
    contentHash: string,
    failoverReason: string,
  ): Promise<{
    result: BuildDigestLlmResult;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }> {
    const provider = this.fallbackProvider!;
    const adapter = this.adapterFor(provider);
    const model = this.modelFor(provider);
    const t0 = Date.now();
    try {
      const {
        result,
        telemetry,
        model: respModel,
      } = await adapter.buildDigest(input);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: null,
        model: respModel,
        status: 'success',
        telemetry: {
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: Date.now() - t0,
        },
        operation: 'build_digest_v2',
        provider,
        failoverReason,
      });
      try {
        await this.cache.writeDigest(
          contentHash,
          provider,
          respModel,
          'build_digest_v2',
          result,
        );
      } catch (cacheErr) {
        this.log.warn(
          JSON.stringify({
            event: 'llm.digest_cache_write_failed',
            userId: input.userId,
            provider,
            error:
              cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          }),
        );
        // Swallow — fallback call succeeded, result is valid even without cache.
      }
      return {
        result,
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        model: respModel,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.recordTelemetry({
        userId: input.userId,
        articleId: null,
        model,
        status: 'error',
        telemetry: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: Date.now() - t0,
        },
        operation: 'build_digest_v2',
        provider,
        failoverReason,
        errorMessage: msg,
      });
      throw err;
    }
  }

  private async recordTelemetry(args: {
    userId: string;
    articleId: string | null;
    model: string;
    status: string;
    telemetry: TelemetryPayload;
    operation?: LlmOperation;
    errorMessage?: string;
    provider?: LlmProvider;
    failoverReason?: string;
  }): Promise<void> {
    await this.db.insert(llmCalls).values({
      userId: args.userId,
      articleId: args.articleId,
      provider: args.provider ?? this.provider,
      model: args.model,
      operation: args.operation ?? 'analyze_article_v5',
      status: args.status,
      inputTokens: args.telemetry.inputTokens,
      outputTokens: args.telemetry.outputTokens,
      cacheReadTokens: args.telemetry.cacheReadTokens,
      cacheCreationTokens: args.telemetry.cacheCreationTokens,
      latencyMs: args.telemetry.latencyMs,
      errorMessage: args.errorMessage,
      failoverReason: args.failoverReason,
    });
  }

  private async withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
