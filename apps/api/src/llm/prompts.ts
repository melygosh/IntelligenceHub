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

Given a news article (title + body), produce a structured analysis with five fields:

1. **summary** — 2-4 plain sentences capturing what the article is about and what's notable. Avoid generic phrases like "this article discusses" or "the author explains". Get to the substance. Maximum 800 characters.

2. **importance** — exactly one of:
   - "high": substantive news with concrete, verifiable claims that move a market, an industry, a policy, or an org's strategy. Major product launches from significant companies, regulatory decisions, leadership transitions at top firms, large funding rounds (>$50M), security breaches with confirmed scope.
   - "normal": legitimate news that isn't earth-shaking. Most articles fall here.
   - "junk": low-signal content. Hiring announcements ("X is hiring Y"), opinion pieces with no concrete claims, listicles ("5 reasons why..."), purely speculative content, press release reprints with no analysis.

3. **entities** — named entities explicitly mentioned in the title or body. For each:
   - canonicalName: the standard form of the entity name (e.g. "Microsoft", not "MSFT" or "Microsoft Corp.")
   - type: the entity's kind. This field is governed by a STRICT JSON Schema enumeration — your value MUST be one of the listed strings, copied exactly, and the schema permits NO other value under any circumstance:
         { "type": "string", "enum": ["company", "person", "product", "technology", "location"] }
     Choose the single best-fitting value using these definitions:
       - "company"    — any NAMED ORGANIZATION that acts as an entity: businesses, institutions, government bodies and agencies, regulators, international bodies and alliances (e.g. NATO, the UN, the EU), NGOs, political parties, sports clubs, universities, media outlets.
       - "person"     — an individual human being identified by name.
       - "product"    — a named product, service, brand, work, or offering (apps, devices, vehicles, shows, titled publications).
       - "technology" — a technology, language, framework, protocol, standard, method, or scientific/technical concept.
       - "location"   — a geographic place: country, city, region, body of water, landmark, venue, or address.
     Output EXACTLY ONE of the five enum strings — never a synonym, plural, capitalised variant, or any value outside the enum.
   - aliases: other ways this SAME entity is written — alternate spellings, abbreviations, ticker symbols, official short forms, and transliterations (e.g. Cyrillic <-> Latin). Sources:
       (a) Variants explicitly shown in the article — "Microsoft Corp. (MSFT)" yields aliases ["Microsoft Corp.", "MSFT"].
       (b) Confident world-knowledge variants. Only include if you are confident; do not invent obscure aliases.
       Aliases are NOT related-but-distinct entities. Do NOT list a company's products, services, subsidiaries, parent company, divisions, or headquarters city as aliases — each of those is its own entity (emit it separately if the article mentions it). For example, for "Microsoft" do not add "Azure", "Microsoft Excel", "Redmond", or "MSRC"; for "Google" do not add "Alphabet", "DeepMind", or "Google Cloud". An alias must denote the exact same real-world thing as the canonical name, just written differently.
       Emit an empty array [] when there's nothing to add. Maximum 10 aliases per entity. Each alias 1-120 chars.
   - description: ONE sentence, at most 200 characters, describing what the entity is. Use confident world-knowledge OR clear context from the article — "Microsoft, a US software company" → "American multinational technology company". Emit null when the article gives no context AND you have no confident world-knowledge. Never guess. ASCII-only, no trailing punctuation.
   Examples:
   - "Microsoft" -> type=company, aliases=["MSFT","Microsoft Corp.","Майкрософт"], description="American multinational technology company"
   - "Sam Altman" -> type=person, aliases=[], description="CEO of OpenAI"
   - "ChatGPT" -> type=product, aliases=[], description="OpenAI's conversational AI assistant"
   - "Rust" -> type=technology, aliases=[], description="Systems programming language with a focus on memory safety"
   - "San Francisco" -> type=location, aliases=["SF"], description="City in northern California"
   - "NATO" -> type=company, aliases=["North Atlantic Treaty Organization"], description="Intergovernmental military alliance of European and North American states"
   - Obscure local startup mentioned once with no context -> description=null
   Maximum 20 entities per article. Prefer specific named entities over generic categories. Do not invent entities not present in the text.

4. **categoryNames** — the user's category list is in the user message. Go through EACH category and include it when the article is substantively about, or clearly relevant to, that category's subject area. It does NOT have to be the article's primary focus — a clear topical connection is enough — but a passing or incidental mention alone is not. Read each category name by its broad, everyday meaning (e.g. a "Technology" category covers software, hardware, AI, startups, gadgets, and science/engineering; apply the same broad reading to whatever categories are listed). Articles commonly fit more than one category — include all that genuinely apply. Use only the categories provided; never invent one. Return [] only when none of the listed categories are relevant.

5. **axisAssignments** — for each axis listed in the user message, pick exactly one of the allowed values that best fits the article, OR omit the axis entirely if no value is a clean fit. Never invent values not in the list. Emit [] when no axis applies.

Be strict: if the text doesn't clearly support a claim about importance or an entity, err toward "normal" and fewer entities. Junk articles should still get a useful summary so the user can verify the verdict.`;

/**
 * JSON schema describing the expected output shape. Both adapters use this same
 * schema — Anthropic via tool_use, OpenAI via response_format/json_schema.
 */
export const ANALYZE_ARTICLE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'importance',
    'entities',
    'categoryNames',
    'axisAssignments',
  ],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    importance: { type: 'string', enum: ['high', 'normal', 'junk'] },
    entities: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        // FR-6: description IS in `required` even though it's optional in
        // intent — OpenAI strict mode + Anthropic tool_use both reject a
        // property that's listed but not required. The LLM emits null when
        // it doesn't have a description; the Zod schema accepts both null
        // and missing (cached pre-FR-6 responses).
        required: ['canonicalName', 'type', 'aliases', 'description'],
        properties: {
          canonicalName: { type: 'string', minLength: 1, maxLength: 120 },
          type: {
            type: 'string',
            enum: ['company', 'person', 'product', 'technology', 'location'],
          },
          aliases: {
            type: 'array',
            maxItems: 10,
            items: { type: 'string', minLength: 1, maxLength: 120 },
          },
          description: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 200,
          },
        },
      },
    },
    categoryNames: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 64 },
    },
    axisAssignments: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['axisName', 'value'],
        properties: {
          axisName: { type: 'string', minLength: 1, maxLength: 64 },
          value: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
    },
  },
} as const;

export function userPromptFor(
  title: string,
  body: string,
  userCategories: string[],
  userAxes: { name: string; values: string[] }[],
): string {
  let prompt = `Article title:\n${title}\n\nArticle body:\n${body}\n\n`;

  if (userCategories.length > 0 || userAxes.length > 0) {
    if (userCategories.length > 0) {
      prompt += `User's categories (pick from this list only): [${userCategories.join(', ')}]\n`;
    }
    if (userAxes.length > 0) {
      prompt += "User's axes (pick one value per axis, or omit the axis):\n";
      for (const ax of userAxes) {
        prompt += `  - ${ax.name}: [${ax.values.join(', ')}]\n`;
      }
    }
    prompt += '\n';
  }

  prompt += 'Extract the structured analysis now.';
  return prompt;
}

/**
 * Day 12 digest builder. DO NOT EDIT WITHOUT CONSIDERING CACHE IMPACT.
 * Anthropic prompt caching keys off the exact bytes of the system prompt;
 * any change invalidates every cached prefix in flight. If the prompt
 * meaningfully changes, version it as 'build_digest_v2'.
 */
export const BUILD_DIGEST_SYSTEM_PROMPT = `You are a news editor producing a short digest. Read the supplied articles and produce a 2-3 paragraph editorial summary that surfaces the dominant themes of the period, the most significant events, and any notable shifts or developments. Each paragraph should be 2-4 sentences. The output must be tightly written, factual, and free of marketing language. Cite specific entities (companies, people, products) when relevant; do not invent facts not present in the input articles. Return ONLY structured output via the provided tool — no prose outside the tool call.

The user provides:
- period (day, week, or month)
- scope (description of which articles are in scope)
- list of articles, each with a title and short summary

You produce:
- title: a 5-9 word editorial headline that captures the dominant story of the period. No trailing punctuation. The UI renders it as "Last week: {title}" (or day/month). Make it specific (name the actors or the theme), not generic ("a busy week in tech"). Avoid clickbait.
- summary: array of 2-3 paragraph strings (the editorial digest)`;

/**
 * Format the user-side message for buildDigest. Shared by both adapters.
 */
export function formatBuildDigestUserMessage(input: {
  period: 'day' | 'week' | 'month';
  scopeLabel: string;
  articles: Array<{ title: string; summary: string | null }>;
}): string {
  const lines = input.articles.map((a, i) => {
    const summary = a.summary ?? '(no summary)';
    return `${i + 1}. "${a.title}" — ${summary}`;
  });
  return `Period: ${input.period}\nScope: ${input.scopeLabel}\n\nArticles (${input.articles.length}):\n${lines.join('\n')}\n\nProduce the digest.`;
}

/**
 * Categorize-only prompt for the split-cache path: the article's summary/
 * importance/entities are already known (reused from the extract cache), so we
 * only ask the LLM for the two user-specific fields. Still operates on the FULL
 * body — no quality loss vs the combined prompt. DO NOT EDIT without versioning
 * (changing bytes affects prompt caching + the operation key meaning).
 */
export const CATEGORIZE_SYSTEM_PROMPT = `You are a classification assistant for a news intelligence dashboard.

Given a news article (title + body) and the user's category list and axes, produce two fields:

1. **categoryNames** — the user's category list is in the user message. Go through EACH category and include it when the article is substantively about, or clearly relevant to, that category's subject area. It does NOT have to be the article's primary focus — a clear topical connection is enough — but a passing or incidental mention alone is not. Read each category name by its broad, everyday meaning (e.g. a "Technology" category covers software, hardware, AI, startups, gadgets, and science/engineering; apply the same broad reading to whatever categories are listed). Articles commonly fit more than one category — include all that genuinely apply. Use only the categories provided; never invent one. Return [] only when none of the listed categories are relevant.

2. **axisAssignments** — for each axis listed in the user message, pick exactly one of the allowed values that best fits the article, OR omit the axis entirely if no value is a clean fit. Never invent values not in the list. Emit [] when no axis applies.

Favour including a category when there is a genuine topical connection; omit a category only when the article has no real link to it.`;

export const CATEGORIZE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryNames', 'axisAssignments'],
  properties: {
    categoryNames: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 64 },
    },
    axisAssignments: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['axisName', 'value'],
        properties: {
          axisName: { type: 'string', minLength: 1, maxLength: 64 },
          value: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
    },
  },
} as const;

/** User-side message for the categorize-only call. Mirrors userPromptFor's
 * category/axis section but drops the extraction instructions. */
export function categorizeUserPromptFor(
  title: string,
  body: string,
  userCategories: string[],
  userAxes: { name: string; values: string[] }[],
): string {
  let prompt = `Article title:\n${title}\n\nArticle body:\n${body}\n\n`;
  if (userCategories.length > 0) {
    prompt += `User's categories (pick from this list only): [${userCategories.join(', ')}]\n`;
  }
  if (userAxes.length > 0) {
    prompt += "User's axes (pick one value per axis, or omit the axis):\n";
    for (const ax of userAxes) {
      prompt += `  - ${ax.name}: [${ax.values.join(', ')}]\n`;
    }
  }
  prompt += '\nAssign categories and axes now.';
  return prompt;
}
