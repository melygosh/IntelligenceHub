import { createHash } from 'node:crypto';

/**
 * Pure hash of a user's category + axes config.
 *
 * Canonical form: a JSON object with sorted category names and axes sorted by name,
 * each axis's values sorted within itself. Independent of input order, so two
 * users with the same effective config hit the same cache row.
 *
 * Used by the response-cache key extension in LlmResponseCacheService.
 * Stored on articles.config_hash so Day 8b regeneration can find articles
 * whose stored hash differs from the user's current hash.
 */

export function configHash(
  categories: string[],
  axes: { name: string; values: string[] }[],
): string {
  // Dedupe names + values: ['tech','tech'] is the same effective config as
  // ['tech'] (the prompt/tagging treat them set-wise), so they must hash the
  // same — otherwise a duplicate yields a spurious cache miss + regeneration.
  const canonical = JSON.stringify({
    c: [...new Set(categories)].sort(),
    a: axes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => ({ n: x.name, v: [...new Set(x.values)].sort() })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export const EMPTY_CONFIG_HASH = configHash([], []);
