import { useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
  useGetPublicConfigQuery,
} from '../../store/api';
import { CategoryDropdown } from '../../components/filters/CategoryDropdown';
import type {
  GraphEdge,
  GraphNode,
  GraphPeriod,
  GraphResponse,
} from '@intelligencehub/shared';
import { filterGraph } from './filter';
import { layout } from './layout';
import { ArticleGraphNode } from './ArticleGraphNode';
import { EntityGraphNode } from './EntityGraphNode';
import { computeFocusSet } from './focus';
import { GraphSidePanel, type SelectedNode } from './GraphSidePanel';
import { GraphSelectionPanel, type GraphDimension } from './GraphSelectionPanel';
import { SummaryBand } from './SummaryBand';
import { PeriodChips } from '../../components/filters/PeriodChips';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { colourFor } from './graph-palette';
import { GraphExportMenu } from './GraphExportMenu';

const nodeTypes = {
  article: ArticleGraphNode,
  entity: EntityGraphNode,
} as const;

const DEFAULT_PERIOD: GraphPeriod = '7d';

function isGraphPeriod(s: string | null): s is GraphPeriod {
  return s === 'all' || s === '24h' || s === '7d' || s === '30d' || s === 'custom';
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

// Above this many `mentions` edges in view the animation auto-disables —
// flowing dashes on every edge turn the canvas into a strobe. Empirically
// readable at ~80; above that the cap takes over and the page surfaces a
// hint so the user knows why their toggle didn't visually change anything.
const ANIMATE_EDGE_CAP = 80;

function toReactFlowEdges(
  graphEdges: GraphEdge[],
  focus: ReadonlySet<string> | null,
  animateMentions: boolean,
): Edge[] {
  return graphEdges.map((e, i) => {
    const dim = focus !== null && !(focus.has(e.from) && focus.has(e.to));
    return {
      id: `${e.from}->${e.to}-${e.kind}-${i}`,
      source: e.from,
      target: e.to,
      type: 'default',
      // Only mentions edges (article → entity) carry timestamp direction.
      // co_mention is symmetric; similar (if used) is also direction-less.
      animated: animateMentions && e.kind === 'mentions',
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
  const categoryParam = searchParams.get('category') ?? '';
  // CSV → string[]. Empty string + filter out blanks so trailing commas
  // don't surface as empty UUID values.
  const categoryIds = useMemo(
    () =>
      categoryParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [categoryParam],
  );
  const periodParam = searchParams.get('period');
  const period: GraphPeriod = isGraphPeriod(periodParam) ? periodParam : DEFAULT_PERIOD;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  // Could-tier bonus: animate mentions edges in chronological direction
  // (article → entity). URL-backed via ?animate=1 so the toggle survives
  // reload and is sharable. Off by default — animation on a busy graph
  // looks like a strobe; the cap below auto-disables when there's too
  // much going on, but starting off means the reviewer opts in.
  const animateRequested = searchParams.get('animate') === '1';
  // Anchor mode rides in via React Router navigation state from EntityDetail's
  // "view in graph" link — not persisted in the URL, so reloading the page
  // drops back to top-N. Matches the same in-memory-only choice as the
  // customize-canvas selection.
  const location = useLocation();
  const anchorEntityId = (location.state as { anchorEntityId?: string } | null)
    ?.anchorEntityId;

  // Explicit-set mode: null means "use top-N defaults". Once the user
  // diverges via the customize panel, these become the source of truth.
  // In-memory only — refreshing the page resets to top-N as designed.
  const [pickedEntityIds, setPickedEntityIds] = useState<Set<string> | null>(
    null,
  );
  const [pickedArticleIds, setPickedArticleIds] = useState<Set<string> | null>(
    null,
  );
  const [dimension, setDimension] = useState<GraphDimension>('entity');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { data: publicConfig } = useGetPublicConfigQuery();
  const selectionCap = publicConfig?.graphSelectionCap ?? 100;

  const explicitMode = pickedEntityIds !== null || pickedArticleIds !== null;

  const { data, isLoading } = useGetGraphQuery({
    categoryIds,
    period,
    from,
    to,
    anchorEntityId: explicitMode ? undefined : anchorEntityId,
    selectedEntityIds: pickedEntityIds
      ? Array.from(pickedEntityIds)
      : undefined,
    selectedArticleIds: pickedArticleIds
      ? Array.from(pickedArticleIds)
      : undefined,
  });

  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // Snapshot target for PNG / SVG export. Wraps the ReactFlow canvas (not the
  // legend strip below it), so the export shows exactly the canvas content.
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const filtered: GraphResponse | null = useMemo(
    () => (data ? filterGraph(data, 'both') : null),
    [data],
  );
  const positions = useMemo(
    () =>
      filtered
        ? layout(filtered.nodes, filtered.edges)
        : new Map<string, { x: number; y: number }>(),
    [filtered],
  );

  // Only apply focus when the selected node is actually on the canvas. A band
  // click can select a node that isn't in `filtered.nodes` (e.g. an item not in
  // the current top-N selection) — without this guard, computeFocusSet would
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
  const mentionsEdgeCount = filtered
    ? filtered.edges.filter((e) => e.kind === 'mentions').length
    : 0;
  const animateCapped =
    animateRequested && mentionsEdgeCount > ANIMATE_EDGE_CAP;
  const animateEffective = animateRequested && !animateCapped;
  const edges = useMemo(
    () =>
      filtered
        ? toReactFlowEdges(filtered.edges, focus, animateEffective)
        : [],
    [filtered, focus, animateEffective],
  );

  // All filter changes preserve location.state so the entity anchor (which
  // rides in via state from EntityDetail) survives every chip click. Without
  // this, React Router defaults the new entry's state to undefined and the
  // anchor gets dropped on the first filter interaction.
  function updateParam(key: string, value: string | undefined): void {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true, state: location.state });
  }

  function updateCategoryIds(ids: string[]): void {
    updateParam('category', ids.length > 0 ? ids.join(',') : undefined);
    setSelected(null);
  }
  function onChangeDimension(d: GraphDimension): void {
    setDimension(d);
    setPickedEntityIds(null);
    setPickedArticleIds(null);
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
    setSearchParams(params, { replace: true, state: location.state });
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

  function openCustomize(): void {
    setCustomizeOpen(true);
  }

  function resetCustomize(): void {
    setPickedEntityIds(null);
    setPickedArticleIds(null);
    setDimension('entity');
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader eyebrow="Graph" title="Relationships" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodChips value={period} onChange={updatePeriod} />
        <CategoryDropdown selected={categoryIds} onChange={updateCategoryIds} />
        <button
          type="button"
          onClick={openCustomize}
          className={
            'inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[13.5px] transition-colors ' +
            (explicitMode
              ? 'border-ink bg-ink text-paper'
              : 'border-border bg-paper text-ink hover:bg-paper2')
          }
          title="Open the customize-canvas panel"
        >
          Customize…
          {explicitMode ? (
            <span className="text-[11.5px]">
              ({(pickedEntityIds?.size ?? 0) + (pickedArticleIds?.size ?? 0)})
            </span>
          ) : null}
        </button>
        {explicitMode ? (
          <button
            type="button"
            onClick={resetCustomize}
            className="font-mono text-[12.5px] text-muted hover:text-ink"
            title="Restore the default top-N selection"
          >
            reset to top-N
          </button>
        ) : null}
        <label
          className="flex items-center gap-1.5 font-mono text-[12.5px] text-muted hover:text-ink"
          title="Animate mentions edges in chronological direction (article → entity)"
        >
          <input
            type="checkbox"
            checked={animateRequested}
            onChange={(e) =>
              updateParam('animate', e.target.checked ? '1' : undefined)
            }
            className="h-3 w-3 accent-ink"
          />
          animate edges
        </label>
        <div className="ml-auto">
          <GraphExportMenu
            getCanvasRoot={() => canvasRef.current}
            graph={filtered}
            filters={{
              period,
              from,
              to,
              nodeKind: 'both',
              categoryIds,
              anchorEntityId: explicitMode ? undefined : anchorEntityId,
            }}
          />
        </div>
      </div>
      <SummaryBand
        data={filtered}
        selected={selected}
        onSelect={setSelected}
      />
      <div className="flex min-h-[440px] flex-1 gap-0">
        <div
          ref={canvasRef}
          className="min-w-0 flex-1 border border-border bg-surface"
        >
          {isLoading ? (
            <LoadingHint className="p-6" />
          ) : !filtered || filtered.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <EmptyState
                title="No activity in this window"
                subtitle={
                  <>
                    Try a wider window or pull a feed in{' '}
                    <a href="/feeds" className="text-accent hover:text-accent-deep">
                      Feeds
                    </a>
                    .
                  </>
                }
              />
              <button
                type="button"
                onClick={() => updatePeriod('all')}
                className="mt-3 border border-border bg-paper px-3 py-1 font-mono text-[12px] text-ink hover:bg-paper2"
              >
                Use period=all
              </button>
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
            {animateCapped ? (
              <p className="mt-1 font-mono text-[11px] text-mute2">
                Animation off — {mentionsEdgeCount} mentions edges in view
                exceeds the cap of {ANIMATE_EDGE_CAP}.
              </p>
            ) : null}
          </div>
        </div>
        {selected ? (
          <GraphSidePanel selected={selected} onClose={() => setSelected(null)} />
        ) : null}
        {customizeOpen ? (
          <GraphSelectionPanel
            dimension={dimension}
            onChangeDimension={onChangeDimension}
            selectedEntityIds={pickedEntityIds ?? new Set()}
            selectedArticleIds={pickedArticleIds ?? new Set()}
            onChangeEntities={setPickedEntityIds}
            onChangeArticles={setPickedArticleIds}
            onReset={resetCustomize}
            onClose={() => setCustomizeOpen(false)}
            cap={selectionCap}
          />
        ) : null}
      </div>
    </div>
  );
}
