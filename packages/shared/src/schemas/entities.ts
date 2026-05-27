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
