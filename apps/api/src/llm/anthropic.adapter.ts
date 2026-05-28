import Anthropic from '@anthropic-ai/sdk';
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

export type AnthropicCallTelemetry = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
};

export type AnthropicCallResult = {
  data: ArticleAnalysisResultType;
  telemetry: AnthropicCallTelemetry;
  model: string;
};

export type AnthropicDigestResult = {
  result: BuildDigestLlmResultType;
  telemetry: { inputTokens: number; outputTokens: number };
  model: string;
};

const BUILD_DIGEST_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const, minLength: 6, maxLength: 120 },
    summary: {
      type: 'array' as const,
      items: { type: 'string' as const, minLength: 20 },
      minItems: 2,
      maxItems: 3,
    },
  },
  required: ['title', 'summary'],
  additionalProperties: false,
};

@Injectable()
export class AnthropicAdapter {
  // Lazy: only constructed if/when this adapter is actually used, so a missing
  // API key does not crash boot when anthropic is neither primary nor fallback.
  private client: Anthropic | undefined;
  readonly model: string;
  private readonly apiKey: string;
  private readonly maxTokens: number;

  constructor() {
    const { apiKey, model } = resolveProviderEnv('anthropic');
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = loadEnv().LLM_TOKEN_LIMIT_PER_ARTICLE;
  }

  async analyzeArticle(
    input: ArticleAnalysisInput,
  ): Promise<AnthropicCallResult> {
    const client = this.getClient();
    const t0 = Date.now();
    const body = this.truncateForBudget(input.body);

    // Structured output via tool_use: declare a single tool, force the model to call it,
    // parse the tool_input as our typed result. This is Anthropic's native way to constrain JSON.
    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: [
        {
          type: 'text',
          text: ANALYZE_ARTICLE_SYSTEM_PROMPT,
          // Cache the (static) system prompt; saves ~10x on input tokens for the
          // cached portion across repeated articles within the 5-minute TTL.
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'record_analysis',
          description: 'Record the structured analysis of the article.',
          input_schema:
            ANALYZE_ARTICLE_OUTPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_analysis' },
      messages: [
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
    });

    const latencyMs = Date.now() - t0;

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error('Anthropic response missing tool_use block');
    }

    const parsed = ArticleAnalysisResult.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(
        `Anthropic response failed Zod validation: ${parsed.error.message}`,
      );
    }

    return {
      data: parsed.data,
      telemetry: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        latencyMs,
      },
      model: this.model,
    };
  }

  async buildDigest(
    input: BuildDigestLlmInput,
  ): Promise<AnthropicDigestResult> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: BUILD_DIGEST_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'submit_digest',
          description: 'Submit the assembled digest summary.',
          input_schema:
            BUILD_DIGEST_OUTPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_digest' },
      messages: [
        { role: 'user', content: formatBuildDigestUserMessage(input) },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error('Anthropic buildDigest: no tool_use block in response');
    }

    const parsed = BuildDigestLlmResult.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(
        `Anthropic buildDigest response failed Zod validation: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      telemetry: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: this.model,
    };
  }

  /**
   * Crude truncation to keep input+output within the configured token budget.
   * Rough estimate: 4 chars per token. We reserve ~1000 tokens for the output and
   * the system prompt overhead, leaving the rest for the body.
   */
  private truncateForBudget(body: string): string {
    const headroomChars = (this.maxTokens - 1000) * 4;
    if (body.length <= headroomChars) return body;
    return body.slice(0, headroomChars) + '\n\n[truncated]';
  }

  private getClient(): Anthropic {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is required when anthropic is the active LLM provider — ' +
          'set LLM_PROVIDER_API_KEY (if LLM_PROVIDER=anthropic) or ' +
          'LLM_FALLBACK_PROVIDER_API_KEY (if LLM_FALLBACK_PROVIDER=anthropic).',
      );
    }
    this.client = new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }
}
