import { z } from 'zod';
import { DigestStatus } from './digests.js';

/**
 * Generic server-to-client event envelope. Discriminated union by `type`.
 * Future iterations append new variants (alerts, regen status, feed-pull
 * notifications, etc.) without touching the SSE channel or frontend hook.
 */
export const ServerEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('digest.status_changed'),
    payload: z.object({
      digestId: z.string().uuid(),
      status: DigestStatus,
    }),
  }),
  z.object({
    type: z.literal('feed.pull.done'),
    payload: z.object({
      feedId: z.string().uuid(),
      inserted: z.number().int().nonnegative(),
      filtered: z.number().int().nonnegative(),
      duplicates: z.number().int().nonnegative(),
      llmErrors: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('feed.pull.failed'),
    payload: z.object({
      feedId: z.string().uuid(),
      error: z.string(),
    }),
  }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

export type ServerEventType = ServerEvent['type'];
