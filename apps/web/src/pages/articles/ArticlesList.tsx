import { useGetArticlesQuery } from '../../store/api';
import type { ArticleListItem, ArticleEntitySummary } from '@intelligencehub/shared';

const Sep = () => <span className="text-border2">·</span>;

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
    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted">
      <span className="text-mute2">{TYPE_GLYPH[entity.type]}</span>
      <span>{entity.canonicalName}</span>
    </span>
  );
}

function ArticleRow({ article }: { article: ArticleListItem }) {
  const date = new Date(article.ts);
  return (
    <li className="flex gap-3 px-1 py-3">
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
        </div>
      </div>
    </li>
  );
}

export default function ArticlesList() {
  const { data, isLoading } = useGetArticlesQuery();

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
      </header>

      {isLoading ? (
        <p className="font-mono text-[11px] text-mute2">Loading…</p>
      ) : !data || data.articles.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[18px] text-ink">No articles yet</p>
          <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
            Add a feed in <a href="/feeds" className="text-accent hover:text-accent-deep">Feeds</a>{' '}
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
