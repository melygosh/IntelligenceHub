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
import { AnthropicAdapter, type AnthropicCallResult } from './anthropic.adapter';
import { OpenAiAdapter, type OpenAiCallResult } from './openai.adapter';
import { LlmResponseCacheService } from './llm-cache.service';

type AdapterResult = AnthropicCallResult | OpenAiCallResult;
type TelemetryPayload = AdapterResult['telemetry'];

@Injectable()
export class LlmService implements ILlmService {
  private readonly log = new Logger(LlmService.name);
  private readonly provider: LlmProvider;
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
    this.maxConcurrent = env.LLM_CONCURRENCY;
  }

  private get activeModel(): string {
    return this.provider === 'anthropic' ? this.anthropic.model : this.openai.model;
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult> {
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

    return this.withSemaphore(() => this.callWithRetry(input));
  }

  async buildDigest(input: BuildDigestLlmInput): Promise<{
    result: BuildDigestLlmResult;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }> {
    const contentHash = await this.hashDigestInput(input);

    const cached = await this.cache.readDigest(
      contentHash,
      this.provider,
      this.activeModel,
      'build_digest_v1',
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
      const adapter = this.provider === 'anthropic' ? this.anthropic : this.openai;
      const t0 = Date.now();
      let lastErr: Error | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const { result, telemetry, model } = await adapter.buildDigest(input);
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
            operation: 'build_digest_v1',
          });
          await this.cache.writeDigest(
            contentHash,
            this.provider,
            model,
            'build_digest_v1',
            result,
          );
          return {
            result,
            inputTokens: telemetry.inputTokens,
            outputTokens: telemetry.outputTokens,
            model,
          };
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          this.log.warn(
            JSON.stringify({
              event: 'llm.digest_attempt_failed',
              userId: input.userId,
              attempt,
              error: lastErr.message,
            }),
          );
        }
      }

      await this.recordTelemetry({
        userId: input.userId,
        articleId: null,
        model: this.activeModel,
        status: 'error',
        telemetry: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: Date.now() - t0,
        },
        operation: 'build_digest_v1',
        errorMessage: lastErr?.message ?? 'unknown',
      });
      throw lastErr ?? new Error('buildDigest failed without throwing');
    });
  }

  private async hashDigestInput(input: BuildDigestLlmInput): Promise<string> {
    // Deterministic content hash: same period + scope + article subset → same hash.
    // Articles ordered by title to neutralise upstream ordering changes.
    const articles = [...input.articles].sort((a, b) => a.title.localeCompare(b.title));
    const canonical = JSON.stringify({
      period: input.period,
      scopeLabel: input.scopeLabel,
      articles: articles.map((a) => ({ title: a.title, summary: a.summary ?? '' })),
    });
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async callWithRetry(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult> {
    const adapter = this.provider === 'anthropic' ? this.anthropic : this.openai;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = (await adapter.analyzeArticle(input)) as AdapterResult;
        await this.recordTelemetry({
          userId: input.userId,
          articleId: input.articleId,
          model: result.model,
          status: 'success',
          telemetry: result.telemetry,
        });
        await this.cache.write(
          input.contentHash,
          this.provider,
          result.model,
          'analyze_article_v3',
          input.configHash,
          result.data,
        );
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

  private async recordTelemetry(args: {
    userId: string;
    articleId: string | null;
    model: string;
    status: string;
    telemetry: TelemetryPayload;
    operation?: LlmOperation;
    errorMessage?: string;
  }): Promise<void> {
    await this.db.insert(llmCalls).values({
      userId: args.userId,
      articleId: args.articleId,
      provider: this.provider,
      model: args.model,
      operation: args.operation ?? 'analyze_article_v3',
      status: args.status,
      inputTokens: args.telemetry.inputTokens,
      outputTokens: args.telemetry.outputTokens,
      cacheReadTokens: args.telemetry.cacheReadTokens,
      cacheCreationTokens: args.telemetry.cacheCreationTokens,
      latencyMs: args.telemetry.latencyMs,
      errorMessage: args.errorMessage,
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
