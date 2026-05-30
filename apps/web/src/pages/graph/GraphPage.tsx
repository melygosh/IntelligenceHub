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
import { ArticlesPanel } from './ArticlesPanel';
import { EntityPickerDropdown } from './EntityPickerDropdown';
import { PeriodChips } from '../../components/filters/PeriodChips';
import { SearchInput } from '../../components/filters/SearchInput';
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

/** CSV → trimmed, non-empty string[]. */
function parseCsv(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Order-insensitive equality of two id lists (used for category compare). */
function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** Equality of two selection sets, treating null (untouched) distinctly. */
function sameSel(
  a: ReadonlySet<string> | null,
  b: ReadonlySet<string> | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// The committed params that actually drive the /graph fetch. The builder edits
// a separate draft; clicking Build copies draft → built (one fetch).
type BuiltParams = {
  categoryIds: string[];
  period: GraphPeriod;
  from?: string;
  to?: string;
  entitySel: Set<string> | null;
  articleIds: Set<string>;
  // Carried only for the initial auto-build (anchored from EntityDetail). A
  // manual Build / reset drops it.
  anchorEntityId?: string;
};

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

// Above this many `mentions` edges in view the animation auto-disables — flowing
// dashes on every edge turn the canvas into a strobe. Readable at ~80; above
// that the cap takes over and the page surfaces a hint.
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
            style={{ display: 'inline-block', width: 9, height: 9, background: colourFor(p.id) }}
          />
          {p.name}
        </span>
      ))}
    </div>
  );
}

export default function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const anchorEntityId = (location.state as { anchorEntityId?: string } | null)
    ?.anchorEntityId;
  // `animate` stays URL-backed + instant — it's a client-only render toggle
  // (no fetch), unaffected by the build flow.
  const animateRequested = searchParams.get('animate') === '1';

  // --- Draft: what the builder edits. Changing these fetches NOTHING; they
  // only take effect when the user clicks Build. Seeded once from the URL so
  // existing /graph?category=…&period=… links still open as expected.
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>(() =>
    parseCsv(searchParams.get('category')),
  );
  const [draftPeriod, setDraftPeriod] = useState<GraphPeriod>(() => {
    const p = searchParams.get('period');
    return isGraphPeriod(p) ? p : DEFAULT_PERIOD;
  });
  const [draftFrom, setDraftFrom] = useState<string | undefined>(
    () => searchParams.get('from') ?? undefined,
  );
  const [draftTo, setDraftTo] = useState<string | undefined>(
    () => searchParams.get('to') ?? undefined,
  );
  // null = untouched (the dropdown pre-checks the on-canvas top-N display-only);
  // a non-null set is an explicit entity pick.
  const [draftEntitySel, setDraftEntitySel] = useState<Set<string> | null>(null);
  const [draftArticleIds, setDraftArticleIds] = useState<Set<string>>(new Set());

  // --- Built: the committed params that actually drive the /graph fetch.
  // Initialised = draft defaults (+ any anchor) so the canvas auto-builds the
  // top-N on first load. Only Build / reset reassign this.
  const [built, setBuilt] = useState<BuiltParams>(() => {
    const p = searchParams.get('period');
    return {
      categoryIds: parseCsv(searchParams.get('category')),
      period: isGraphPeriod(p) ? p : DEFAULT_PERIOD,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      entitySel: null,
      articleIds: new Set<string>(),
      anchorEntityId,
    };
  });

  const [articlesOpen, setArticlesOpen] = useState(false);
  // Canvas-level text search: dims non-matching nodes by label. In-memory,
  // client-only — operates on the already-built graph, no fetch.
  const [graphQuery, setGraphQuery] = useState('');
  const { data: publicConfig } = useGetPublicConfigQuery();
  const selectionCap = publicConfig?.graphSelectionCap ?? 100;

  const explicitMode = built.entitySel !== null || built.articleIds.size > 0;

  const { data, isLoading, isFetching } = useGetGraphQuery({
    categoryIds: built.categoryIds,
    period: built.period,
    from: built.from,
    to: built.to,
    anchorEntityId: explicitMode ? undefined : built.anchorEntityId,
    selectedEntityIds:
      built.entitySel && built.entitySel.size > 0
        ? Array.from(built.entitySel)
        : undefined,
    selectedArticleIds:
      built.articleIds.size > 0 ? Array.from(built.articleIds) : undefined,
  });

  // Draft differs from what's currently built → Build is "pending" (glows).
  const pending =
    !sameIdList(draftCategoryIds, built.categoryIds) ||
    draftPeriod !== built.period ||
    draftFrom !== built.from ||
    draftTo !== built.to ||
    !sameSel(draftEntitySel, built.entitySel) ||
    !sameSel(draftArticleIds, built.articleIds);

  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Entity ids currently on the canvas (from the BUILT graph). When the draft
  // entity selection is untouched, the dropdown pre-checks these so it reflects
  // what's shown; once the user picks, the draft set wins.
  const canvasEntityIds = useMemo(() => {
    const s = new Set<string>();
    if (data) for (const n of data.nodes) if (n.kind === 'entity') s.add(n.id);
    return s;
  }, [data]);
  const checkedEntityIds = draftEntitySel ?? canvasEntityIds;

  // Default canvas shows the top-N entities only; once a selection exists we
  // show both kinds so connecting article nodes + their edges appear.
  const filtered: GraphResponse | null = useMemo(() => {
    if (!data) return null;
    return filterGraph(data, explicitMode ? 'both' : 'entities');
  }, [data, explicitMode]);
  const positions = useMemo(
    () =>
      filtered
        ? layout(filtered.nodes, filtered.edges)
        : new Map<string, { x: number; y: number }>(),
    [filtered],
  );

  const focus = useMemo(() => {
    if (!filtered) return null;
    const q = graphQuery.trim().toLowerCase();
    if (q) {
      return new Set(
        filtered.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id),
      );
    }
    if (!selected) return null;
    const onCanvas = filtered.nodes.some((n) => n.id === selected.id);
    if (!onCanvas) return null;
    return computeFocusSet(selected.id, filtered.edges);
  }, [filtered, selected, graphQuery]);

  const nodes = useMemo(
    () => (filtered ? toReactFlowNodes(filtered.nodes, positions, focus) : []),
    [filtered, positions, focus],
  );
  const mentionsEdgeCount = filtered
    ? filtered.edges.filter((e) => e.kind === 'mentions').length
    : 0;
  const animateCapped = animateRequested && mentionsEdgeCount > ANIMATE_EDGE_CAP;
  const animateEffective = animateRequested && !animateCapped;
  const edges = useMemo(
    () => (filtered ? toReactFlowEdges(filtered.edges, focus, animateEffective) : []),
    [filtered, focus, animateEffective],
  );

  function setAnimate(on: boolean): void {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('animate', '1');
    else next.delete('animate');
    setSearchParams(next, { replace: true, state: location.state });
  }

  function onDraftPeriod(p: GraphPeriod): void {
    setDraftPeriod(p);
    if (p !== 'custom') {
      setDraftFrom(undefined);
      setDraftTo(undefined);
    }
  }

  // Commit the draft → the canvas refetches once. A manual build drops the
  // incoming anchor (the user is driving now).
  function build(): void {
    if (!pending && !isFetching) return;
    setBuilt({
      categoryIds: draftCategoryIds,
      period: draftPeriod,
      from: draftFrom,
      to: draftTo,
      entitySel: draftEntitySel ? new Set(draftEntitySel) : null,
      articleIds: new Set(draftArticleIds),
      anchorEntityId: undefined,
    });
    setSelected(null);
  }

  // Clear draft AND build back to the default top-N overview.
  function reset(): void {
    setDraftCategoryIds([]);
    setDraftPeriod(DEFAULT_PERIOD);
    setDraftFrom(undefined);
    setDraftTo(undefined);
    setDraftEntitySel(null);
    setDraftArticleIds(new Set());
    setBuilt({
      categoryIds: [],
      period: DEFAULT_PERIOD,
      from: undefined,
      to: undefined,
      entitySel: null,
      articleIds: new Set(),
      anchorEntityId: undefined,
    });
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
      <PageHeader eyebrow="Graph" title="Relationships" />
      {/* Builder card — build inputs only. A Build click commits these in one
          /graph fetch. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-paper px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          build
        </span>
        <CategoryDropdown selected={draftCategoryIds} onChange={setDraftCategoryIds} />
        <EntityPickerDropdown
          selectedIds={checkedEntityIds}
          onChange={setDraftEntitySel}
          cap={selectionCap}
        />
        <PeriodChips value={draftPeriod} onChange={onDraftPeriod} showLabel={false} />
        <button
          type="button"
          onClick={() => setArticlesOpen((v) => !v)}
          className={
            'inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[13.5px] transition-colors ' +
            (articlesOpen || draftArticleIds.size > 0
              ? 'bg-paper2 text-ink'
              : 'bg-paper text-muted hover:text-ink')
          }
          title="Open the article picker (opens on the right)"
        >
          Articles
          {draftArticleIds.size > 0 ? (
            <span className="text-[11px]">({draftArticleIds.size})</span>
          ) : null}
          <span aria-hidden="true" className="text-mute2">›</span>
        </button>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="border border-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-muted hover:border-border hover:text-ink"
            title="Reset to defaults and rebuild"
          >
            reset
          </button>
          <button
            type="button"
            onClick={build}
            disabled={!pending && !isFetching}
            title={pending ? 'Apply changes to the canvas' : 'Canvas is up to date'}
            className={
              'inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[12.5px] transition-colors ' +
              (isFetching
                ? 'cursor-wait border-border bg-paper2 text-mute2'
                : pending
                  ? 'border-accent bg-accent text-paper hover:border-accent-deep hover:bg-accent-deep'
                  : 'cursor-not-allowed border-border bg-paper2 text-mute2')
            }
          >
            {isFetching ? 'Building…' : 'Build'}
            {!isFetching ? <span aria-hidden="true">→</span> : null}
          </button>
        </div>
      </div>
      {/* View controls — operate on the already-built graph (no fetch). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput
          value={graphQuery}
          onChange={setGraphQuery}
          placeholder="search graph…"
          widthClass="md:w-80"
        />
        <div className="ml-auto flex items-center gap-2.5 font-mono text-[12.5px] text-muted">
          <label
            className="flex items-center gap-1.5 hover:text-ink"
            title="Animate mentions edges in chronological direction (article → entity)"
          >
            <input
              type="checkbox"
              checked={animateRequested}
              onChange={(e) => setAnimate(e.target.checked)}
              className="h-3 w-3 accent-ink"
            />
            animate
          </label>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <GraphExportMenu
            getCanvasRoot={() => canvasRef.current}
            graph={filtered}
            filters={{
              period: built.period,
              from: built.from,
              to: built.to,
              nodeKind: 'both',
              categoryIds: built.categoryIds,
              anchorEntityId: explicitMode ? undefined : built.anchorEntityId,
            }}
          />
        </div>
      </div>
      <div className="flex min-h-[440px] flex-1 gap-0">
        <div ref={canvasRef} className="min-w-0 flex-1 border border-border bg-surface">
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
                onClick={() => {
                  setDraftPeriod('all');
                  setDraftFrom(undefined);
                  setDraftTo(undefined);
                  setBuilt((b) => ({
                    ...b,
                    period: 'all',
                    from: undefined,
                    to: undefined,
                  }));
                }}
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
                Animation off — {mentionsEdgeCount} mentions edges in view exceeds the cap of{' '}
                {ANIMATE_EDGE_CAP}.
              </p>
            ) : null}
          </div>
        </div>
        {selected ? (
          <GraphSidePanel selected={selected} onClose={() => setSelected(null)} />
        ) : null}
        {articlesOpen ? (
          <ArticlesPanel
            selectedEntityIds={draftEntitySel ?? new Set()}
            selectedArticleIds={draftArticleIds}
            onChangeArticles={setDraftArticleIds}
            onReset={reset}
            onClose={() => setArticlesOpen(false)}
            cap={selectionCap}
            period={draftPeriod}
            from={draftFrom}
            to={draftTo}
            categoryIds={draftCategoryIds}
          />
        ) : null}
      </div>
    </div>
  );
}
