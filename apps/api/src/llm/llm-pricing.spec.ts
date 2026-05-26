import { computeCost, lookupPricing, MODEL_PRICING } from './llm-pricing';

describe('llm-pricing', () => {
  describe('computeCost', () => {
    it('zero tokens → zero cost', () => {
      expect(
        computeCost(
          {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
          MODEL_PRICING['claude-haiku-4-5'],
        ),
      ).toBe(0);
    });

    it('1M input tokens on haiku → $1.00', () => {
      expect(
        computeCost(
          {
            inputTokens: 1_000_000,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
          MODEL_PRICING['claude-haiku-4-5'],
        ),
      ).toBeCloseTo(1.0, 6);
    });

    it('mixed tokens on opus-4-7 → sum of components', () => {
      // 100K input ($0.50) + 50K output ($1.25) + 200K cache read ($0.10) + 0 cache creation
      expect(
        computeCost(
          {
            inputTokens: 100_000,
            outputTokens: 50_000,
            cacheReadTokens: 200_000,
            cacheCreationTokens: 0,
          },
          MODEL_PRICING['claude-opus-4-7'],
        ),
      ).toBeCloseTo(0.5 + 1.25 + 0.1, 6);
    });

    it('cache_creation tokens are billed', () => {
      // 1M cache_creation on haiku → $1.25
      expect(
        computeCost(
          {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 1_000_000,
          },
          MODEL_PRICING['claude-haiku-4-5'],
        ),
      ).toBeCloseTo(1.25, 6);
    });
  });

  describe('lookupPricing', () => {
    it('exact match returns pricing', () => {
      expect(lookupPricing('claude-haiku-4-5')).toEqual(
        MODEL_PRICING['claude-haiku-4-5'],
      );
    });

    it('date-suffixed model strips and matches base', () => {
      expect(lookupPricing('claude-haiku-4-5-20251001')).toEqual(
        MODEL_PRICING['claude-haiku-4-5'],
      );
    });

    it('unknown model returns null', () => {
      expect(lookupPricing('llama-9000')).toBeNull();
    });
  });
});
