import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { saveGraphView } from '../../store/graphViewSlice';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGetCategoriesQuery, useGetGraphQuery, useGetPublicConfigQuery } from '../../store/api';
import { CategoryDropdown } from '../../components/filters/CategoryDropdown';
import type { GraphEdge, GraphNode, GraphPeriod, GraphResponse } from '@intelligencehub/shared';
import { filterGraph } from './filter';
import { layout } from './layout';
import { weightAsOf, timelineBounds } from './timeline';
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
function sameSel(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null): boolean {
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
  const anchorEntityId = (location.state as { anchorEntityId?: string } | null)?.anchorEntityId;
  // `animate` stays URL-backed + instant — it's a client-only render toggle
  // (no fetch), unaffected by the build flow.
  const animateRequested = searchParams.get('animate') === '1';

  // Restore the previous /graph view when returning from a detail page. An
  // anchored arrival (clicking "view in graph" on an entity) is an explicit new
  // intent, so it overrides any saved snapshot. Read once for the initializers.
  const dispatch = useDispatch<AppDispatch>();
  const savedSnapshot = useSelector((s: RootState) => s.graphView.snapshot);
  const restore = anchorEntityId ? null : savedSnapshot;

  // --- Draft: what the builder edits. Changing these fetches NOTHING; they
  // only take effect when the user clicks Build. Seeded once from the URL so
  // existing /graph?category=…&period=… links still open as expected.
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>(() =>
    restore ? restore.draftCategoryIds : parseCsv(searchParams.get('category')),
  );
  const [draftPeriod, setDraftPeriod] = useState<GraphPeriod>(() => {
    if (restore) return restore.draftPeriod;
    const p = searchParams.get('period');
    return isGraphPeriod(p) ? p : DEFAULT_PERIOD;
  });
  const [draftFrom, setDraftFrom] = useState<string | undefined>(() =>
    restore ? restore.draftFrom : (searchParams.get('from') ?? undefined),
  );
  const [draftTo, setDraftTo] = useState<string | undefined>(() =>
    restore ? restore.draftTo : (searchParams.get('to') ?? undefined),
  );
  // null = untouched (the dropdown pre-checks the on-canvas top-N display-only);
  // a non-null set is an explicit entity pick.
  const [draftEntitySel, setDraftEntitySel] = useState<Set<string> | null>(() =>
    restore?.draftEntitySel ? new Set(restore.draftEntitySel) : null,
  );
  const [draftArticleIds, setDraftArticleIds] = useState<Set<string>>(() =>
    restore ? new Set(restore.draftArticleIds) : new Set(),
  );

  // --- Built: the committed params that actually drive the /graph fetch.
  // Initialised = draft defaults (+ any anchor) so the canvas auto-builds the
  // top-N on first load. Only Build / reset reassign this.
  const [built, setBuilt] = useState<BuiltParams>(() => {
    if (restore) {
      return {
        categoryIds: restore.built.categoryIds,
        period: restore.built.period,
        from: restore.built.from,
        to: restore.built.to,
        entitySel: restore.built.entitySel ? new Set(restore.built.entitySel) : null,
        articleIds: new Set(restore.built.articleIds),
        anchorEntityId: restore.built.anchorEntityId,
      };
    }
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

  const [articlesOpen, setArticlesOpen] = useState(() => restore?.articlesOpen ?? false);
  // Canvas-level text search: dims non-matching nodes by label. In-memory,
  // client-only — operates on the already-built graph, no fetch.
  const [graphQuery, setGraphQuery] = useState(() => restore?.graphQuery ?? '');
  // Timeline scrubber (FR-7 timeline mode). Opt-in: off → graph is fetched
  // WITHOUT timeline data and behaves exactly as before. `scrubT` is the
  // current "as-of" unix-seconds playhead; null = no scrub (show full totals).
  const [timelineOn, setTimelineOn] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // The 24h window is too short for a meaningful build-up replay — disable the
  // timeline there. Keyed on the BUILT period (what's on the canvas), not the
  // draft. `timelineActive` (used everywhere below) folds the disable in, so a
  // 24h build neither fetches nor renders timeline data even if the box was
  // ticked at a longer period — no effect / setState-in-effect needed.
  const timelineDisabled = built.period === '24h';
  const timelineActive = timelineOn && !timelineDisabled;
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
      built.entitySel && built.entitySel.size > 0 ? Array.from(built.entitySel) : undefined,
    selectedArticleIds: built.articleIds.size > 0 ? Array.from(built.articleIds) : undefined,
    timeline: timelineActive,
  });

  // Draft differs from what's currently built → Build is "pending" (glows).
  const pending =
    !sameIdList(draftCategoryIds, built.categoryIds) ||
    draftPeriod !== built.period ||
    draftFrom !== built.from ||
    draftTo !== built.to ||
    !sameSel(draftEntitySel, built.entitySel) ||
    !sameSel(draftArticleIds, built.articleIds);

  const [selected, setSelected] = useState<SelectedNode | null>(() => restore?.selected ?? null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // react-flow instance, captured on init so we can re-fit the view after each
  // Build (the `fitView` prop only fits on initial mount, not on data changes).
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // Persist the whole view to Redux on any change, so leaving /graph and coming
  // back restores this exact canvas + builder + open panel/selection (survives
  // navigation; a full page reload starts fresh by design).
  useEffect(() => {
    dispatch(
      saveGraphView({
        draftCategoryIds,
        draftPeriod,
        draftFrom,
        draftTo,
        draftEntitySel: draftEntitySel ? Array.from(draftEntitySel) : null,
        draftArticleIds: Array.from(draftArticleIds),
        built: {
          categoryIds: built.categoryIds,
          period: built.period,
          from: built.from,
          to: built.to,
          entitySel: built.entitySel ? Array.from(built.entitySel) : null,
          articleIds: Array.from(built.articleIds),
          anchorEntityId: built.anchorEntityId,
        },
        articlesOpen,
        graphQuery,
        selected,
      }),
    );
  }, [
    dispatch,
    draftCategoryIds,
    draftPeriod,
    draftFrom,
    draftTo,
    draftEntitySel,
    draftArticleIds,
    built,
    articlesOpen,
    graphQuery,
    selected,
  ]);

  // Entity ids currently on the canvas (from the BUILT graph). When the draft
  // entity selection is untouched, the dropdown pre-checks these so it reflects
  // what's shown; once the user picks, the draft set wins.
  const canvasEntityIds = useMemo(() => {
    const s = new Set<string>();
    if (data) for (const n of data.nodes) if (n.kind === 'entity') s.add(n.id);
    return s;
  }, [data]);
  const checkedEntityIds = draftEntitySel ?? canvasEntityIds;

  // Default canvas shows the top-N entities only; once a selection exists
  // (entities picked or articles added) we show both kinds so the connecting
  // article nodes + their edges appear. Article visibility is driven by
  // selection — add articles to see them, deselect to hide them.
  const filtered: GraphResponse | null = useMemo(() => {
    if (!data) return null;
    return filterGraph(data, explicitMode ? 'both' : 'entities');
  }, [data, explicitMode]);

  // Bounds of the co-mention buckets on the built graph (null when timeline
  // data isn't present). Drives the slider range.
  const bounds = useMemo(
    () => (filtered ? timelineBounds(filtered.edges) : null),
    [filtered],
  );

  // The timeline replays co-mention build-up, so it's only applicable when the
  // built graph actually has co-mention edges (≥2 co-mentioned entities) — and
  // not on the too-short 24h window. Used to disable the toggle.
  const hasCoMention = useMemo(
    () => !!filtered?.edges.some((e) => e.kind === 'co_mention'),
    [filtered],
  );
  const timelineUnavailable = timelineDisabled || !hasCoMention;

  // The graph projected to the scrub time: co_mention edges take their
  // weight-as-of(scrubT) (zero-weight dropped); entity nodes are kept only when
  // still incident to a visible co-mention edge (so the canvas fills in over
  // time). When the timeline is off or scrubT is null/at-max, this is identity.
  const timeFiltered: GraphResponse | null = useMemo(() => {
    if (!filtered) return null;
    if (!timelineActive || scrubT === null || !bounds || scrubT >= bounds.max) {
      return filtered;
    }
    const edges = filtered.edges.flatMap((e) => {
      if (e.kind !== 'co_mention') return [e]; // mention/similar unaffected in v1
      const w = weightAsOf(e.buckets, scrubT);
      return w > 0 ? [{ ...e, weight: w }] : [];
    });
    const liveEntityIds = new Set<string>();
    for (const e of edges) {
      if (e.kind === 'co_mention') {
        liveEntityIds.add(e.from);
        liveEntityIds.add(e.to);
      }
    }
    const nodes = filtered.nodes.filter(
      (n) => n.kind !== 'entity' || liveEntityIds.has(n.id),
    );
    return { nodes, edges };
  }, [filtered, timelineActive, scrubT, bounds]);

  const positions = useMemo(
    () =>
      filtered
        ? layout(filtered.nodes, filtered.edges)
        : new Map<string, { x: number; y: number }>(),
    [filtered],
  );

  const focus = useMemo(() => {
    if (!timeFiltered) return null;
    const q = graphQuery.trim().toLowerCase();
    if (q) {
      return new Set(
        timeFiltered.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id),
      );
    }
    if (!selected) return null;
    const onCanvas = timeFiltered.nodes.some((n) => n.id === selected.id);
    if (!onCanvas) return null;
    return computeFocusSet(selected.id, timeFiltered.edges);
  }, [timeFiltered, selected, graphQuery]);

  const nodes = useMemo(
    () => (timeFiltered ? toReactFlowNodes(timeFiltered.nodes, positions, focus) : []),
    [timeFiltered, positions, focus],
  );
  const mentionsEdgeCount = timeFiltered
    ? timeFiltered.edges.filter((e) => e.kind === 'mentions').length
    : 0;
  const animateCapped = animateRequested && mentionsEdgeCount > ANIMATE_EDGE_CAP;
  const animateEffective = animateRequested && !animateCapped;
  const edges = useMemo(
    () => (timeFiltered ? toReactFlowEdges(timeFiltered.edges, focus, animateEffective) : []),
    [timeFiltered, focus, animateEffective],
  );

  // Autoplay: step the playhead across buckets, ~1 step / 220ms, stop at max.
  // The stop-at-max state change is deferred (scheduled, not called inline) so
  // it doesn't trigger a cascading render synchronously within the effect.
  useEffect(() => {
    if (!playing || !bounds) return;
    if (scrubT !== null && scrubT >= bounds.max) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const buckets = [
      ...new Set(
        (filtered?.edges ?? []).flatMap((e) => e.buckets?.map((b) => b.t) ?? []),
      ),
    ].sort((a, b) => a - b);
    const cur = scrubT ?? bounds.min - 1;
    const next = buckets.find((t) => t > cur) ?? bounds.max;
    const id = setTimeout(() => setScrubT(next), 220);
    return () => clearTimeout(id);
  }, [playing, scrubT, bounds, filtered]);

  // Re-fit the view whenever a new graph is built (the `fitView` prop only fits
  // on initial mount, not on data changes). rAF so it runs after the new node
  // set has laid out. Keyed on `data` (the built fetch result), so it fits on
  // Build, not on every scrub frame.
  useEffect(() => {
    const inst = rfRef.current;
    if (!inst || !data || data.nodes.length === 0) return;
    const raf = requestAnimationFrame(() =>
      inst.fitView({ padding: 0.2, duration: 300 }),
    );
    return () => cancelAnimationFrame(raf);
  }, [data]);

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
    // Entity selection to commit:
    //  - user explicitly picked entities → use that draft set.
    //  - user added articles WITHOUT touching the entity dropdown → seed from
    //    the currently-displayed top-N entities, so they persist on the canvas
    //    instead of vanishing (explicit mode with an empty entity set would
    //    otherwise render only the picked articles).
    //  - otherwise → null (default top-N path).
    const entitySel: Set<string> | null = draftEntitySel
      ? new Set(draftEntitySel)
      : draftArticleIds.size > 0 && canvasEntityIds.size > 0
        ? new Set(canvasEntityIds)
        : null;
    setBuilt({
      categoryIds: draftCategoryIds,
      period: draftPeriod,
      from: draftFrom,
      to: draftTo,
      entitySel,
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
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">build</span>
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
          <span aria-hidden="true" className="text-mute2">
            ›
          </span>
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
          <label
            className={
              'flex items-center gap-1.5 ' +
              (timelineUnavailable
                ? 'cursor-not-allowed opacity-40'
                : 'hover:text-ink')
            }
            title={
              timelineDisabled
                ? 'Timeline needs a longer window than 24h'
                : !hasCoMention
                  ? 'No co-mention relationships to replay in this view'
                  : 'Replay how co-mention relationships built up over the period'
            }
          >
            <input
              type="checkbox"
              checked={timelineActive && hasCoMention}
              disabled={timelineUnavailable}
              onChange={(e) => {
                setTimelineOn(e.target.checked);
                setScrubT(null);
                setPlaying(false);
              }}
              className="h-3 w-3 accent-ink"
            />
            timeline
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
              nodeKind: explicitMode ? 'both' : 'entities',
              categoryIds: built.categoryIds,
              anchorEntityId: explicitMode ? undefined : built.anchorEntityId,
            }}
          />
        </div>
      </div>
      {timelineActive && bounds ? (
        <div className="flex items-center gap-3 border border-border bg-paper px-3 py-2 font-mono text-[12px] text-muted">
          <button
            type="button"
            onClick={() => {
              if (scrubT === null || scrubT >= bounds.max) setScrubT(bounds.min);
              setPlaying((p) => !p);
            }}
            className="border border-border px-2 py-0.5 text-ink hover:bg-paper2"
            aria-label={playing ? 'Pause timeline' : 'Play timeline'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={3600}
            value={scrubT ?? bounds.max}
            onChange={(e) => {
              setPlaying(false);
              setScrubT(Number(e.target.value));
            }}
            className="flex-1 accent-ink"
            aria-label="Timeline position"
          />
          <span className="tnum whitespace-nowrap text-ink">
            {new Date((scrubT ?? bounds.max) * 1000).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      ) : null}
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
              onInit={(inst) => {
                rfRef.current = inst;
              }}
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
        {selected ? <GraphSidePanel selected={selected} onClose={() => setSelected(null)} /> : null}
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
