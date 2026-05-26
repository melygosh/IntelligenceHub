import { z } from 'zod';

export const EntityKind = z.enum(['company', 'person', 'product', 'technology', 'location']);
export type EntityKind = z.infer<typeof EntityKind>;

export const ArticleEntitySummary = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
});
export type ArticleEntitySummary = z.infer<typeof ArticleEntitySummary>;

export const ArticleListItem = z.object({
  id: z.string().uuid(),
  title: z.string(),
  url: z.string().url(),
  summary: z.string().nullable(),
  importance: z.enum(['high', 'normal', 'junk']).nullable(),
  ts: z.string().datetime(),
  feedId: z.string().uuid(),
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
