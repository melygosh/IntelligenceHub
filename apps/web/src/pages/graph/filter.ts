import type { GraphResponse } from '@intelligencehub/shared';

export type NodeKindFilter = 'both' | 'articles' | 'entities';

export const NODE_KIND_FILTERS: NodeKindFilter[] = ['both', 'articles', 'entities'];

export function isNodeKindFilter(v: unknown): v is NodeKindFilter {
  return v === 'both' || v === 'articles' || v === 'entities';
}

/**
 * Drops nodes that don't match the filter and any edge whose endpoint was
 * dropped. Returns the input unchanged on 'both'. Important: 'entities' keeps
 * co_mention edges (entity<->entity) but drops mention edges (entity is one
 * endpoint, article is the other — article was dropped). 'articles' drops all
 * edges because every edge type needs at least one entity endpoint.
 */
export function filterGraph(
  data: GraphResponse,
  kind: NodeKindFilter,
): GraphResponse {
  if (kind === 'both') return data;
  const keep = kind === 'articles' ? 'article' : 'entity';
  const nodes = data.nodes.filter((n) => n.kind === keep);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = data.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
  );
  return { nodes, edges };
}
