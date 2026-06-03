import { z } from 'zod';
import { EntityKind, ArticlesPeriod } from './articles.js';

// Same shape as feeds.ts inlines on the Feed schema; mirrored here so the
// dashboard contract is standalone.
const DashboardFeedStatus = z.enum(['active', 'paused', 'error', 'disabled']);

// Same enum as the graph + articles pages, re-exported for the dashboard's
// own URL parameter so consumers don't need a cross-domain import.
export const DashboardPeriod = ArticlesPeriod;
export type DashboardPeriod = z.infer<typeof DashboardPeriod>;

export const DashboardTopEntity = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  mentionCount: z.number().int().nonnegative(),
  // Null when the entity has no in-scope category, or no mentioning articles
  // carry a category. The card renders a slate dot in that case.
  dominantCategoryId: z.string().uuid().nullable(),
});
export type DashboardTopEntity = z.infer<typeof DashboardTopEntity>;

export const DashboardTopCategory = z.object({
  id: z.string().uuid(),
  name: z.string(),
  articleCount: z.number().int().nonnegative(),
});
export type DashboardTopCategory = z.infer<typeof DashboardTopCategory>;

export const DashboardTopFeed = z.object({
  id: z.string().uuid(),
  // Null when the feed has been deleted (US-3 detach) but its articles remain.
  title: z.string().nullable(),
  status: DashboardFeedStatus.nullable(),
  articleCount: z.number().int().nonnegative(),
});
export type DashboardTopFeed = z.infer<typeof DashboardTopFeed>;

export const DashboardResponse = z.object({
  // Echoed for the UI to display "Top entities · last 7 days" headers
  // honestly even when no row is returned.
  window: z.object({
    period: DashboardPeriod,
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
  }),
  totalArticles: z.number().int().nonnegative(),
  topEntities: z.array(DashboardTopEntity),
  topCategories: z.array(DashboardTopCategory),
  topFeeds: z.array(DashboardTopFeed),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;

export const GetDashboardQuery = z.object({
  period: DashboardPeriod.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type GetDashboardQuery = z.infer<typeof GetDashboardQuery>;
