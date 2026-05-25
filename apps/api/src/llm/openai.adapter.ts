import OpenAI from 'openai';
import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleAnalysisResult,
  type ArticleAnalysisInput,
  type ArticleAnalysisResult as ArticleAnalysisResultType,
} from '@intelligencehub/shared';
import { loadEnv } from '../common/config/env';
import {
  ANALYZE_ARTICLE_OUTPUT_SCHEMA,
  ANALYZE_ARTICLE_SYSTEM_PROMPT,
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

@Injectable()
export class OpenAiAdapter {
  private readonly log = new Logger(OpenAiAdapter.name);
  // Lazy: only constructed if/when this adapter is actually used, so a missing
  // OPENAI_API_KEY does not crash boot when LLM_PROVIDER=anthropic.
  private client: OpenAI | undefined;
  readonly model: string;
  private readonly maxTokens: number;

  constructor() {
    const env = loadEnv();
    this.model = env.LLM_MODEL_OPENAI;
    this.maxTokens = env.LLM_TOKEN_LIMIT_PER_ARTICLE;
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<OpenAiCallResult> {
    const client = this.getClient();
    const t0 = Date.now();
    const body = this.truncateForBudget(input.body);

    const completion = await client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        // Static instructions first → OpenAI's automatic prefix caching fires for prefixes >=1024 tokens
        { role: 'system', content: ANALYZE_ARTICLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: userPromptFor(input.title, body, input.userCategories, input.userAxes),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'article_analysis',
          strict: true,
          schema: ANALYZE_ARTICLE_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
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
      throw new Error(`OpenAI response was not valid JSON: ${(err as Error).message}`);
    }

    const parsed = ArticleAnalysisResult.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`OpenAI response failed Zod validation: ${parsed.error.message}`);
    }

    return {
      data: parsed.data,
      telemetry: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cacheReadTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheCreationTokens: 0, // OpenAI doesn't expose write metrics separately
        latencyMs,
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
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required when LLM_PROVIDER=openai');
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return this.client;
  }
}
