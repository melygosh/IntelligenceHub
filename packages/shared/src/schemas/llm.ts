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
};

export interface LlmService {
  analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult>;
}

export type LlmProvider = 'anthropic' | 'openai';
export type LlmOperation =
  | 'analyze_article'
  | 'analyze_article_v2'
  | 'analyze_article_v3'
  | 'match_entities'
  | 'build_digest';
