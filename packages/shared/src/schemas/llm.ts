import { z } from 'zod';
import { EntityKind } from './articles.js';

export const Importance = z.enum(['high', 'normal', 'junk']);
export type Importance = z.infer<typeof Importance>;

export const ExtractedEntity = z.object({
  canonicalName: z.string().min(1).max(120),
  type: EntityKind,
  aliases: z.array(z.string().min(1).max(120)).max(10).default([]),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntity>;

export const ArticleAnalysisResult = z.object({
  summary: z.string().min(1).max(800),
  importance: Importance,
  entities: z.array(ExtractedEntity).max(20),
});
export type ArticleAnalysisResult = z.infer<typeof ArticleAnalysisResult>;

export type ArticleAnalysisInput = {
  title: string;
  body: string;
  articleId: string;
  userId: string;
  contentHash: string;
};

/**
 * Provider-independent LLM service interface (spec FR-3).
 * Each adapter implements this; the active adapter is chosen via LLM_PROVIDER env.
 * Day 5 implements analyzeArticle only. matchEntities lands Day 6, buildDigest Day 12.
 */
export interface LlmService {
  analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult>;
}

export type LlmProvider = 'anthropic' | 'openai';
export type LlmOperation = 'analyze_article' | 'analyze_article_v2' | 'match_entities' | 'build_digest';
