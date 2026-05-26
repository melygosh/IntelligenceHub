import { z } from 'zod';

export const RegenerationStatus = z.enum(['running', 'completed', 'failed']);
export type RegenerationStatus = z.infer<typeof RegenerationStatus>;

export const RegenerationRun = z.object({
  id: z.string().uuid(),
  status: RegenerationStatus,
  configHash: z.string(),
  articlesTotal: z.number().int(),
  articlesProcessed: z.number().int(),
  articlesCacheHit: z.number().int(),
  articlesLlmCalled: z.number().int(),
  articlesErrored: z.number().int(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
});
export type RegenerationRun = z.infer<typeof RegenerationRun>;

export const StartRegenerationResponse = z.object({
  run: RegenerationRun,
  eligibleArticles: z.number().int(),
});
export type StartRegenerationResponse = z.infer<typeof StartRegenerationResponse>;
