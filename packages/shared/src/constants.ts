export const QUEUE_NAMES = {
  FEED_PULL: 'feed.pull',
  ARTICLE_ANALYZE: 'article.analyze',
  REGENERATION: 'regeneration',
  RETAG_ARTICLE: 'retag.article',
  DEMO_SEED: 'demo.seed',
  DIGEST_BUILD: 'digest.build',
  EMBED_BACKFILL: 'embed.backfill',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// List-endpoint pagination. Default kept small enough that an unindexed
// COUNT(*) on the user's articles is cheap; max bound keeps the customize
// panel's "load 500 at once" path explicit instead of accidentally
// runaway-growing. Both are honoured by /api/articles and /api/entities.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;
// Page-size options surfaced in the articles toolbar. The maximum must
// stay <= MAX_PAGE_SIZE (the API clamps anything larger).
export const ARTICLE_PAGE_SIZE_OPTIONS = [25, 50, 100, 500] as const;
