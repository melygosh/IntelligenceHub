import { z } from 'zod';

export const EntityKind = z.enum(['company', 'person', 'product', 'technology', 'location']);
export type EntityKind = z.infer<typeof EntityKind>;

export const ArticleEntitySummary = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
});
export type ArticleEntitySummary = z.infer<typeof ArticleEntitySummary>;

export const ArticleStatus = z.enum([
  'ready',
  'pending',
  'filtered',
  'failed',
  'duplicate',
]);
export type ArticleStatus = z.infer<typeof ArticleStatus>;

export const ArticleListItem = z.object({
  id: z.string().uuid(),
  title: z.string(),
  url: z.string().url(),
  summary: z.string().nullable(),
  importance: z.enum(['high', 'normal', 'junk']).nullable(),
  ts: z.string().datetime(),
  // Null once the source feed has been deleted (US-3 detach).
  feedId: z.string().uuid().nullable(),
  status: ArticleStatus,
  filterReason: z.string().nullable(),
  entities: z.array(ArticleEntitySummary),
  categoryNames: z.array(z.string()).default([]),
  similarCount: z.number().int().nonnegative().default(0),
});
export type ArticleListItem = z.infer<typeof ArticleListItem>;

export const ArticleListResponse = z.object({
  articles: z.array(ArticleListItem),
});
export type ArticleListResponse = z.infer<typeof ArticleListResponse>;

export const AxisAssignmentSummary = z.object({
  axisName: z.string(),
  value: z.string(),
});
export type AxisAssignmentSummary = z.infer<typeof AxisAssignmentSummary>;

export const SimilarArticleSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  url: z.string().url(),
  feedTitle: z.string(),
  ts: z.string().datetime(),
});
export type SimilarArticleSummary = z.infer<typeof SimilarArticleSummary>;

export const ArticleDetail = ArticleListItem.extend({
  body: z.string().nullable(),
  feedTitle: z.string(),
  axisAssignments: z.array(AxisAssignmentSummary),
  similarArticles: z.array(SimilarArticleSummary),
});
export type ArticleDetail = z.infer<typeof ArticleDetail>;

export const ArticlesPeriod = z.enum(['all', '24h', '7d', '30d', 'custom']);
export type ArticlesPeriod = z.infer<typeof ArticlesPeriod>;

export const ArticleImportance = z.enum(['high', 'normal', 'junk']);
export type ArticleImportance = z.infer<typeof ArticleImportance>;

export const GetArticlesQuery = z.object({
  // CSV of category UUIDs. Backend matches any (OR). Single value remains valid.
  category: z.string().optional(),
  // CSV of feed UUIDs. Backend matches any (OR).
  feed: z.string().optional(),
  // CSV of importance values. Backend matches any (OR).
  importance: z.string().optional(),
  // CSV of axis_value UUIDs. AND across axes (the value's parent axis groups them),
  // OR within an axis.
  axisValue: z.string().optional(),
  // CSV of processing-state values (US-7 processing-state filter). When omitted,
  // backend defaults to ['ready'] (analyzed articles only). Users opt into
  // 'filtered' to see what the pre-filter cut and why, plus 'pending' / 'failed'
  // for transient states. 'duplicate' is intentionally hidden (back-row for the
  // N-similar counter).
  status: z.string().optional(),
  period: ArticlesPeriod.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type GetArticlesQuery = z.infer<typeof GetArticlesQuery>;
