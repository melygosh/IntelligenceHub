import { z } from 'zod';

export const CreateFeedRequest = z.object({
  url: z.string().url().max(2048),
  // Optional pre-discovered title + icon URL (from a prior validate call).
  // Persisted as-is; the puller worker may overwrite on the next pull if the
  // channel title / icon differs.
  title: z.string().min(1).max(200).optional(),
  iconUrl: z.string().url().max(2048).optional(),
});
export type CreateFeedRequest = z.infer<typeof CreateFeedRequest>;

export const Feed = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  title: z.string().nullable(),
  iconUrl: z.string().nullable(),
  status: z.enum(['active', 'paused', 'error']),
  lastPullAt: z.string().datetime().nullable(),
  lastPullError: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Feed = z.infer<typeof Feed>;

export const FeedListResponse = z.object({
  feeds: z.array(Feed),
});
export type FeedListResponse = z.infer<typeof FeedListResponse>;

export const PullFeedResponse = z.object({
  enqueued: z.literal(true),
  feedId: z.string().uuid(),
});
export type PullFeedResponse = z.infer<typeof PullFeedResponse>;

export const PullAllFeedsResponse = z.object({
  enqueued: z.number().int().nonnegative(),
  skippedPaused: z.number().int().nonnegative(),
});
export type PullAllFeedsResponse = z.infer<typeof PullAllFeedsResponse>;

export const ValidateFeedRequest = z.object({
  url: z.string().url().max(2048),
});
export type ValidateFeedRequest = z.infer<typeof ValidateFeedRequest>;

export const ValidateFeedResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    title: z.string(),
    iconUrl: z.string().nullable(),
    normalisedUrl: z.string().url(),
    itemCount: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['unreachable', 'not_a_feed', 'malformed_url', 'empty', 'blocked']),
    detail: z.string(),
  }),
]);
export type ValidateFeedResponse = z.infer<typeof ValidateFeedResponse>;

export const UpdateFeedRequest = z.object({
  status: z.enum(['active', 'paused']),
});
export type UpdateFeedRequest = z.infer<typeof UpdateFeedRequest>;
