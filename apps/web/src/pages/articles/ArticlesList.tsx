import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useGetArticleQuery,
  useGetArticlesQuery,
  useGetCategoriesQuery,
  useGetFeedsQuery,
} from '../../store/api';
import type { ArticleListItem, ArticleEntitySummary, Feed } from '@intelligencehub/shared';
import { EntityGlyph } from '../../components/entities/EntityGlyph';
import { IMP_STYLE } from '../../components/articles/importance';
import { FacetDropdown, CheckboxIcon } from '../../components/filters/FacetDropdown';
import { SearchInput } from '../../components/filters/SearchInput';

const Sep = () => <span className="text-border2">·</span>;

function CategoryDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useGetCategoriesQuery();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valueLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (data?.categories.find((c) => c.id === selected[0])?.name ?? '1 selected')
        : `${selected.length} selected`;
  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <FacetDropdown label="Category" valueLabel={valueLabel} isActive={selected.length > 0}>
      {() => (
        <>
          {data?.categories.map((c) => {
            const on = selectedSet.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                  (on ? 'text-ink' : 'text-muted')
                }
              >
                <CheckboxIcon on={on} />
                <span>{c.name}</span>
              </button>
            );
          })}
          {selected.length > 0 ? (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="block w-full px-3 py-1.5 text-left font-mono text-[12.5px] text-mute2 hover:bg-paper2 hover:text-ink"
              >
                Clear selection
              </button>
            </>
          ) : null}
        </>
      )}
    </FacetDropdown>
  );
}

const IMPORTANCE_OPTIONS: { value: 'high' | 'normal' | 'junk'; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'junk', label: 'Junk' },
];

function ImportanceDropdown({
  selected,
  onChange,
}: {
  selected: ('high' | 'normal' | 'junk')[];
  onChange: (imps: ('high' | 'normal' | 'junk')[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valueLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? IMPORTANCE_OPTIONS.find((o) => o.value === selected[0])?.label ?? '1 selected'
        : `${selected.length} selected`;
  const toggle = (v: 'high' | 'normal' | 'junk') => {
    if (selectedSet.has(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  };
  return (
    <FacetDropdown
      label="Importance"
      valueLabel={valueLabel}
      isActive={selected.length > 0}
    >
      {() => (
        <>
          {IMPORTANCE_OPTIONS.map((o) => {
            const on = selectedSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                  (on ? 'text-ink' : 'text-muted')
                }
              >
                <CheckboxIcon on={on} />
                <span>{o.label}</span>
              </button>
            );
          })}
          {selected.length > 0 ? (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="block w-full px-3 py-1.5 text-left font-mono text-[12.5px] text-mute2 hover:bg-paper2 hover:text-ink"
              >
                Clear selection
              </button>
            </>
          ) : null}
        </>
      )}
    </FacetDropdown>
  );
}

type Period = 'all' | '24h' | '7d' | '30d' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  all: 'All',
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  custom: 'Custom',
};

function isPeriod(s: string | null): s is Period {
  return s === 'all' || s === '24h' || s === '7d' || s === '30d' || s === 'custom';
}

function parseCsvParam(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const tok of raw.split(',')) {
    const t = tok.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

const PERIOD_SUBTITLE: Record<Period, string> = {
  all: 'all time',
  '24h': 'last 24h',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  custom: 'custom range',
};

/** Summarise the active filters in one mono line. Empty filters render as
 * "no active filters · all sources, all importances, all time" per the design. */
function buildFilterSubtitle(opts: {
  categoryIds: string[];
  importances: ('high' | 'normal' | 'junk')[];
  period: Period;
  from: string;
  to: string;
  q: string;
  feedsData: { feeds: Feed[] } | undefined;
  categoriesData: { categories: { id: string; name: string }[] } | undefined;
}): string {
  const parts: string[] = [];
  if (opts.categoryIds.length > 0) {
    if (opts.categoryIds.length === 1) {
      const name = opts.categoriesData?.categories.find(
        (c) => c.id === opts.categoryIds[0],
      )?.name;
      parts.push(`category: ${name ?? opts.categoryIds[0].slice(0, 8)}`);
    } else {
      parts.push(`${opts.categoryIds.length} categories`);
    }
  }
  if (opts.importances.length > 0) {
    parts.push(`importance: ${opts.importances.join(', ')}`);
  }
  if (opts.period !== 'all') {
    if (opts.period === 'custom' && opts.from && opts.to) {
      parts.push(`date: ${opts.from} → ${opts.to}`);
    } else {
      parts.push(`date: ${PERIOD_SUBTITLE[opts.period]}`);
    }
  }
  if (opts.q) parts.push(`matching "${opts.q}"`);
  if (parts.length === 0) {
    return 'no active filters · all sources, all importances, all time';
  }
  return parts.join(' · ');
}

function DateDropdown({
  period,
  from,
  to,
  onPeriodChange,
  onCustomChange,
}: {
  period: Period;
  from: string;
  to: string;
  onPeriodChange: (p: Period) => void;
  onCustomChange: (from: string, to: string) => void;
}) {
  const customInvalid =
    period === 'custom' && from && to && new Date(from) > new Date(to);
  const valueLabel = period === 'all' ? null : PERIOD_LABELS[period];
  return (
    <FacetDropdown
      label="Date"
      valueLabel={valueLabel}
      isActive={period !== 'all'}
      panelClassName="min-w-[340px] px-3 py-2.5"
    >
      {(close) => (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onPeriodChange(p);
                  if (p !== 'custom') close();
                }}
                aria-pressed={period === p}
                className={
                  'border px-2 py-0.5 font-mono text-[12.5px] transition-colors ' +
                  (period === p
                    ? 'border-ink bg-ink text-paper'
                    : 'border-border bg-paper text-ink hover:bg-paper2')
                }
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => onCustomChange(e.target.value, to)}
                className="border border-border bg-paper px-1.5 py-0.5 font-mono text-[12.5px]"
              />
              <span className="font-mono text-[12.5px] text-mute2">→</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => onCustomChange(from, e.target.value)}
                className="border border-border bg-paper px-1.5 py-0.5 font-mono text-[12.5px]"
              />
              {customInvalid ? (
                <span className="font-mono text-[12.5px] text-critical">from &gt; to</span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </FacetDropdown>
  );
}

function ImportanceDot({ level }: { level: ArticleListItem['importance'] }) {
  if (!level) {
    return <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 bg-border" />;
  }
  const s = IMP_STYLE[level];
  return (
    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0" style={{ background: s.dot }} />
  );
}

function ImportanceBadge({ level }: { level: ArticleListItem['importance'] }) {
  if (!level) return null;
  const s = IMP_STYLE[level];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[11.5px] uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.dot}55` }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
      {level}
    </span>
  );
}

function SimilarBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count < 1) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="group inline-flex items-baseline gap-1 border border-accent/40 bg-accent/10 px-1.5 py-px font-mono text-[12.5px] text-accent transition-colors hover:border-accent hover:bg-accent hover:text-paper"
    >
      <svg viewBox="0 0 10 10" className="h-2 w-2 self-center">
        <path d="M1 5 L5 1 L9 5 L5 9 Z" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
      <span className="tnum">{count}</span>
      <span>similar</span>
    </button>
  );
}

function SourceFavicon({ feed }: { feed: Feed | undefined }) {
  // Real favicon if the feed exposed one in its RSS/Atom metadata
  // (Day 14 — feeds.icon_url). Otherwise the inverted-ink initials block.
  const [loadFailed, setLoadFailed] = useState(false);
  if (feed?.iconUrl && !loadFailed) {
    return (
      <img
        src={feed.iconUrl}
        alt=""
        className="h-3.5 w-3.5 shrink-0 object-contain"
        onError={() => setLoadFailed(true)}
      />
    );
  }
  const seed = (feed?.title ?? feed?.url ?? '?').replace(/^https?:\/\//, '').replace(/^www\./, '');
  const initials = seed.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center bg-ink font-mono text-[8.5px] tracking-tighter text-paper">
      {initials}
    </span>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
      <path d="M4 2 H10 V8 M10 2 L3 9" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  );
}

function EntityChipInline({ entity }: { entity: ArticleEntitySummary }) {
  return (
    <Link
      to={`/entities/${entity.id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-[12.5px] text-muted hover:text-ink"
    >
      <span className="inline-flex h-3 w-3 items-center justify-center text-mute2">
        <EntityGlyph type={entity.type} />
      </span>
      <span>{entity.canonicalName}</span>
    </Link>
  );
}

function SimilarSidebar({
  articleId,
  onClose,
}: {
  articleId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useGetArticleQuery(articleId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const anchorTs = data ? new Date(data.ts) : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Similar in other sources"
        className="fixed right-0 top-0 z-50 flex h-screen w-[min(480px,100vw)] flex-col border-l border-border bg-paper shadow-[-12px_0_40px_-12px_rgba(28,26,22,0.25)]"
      >
        <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Similar in other sources{' '}
            <span className="tnum text-ink">{data?.similarArticles.length ?? '—'}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-baseline gap-1.5 font-mono text-[12.5px] text-muted hover:text-ink"
          >
            close{' '}
            <kbd className="border border-border bg-paper2 px-1 py-px font-mono text-[10.5px] text-mute2">
              esc
            </kbd>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-5 py-6 font-mono text-[12.5px] text-mute2">Loading…</div>
          ) : isError || !data ? (
            <div className="px-5 py-6 font-mono text-[12.5px] text-critical">
              Couldn't load similar articles.
            </div>
          ) : (
            <>
              {/* Anchor block */}
              <section className="border-b border-border bg-paper2/40 px-5 py-4">
                <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  Anchor
                </div>
                <div className="flex items-start gap-2">
                  <ImportanceDot level={data.importance} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/articles/${data.id}`}
                      onClick={onClose}
                      className="pretty text-[14.5px] font-medium leading-snug text-ink hover:text-accent"
                    >
                      {data.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px] text-mute2">
                      <span className="text-muted">{data.feedTitle}</span>
                      {anchorTs ? (
                        <>
                          <Sep />
                          <span className="tnum text-muted">
                            {anchorTs.toISOString().slice(0, 16).replace('T', ' ')} UTC
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {/* Similar list */}
              {data.similarArticles.length === 0 ? (
                <div className="px-5 py-10 text-center font-mono text-[12.5px] text-mute2">
                  No other sources covered this story.
                </div>
              ) : (
                <ol>
                  {data.similarArticles.map((s, i) => (
                    <li
                      key={s.id}
                      className="grid grid-cols-[28px_1fr] gap-x-3 border-b border-border px-5 py-3 last:border-b-0 hover:bg-paper2/40"
                    >
                      <span className="pt-0.5 font-mono text-[12px] tnum text-mute2">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[12px] text-muted">
                          <span>{s.feedTitle}</span>
                          <Sep />
                          <span className="tnum text-mute2" title={s.ts}>
                            {fmtRelative(s.ts)}
                          </span>
                        </div>
                        <Link
                          to={`/articles/${s.id}`}
                          onClick={onClose}
                          className="pretty mt-1 block text-[14px] leading-snug text-ink hover:text-accent"
                        >
                          {s.title}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-[11.5px] text-mute2">
          <span>Same content_hash or normalized URL</span>
          {data ? (
            <Link
              to={`/articles/${data.id}`}
              onClick={onClose}
              className="text-accent hover:text-accent-deep"
            >
              open anchor article →
            </Link>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function ArticleRow({
  article,
  feed,
  onOpenSimilar,
}: {
  article: ArticleListItem;
  feed: Feed | undefined;
  onOpenSimilar: (articleId: string) => void;
}) {
  const date = new Date(article.ts);
  const isJunk = article.importance === 'junk';
  return (
    <article className="group grid grid-cols-[14px_1fr] gap-x-3 border-b border-border px-5 py-3 last:border-b-0 hover:bg-paper2/60">
      <ImportanceDot level={article.importance} />
      <div className="min-w-0">
        {/* Title row with hover-only external link */}
        <div className="flex items-baseline gap-2">
          <Link
            to={`/articles/${article.id}`}
            className={
              'pretty leading-snug hover:text-accent ' +
              (isJunk
                ? 'text-[14.5px] italic text-muted'
                : 'text-[15.5px] font-medium text-ink')
            }
          >
            {article.title}
          </Link>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open original"
            className="opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 focus:opacity-100"
          >
            <ExternalIcon />
          </a>
        </div>

        {/* Optional 2-line summary clamp */}
        {article.summary && !isJunk ? (
          <div
            className="pretty mt-1 text-[13px] leading-snug text-muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.summary}
          </div>
        ) : null}

        {/* Meta strip */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px] text-mute2">
          <span className="inline-flex items-center gap-1.5">
            <SourceFavicon feed={feed} />
            <span className="text-muted">{feed?.title ?? 'Unknown source'}</span>
          </span>
          <Sep />
          <span className="tnum text-muted" title={date.toISOString()}>
            {date.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {article.importance ? (
            <>
              <Sep />
              <ImportanceBadge level={article.importance} />
            </>
          ) : null}
          {article.similarCount > 0 ? (
            <>
              <Sep />
              <SimilarBadge
                count={article.similarCount}
                onClick={() => onOpenSimilar(article.id)}
              />
            </>
          ) : null}
          {article.categoryNames.length > 0 ? (
            <>
              <Sep />
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {article.categoryNames.map((n) => (
                  <span
                    key={n}
                    className="border border-border bg-paper2 px-1.5 py-px font-mono text-[11.5px] text-muted"
                  >
                    {n}
                  </span>
                ))}
              </span>
            </>
          ) : null}
          {article.entities.length > 0 ? (
            <>
              <Sep />
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {article.entities.slice(0, 4).map((e) => (
                  <EntityChipInline key={e.id} entity={e} />
                ))}
                {article.entities.length > 4 ? (
                  <span className="font-mono text-[12.5px] tnum text-mute2">
                    +{article.entities.length - 4}
                  </span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ArticlesList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryIds = useMemo(
    () => parseCsvParam(searchParams.get('category')),
    [searchParams],
  );
  const importances = useMemo(
    () =>
      parseCsvParam(searchParams.get('importance')).filter(
        (v): v is 'high' | 'normal' | 'junk' =>
          v === 'high' || v === 'normal' || v === 'junk',
      ),
    [searchParams],
  );
  const rawPeriod = searchParams.get('period');
  const period: Period = isPeriod(rawPeriod) ? rawPeriod : 'all';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const q = searchParams.get('q') ?? '';

  const customInvalid =
    period === 'custom' && from && to && new Date(from) > new Date(to);
  const customIncomplete = period === 'custom' && (!from || !to);

  // Convert local-date `from`/`to` strings to UTC ISO datetimes for the API.
  // `<input type="date">` produces 'YYYY-MM-DD' (local midnight). We treat
  // those as inclusive UTC bounds for simplicity.
  const apiFrom = period === 'custom' && from ? `${from}T00:00:00.000Z` : undefined;
  const apiTo = period === 'custom' && to ? `${to}T23:59:59.999Z` : undefined;

  const { data, isLoading, error } = useGetArticlesQuery(
    customInvalid || customIncomplete
      ? { categoryIds, importances }
      : {
          categoryIds,
          importances,
          period,
          from: apiFrom,
          to: apiTo,
          q: q || undefined,
        },
  );
  const { data: feedsData } = useGetFeedsQuery();
  const { data: categoriesData } = useGetCategoriesQuery();
  const [openSimilarId, setOpenSimilarId] = useState<string | null>(null);

  // feedId → Feed lookup for the per-row source pill (title + iconUrl).
  // Reactive: refetched when SSE feed.pull.done fires (Day-13 hook).
  const feedById = useMemo(() => {
    const m = new Map<string, Feed>();
    for (const f of feedsData?.feeds ?? []) m.set(f.id, f);
    return m;
  }, [feedsData]);

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  const filterSubtitle = useMemo(
    () =>
      buildFilterSubtitle({
        categoryIds,
        importances,
        period,
        from,
        to,
        q,
        feedsData,
        categoriesData,
      }),
    [categoryIds, importances, period, from, to, q, feedsData, categoriesData],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          /articles
        </div>
        <h1 className="pretty font-serif text-[30px] leading-tight text-ink">
          Your feed
        </h1>
      </header>

      <div className="border border-border bg-paper">
        {/* Toolbar row: filters + search, all left-grouped */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-5 py-2.5">
          <ImportanceDropdown
            selected={importances}
            onChange={(imps) =>
              updateParams({ importance: imps.length > 0 ? imps.join(',') : undefined })
            }
          />
          <CategoryDropdown
            selected={categoryIds}
            onChange={(ids) =>
              updateParams({ category: ids.length > 0 ? ids.join(',') : undefined })
            }
          />
          <DateDropdown
            period={period}
            from={from}
            to={to}
            onPeriodChange={(p) =>
              updateParams({
                period: p === 'all' ? undefined : p,
                from: p === 'custom' ? from || undefined : undefined,
                to: p === 'custom' ? to || undefined : undefined,
              })
            }
            onCustomChange={(f, t) =>
              updateParams({ from: f || undefined, to: t || undefined })
            }
          />
          <div className="flex-1" />
          <SearchInput
            value={q}
            onChange={(v) => updateParams({ q: v || undefined })}
            placeholder="search title, entity, summary…"
          />
        </div>

        {/* Subtitle row: active filters on the left, sort + count on the right */}
        <div className="flex items-baseline justify-between gap-3 border-b border-border bg-paper2/40 px-5 py-1.5 font-mono text-[12.5px] text-mute2">
          <span>{filterSubtitle}</span>
          <span className="tnum">
            {q ? 'sort relevance' : 'sort newest first'}
            {data ? (
              <>
                {' '}· <span className="text-ink">{data.articles.length}</span> articles
              </>
            ) : null}
          </span>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="px-5 py-10 text-center font-mono text-[13px] text-mute2">
            Loading…
          </div>
        ) : error ? (
          <div className="px-5 py-10 text-center">
            <p className="font-serif text-[22px] text-critical">Couldn't load articles</p>
            <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
              {(error as { data?: { message?: string } }).data?.message ??
                'Try a different filter or refresh the page.'}
            </p>
          </div>
        ) : !data || data.articles.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-serif text-[22px] text-ink">No articles match</p>
            <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
              Try a different filter, or add a feed in{' '}
              <Link to="/feeds" className="text-accent hover:text-accent-deep">
                Feeds
              </Link>
              .
            </p>
          </div>
        ) : (
          data.articles.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              feed={feedById.get(a.feedId)}
              onOpenSimilar={setOpenSimilarId}
            />
          ))
        )}
      </div>

      {openSimilarId ? (
        <SimilarSidebar
          articleId={openSimilarId}
          onClose={() => setOpenSimilarId(null)}
        />
      ) : null}
    </div>
  );
}
