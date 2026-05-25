import Anthropic from '@anthropic-ai/sdk';
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

@Injectable()
export class AnthropicAdapter {
  private readonly log = new Logger(AnthropicAdapter.name);
  // Lazy: only constructed if/when this adapter is actually used, so a missing
  // ANTHROPIC_API_KEY does not crash boot when LLM_PROVIDER=openai.
  private client: Anthropic | undefined;
  readonly model: string;
  private readonly maxTokens: number;

  constructor() {
    const env = loadEnv();
    this.model = env.LLM_MODEL_ANTHROPIC;
    this.maxTokens = env.LLM_TOKEN_LIMIT_PER_ARTICLE;
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<AnthropicCallResult> {
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
          input_schema: ANALYZE_ARTICLE_OUTPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_analysis' },
      messages: [
        {
          role: 'user',
          content: userPromptFor(input.title, body, input.userCategories, input.userAxes),
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
      throw new Error(`Anthropic response failed Zod validation: ${parsed.error.message}`);
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
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic');
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.client;
  }
}
