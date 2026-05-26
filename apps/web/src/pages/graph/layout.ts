import dagre from '@dagrejs/dagre';
import type { GraphEdge, GraphNode } from '@intelligencehub/shared';

const ARTICLE_WIDTH = 240;
const ENTITY_WIDTH = 160;
const NODE_HEIGHT = 36;

export function layout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80 });
  nodes.forEach((n) =>
    g.setNode(n.id, {
      width: n.kind === 'article' ? ARTICLE_WIDTH : ENTITY_WIDTH,
      height: NODE_HEIGHT,
    }),
  );
  edges.forEach((e) => g.setEdge(e.from, e.to));
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  g.nodes().forEach((id) => {
    const { x, y } = g.node(id);
    positions.set(id, { x, y });
  });
  return positions;
}
