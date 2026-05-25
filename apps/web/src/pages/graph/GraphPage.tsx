import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGetGraphQuery } from '../../store/api';
import type { GraphEdge, GraphNode } from '@intelligencehub/shared';

function nodeStyle(node: GraphNode): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: 11,
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    boxShadow: 'none',
    borderRadius: 0,
  };
  if (node.kind === 'article') {
    return { ...base, background: 'var(--color-paper2)', maxWidth: 240 };
  }
  return { ...base, background: 'var(--color-accent-light)', color: 'var(--color-accent-deep)' };
}

function layoutNodes(graphNodes: GraphNode[]): Node[] {
  return graphNodes.map((n, i) => {
    const ring = Math.floor(i / 8);
    const angle = (i % 8) * (Math.PI / 4) + ring * 0.3;
    const radius = 120 + ring * 110;
    return {
      id: n.id,
      data: { label: n.kind === 'article' ? truncate(n.label, 60) : n.label },
      position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      style: nodeStyle(n),
    };
  });
}

function layoutEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e, i) => ({
    id: `${e.from}->${e.to}-${i}`,
    source: e.from,
    target: e.to,
    type: 'default',
    style: {
      stroke: 'var(--color-mute2)',
      strokeWidth: e.kind === 'co_mention' ? 1.4 : 1,
      strokeDasharray: e.kind === 'similar' ? '4 3' : undefined,
    },
  }));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export default function GraphPage() {
  const { data, isLoading } = useGetGraphQuery();
  const nodes = useMemo(() => (data ? layoutNodes(data.nodes) : []), [data]);
  const edges = useMemo(() => (data ? layoutEdges(data.edges) : []), [data]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Graph
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">Relationships</h1>
        <div className="flex flex-wrap items-center gap-x-3 font-mono text-[10.5px] text-muted">
          <span>articles + entities · mention edges</span>
          {data ? (
            <span className="tnum text-ink">
              · {data.nodes.length} nodes · {data.edges.length} edges
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-[520px] flex-1 border border-border bg-surface">
        {isLoading ? (
          <p className="p-6 font-mono text-[11px] text-mute2">Loading…</p>
        ) : !data || data.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="font-serif text-[18px] text-ink">No graph yet</p>
              <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
                Pull a few articles in <a href="/feeds" className="text-accent hover:text-accent-deep">Feeds</a>{' '}
                and they'll show up here connected to their mentioned entities.
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d8cfbd" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable maskColor="rgba(244,239,230,0.6)" />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
