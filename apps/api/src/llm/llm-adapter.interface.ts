import type {
  ArticleAnalysisInput,
  ArticleAnalysisResult,
  BuildDigestLlmInput,
  BuildDigestLlmResult,
  CategorizeInput,
  CategorizeResult,
} from '@intelligencehub/shared';

/** Token + latency usage returned by an `analyzeArticle` call. Identical across
 * providers — OpenAI maps its `prompt_tokens_details.cached_tokens` onto
 * `cacheReadTokens` and leaves `cacheCreationTokens` at 0. */
export type LlmCallTelemetry = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
};

export type LlmAnalyzeResult = {
  data: ArticleAnalysisResult;
  telemetry: LlmCallTelemetry;
  model: string;
};

export type LlmDigestResult = {
  result: BuildDigestLlmResult;
  telemetry: { inputTokens: number; outputTokens: number };
  model: string;
};

export type LlmCategorizeResult = {
  data: CategorizeResult;
  telemetry: LlmCallTelemetry;
  model: string;
};

/**
 * The provider-agnostic contract both LLM adapters implement (FR-3). Each
 * adapter encapsulates request shaping, structured-output parsing, Zod
 * validation, error handling, and a per-request timeout; the `LlmService`
 * orchestrator selects the active adapter by env and adds caching, retry,
 * failover, and telemetry on top. Making this a declared interface — rather
 * than relying on structural typing at the call site — is what keeps the two
 * adapters genuinely interchangeable.
 */
export interface LlmAdapter {
  readonly model: string;
  analyzeArticle(input: ArticleAnalysisInput): Promise<LlmAnalyzeResult>;
  buildDigest(input: BuildDigestLlmInput): Promise<LlmDigestResult>;
  categorizeArticle(input: CategorizeInput): Promise<LlmCategorizeResult>;
}
