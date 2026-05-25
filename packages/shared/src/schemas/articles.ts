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
});
export type ArticleListItem = z.infer<typeof ArticleListItem>;

export const ArticleListResponse = z.object({
  articles: z.array(ArticleListItem),
});
export type ArticleListResponse = z.infer<typeof ArticleListResponse>;
