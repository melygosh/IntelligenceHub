/**
 * String-similarity helpers for entity dedup.
 *
 * Exports:
 *   - jaroWinkler(a, b)  pure similarity score in [0, 1]
 *   - isLikelyMatch(a, b)  boolean: combines a token-prefix shortcut with a
 *                          strict Jaro-Winkler threshold
 *   - SIMILARITY_THRESHOLD  the strict threshold (0.95) used inside isLikelyMatch
 *
 * Why two layers: pure Jaro-Winkler scores "pope leo"/"pope leo xiv" (same
 * entity) and "google"/"googol" (different entities) at the same ~0.93. No
 * single JW threshold separates them. The token-prefix rule rescues the
 * multi-word "X Y" / "X Y suffix" case so we can keep a strict JW threshold
 * (0.95) for the typo-distance cases without losing recall on title variants.
 */

export const SIMILARITY_THRESHOLD = 0.95;

export function isLikelyMatch(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  if (isTokenPrefixOf(a, b) || isTokenPrefixOf(b, a)) return true;
  return jaroWinkler(a, b) >= SIMILARITY_THRESHOLD;
}

/**
 * True when `shorter` is a strict whitespace-token prefix of `longer`.
 * "pope leo" is a token-prefix of "pope leo xiv" (yes).
 * "microsoft" is NOT a token-prefix of "microsoftteams" (no — no space boundary).
 * Both sides are split on /\s+/ so multi-space and tab variants are equivalent.
 */
function isTokenPrefixOf(shorter: string, longer: string): boolean {
  const s = shorter
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');
  const l = longer
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');
  if (s.length === 0 || l.length === 0) return false;
  if (s.length >= l.length) return false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== l[i]) return false;
  }
  return true;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  if (a === b) return 1;

  const jaroScore = jaro(a, b);
  if (jaroScore < 0.7) return jaroScore; // no prefix bonus on weak matches

  // Winkler prefix bonus: shared prefix of up to 4 chars, weighted by 0.1
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix += 1;
    else break;
  }

  return jaroScore + prefix * 0.1 * (1 - jaroScore);
}

function jaro(a: string, b: string): number {
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);

  const aMatches: boolean[] = new Array(a.length).fill(false);
  const bMatches: boolean[] = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  // Transpositions = half the count of out-of-order matched chars
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  transpositions = transpositions / 2;

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}
