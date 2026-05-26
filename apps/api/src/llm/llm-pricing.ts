/**
 * Hardcoded model pricing for telemetry cost computation. Values in USD
 * per 1M tokens, sourced from public pricing pages as of 2026-05.
 *
 * DO NOT TRUST FOR BILLING. This is a transparency display, not an
 * accounting source. Models not listed here render cost as `—` and are
 * tallied in `unknownModelCount` on the telemetry summary.
 */
export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheCreationPer1M: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': {
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cacheReadPer1M: 0.5,
    cacheCreationPer1M: 6.25,
  },
  'claude-sonnet-4-6': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0.3,
    cacheCreationPer1M: 3.75,
  },
  'claude-haiku-4-5': {
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    cacheReadPer1M: 0.1,
    cacheCreationPer1M: 1.25,
  },
  'gpt-5': {
    inputPer1M: 5.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0,
    cacheCreationPer1M: 0,
  },
  'gpt-5-mini': {
    inputPer1M: 1.0,
    outputPer1M: 4.0,
    cacheReadPer1M: 0,
    cacheCreationPer1M: 0,
  },
  'gpt-4o': {
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    cacheReadPer1M: 1.25,
    cacheCreationPer1M: 0,
  },
  'gpt-4o-mini': {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cacheReadPer1M: 0.075,
    cacheCreationPer1M: 0,
  },
};

export function computeCost(
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
  pricing: ModelPricing,
): number {
  return (
    (tokens.inputTokens / 1_000_000) * pricing.inputPer1M +
    (tokens.outputTokens / 1_000_000) * pricing.outputPer1M +
    (tokens.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M +
    (tokens.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPer1M
  );
}

/**
 * Look up pricing; return null if model not in lookup table.
 * Live model IDs from the API may carry date suffixes (e.g.,
 * 'claude-haiku-4-5-20251001'); strip them so the base ID matches.
 */
export function lookupPricing(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Strip trailing -YYYYMMDD or -YYYY-MM-DD style suffixes
  const stripped = model
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return MODEL_PRICING[stripped] ?? null;
}
