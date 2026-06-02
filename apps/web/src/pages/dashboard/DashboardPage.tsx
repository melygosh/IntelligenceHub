import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  DashboardPeriod,
  DashboardTopCategory,
  DashboardTopEntity,
  DashboardTopFeed,
  GraphPeriod,
} from '@intelligencehub/shared';
import { useGetCategoriesQuery, useGetDashboardQuery } from '../../store/api';
import { useArticleAnalyzedEvents } from '../../events/useArticleAnalyzedEvents';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PeriodChips } from '../../components/filters/PeriodChips';
import { buildCategoryColours, categoryColour } from '../graph/graph-palette';

const DEFAULT_PERIOD: DashboardPeriod = '7d';

function isPeriod(s: string | null): s is DashboardPeriod {
  return s === 'all' || s === '24h' || s === '7d' || s === '30d' || s === 'custom';
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const period: DashboardPeriod = isPeriod(params.get('period'))
    ? (params.get('period') as DashboardPeriod)
    : DEFAULT_PERIOD;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const { data, isLoading } = useGetDashboardQuery({ period, from, to });
  // Same index-based category→colour map as the graph, so the dots here match
  // the graph legend/canvas.
  const { data: cats } = useGetCategoriesQuery();
  const categoryColours = useMemo(
    () => buildCategoryColours(cats?.categories.map((c) => c.id) ?? []),
    [cats],
  );
  // SSE: refresh the cards when new articles become ready so totals stay
  // fresh while the user has /dashboard open and feed-pull is running.
  useArticleAnalyzedEvents();

  function updatePeriod(next: GraphPeriod): void {
    const nextParams = new URLSearchParams(params);
    if (next === DEFAULT_PERIOD) nextParams.delete('period');
    else nextParams.set('period', next);
    if (next !== 'custom') {
      nextParams.delete('from');
      nextParams.delete('to');
    }
    setParams(nextParams, { replace: true });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="/dashboard"
        title="Dashboard"
        subtitle="Top entities, categories, and feeds for the chosen window. Deterministic — no LLM call."
      />
      <PeriodChips value={period} onChange={updatePeriod} />

      {isLoading ? (
        <LoadingHint />
      ) : !data ? (
        <div className="border border-dashed border-border">
          <EmptyState title="Dashboard unavailable" />
        </div>
      ) : data.totalArticles === 0 ? (
        <div className="border border-dashed border-border">
          <EmptyState
            title="No articles in this window"
            subtitle={
              <>
                Widen the window or add a feed in{' '}
                <Link to="/feeds" className="text-accent hover:text-accent-deep">
                  Feeds
                </Link>
                .
              </>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-muted">
            <span className="tnum text-ink">{data.totalArticles} articles</span>
            <span aria-hidden>·</span>
            <span>scoped to {period === 'all' ? 'all time' : `last ${period}`}</span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <TopEntitiesCard rows={data.topEntities} colours={categoryColours} />
            <TopCategoriesCard rows={data.topCategories} total={data.totalArticles} />
            <TopFeedsCard rows={data.topFeeds} />
          </div>
        </>
      )}
    </div>
  );
}

function CardShell({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-paper">
      <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{title}</h2>
        <span className="font-mono text-[11.5px] tnum text-mute2">
          {count > 0 ? `top ${count}` : '—'}
        </span>
      </header>
      <div className="p-3">
        {count === 0 ? <p className="font-mono text-[12.5px] text-mute2">{empty}</p> : children}
      </div>
    </section>
  );
}

function TopEntitiesCard({
  rows,
  colours,
}: {
  rows: DashboardTopEntity[];
  colours: ReadonlyMap<string, string>;
}) {
  return (
    <CardShell title="Top entities" count={rows.length} empty="No mentions yet.">
      <ol className="flex flex-col">
        {rows.map((e, i) => (
          <li key={e.id} className="flex items-center gap-2 py-1.5">
            <span className="w-5 font-mono text-[11.5px] tnum text-mute2">{i + 1}</span>
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0"
              style={{ background: categoryColour(colours, e.dominantCategoryId) }}
            />
            <Link
              to={`/entities/${e.id}`}
              className="min-w-0 flex-1 truncate text-ink hover:text-accent-deep"
            >
              {e.canonicalName}
            </Link>
            <span className="font-mono text-[11.5px] text-mute2">{e.type}</span>
            <span className="w-9 text-right font-mono text-[12.5px] tnum text-ink">
              {e.mentionCount}
            </span>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

function TopCategoriesCard({ rows, total }: { rows: DashboardTopCategory[]; total: number }) {
  const max = rows.reduce((m, r) => Math.max(m, r.articleCount), 0);
  return (
    <CardShell
      title="Top categories"
      count={rows.length}
      empty="No categorised articles in this window."
    >
      <ol className="flex flex-col gap-2">
        {rows.map((c, i) => {
          const pct = total === 0 ? 0 : (c.articleCount / total) * 100;
          const barFraction = max === 0 ? 0 : c.articleCount / max;
          return (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-5 font-mono text-[11.5px] tnum text-mute2">{i + 1}</span>
                <Link
                  to={`/articles?category=${c.id}`}
                  className="min-w-0 flex-1 truncate text-ink hover:text-accent-deep"
                >
                  {c.name}
                </Link>
                <span className="w-9 text-right font-mono text-[12.5px] tnum text-ink">
                  {c.articleCount}
                </span>
                <span className="w-10 text-right font-mono text-[11.5px] tnum text-mute2">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="ml-7 h-1 bg-paper2">
                <div className="h-1 bg-ink" style={{ width: `${barFraction * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </CardShell>
  );
}

function TopFeedsCard({ rows }: { rows: DashboardTopFeed[] }) {
  return (
    <CardShell title="Top feeds" count={rows.length} empty="No feed activity in this window.">
      <ol className="flex flex-col">
        {rows.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2 py-1.5">
            <span className="w-5 font-mono text-[11.5px] tnum text-mute2">{i + 1}</span>
            <FeedStatusPip status={f.status} />
            <Link
              to={`/articles?feed=${f.id}`}
              className="min-w-0 flex-1 truncate text-ink hover:text-accent-deep"
            >
              {f.title ?? '(deleted feed)'}
            </Link>
            <span className="w-9 text-right font-mono text-[12.5px] tnum text-ink">
              {f.articleCount}
            </span>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

function FeedStatusPip({ status }: { status: DashboardTopFeed['status'] }) {
  const cls =
    status === 'active'
      ? 'bg-accent'
      : status === 'paused'
        ? 'bg-mute2'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-mute2 opacity-50';
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`}
      title={status ?? 'detached'}
    />
  );
}
