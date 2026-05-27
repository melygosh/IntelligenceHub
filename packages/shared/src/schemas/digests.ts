import { z } from 'zod';
import { EntityKind } from './articles.js';

export const DigestPeriod = z.enum(['day', 'week', 'month']);
export type DigestPeriod = z.infer<typeof DigestPeriod>;

export const DigestScopeKind = z.enum(['category', 'entity']);
export type DigestScopeKind = z.infer<typeof DigestScopeKind>;

export const DigestStatus = z.enum(['building', 'ready', 'failed']);
export type DigestStatus = z.infer<typeof DigestStatus>;

export const BuildDigestRequest = z.object({
  period: DigestPeriod,
  scopeKind: DigestScopeKind,
  scopeFilterIds: z.array(z.string().uuid()).default([]),
});
export type BuildDigestRequest = z.infer<typeof BuildDigestRequest>;

export const DigestTopEntity = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  type: EntityKind,
  mentionCount: z.number().int().positive(),
});
export type DigestTopEntity = z.infer<typeof DigestTopEntity>;

export const DigestTopCategory = z.object({
  id: z.string().uuid(),
  name: z.string(),
  articleCount: z.number().int().positive(),
});
export type DigestTopCategory = z.infer<typeof DigestTopCategory>;

export const DigestKeyArticle = z.object({
  id: z.string().uuid(),
  title: z.string(),
  ts: z.string().datetime(),
  importance: z.enum(['high', 'normal', 'junk']).nullable(),
  // Snapshot of the article's feed + top entities at digest-build time.
  // Nullable + optional default-[] because digests built before the
  // schema bump don't have these populated; UI renders them when present.
  feedTitle: z.string().nullable().default(null),
  entities: z
    .array(
      z.object({
        id: z.string().uuid(),
        canonicalName: z.string(),
        type: EntityKind,
      }),
    )
    .default([]),
});
export type DigestKeyArticle = z.infer<typeof DigestKeyArticle>;

export const DigestSummary = z.object({
  id: z.string().uuid(),
  period: DigestPeriod,
  scopeKind: DigestScopeKind,
  scopeFilterIds: z.array(z.string().uuid()),
  windowFrom: z.string().datetime(),
  windowTo: z.string().datetime(),
  status: DigestStatus,
  title: z.string().nullable(),
  articleCount: z.number().int().nonnegative(),
  entityCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});
export type DigestSummary = z.infer<typeof DigestSummary>;

export const DigestDetail = DigestSummary.extend({
  summary: z.array(z.string()).nullable(),
  topEntities: z.array(DigestTopEntity),
  topCategories: z.array(DigestTopCategory),
  keyArticles: z.array(DigestKeyArticle),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  model: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type DigestDetail = z.infer<typeof DigestDetail>;
