import { z } from 'zod';
import { EntityKind } from './articles.js';

export const MentioningArticleSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  ts: z.string().datetime(),
  importance: z.enum(['high', 'normal', 'junk']).nullable(),
});
export type MentioningArticleSummary = z.infer<typeof MentioningArticleSummary>;

export const RelatedEntitySummary = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  weight: z.number().int().positive(),
});
export type RelatedEntitySummary = z.infer<typeof RelatedEntitySummary>;

export const TimelineBucket = z.object({
  dayUtc: z.string(), // YYYY-MM-DD
  count: z.number().int().positive(),
});
export type TimelineBucket = z.infer<typeof TimelineBucket>;

export const RecentEntity = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  mentionCount: z.number().int().nonnegative(),
  lastSeenTs: z.string().datetime(),
});
export type RecentEntity = z.infer<typeof RecentEntity>;

export const RecentEntitiesResponse = z.object({
  entities: z.array(RecentEntity),
});
export type RecentEntitiesResponse = z.infer<typeof RecentEntitiesResponse>;

/** Sort orders for the entity directory list. */
export const EntitySort = z.enum(['recent', 'mentions', 'name']);
export type EntitySort = z.infer<typeof EntitySort>;

/** A row in the entity directory — superset of RecentEntity with first-seen. */
export const EntityListItem = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  mentionCount: z.number().int().nonnegative(),
  firstSeenTs: z.string().datetime().nullable(),
  lastSeenTs: z.string().datetime().nullable(),
});
export type EntityListItem = z.infer<typeof EntityListItem>;

export const EntityListResponse = z.object({
  entities: z.array(EntityListItem),
  // Pagination envelope; mirrors ArticleListResponse.
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type EntityListResponse = z.infer<typeof EntityListResponse>;

export const EntityDetail = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  aliases: z.array(z.string()),
  mentionCount: z.number().int().nonnegative(),
  firstSeenTs: z.string().datetime().nullable(),
  lastSeenTs: z.string().datetime().nullable(),
  mentioningArticles: z.array(MentioningArticleSummary),
  relatedEntities: z.array(RelatedEntitySummary),
  timelineBuckets: z.array(TimelineBucket),
});
export type EntityDetail = z.infer<typeof EntityDetail>;
