import { z } from 'zod';
import { EntityKind, ArticleImportance, ArticlesPeriod } from './articles.js';

export const GraphNodeKind = z.enum(['article', 'entity']);
export type GraphNodeKind = z.infer<typeof GraphNodeKind>;

export const GraphEdgeKind = z.enum(['mentions', 'co_mention', 'similar']);
export type GraphEdgeKind = z.infer<typeof GraphEdgeKind>;

// `GraphPeriod` is the same enum as `ArticlesPeriod` — re-exported so the graph
// page can read it as a graph-domain type without a cross-domain import.
export const GraphPeriod = ArticlesPeriod;
export type GraphPeriod = z.infer<typeof GraphPeriod>;

export const GraphNode = z.object({
  id: z.string().uuid(),
  kind: GraphNodeKind,
  label: z.string(),
  // unix seconds — only set on article nodes
  ts: z.number().int().nullable(),
  // only set on entity nodes
  entityType: EntityKind.nullable(),
  // FR-7: only set on article nodes ('high' | 'normal' | 'junk'); null on
  // entities and on article rows not yet analysed.
  importance: ArticleImportance.nullable(),
  // Only set on entity nodes — drives node size on the canvas.
  mentionCount: z.number().int().nonnegative().nullable(),
  // Only set on entity nodes — drives node colour on the canvas. Null when
  // the entity's mentioning articles have no category in scope (renders as
  // the 'uncategorised' slate).
  dominantCategoryId: z.string().uuid().nullable(),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  kind: GraphEdgeKind,
  weight: z.number().int().nullable(), // co_mention has weight; mentions/similar may not
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const GraphResponse = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type GraphResponse = z.infer<typeof GraphResponse>;

// Request shape for `GET /api/graph`. `from`/`to` are required only when
// `period === 'custom'` (enforced server-side). When `anchor` is set, the
// canvas shows [that entity + its top-`top` co-mentioned neighbours in
// scope] instead of the top-`top` global entities; `top` still caps the
// neighbour count.
export const GetGraphQuery = z.object({
  // CSV of category UUIDs. Backend matches any (OR). Single value remains
  // valid. Matches GetArticlesQuery.category for cross-page parity.
  category: z.string().optional(),
  period: GraphPeriod.optional(), // default '7d' applied server-side
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  top: z.coerce.number().int().positive().max(200).optional(), // default 20
  anchor: z.string().uuid().optional(),
  // CSVs of explicit entity/article UUIDs. When either is non-empty the
  // server skips top-N and renders exactly the union of these IDs (plus the
  // edges among them). Used by the customize-canvas side panel.
  entityIds: z.string().optional(),
  articleIds: z.string().optional(),
});
export type GetGraphQuery = z.infer<typeof GetGraphQuery>;

// Response for `GET /api/graph/summary` — drives the 2-cell band.
export const GraphSummaryEntity = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  mentionCount: z.number().int().nonnegative(),
  dominantCategoryId: z.string().uuid().nullable(),
});
export type GraphSummaryEntity = z.infer<typeof GraphSummaryEntity>;

export const GraphSummaryArticle = z.object({
  id: z.string().uuid(),
  title: z.string(),
  // null after a feed was deleted (US-3 detach made articles.feedId nullable).
  feedTitle: z.string().nullable(),
  ts: z.string().datetime(),
  importance: ArticleImportance.nullable(),
});
export type GraphSummaryArticle = z.infer<typeof GraphSummaryArticle>;

export const GraphSummaryResponse = z.object({
  topEntities: z.array(GraphSummaryEntity), // up to 5
  topArticles: z.array(GraphSummaryArticle), // up to 5
});
export type GraphSummaryResponse = z.infer<typeof GraphSummaryResponse>;
