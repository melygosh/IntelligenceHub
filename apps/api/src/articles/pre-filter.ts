import { loadEnv } from '../common/config/env';

export type PreFilterReason = 'too_short' | 'empty' | 'spam';

export type PreFilterResult =
  | { filtered: false }
  | { filtered: true; reason: PreFilterReason; detail: string };

export type PreFilterInput = {
  title: string;
  body: string;
};

/**
 * Deterministic, env-tunable rejection layer that runs BEFORE any LLM call (Phase 2 Day 5).
 * Goal: drop obviously-garbage articles cheaply so we don't burn tokens on them.
 */
export function runPreFilter(input: PreFilterInput): PreFilterResult {
  const env = loadEnv();
  const title = input.title.trim();
  const body = input.body.trim();

  if (title.length === 0 || body.length === 0) {
    const which =
      title.length === 0 && body.length === 0
        ? 'title and body are both empty'
        : title.length === 0
          ? 'title is empty'
          : 'body is empty';
    return { filtered: true, reason: 'empty', detail: which };
  }
  if (body.length < env.PREFILTER_MIN_LENGTH) {
    return {
      filtered: true,
      reason: 'too_short',
      detail: `body is ${body.length} chars, below the ${env.PREFILTER_MIN_LENGTH}-char minimum`,
    };
  }

  // Spam heuristic 1: title is more than half the body (placeholder / SEO stub)
  if (title.length > body.length * 0.5) {
    return {
      filtered: true,
      reason: 'spam',
      detail: `title (${title.length} chars) is over half the body (${body.length} chars) — likely an SEO/placeholder stub`,
    };
  }

  // Spam heuristic 2: link density — sum of anchor inner-text > 50% of body
  const linkTextChars = sumLinkTextChars(body);
  if (linkTextChars > body.length * 0.5) {
    return {
      filtered: true,
      reason: 'spam',
      detail: `link text (${linkTextChars} chars) is over half the body (${body.length} chars) — likely a link farm`,
    };
  }

  return { filtered: false };
}

function sumLinkTextChars(body: string): number {
  const matches = body.matchAll(/<a\b[^>]*>([^<]*)<\/a>/gi);
  let total = 0;
  for (const m of matches) {
    total += (m[1] ?? '').length;
  }
  return total;
}
