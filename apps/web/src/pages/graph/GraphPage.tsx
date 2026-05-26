import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGetCategoriesQuery, useGetGraphQuery } from '../../store/api';
import type { GraphEdge, GraphNode, GraphResponse } from '@intelligencehub/shared';
import { filterGraph, isNodeKindFilter, NODE_KIND_FILTERS, type NodeKindFilter } from './filter';
import { layout } from './layout';

function CategoryFilter({
  selected,
  onChange,
}: {
  selected: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const { data } = useGetCategoriesQuery();
  return (
    <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
      <label htmlFor="graph-cat-filter">filter by category:</label>
      <select
        id="graph-cat-filter"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="border border-border bg-paper px-1.5 py-0.5 text-[10.5px] text-ink focus:border-ink focus:outline-none"
      >
        <option value="">All categories</option>
        {data?.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function NodeKindToggle({
  selected,
  onChange,
}: {
  selected: NodeKindFilter;
  onChange: (kind: NodeKindFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
      <span>show:</span>
      <div className="flex border border-border">
        {NODE_KIND_FILTERS.map((kind) => {
          const active = selected === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onChange(kind)}
              className={
                'px-2 py-0.5 text-[10.5px] ' +
                (active
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink hover:bg-paper2')
              }
              aria-pressed={active}
            >
              {kind}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function toReactFlowNodes(
  graphNodes: GraphNode[],
  positions: Map<string, { x: number; y: number }>,
): Node[] {
  return graphNodes.map((n) => ({
    id: n.id,
    data: { label: n.kind === 'article' ? truncate(n.label, 60) : n.label },
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    style: nodeStyle(n),
  }));
}

function toReactFlowEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e, i) => ({
    id: `${e.from}->${e.to}-${e.kind}-${i}`,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get('category') ?? undefined;
  const nodeKindParam = searchParams.get('nodeKind');
  const nodeKind: NodeKindFilter = isNodeKindFilter(nodeKindParam) ? nodeKindParam : 'both';

  const { data, isLoading } = useGetGraphQuery({ categoryId });

  const filtered: GraphResponse | null = useMemo(
    () => (data ? filterGraph(data, nodeKind) : null),
    [data, nodeKind],
  );
  const positions = useMemo(
    () => (filtered ? layout(filtered.nodes, filtered.edges) : new Map<string, { x: number; y: number }>()),
    [filtered],
  );
  const nodes = useMemo(
    () => (filtered ? toReactFlowNodes(filtered.nodes, positions) : []),
    [filtered, positions],
  );
  const edges = useMemo(
    () => (filtered ? toReactFlowEdges(filtered.edges) : []),
    [filtered],
  );

  function updateCategory(id: string | undefined): void {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('category', id);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  }

  function updateNodeKind(kind: NodeKindFilter): void {
    const next = new URLSearchParams(searchParams);
    if (kind === 'both') next.delete('nodeKind');
    else next.set('nodeKind', kind);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Graph
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">Relationships</h1>
        <div className="flex flex-wrap items-center gap-x-3 font-mono text-[10.5px] text-muted">
          <span>articles + entities · mention + co-mention edges</span>
          {filtered ? (
            <span className="tnum text-ink">
              · {filtered.nodes.length} nodes · {filtered.edges.length} edges
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <CategoryFilter selected={categoryId} onChange={updateCategory} />
          <NodeKindToggle selected={nodeKind} onChange={updateNodeKind} />
        </div>
      </header>

      <div className="min-h-[520px] flex-1 border border-border bg-surface">
        {isLoading ? (
          <p className="p-6 font-mono text-[11px] text-mute2">Loading…</p>
        ) : !filtered || filtered.nodes.length === 0 ? (
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
