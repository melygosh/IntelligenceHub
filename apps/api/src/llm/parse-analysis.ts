import {
  ArticleAnalysisResult,
  CategorizeResult,
} from '@intelligencehub/shared';

/**
 * Pure parse + Zod-validate helpers for the two adapters' `analyzeArticle`
 * responses, extracted so the parse/validate/error behaviour is unit-testable
 * without a live SDK client or provider env (FR-3: "invalid responses never
 * reach the DB" — these throw on anything that doesn't validate).
 */

// Minimal structural view of an Anthropic content block — enough to find the
// tool_use block and read its input, without importing the SDK type.
type ContentBlockLike = { type: string; input?: unknown };

// The five entity kinds actually offered to the model (the analyze output
// schema's enum). 'unknown' is deliberately absent — it is our fallback, not a
// model option.
const MODEL_ENTITY_TYPES = new Set([
  'company',
  'person',
  'product',
  'technology',
  'location',
]);

/**
 * Rewrite (in place) any entity `type` the model emitted outside the offered
 * enum to 'unknown', before Zod validation. Anthropic tool_use does NOT enforce
 * enums, so the model occasionally returns e.g. "organization"/"event"; without
 * this, one stray value fails safeParse and rejects the ENTIRE analysis (summary
 * + every other entity), forcing a retry/failover. Coercing the single offending
 * entity to 'unknown' preserves the rest and surfaces it for manual
 * reclassification in the UI. A missing/non-string type is left to fail — that
 * is a malformed response, not an enum stray.
 */
function coerceUnknownEntityTypes(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { entities?: unknown }).entities)
  ) {
    for (const e of (raw as { entities: unknown[] }).entities) {
      if (
        e &&
        typeof e === 'object' &&
        typeof (e as { type?: unknown }).type === 'string' &&
        !MODEL_ENTITY_TYPES.has((e as { type: string }).type)
      ) {
        (e as { type: string }).type = 'unknown';
      }
    }
  }
  return raw;
}

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
  const parsed = ArticleAnalysisResult.safeParse(
    coerceUnknownEntityTypes(toolUse.input),
  );
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
  const parsed = ArticleAnalysisResult.safeParse(coerceUnknownEntityTypes(raw));
  if (!parsed.success) {
    throw new Error(
      `OpenAI response failed Zod validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Anthropic categorize: structured output via forced tool_use; validate the
 * tool input against CategorizeResult. Throws on missing block / invalid shape. */
export function parseAnthropicCategorize(
  content: ReadonlyArray<ContentBlockLike>,
): CategorizeResult {
  const toolUse = content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Anthropic categorize response missing tool_use block');
  }
  const parsed = CategorizeResult.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Anthropic categorize response failed Zod validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** OpenAI categorize: JSON string content → CategorizeResult. */
export function parseOpenAiCategorize(
  content: string | null | undefined,
): CategorizeResult {
  if (!content) {
    throw new Error('OpenAI categorize response had no content');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `OpenAI categorize response was not valid JSON: ${(err as Error).message}`,
    );
  }
  const parsed = CategorizeResult.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `OpenAI categorize response failed Zod validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
