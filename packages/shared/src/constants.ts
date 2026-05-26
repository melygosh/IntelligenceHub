export const QUEUE_NAMES = {
  FEED_PULL: 'feed.pull',
  REGENERATION: 'regeneration',
  DEMO_SEED: 'demo.seed',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
