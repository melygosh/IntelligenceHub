import { ArticleAnalysisResult } from '@intelligencehub/shared';

/**
 * Pure parse + Zod-validate helpers for the two adapters' `analyzeArticle`
 * responses, extracted so the parse/validate/error behaviour is unit-testable
 * without a live SDK client or provider env (FR-3: "invalid responses never
 * reach the DB" — these throw on anything that doesn't validate).
 */

// Minimal structural view of an Anthropic content block — enough to find the
// tool_use block and read its input, without importing the SDK type.
type ContentBlockLike = { type: string; input?: unknown };

/** Anthropic returns structured output as a forced `tool_use` block; its
 * `input` is the candidate result. Throws if the block is missing or the input
 * fails schema validation. */
export function parseAnthropicAnalysis(
  content: ReadonlyArray<ContentBlockLike>,
): ArticleAnalysisResult {
  const toolUse = content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Anthropic response missing tool_use block');
  }
  const parsed = ArticleAnalysisResult.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Anthropic response failed Zod validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** OpenAI returns structured output as a JSON string in the message content.
 * Throws on empty content, non-JSON, or a payload that fails schema
 * validation. */
export function parseOpenAiAnalysis(
  content: string | null | undefined,
): ArticleAnalysisResult {
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
  return parsed.data;
}
