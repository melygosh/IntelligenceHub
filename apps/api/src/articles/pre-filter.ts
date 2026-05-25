import { loadEnv } from '../common/config/env';

export type PreFilterReason = 'too_short' | 'empty' | 'spam';

export type PreFilterResult =
  | { filtered: false }
  | { filtered: true; reason: PreFilterReason };

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
    return { filtered: true, reason: 'empty' };
  }
  if (body.length < env.PREFILTER_MIN_LENGTH) {
    return { filtered: true, reason: 'too_short' };
  }

  // Spam heuristic 1: title is more than half the body (placeholder / SEO stub)
  if (title.length > body.length * 0.5) {
    return { filtered: true, reason: 'spam' };
  }

  // Spam heuristic 2: link density — sum of anchor inner-text > 50% of body
  const linkTextChars = sumLinkTextChars(body);
  if (linkTextChars > body.length * 0.5) {
    return { filtered: true, reason: 'spam' };
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
