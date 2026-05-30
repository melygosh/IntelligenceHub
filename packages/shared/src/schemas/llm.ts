import { z } from 'zod';
import { EntityKind } from './articles.js';
import type { DigestPeriod } from './digests.js';

export const Importance = z.enum(['high', 'normal', 'junk']);
export type Importance = z.infer<typeof Importance>;

export const ExtractedEntity = z.object({
  canonicalName: z.string().min(1).max(120),
  type: EntityKind,
  aliases: z.array(z.string().min(1).max(120)).max(10).default([]),
  // FR-6: optional 1-sentence description (max 200 chars). `.optional()` so
  // LLM responses cached under the pre-FR-6 prompt (which never emitted this
  // key) still parse; `.nullable()` so the LLM can say "no context for one".
  description: z.string().min(1).max(200).nullable().optional(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntity>;

export const AxisAssignment = z.object({
  axisName: z.string().min(1).max(64),
  value: z.string().min(1).max(64),
});
export type AxisAssignment = z.infer<typeof AxisAssignment>;

export const ArticleAnalysisResult = z.object({
  summary: z.string().min(1).max(800),
  importance: Importance,
  entities: z.array(ExtractedEntity).max(20),
  categoryNames: z.array(z.string().min(1).max(64)).max(20).default([]),
  axisAssignments: z.array(AxisAssignment).max(10).default([]),
});
export type ArticleAnalysisResult = z.infer<typeof ArticleAnalysisResult>;

export type ArticleAnalysisInput = {
  title: string;
  body: string;
  articleId: string;
  userId: string;
  contentHash: string;
  userCategories: string[];
  userAxes: { name: string; values: string[] }[];
  configHash: string;
  // What triggered this call — used as the telemetry operation label so the
  // regeneration path is reported separately from initial processing (FR-10).
  // Defaults to 'analyze_article_v4'. Does NOT affect the cache key.
  operationTrigger?: LlmOperation;
};

export interface LlmService {
  analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult>;
}

export type LlmProvider = 'anthropic' | 'openai';
export type LlmOperation =
  | 'analyze_article'
  | 'analyze_article_v2'
  | 'analyze_article_v3'
  | 'analyze_article_v4'
  // Telemetry-only label for the regeneration path (FR-10 wants process vs
  // regeneration distinguishable). NOTE: this is NOT used as the LLM
  // response-cache key — regeneration shares the 'analyze_article_v4' cache so
  // it can hit results created during initial processing (FR-9 cache reuse).
  | 'regenerate_article_v4'
  | 'build_digest_v1'
  | 'build_digest_v2';

export type DigestLlmArticleSummary = {
  title: string;
  summary: string | null;
};

export type BuildDigestLlmInput = {
  userId: string;
  period: DigestPeriod;
  scopeLabel: string;
  articles: DigestLlmArticleSummary[];
};

export const BuildDigestLlmResult = z.object({
  // 5-9 word editorial headline rendered in the UI as "Last week: {title}".
  // No trailing punctuation. Min/max chars are a soft guard against single-
  // word stubs or runaway sentences; the prompt does the real shaping.
  title: z.string().min(6).max(120),
  summary: z.array(z.string().min(20)).min(2).max(3),
});
export type BuildDigestLlmResult = z.infer<typeof BuildDigestLlmResult>;
