import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type ArticleAnalysisInput,
  type ArticleAnalysisResult,
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
    articleId: string;
    model: string;
    status: string;
    telemetry: TelemetryPayload;
    errorMessage?: string;
  }): Promise<void> {
    await this.db.insert(llmCalls).values({
      userId: args.userId,
      articleId: args.articleId,
      provider: this.provider,
      model: args.model,
      operation: 'analyze_article_v3',
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
