import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGetArticlesQuery, useGetCategoriesQuery } from '../../store/api';
import type { ArticleListItem, ArticleEntitySummary } from '@intelligencehub/shared';

const Sep = () => <span className="text-border2">·</span>;

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
      <label htmlFor="cat-filter">filter by category:</label>
      <select
        id="cat-filter"
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

type Period = 'all' | '24h' | '7d' | '30d' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  all: 'All',
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  custom: 'Custom',
};

function TimeWindowFilter({
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
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPeriodChange(p)}
          aria-pressed={period === p}
          className={
            'border border-border px-2 py-0.5 font-mono text-[10.5px] ' +
            (period === p ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-paper2')
          }
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
      {period === 'custom' ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => onCustomChange(e.target.value, to)}
            className="border border-border bg-paper px-1.5 py-0.5 font-mono text-[10.5px]"
          />
          <span className="font-mono text-[10.5px] text-mute2">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onCustomChange(from, e.target.value)}
            className="border border-border bg-paper px-1.5 py-0.5 font-mono text-[10.5px]"
          />
          {customInvalid ? (
            <span className="font-mono text-[10.5px] text-critical">from &gt; to</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 250);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="Search articles…"
      className="border border-border bg-paper px-2 py-0.5 font-mono text-[10.5px] placeholder:text-mute2"
    />
  );
}

const TYPE_GLYPH: Record<ArticleEntitySummary['type'], React.ReactNode> = {
  company: <span className="inline-block h-1.5 w-1.5 bg-current" />,
  person: <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />,
  product: <span className="inline-block h-1.5 w-1.5 rounded-sm bg-current" />,
  technology: <span className="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />,
  location: <span className="inline-block h-1.5 w-1.5 rounded-full border border-current bg-transparent" />,
};

function ImportanceDot({ level }: { level: ArticleListItem['importance'] }) {
  const color =
    level === 'high'
      ? 'bg-accent'
      : level === 'junk'
        ? 'bg-mute2'
        : level === 'normal'
          ? 'bg-muted'
          : 'bg-border';
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 ${color}`} />;
}

function EntityChipInline({ entity }: { entity: ArticleEntitySummary }) {
  return (
    <Link
      to={`/entities/${entity.id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted hover:text-ink"
    >
      <span className="text-mute2">{TYPE_GLYPH[entity.type]}</span>
      <span>{entity.canonicalName}</span>
    </Link>
  );
}

function ArticleRow({ article }: { article: ArticleListItem }) {
  const date = new Date(article.ts);
  return (
    <li className="hover:bg-paper2">
      <Link to={`/articles/${article.id}`} className="flex gap-3 px-1 py-3">
        <ImportanceDot level={article.importance} />
        <div className="min-w-0 flex-1">
          <h3 className="pretty text-[14.5px] font-medium leading-snug text-ink">{article.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-mute2">
            <span className="tnum">
              {date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {article.importance ? (
              <>
                <Sep />
                <span className="uppercase tracking-[0.06em] text-muted">{article.importance}</span>
              </>
            ) : null}
            {article.similarCount > 0 ? (
              <>
                <Sep />
                <span className="text-muted">{article.similarCount} similar</span>
              </>
            ) : null}
            {article.entities.length > 0 ? (
              <>
                <Sep />
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {article.entities.map((e) => (
                    <EntityChipInline key={e.id} entity={e} />
                  ))}
                </span>
              </>
            ) : null}
            {article.categoryNames.length > 0 ? (
              <>
                <Sep />
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {article.categoryNames.map((n) => (
                    <span
                      key={n}
                      className="border border-border bg-paper px-1 py-px font-mono text-[10px] uppercase tracking-[0.06em] text-muted"
                    >
                      {n}
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function ArticlesList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get('category') ?? undefined;
  const period = (searchParams.get('period') as Period | null) ?? 'all';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const q = searchParams.get('q') ?? '';

  const customInvalid =
    period === 'custom' && from && to && new Date(from) > new Date(to);

  // Convert local-date `from`/`to` strings to UTC ISO datetimes for the API.
  // `<input type="date">` produces 'YYYY-MM-DD' (local midnight). We treat
  // those as inclusive UTC bounds for simplicity.
  const apiFrom = period === 'custom' && from ? `${from}T00:00:00.000Z` : undefined;
  const apiTo = period === 'custom' && to ? `${to}T23:59:59.999Z` : undefined;

  const { data, isLoading } = useGetArticlesQuery(
    customInvalid
      ? { categoryId }
      : { categoryId, period, from: apiFrom, to: apiTo, q: q || undefined },
  );

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Articles
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">
          Your feed
        </h1>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
          <span>most recent first (or by relevance when searching)</span>
          {data ? (
            <>
              <Sep />
              <span className="tnum text-ink">{data.articles.length} total</span>
            </>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CategoryFilter
            selected={categoryId}
            onChange={(id) => updateParams({ category: id })}
          />
          <TimeWindowFilter
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
          <SearchInput
            value={q}
            onChange={(v) => updateParams({ q: v || undefined })}
          />
        </div>
      </header>

      {isLoading ? (
        <p className="font-mono text-[11px] text-mute2">Loading…</p>
      ) : !data || data.articles.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[18px] text-ink">No articles match</p>
          <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
            Try a different filter, or add a feed in{' '}
            <Link to="/feeds" className="text-accent hover:text-accent-deep">
              Feeds
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.articles.map((a) => (
            <ArticleRow key={a.id} article={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
