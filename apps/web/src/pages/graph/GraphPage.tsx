import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useGetCategoriesQuery,
  useGetGraphQuery,
  useGetGraphSummaryQuery,
} from '../../store/api';
import type {
  GraphEdge,
  GraphNode,
  GraphPeriod,
  GraphResponse,
} from '@intelligencehub/shared';
import {
  filterGraph,
  isNodeKindFilter,
  NODE_KIND_FILTERS,
  type NodeKindFilter,
} from './filter';
import { layout } from './layout';
import { ArticleGraphNode } from './ArticleGraphNode';
import { EntityGraphNode } from './EntityGraphNode';
import { computeFocusSet } from './focus';
import { GraphSidePanel, type SelectedNode } from './GraphSidePanel';
import { SummaryBand } from './SummaryBand';
import { PeriodChips } from '../../components/filters/PeriodChips';
import { colourFor } from './graph-palette';

const nodeTypes = {
  article: ArticleGraphNode,
  entity: EntityGraphNode,
} as const;

const DEFAULT_PERIOD: GraphPeriod = '7d';
const DEFAULT_NODE_KIND: NodeKindFilter = 'entities'; // hybrid default

function isGraphPeriod(s: string | null): s is GraphPeriod {
  return s === 'all' || s === '24h' || s === '7d' || s === '30d' || s === 'custom';
}

function CategoryFilter({
  selected,
  onChange,
}: {
  selected: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const { data } = useGetCategoriesQuery();
  return (
    <div className="flex items-center gap-2 font-mono text-[12.5px] text-muted">
      <label htmlFor="graph-cat-filter">category:</label>
      <select
        id="graph-cat-filter"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="border border-border bg-paper px-1.5 py-0.5 text-[12.5px] text-ink focus:border-ink focus:outline-none"
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
    <div className="flex items-center gap-2 font-mono text-[12.5px] text-muted">
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
                'px-2 py-0.5 text-[12.5px] ' +
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

function toReactFlowNodes(
  graphNodes: GraphNode[],
  positions: Map<string, { x: number; y: number }>,
  focus: ReadonlySet<string> | null,
): Node[] {
  return graphNodes.map((n) => {
    const dim = focus !== null && !focus.has(n.id);
    const style: React.CSSProperties = {
      opacity: dim ? 0.18 : 1,
      transition: 'opacity 120ms linear',
    };
    if (n.kind === 'article') {
      return {
        id: n.id,
        type: 'article',
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        style,
        data: {
          label: truncate(n.label, 60),
          kind: 'article' as const,
          importance: n.importance,
        },
      };
    }
    return {
      id: n.id,
      type: 'entity',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      style,
      data: {
        label: n.label,
        kind: 'entity' as const,
        mentionCount: n.mentionCount,
        dominantCategoryId: n.dominantCategoryId,
      },
    };
  });
}

function toReactFlowEdges(
  graphEdges: GraphEdge[],
  focus: ReadonlySet<string> | null,
): Edge[] {
  return graphEdges.map((e, i) => {
    const dim = focus !== null && !(focus.has(e.from) && focus.has(e.to));
    return {
      id: `${e.from}->${e.to}-${e.kind}-${i}`,
      source: e.from,
      target: e.to,
      type: 'default',
      style: {
        stroke: 'var(--color-mute2)',
        strokeWidth: e.kind === 'co_mention' ? Math.min(1 + (e.weight ?? 1) * 0.3, 3) : 1,
        strokeDasharray: e.kind === 'similar' ? '4 3' : undefined,
        opacity: dim ? 0.12 : 1,
        transition: 'opacity 120ms linear',
      },
    };
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function CategoryLegend({ data }: { data: GraphResponse | null }) {
  const { data: cats } = useGetCategoriesQuery();
  const present = useMemo(() => {
    if (!data) return [] as Array<{ id: string; name: string }>;
    const ids = new Set<string>();
    for (const n of data.nodes)
      if (n.kind === 'entity' && n.dominantCategoryId) ids.add(n.dominantCategoryId);
    const byId = new Map(cats?.categories.map((c) => [c.id, c.name]) ?? []);
    return Array.from(ids).map((id) => ({ id, name: byId.get(id) ?? 'category' }));
  }, [data, cats]);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
      {present.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              background: colourFor(p.id),
            }}
          />
          {p.name}
        </span>
      ))}
    </div>
  );
}

export default function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get('category') ?? undefined;
  const nodeKindParam = searchParams.get('nodeKind');
  const nodeKind: NodeKindFilter = isNodeKindFilter(nodeKindParam)
    ? nodeKindParam
    : DEFAULT_NODE_KIND;
  const periodParam = searchParams.get('period');
  const period: GraphPeriod = isGraphPeriod(periodParam) ? periodParam : DEFAULT_PERIOD;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  const { data, isLoading } = useGetGraphQuery({
    categoryId,
    period,
    from,
    to,
  });
  const { data: summary } = useGetGraphSummaryQuery({
    categoryId,
    period,
    from,
    to,
  });

  const [selected, setSelected] = useState<SelectedNode | null>(null);

  const filtered: GraphResponse | null = useMemo(
    () => (data ? filterGraph(data, nodeKind) : null),
    [data, nodeKind],
  );
  const positions = useMemo(
    () =>
      filtered
        ? layout(filtered.nodes, filtered.edges)
        : new Map<string, { x: number; y: number }>(),
    [filtered],
  );

  // Only apply focus when the selected node is actually on the canvas. A band
  // click on a top-article with `show: entities` selects an article that
  // isn't in `filtered.nodes` — without this guard, computeFocusSet would
  // return a singleton set the canvas can't match, dimming everything.
  const focus = useMemo(() => {
    if (!filtered || !selected) return null;
    const onCanvas = filtered.nodes.some((n) => n.id === selected.id);
    if (!onCanvas) return null;
    return computeFocusSet(selected.id, filtered.edges);
  }, [filtered, selected]);

  const nodes = useMemo(
    () => (filtered ? toReactFlowNodes(filtered.nodes, positions, focus) : []),
    [filtered, positions, focus],
  );
  const edges = useMemo(
    () => (filtered ? toReactFlowEdges(filtered.edges, focus) : []),
    [filtered, focus],
  );

  function updateParam(key: string, value: string | undefined): void {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function updateCategory(id: string | undefined): void {
    updateParam('category', id);
    setSelected(null);
  }
  function updateNodeKind(kind: NodeKindFilter): void {
    updateParam('nodeKind', kind === DEFAULT_NODE_KIND ? undefined : kind);
    setSelected(null);
  }
  function updatePeriod(next: GraphPeriod): void {
    // Build a single URLSearchParams so multiple setSearchParams calls don't
    // overwrite each other (each updateParam call reads from the same stale
    // searchParams snapshot, so doing three separate calls loses the first two).
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_PERIOD) params.delete('period');
    else params.set('period', next);
    if (next !== 'custom') {
      params.delete('from');
      params.delete('to');
    }
    setSearchParams(params, { replace: true });
    setSelected(null);
  }

  function onNodeClick(_e: React.MouseEvent, node: Node): void {
    const kind = (node.data as { kind?: 'article' | 'entity' }).kind;
    if (kind === 'article' || kind === 'entity') {
      setSelected({ id: node.id, kind });
    }
  }

  function onPaneClick(): void {
    setSelected(null);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Graph
        </div>
        <h1 className="pretty mb-3 font-serif text-[30px] leading-tight text-ink">Relationships</h1>
      </header>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodChips value={period} onChange={updatePeriod} />
        <NodeKindToggle selected={nodeKind} onChange={updateNodeKind} />
        <CategoryFilter selected={categoryId} onChange={updateCategory} />
      </div>
      <SummaryBand
        data={summary}
        selected={selected}
        onSelect={setSelected}
        period={period}
      />
      <div className="flex min-h-[440px] flex-1 gap-0">
        <div className="min-w-0 flex-1 border border-border bg-surface">
          {isLoading ? (
            <p className="p-6 font-mono text-[13px] text-mute2">Loading…</p>
          ) : !filtered || filtered.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="font-serif text-[22px] text-ink">No activity in this window</p>
                <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
                  Try a wider window or pull a feed in{' '}
                  <a href="/feeds" className="text-accent hover:text-accent-deep">
                    Feeds
                  </a>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => updatePeriod('all')}
                  className="mt-3 border border-border bg-paper px-3 py-1 font-mono text-[12px] text-ink hover:bg-paper2"
                >
                  Use period=all
                </button>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d8cfbd" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgba(244,239,230,0.6)" />
            </ReactFlow>
          )}
          <div className="border-t border-border px-3 py-1.5">
            <CategoryLegend data={filtered} />
          </div>
        </div>
        {selected ? (
          <GraphSidePanel selected={selected} onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </div>
  );
}
