export const QUEUE_NAMES = {
  FEED_PULL: 'feed.pull',
  ARTICLE_ANALYZE: 'article.analyze',
  REGENERATION: 'regeneration',
  DEMO_SEED: 'demo.seed',
  DIGEST_BUILD: 'digest.build',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
