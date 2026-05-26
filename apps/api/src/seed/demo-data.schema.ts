import { z } from 'zod';
import { EntityKind } from '@intelligencehub/shared';

export const DemoFeed = z.object({
  url: z.string(),
  title: z.string(),
});
export type DemoFeed = z.infer<typeof DemoFeed>;

export const DemoEntity = z.object({
  canonicalName: z.string(),
  type: EntityKind,
  aliases: z.array(z.string()).default([]),
});
export type DemoEntity = z.infer<typeof DemoEntity>;

export const DemoAxisAssignment = z.object({
  axisName: z.string(),
  value: z.string(),
});
export type DemoAxisAssignment = z.infer<typeof DemoAxisAssignment>;

export const DemoArticle = z.object({
  feedUrl: z.string(),
  url: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  contentHash: z.string().nullable(),
  ts: z.string().datetime(),
  summary: z.string().nullable(),
  importance: z.enum(['high', 'normal', 'junk']).nullable(),
  entities: z.array(DemoEntity),
  categoryNames: z.array(z.string()).default([]),
  axisAssignments: z.array(DemoAxisAssignment).default([]),
  duplicateOfUrl: z.string().optional(),
});
export type DemoArticle = z.infer<typeof DemoArticle>;

export const DemoSeedData = z.object({
  feeds: z.array(DemoFeed),
  categories: z.array(z.string()),
  articles: z.array(DemoArticle),
});
export type DemoSeedData = z.infer<typeof DemoSeedData>;
