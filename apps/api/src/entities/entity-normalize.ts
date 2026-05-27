/**
 * Pure normalization for entity canonical names + aliases.
 * Used as the join key for entity_alias.alias_normalized and as the comparison
 * basis for fuzzy matching in entity-fuzzy.ts.
 *
 * Steps:
 *   1. NFKC compatibility decomposition (collapses fullwidth, ligatures, etc.)
 *   2. Trim whitespace
 *   3. Strip a fixed leading "The "
 *   4. Strip ONE trailing suffix token (longest-first, space-separated, case-insensitive).
 *      The suffix list includes both punctuated ("Corp.") and un-punctuated ("Corp") forms
 *      so we don't pre-strip punctuation and accidentally break "S.A." matching.
 *   5. Strip a residual trailing comma left from "Acme, Inc." style
 *   6. Lowercase
 *
 * The suffix list is intentionally short and Latin-only; Cyrillic/CJK forms
 * come in via LLM-emitted aliases.
 */

const TRAILING_SUFFIXES = [
  'Corporation',
  'Incorporated',
  'Limited',
  'S.p.A.',
  'S.A.',
  'Corp.',
  'Corp',
  'GmbH',
  'Inc.',
  'Inc',
  'Ltd.',
  'Ltd',
  'Co.',
  'LLC',
  'LLP',
  'PLC',
  'AG',
  'Co',
];

const LEADING_PREFIXES = ['The'];

export function normalize(input: string): string {
  if (!input) return '';

  let s = input.normalize('NFKC').trim();
  if (s === '') return '';

  // Strip leading prefix tokens (case-insensitive, space-separated)
  for (const prefix of LEADING_PREFIXES) {
    const lower = s.toLowerCase();
    const lowerPrefix = prefix.toLowerCase() + ' ';
    if (lower.startsWith(lowerPrefix)) {
      s = s.slice(prefix.length + 1).trim();
      break;
    }
  }

  // Strip a single trailing suffix (case-insensitive, token-aligned).
  // Longest-first ensures "Corporation" beats "Corp", "S.p.A." beats "S.A.".
  // The list is already declared longest-first; sort defensively in case it gets edited.
  const sortedSuffixes = [...TRAILING_SUFFIXES].sort(
    (a, b) => b.length - a.length,
  );
  for (const suffix of sortedSuffixes) {
    const lower = s.toLowerCase();
    const lowerSuffix = ' ' + suffix.toLowerCase();
    if (lower.endsWith(lowerSuffix)) {
      s = s.slice(0, s.length - suffix.length).trim();
      // Strip the residual comma from "Acme, Inc." -> "Acme,"
      s = s.replace(/,$/, '').trim();
      break;
    }
  }

  return s.toLowerCase();
}
