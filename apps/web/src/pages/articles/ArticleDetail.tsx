import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Link, useParams } from 'react-router-dom';
import { useGetArticleQuery, useGetRelatedSemanticQuery } from '../../store/api';
import { useArticleEmbeddedEvents } from '../../events/useArticleEmbeddedEvents';
import type {
  ArticleDetail as ArticleDetailDto,
  ArticleEntitySummary,
} from '@intelligencehub/shared';
import { useSetPageTitle } from '../../components/layout/usePageTitle';
import { ArticleListCard } from '../../components/articles/ArticleListCard';
import { EntityGlyph } from '../../components/entities/EntityGlyph';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { Sep } from '../../components/ui/Sep';

type EntityType = ArticleEntitySummary['type'];

const TYPE_GROUP_ORDER: EntityType[] = [
  'company',
  'person',
  'product',
  'technology',
  'location',
  'unknown',
];
const TYPE_GROUP_LABEL: Record<EntityType, string> = {
  company: 'Companies',
  person: 'People',
  product: 'Products',
  technology: 'Technologies',
  location: 'Locations',
  unknown: 'Other',
};

const IMPORTANCE_COLOR: Record<string, string> = {
  high: 'bg-accent',
  normal: 'bg-muted',
  junk: 'bg-mute2',
};

function looksLikeHtml(s: string): boolean {
  // A "<" immediately followed by a tag-name letter or "/" is a strong HTML signal.
  return /<\/?[a-zA-Z]/.test(s);
}

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetArticleQuery(id ?? '', { skip: !id });
  // Semantic similarity (ADR-7). Hook always fires; the component renders
  // nothing when status='unavailable' (feature off) — no extra request
  // budget on accounts that haven't opted in.
  const { data: related } = useGetRelatedSemanticQuery(id ?? '', { skip: !id });
  // SSE invalidation: when the embed-backfill worker finishes for this
  // article, refetch related-semantic so the "computing embedding…"
  // placeholder flips to the real neighbour list without a reload.
  useArticleEmbeddedEvents();

  useSetPageTitle(data?.title);

  const body = data?.body ?? null;
  const sanitizedBody = useMemo(() => {
    if (!body) return null;
    if (!looksLikeHtml(body)) return null;
    return DOMPurify.sanitize(body, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'b',
        'i',
        'u',
        'a',
        'ul',
        'ol',
        'li',
        'blockquote',
        'code',
        'pre',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'img',
        'figure',
        'figcaption',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
    });
  }, [body]);

  const entitiesByType = useMemo(() => {
    const m = new Map<EntityType, ArticleDetailDto['entities']>();
    if (!data) return m;
    for (const e of data.entities) {
      const list = m.get(e.type) ?? [];
      list.push(e);
      m.set(e.type, list);
    }
    return m;
  }, [data]);

  if (isLoading) {
    return <LoadingHint />;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl border border-dashed border-border">
        <EmptyState
          title="Article not found"
          subtitle={
            <>
              Back to{' '}
              <Link to="/articles" className="text-accent hover:text-accent-deep">
                all articles
              </Link>
              .
            </>
          }
        />
      </div>
    );
  }

  const date = new Date(data.ts);

  return (
    <article className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="pretty font-serif text-[34px] leading-tight text-ink">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-muted">
          {data.importance ? (
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 ${IMPORTANCE_COLOR[data.importance] ?? 'bg-border'}`}
              />
              <span className="uppercase tracking-[0.06em] text-ink">{data.importance}</span>
            </span>
          ) : null}
          <Sep />
          <span className="tnum">
            {date.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
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
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Summary
          </div>
          <p className="pretty font-serif text-[19px] leading-relaxed text-ink text-justify">
            {data.summary}
          </p>
        </section>
      ) : null}

      {data.body ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Full text
          </div>
          {sanitizedBody ? (
            <div
              className="article-body pretty font-serif text-[17px] leading-relaxed text-ink text-justify"
              // sanitizedBody comes from DOMPurify with an explicit ALLOWED_TAGS/_ATTR list
              dangerouslySetInnerHTML={{ __html: sanitizedBody }}
            />
          ) : (
            <p className="pretty whitespace-pre-wrap font-serif text-[17px] leading-relaxed text-ink text-justify">
              {data.body}
            </p>
          )}
        </section>
      ) : null}

      {data.categoryNames.length > 0 || data.axisAssignments.length > 0 ? (
        <section className="grid gap-8 sm:grid-cols-2">
          {data.categoryNames.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                Categories
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {data.categoryNames.map((n) => (
                  <li
                    key={n}
                    className="border border-border bg-paper px-2 py-1 font-mono text-[13px] text-ink"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.axisAssignments.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                Axes
              </div>
              <dl className="border-t border-border">
                {data.axisAssignments.map((a) => (
                  <div
                    key={`${a.axisName}:${a.value}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-baseline gap-4 border-b border-border px-1 py-2"
                  >
                    <dt className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-mute2">
                      {a.axisName}
                    </dt>
                    <dd className="pretty font-mono text-[13.5px] text-ink">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {data.entities.length > 0 ? (
        <section className="space-y-4">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Entities extracted
          </div>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {TYPE_GROUP_ORDER.map((type) => {
              const group = entitiesByType.get(type);
              if (!group || group.length === 0) return null;
              return (
                <div key={type} className="space-y-2">
                  <div className="flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-mute2">
                    <span className="inline-flex items-center text-mute2">
                      <EntityGlyph type={type} />
                    </span>
                    <span>{TYPE_GROUP_LABEL[type]}</span>
                    <span className="tnum">{group.length}</span>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {group.map((e) => (
                      <li key={e.id}>
                        <Link
                          to={`/entities/${e.id}`}
                          className="inline-flex items-center gap-1.5 border border-border bg-paper px-2 py-1 font-mono text-[13px] text-ink hover:bg-paper2"
                        >
                          <span className="inline-flex items-center text-mute2">
                            <EntityGlyph type={e.type} />
                          </span>
                          <span>{e.canonicalName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {data.similarCount > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Found {data.similarCount} similar in other feeds
          </div>
          <ArticleListCard items={data.similarArticles} />
        </section>
      ) : null}

      {related && related.status !== 'unavailable' ? (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
              Related (semantic)
            </div>
            {related.status === 'pending' ? (
              <span className="font-mono text-[11px] text-mute2">· computing embedding…</span>
            ) : related.items.length === 0 ? (
              <span className="font-mono text-[11px] text-mute2">
                · no neighbours above threshold
              </span>
            ) : null}
          </div>
          {related.status === 'ready' && related.items.length > 0 ? (
            <ul className="flex flex-col">
              {related.items.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline gap-3 border-t border-border py-2 first:border-t-0"
                >
                  <span className="w-12 font-mono text-[12px] tnum text-mute2">
                    {r.score.toFixed(2)}
                  </span>
                  <Link
                    to={`/articles/${r.id}`}
                    className="min-w-0 flex-1 text-ink hover:text-accent-deep"
                  >
                    {r.title}
                  </Link>
                  {r.feedTitle ? (
                    <span className="font-mono text-[11.5px] text-mute2">{r.feedTitle}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
