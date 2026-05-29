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
  // Emitted by the article-analyze worker when an article reaches a terminal
  // analysis state — 'ready' (analysis applied) or 'failed' (retries exhausted).
  // The frontend invalidates the Articles list so newly-ready rows surface as
  // they are analyzed (async, after the pull completes).
  z.object({
    type: z.literal('article.analyzed'),
    payload: z.object({
      articleId: z.string().uuid(),
      status: z.enum(['ready', 'failed']),
    }),
  }),
  z.object({
    type: z.literal('regeneration.started'),
    payload: z.object({
      runId: z.string().uuid(),
      articlesTotal: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('regeneration.progress'),
    payload: z.object({
      runId: z.string().uuid(),
      articlesProcessed: z.number().int().nonnegative(),
      articlesTotal: z.number().int().nonnegative(),
      articlesCacheHit: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('regeneration.completed'),
    payload: z.object({
      runId: z.string().uuid(),
      articlesProcessed: z.number().int().nonnegative(),
      articlesCacheHit: z.number().int().nonnegative(),
      articlesLlmCalled: z.number().int().nonnegative(),
      articlesErrored: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('regeneration.failed'),
    payload: z.object({
      runId: z.string().uuid(),
      errorMessage: z.string(),
    }),
  }),
  // Emitted by the embed-backfill worker when an article's embedding lands.
  // The article detail page invalidates its related-semantic query on this
  // event so the "computing embedding…" placeholder flips to the real
  // neighbour list without a page reload (ADR-7).
  z.object({
    type: z.literal('article.embedded'),
    payload: z.object({
      articleId: z.string().uuid(),
    }),
  }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

export type ServerEventType = ServerEvent['type'];
