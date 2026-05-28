import { z } from 'zod';

export const TelemetryRow = z.object({
  operation: z.string(),
  provider: z.string(),
  model: z.string(),
  callCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
  avgLatencyMs: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  failoverCount: z.number().int().nonnegative(),
});
export type TelemetryRow = z.infer<typeof TelemetryRow>;

export const TelemetrySummary = z.object({
  rows: z.array(TelemetryRow),
  totalCalls: z.number().int().nonnegative(),
  dateRange: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
  }),
});
export type TelemetrySummary = z.infer<typeof TelemetrySummary>;
