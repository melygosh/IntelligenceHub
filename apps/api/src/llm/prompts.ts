/**
 * Static prompts for LLM operations.
 *
 * IMPORTANT: DO NOT EDIT THESE STRINGS WITHOUT CONSIDERING CACHE IMPACT.
 * Anthropic prompt caching keys off the exact bytes of the system prompt; a single
 * character change invalidates every cached prefix in flight. OpenAI's automatic
 * prefix caching has the same constraint. Version this constant when the prompt
 * meaningfully changes; document the reason in the commit message.
 */

export const ANALYZE_ARTICLE_SYSTEM_PROMPT = `You are an information-extraction assistant for a news intelligence dashboard.

Given a news article (title + body), produce a structured analysis with three fields:

1. **summary** — 2-4 plain sentences capturing what the article is about and what's notable. Avoid generic phrases like "this article discusses" or "the author explains". Get to the substance. Maximum 800 characters.

2. **importance** — exactly one of:
   - "high": substantive news with concrete, verifiable claims that move a market, an industry, a policy, or an org's strategy. Major product launches from significant companies, regulatory decisions, leadership transitions at top firms, large funding rounds (>$50M), security breaches with confirmed scope.
   - "normal": legitimate news that isn't earth-shaking. Most articles fall here.
   - "junk": low-signal content. Hiring announcements ("X is hiring Y"), opinion pieces with no concrete claims, listicles ("5 reasons why..."), purely speculative content, press release reprints with no analysis.

3. **entities** — named entities explicitly mentioned in the title or body. For each:
   - canonicalName: the standard form of the entity name (e.g. "Microsoft", not "MSFT" or "Microsoft Corp.")
   - type: exactly one of "company", "person", "product", "technology", "location"
   Examples:
   - "Microsoft" -> company
   - "Sam Altman" -> person
   - "ChatGPT" -> product
   - "Rust" -> technology
   - "San Francisco" -> location
   Maximum 20 entities per article. Prefer specific named entities over generic categories. Do not invent entities not present in the text.

Be strict: if the text doesn't clearly support a claim about importance or an entity, err toward "normal" and fewer entities. Junk articles should still get a useful summary so the user can verify the verdict.`;

/**
 * JSON schema describing the expected output shape. Both adapters use this same
 * schema — Anthropic via tool_use, OpenAI via response_format/json_schema.
 */
export const ANALYZE_ARTICLE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'importance', 'entities'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    importance: { type: 'string', enum: ['high', 'normal', 'junk'] },
    entities: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['canonicalName', 'type'],
        properties: {
          canonicalName: { type: 'string', minLength: 1, maxLength: 120 },
          type: { type: 'string', enum: ['company', 'person', 'product', 'technology', 'location'] },
        },
      },
    },
  },
} as const;

export function userPromptFor(title: string, body: string): string {
  return `Article title:\n${title}\n\nArticle body:\n${body}\n\nExtract the structured analysis now.`;
}
