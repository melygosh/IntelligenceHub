import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import {
  ArticleAnalysisResult,
  BuildDigestLlmResult,
  type ArticleAnalysisInput,
  type ArticleAnalysisResult as ArticleAnalysisResultType,
  type BuildDigestLlmInput,
  type BuildDigestLlmResult as BuildDigestLlmResultType,
} from '@intelligencehub/shared';
import { loadEnv, resolveProviderEnv } from '../common/config/env';
import {
  ANALYZE_ARTICLE_OUTPUT_SCHEMA,
  ANALYZE_ARTICLE_SYSTEM_PROMPT,
  BUILD_DIGEST_SYSTEM_PROMPT,
  formatBuildDigestUserMessage,
  userPromptFor,
} from './prompts';

export type OpenAiCallTelemetry = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
};

export type OpenAiCallResult = {
  data: ArticleAnalysisResultType;
  telemetry: OpenAiCallTelemetry;
  model: string;
};

export type OpenAiDigestResult = {
  result: BuildDigestLlmResultType;
  telemetry: { inputTokens: number; outputTokens: number };
  model: string;
};

@Injectable()
export class OpenAiAdapter {
  // Lazy: only constructed if/when this adapter is actually used, so a missing
  // API key does not crash boot when openai is neither primary nor fallback.
  private client: OpenAI | undefined;
  readonly model: string;
  private readonly apiKey: string;
  private readonly maxTokens: number;

  constructor() {
    const { apiKey, model } = resolveProviderEnv('openai');
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = loadEnv().LLM_TOKEN_LIMIT_PER_ARTICLE;
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<OpenAiCallResult> {
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
    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new Error('OpenAI response had no content');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (err) {
      throw new Error(
        `OpenAI response was not valid JSON: ${(err as Error).message}`,
      );
    }

    const parsed = ArticleAnalysisResult.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `OpenAI response failed Zod validation: ${parsed.error.message}`,
      );
    }

    return {
      data: parsed.data,
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

  async buildDigest(input: BuildDigestLlmInput): Promise<OpenAiDigestResult> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: this.model,
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
    const headroomChars = (this.maxTokens - 1000) * 4;
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
    this.client = new OpenAI({ apiKey: this.apiKey });
    return this.client;
  }
}
