import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type ArticleAnalysisInput,
  type ArticleAnalysisResult,
  type BuildDigestLlmInput,
  type BuildDigestLlmResult,
  type LlmOperation,
  type LlmProvider,
  type LlmService as ILlmService,
} from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { llmCalls } from '../db/schema';
import { loadEnv } from '../common/config/env';
import {
  AnthropicAdapter,
  type AnthropicCallResult,
} from './anthropic.adapter';
import { OpenAiAdapter, type OpenAiCallResult } from './openai.adapter';
import { LlmResponseCacheService } from './llm-cache.service';

type AdapterResult = AnthropicCallResult | OpenAiCallResult;
type TelemetryPayload = AdapterResult['telemetry'];

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
    // Cache lookup keyed by content_hash + provider + model + operation
    const cached = await this.cache.read(
      input.contentHash,
      this.provider,
      this.activeModel,
      'analyze_article_v3',
      input.configHash,
    );
    if (cached) {
      this.log.log(
        JSON.stringify({
          event: 'llm.cache_hit',
          articleId: input.articleId,
          contentHash: input.contentHash,
        }),
      );
      return cached;
    }

    return this.withSemaphore(async () => {
      try {
        return await this.callWithRetry(input);
      } catch (primaryErr) {
        if (!this.fallbackProvider) throw primaryErr;
        const reason = this.classifyErrorToReason(primaryErr);
        this.log.warn(
          JSON.stringify({
            event: 'llm.failover.fire',
            articleId: input.articleId,
            primary: this.provider,
            fallback: this.fallbackProvider,
            reason,
          }),
        );
        return await this.callOnceWithFallback(input, reason);
      }
    });
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
            // Rate limit / timeout / network errors are not retried here — the SDK already
            // auto-retries those once or twice with backoff.
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
      try {
        const result = await adapter.analyzeArticle(input);
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: result.model,
          status: 'success',
          telemetry: result.telemetry,
        });
        try {
          await this.cache.write(
            input.contentHash,
            this.provider,
            result.model,
            'analyze_article_v3',
            input.configHash,
            result.data,
          );
        } catch (cacheErr) {
          this.log.warn(
            JSON.stringify({
              event: 'llm.cache_write_failed',
              articleId: input.articleId,
              provider: this.provider,
              error:
                cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
            }),
          );
          // Swallow — primary call succeeded, result is valid even without cache.
        }
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
            latencyMs: 0,
          },
          errorMessage: (err as Error).message,
        });
        // Retry only on validation failure (likely transient model wobble).
        // Rate limit / timeout / network errors are not retried here — the SDK already
        // auto-retries those once or twice with backoff.
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
        operation: 'analyze_article_v3',
        provider,
        failoverReason,
      });
      try {
        await this.cache.write(
          input.contentHash,
          provider,
          result.model,
          'analyze_article_v3',
          input.configHash,
          result.data,
        );
      } catch (cacheErr) {
        this.log.warn(
          JSON.stringify({
            event: 'llm.cache_write_failed',
            articleId: input.articleId,
            provider,
            error:
              cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          }),
        );
        // Swallow — fallback call succeeded, result is valid even without cache.
      }
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
        operation: 'analyze_article_v3',
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
      operation: args.operation ?? 'analyze_article_v3',
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
