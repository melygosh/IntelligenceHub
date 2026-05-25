import { z } from 'zod';

export const CreateFeedRequest = z.object({
  url: z.string().url().max(2048),
});
export type CreateFeedRequest = z.infer<typeof CreateFeedRequest>;

export const Feed = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
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
