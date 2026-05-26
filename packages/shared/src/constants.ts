export const QUEUE_NAMES = {
  FEED_PULL: 'feed.pull',
  REGENERATION: 'regeneration',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
