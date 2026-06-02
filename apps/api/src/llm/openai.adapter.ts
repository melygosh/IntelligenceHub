import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import {
  BuildDigestLlmResult,
  type ArticleAnalysisInput,
  type BuildDigestLlmInput,
} from '@intelligencehub/shared';
import { loadEnv, resolveProviderEnv } from '../common/config/env';
import type {
  LlmAdapter,
  LlmAnalyzeResult,
  LlmDigestResult,
} from './llm-adapter.interface';
import {
  ANALYZE_ARTICLE_OUTPUT_SCHEMA,
  ANALYZE_ARTICLE_SYSTEM_PROMPT,
  BUILD_DIGEST_SYSTEM_PROMPT,
  formatBuildDigestUserMessage,
  userPromptFor,
} from './prompts';
import { parseOpenAiAnalysis } from './parse-analysis';

@Injectable()
export class OpenAiAdapter implements LlmAdapter {
  // Lazy: only constructed if/when this adapter is actually used, so a missing
  // API key does not crash boot when openai is neither primary nor fallback.
  private client: OpenAI | undefined;
  readonly model: string;
  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly digestMaxTokens: number;
  private readonly timeoutMs: number;

  constructor() {
    const { apiKey, model } = resolveProviderEnv('openai');
    const env = loadEnv();
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = env.LLM_TOKEN_LIMIT_PER_ARTICLE;
    this.digestMaxTokens = env.LLM_TOKEN_LIMIT_PER_DIGEST;
    this.timeoutMs = env.LLM_TIMEOUT_MS;
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<LlmAnalyzeResult> {
    const client = this.getClient();
    const t0 = Date.now();
    const body = this.truncateForBudget(input.body);

    const completion = await client.chat.completions.create({
      model: this.model,
      max_completion_tokens: this.maxTokens,
      messages: [
        // Static instructions first → OpenAI's automatic prefix caching fires for prefixes >=1024 tokens
        { role: 'system', content: ANALYZE_ARTICLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: userPromptFor(
            input.title,
            body,
            input.userCategories,
            input.userAxes,
          ),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'article_analysis',
          strict: true,
          schema: ANALYZE_ARTICLE_OUTPUT_SCHEMA,
        },
      },
    });

    const latencyMs = Date.now() - t0;
    const data = parseOpenAiAnalysis(completion.choices[0]?.message.content);

    return {
      data,
      telemetry: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cacheReadTokens:
          completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheCreationTokens: 0, // OpenAI doesn't expose write metrics separately
        latencyMs,
      },
      model: this.model,
    };
  }

  async buildDigest(input: BuildDigestLlmInput): Promise<LlmDigestResult> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: this.model,
      max_completion_tokens: this.digestMaxTokens,
      messages: [
        { role: 'system', content: BUILD_DIGEST_SYSTEM_PROMPT },
        { role: 'user', content: formatBuildDigestUserMessage(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'build_digest_v2',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', minLength: 6, maxLength: 120 },
              summary: {
                type: 'array',
                items: { type: 'string', minLength: 20 },
                minItems: 2,
                maxItems: 3,
              },
            },
            required: ['title', 'summary'],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('OpenAI buildDigest: empty response');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `OpenAI buildDigest: not valid JSON: ${(err as Error).message}`,
      );
    }

    const parsed = BuildDigestLlmResult.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(
        `OpenAI buildDigest response failed Zod validation: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      telemetry: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: this.model,
    };
  }

  private truncateForBudget(body: string): string {
    // Clamp at 0: a misconfigured token limit < 1000 would make headroom
    // negative, and body.slice(0, -n) would silently keep only the tail.
    const headroomChars = Math.max(0, (this.maxTokens - 1000) * 4);
    if (body.length <= headroomChars) return body;
    return body.slice(0, headroomChars) + '\n\n[truncated]';
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is required when openai is the active LLM provider — ' +
          'set LLM_PROVIDER_API_KEY (if LLM_PROVIDER=openai) or ' +
          'LLM_FALLBACK_PROVIDER_API_KEY (if LLM_FALLBACK_PROVIDER=openai).',
      );
    }
    // Explicit per-request timeout (FR-3); maxRetries: 0 so our retry/failover/
    // BullMQ layer is the single retry authority and the timeout bound is
    // predictable (see ADR-3).
    this.client = new OpenAI({
      apiKey: this.apiKey,
      timeout: this.timeoutMs,
      maxRetries: 0,
    });
    return this.client;
  }
}
