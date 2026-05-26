import { Link, useParams } from 'react-router-dom';
import { useGetArticleQuery } from '../../store/api';
import type { ArticleEntitySummary } from '@intelligencehub/shared';

const TYPE_GLYPH: Record<ArticleEntitySummary['type'], React.ReactNode> = {
  company: <span className="inline-block h-1.5 w-1.5 bg-current" />,
  person: <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />,
  product: <span className="inline-block h-1.5 w-1.5 rounded-sm bg-current" />,
  technology: <span className="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />,
  location: <span className="inline-block h-1.5 w-1.5 rounded-full border border-current bg-transparent" />,
};

const IMPORTANCE_COLOR: Record<string, string> = {
  high: 'bg-accent',
  normal: 'bg-muted',
  junk: 'bg-mute2',
};

const Sep = () => <span className="text-border2">·</span>;

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetArticleQuery(id ?? '', { skip: !id });

  if (isLoading) {
    return <p className="font-mono text-[13px] text-mute2">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[22px] text-ink">Article not found</p>
        <p className="mt-2 font-mono text-[14px] text-muted">
          Back to <Link to="/articles" className="text-accent hover:text-accent-deep">all articles</Link>.
        </p>
      </div>
    );
  }

  const date = new Date(data.ts);

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Articles › Article
        </div>
        <h1 className="pretty font-serif text-[30px] leading-tight text-ink">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-muted">
          {data.importance ? (
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 ${IMPORTANCE_COLOR[data.importance] ?? 'bg-border'}`} />
              <span className="uppercase tracking-[0.06em] text-ink">{data.importance}</span>
            </span>
          ) : null}
          <Sep />
          <span className="tnum">
            {date.toLocaleString(undefined, {
              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <Sep />
          <span>
            from <span className="text-ink">{data.feedTitle}</span>
          </span>
          <Sep />
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-deep"
          >
            open source ↗
          </a>
        </div>
      </header>

      {data.summary ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Summary</div>
          <p className="pretty font-serif text-[18px] leading-relaxed text-ink">{data.summary}</p>
        </section>
      ) : null}

      {data.body ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Full text</div>
          <p className="pretty whitespace-pre-wrap font-serif text-[17px] leading-relaxed text-ink">
            {data.body}
          </p>
        </section>
      ) : null}

      {data.entities.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Entities</div>
          <ul className="flex flex-wrap gap-2">
            {data.entities.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/entities/${e.id}`}
                  className="inline-flex items-center gap-1.5 border border-border bg-paper px-2 py-1 font-mono text-[13px] text-ink hover:bg-paper2"
                >
                  <span className="text-mute2">{TYPE_GLYPH[e.type]}</span>
                  <span>{e.canonicalName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.categoryNames.length > 0 || data.axisAssignments.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {data.categoryNames.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Categories</div>
              <ul className="flex flex-wrap gap-1.5">
                {data.categoryNames.map((n) => (
                  <li
                    key={n}
                    className="border border-border bg-paper px-1.5 py-px font-mono text-[12px] uppercase tracking-[0.06em] text-muted"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.axisAssignments.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Axes</div>
              <ul className="space-y-0.5 font-mono text-[13px]">
                {data.axisAssignments.map((a) => (
                  <li key={`${a.axisName}:${a.value}`} className="flex items-baseline gap-2">
                    <span className="text-muted">{a.axisName}</span>
                    <span className="text-ink">{a.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {data.similarCount > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Found {data.similarCount} similar in other feeds
          </div>
          <ul className="divide-y divide-border">
            {data.similarArticles.map((s) => {
              const sDate = new Date(s.ts);
              return (
                <li key={s.id} className="flex flex-wrap items-baseline gap-2 py-2">
                  <Link
                    to={`/articles/${s.id}`}
                    className="pretty flex-1 text-[16px] text-ink hover:text-accent-deep"
                  >
                    {s.title}
                  </Link>
                  <span className="font-mono text-[12.5px] text-mute2">
                    from <span className="text-muted">{s.feedTitle}</span>{' '}
                    · <span className="tnum">{sDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>{' '}
                    ·{' '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-deep"
                    >
                      open ↗
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
