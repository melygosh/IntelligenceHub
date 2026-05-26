import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const { data, isLoading } = useGetArticlesQuery({ categoryId });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Articles
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">Your feed</h1>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
          <span>most recent first</span>
          {data ? (
            <>
              <Sep />
              <span className="tnum text-ink">{data.articles.length} total</span>
            </>
          ) : null}
        </div>
        <div className="mt-2">
          <CategoryFilter selected={categoryId} onChange={setCategoryId} />
        </div>
      </header>

      {isLoading ? (
        <p className="font-mono text-[11px] text-mute2">Loading…</p>
      ) : !data || data.articles.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[18px] text-ink">No articles yet</p>
          <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
            Add a feed in <Link to="/feeds" className="text-accent hover:text-accent-deep">Feeds</Link>{' '}
            and click <span className="text-ink">pull now</span> to populate.
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
