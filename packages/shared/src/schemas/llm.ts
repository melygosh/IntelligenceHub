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
  // v5: broadened entity-type guidance + strict JSON-Schema enum in the prompt,
  // plus the parser 'unknown' fallback. Bumped so analyses re-run on the new
  // prompt (paired with extract_article_v2 below).
  | 'analyze_article_v5'
  // Telemetry-only label for the regeneration path (FR-10 wants process vs
  // regeneration distinguishable). NOTE: this is NOT used as the LLM
  // response-cache key — regeneration shares the 'analyze_article_v4' cache so
  // it can hit results created during initial processing (FR-9 cache reuse).
  | 'regenerate_article_v4'
  // Split-cache: article-specific extract (summary/importance/entities,
  // configHash='') and the per-user categorize (categories/axes).
  | 'extract_article_v1'
  // v2: extraction prompt changed (entity-type enum), so the extract cache is
  // bumped to force re-extraction rather than serving v1 (old-prompt) results.
  | 'extract_article_v2'
  | 'categorize_article_v1'
  // v2: category instruction rewritten for better recall (topical relevance,
  // multi-label, no strict-omit bias). Bumped so categorizations recompute on
  // the new prompt instead of serving the old, stingy v1 tags.
  | 'categorize_article_v2'
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

// Article-specific half of the analysis (identical for every user). Cached by
// contentHash alone (configHash='').
export const ExtractResult = z.object({
  summary: z.string().min(1).max(800),
  importance: Importance,
  entities: z.array(ExtractedEntity).max(20),
});
export type ExtractResult = z.infer<typeof ExtractResult>;

// User-specific half (depends on the user's categories + axes).
export const CategorizeResult = z.object({
  categoryNames: z.array(z.string().min(1).max(64)).max(20).default([]),
  axisAssignments: z.array(AxisAssignment).max(10).default([]),
});
export type CategorizeResult = z.infer<typeof CategorizeResult>;

// Input to a categorize-only call. Same shape as ArticleAnalysisInput plus the
// already-extracted entities as an optional context hint.
export type CategorizeInput = {
  title: string;
  body: string;
  articleId: string;
  userId: string;
  contentHash: string;
  userCategories: string[];
  userAxes: { name: string; values: string[] }[];
  configHash: string;
  operationTrigger?: LlmOperation;
};

/** Split a full analysis into its article-specific + user-specific halves. */
export function splitAnalysis(full: ArticleAnalysisResult): {
  extract: ExtractResult;
  categorize: CategorizeResult;
} {
  return {
    extract: {
      summary: full.summary,
      importance: full.importance,
      entities: full.entities,
    },
    categorize: {
      categoryNames: full.categoryNames,
      axisAssignments: full.axisAssignments,
    },
  };
}

/** Recombine an extract + categorize into the full analysis shape consumers expect. */
export function mergeAnalysis(
  extract: ExtractResult,
  categorize: CategorizeResult,
): ArticleAnalysisResult {
  return {
    summary: extract.summary,
    importance: extract.importance,
    entities: extract.entities,
    categoryNames: categorize.categoryNames,
    axisAssignments: categorize.axisAssignments,
  };
}
