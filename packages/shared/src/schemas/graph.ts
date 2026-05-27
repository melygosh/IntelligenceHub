import { z } from 'zod';
import { EntityKind } from './articles.js';

export const GraphNodeKind = z.enum(['article', 'entity']);
export type GraphNodeKind = z.infer<typeof GraphNodeKind>;

export const GraphEdgeKind = z.enum(['mentions', 'co_mention', 'similar']);
export type GraphEdgeKind = z.infer<typeof GraphEdgeKind>;

export const GraphNode = z.object({
  id: z.string().uuid(),
  kind: GraphNodeKind,
  label: z.string(),
  ts: z.number().int().nullable(), // unix seconds — only set on article nodes
  entityType: EntityKind.nullable(), // only set on entity nodes
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
