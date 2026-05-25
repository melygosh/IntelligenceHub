import { jaroWinkler, isLikelyMatch, SIMILARITY_THRESHOLD } from './entity-fuzzy';

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('microsoft', 'microsoft')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', '')).toBe(0);
    expect(jaroWinkler('microsoft', '')).toBe(0);
    expect(jaroWinkler('', 'microsoft')).toBe(0);
  });

  it('is symmetric', () => {
    expect(jaroWinkler('microsoft', 'microsft')).toBeCloseTo(
      jaroWinkler('microsft', 'microsoft'),
      6,
    );
  });

  it('produces scores in [0, 1]', () => {
    for (const [a, b] of [
      ['microsoft', 'apple'],
      ['hello', 'world'],
      ['a', 'b'],
      ['abc', 'abc'],
    ] as const) {
      const s = jaroWinkler(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('isLikelyMatch', () => {
  it('matches identical strings', () => {
    expect(isLikelyMatch('microsoft', 'microsoft')).toBe(true);
  });

  it('matches token-prefix variants (the "Pope Leo XIV" case)', () => {
    expect(isLikelyMatch('pope leo', 'pope leo xiv')).toBe(true);
    expect(isLikelyMatch('pope leo xiv', 'pope leo')).toBe(true); // symmetric
    expect(isLikelyMatch('martin luther king', 'martin luther king jr')).toBe(true);
  });

  it('matches typo-distance variants via Jaro-Winkler', () => {
    expect(isLikelyMatch('microsoft', 'microsft')).toBe(true);
    expect(isLikelyMatch('apple', 'appl')).toBe(true);
  });

  it('rejects genuinely-different strings even when JW scores them ~0.93', () => {
    // google/googol and microsoft/microsoftteams both score ~0.93 via pure JW.
    // The 0.95 threshold + token-prefix rule (neither is a token-prefix of the other)
    // keeps them separate.
    expect(isLikelyMatch('microsoft', 'microsoftteams')).toBe(false);
    expect(isLikelyMatch('google', 'googol')).toBe(false);
    expect(isLikelyMatch('apple', 'orange')).toBe(false);
  });

  it('does NOT collapse on a partial-word prefix (token boundary required)', () => {
    // "microsoft" is a substring-prefix of "microsoftteams" but not a token-prefix
    // (no space boundary). Must NOT collapse.
    expect(isLikelyMatch('microsoft', 'microsoftteams')).toBe(false);
  });

  it('handles empty input', () => {
    expect(isLikelyMatch('', '')).toBe(false);
    expect(isLikelyMatch('microsoft', '')).toBe(false);
    expect(isLikelyMatch('', 'microsoft')).toBe(false);
  });
});

describe('SIMILARITY_THRESHOLD', () => {
  it('is the strict 0.95 threshold used inside isLikelyMatch', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.95);
  });
});
