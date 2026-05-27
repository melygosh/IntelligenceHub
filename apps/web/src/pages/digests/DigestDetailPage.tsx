import { Link, useParams } from 'react-router-dom';
import {
  type DigestTopCategory,
  type DigestTopEntity,
  type EntityKind,
} from '@intelligencehub/shared';
import { useGetDigestQuery } from '../../store/api';
import { useDigestStatusEvents } from '../../events/useDigestStatusEvents';
import { useSetPageTitle } from '../../components/layout/PageTitleContext';
import { ArticleListCard } from '../../components/articles/ArticleListCard';

const PERIOD_LABEL: Record<'day' | 'week' | 'month', string> = {
  day: 'Last 24 hours',
  week: 'Last week',
  month: 'Last month',
};

const Sep = () => <span className="text-border2">·</span>;

const TYPE_GLYPH: Record<EntityKind, React.ReactNode> = {
  company: <span className="inline-block h-1.5 w-1.5 bg-current" />,
  person: <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />,
  product: <span className="inline-block h-1.5 w-1.5 rounded-sm bg-current" />,
  technology: <span className="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />,
  location: <span className="inline-block h-1.5 w-1.5 rounded-full border border-current bg-transparent" />,
};

function fmt(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function TopEntityRow({ e, rank }: { e: DigestTopEntity; rank: number }) {
  return (
    <li className="flex items-center gap-2 py-1.5 font-mono text-[13px]">
      <span className="w-5 shrink-0 text-right text-mute2 tnum">{rank}.</span>
      <span className="inline-flex items-center text-mute2">{TYPE_GLYPH[e.type]}</span>
      <Link
        to={`/entities/${e.id}`}
        className="flex-1 truncate text-ink hover:text-accent-deep"
      >
        {e.canonicalName}
      </Link>
      <span className="text-mute2 tnum">{e.mentionCount}</span>
    </li>
  );
}

function TopCategoryRow({ c, rank }: { c: DigestTopCategory; rank: number }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5 font-mono text-[13px]">
      <span className="w-5 text-right text-mute2 tnum">{rank}.</span>
      <span className="flex-1 truncate text-ink">{c.name}</span>
      <span className="text-mute2 tnum">{c.articleCount}</span>
    </li>
  );
}


export default function DigestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetDigestQuery(id ?? '', { skip: !id });
  useDigestStatusEvents();

  const periodLabel = data ? PERIOD_LABEL[data.period] : null;
  useSetPageTitle(
    data && periodLabel ? (data.title ? `${periodLabel}: ${data.title}` : periodLabel) : null,
  );

  if (isLoading) return <p className="font-mono text-[13px] text-mute2">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[22px] text-ink">Digest not found</p>
        <p className="mt-2 font-mono text-[14px] text-muted">
          Back to <Link to="/digests" className="text-accent hover:text-accent-deep">all digests</Link>.
        </p>
      </div>
    );
  }

  const wFrom = new Date(data.windowFrom);
  const wTo = new Date(data.windowTo);

  const scopeLabel =
    data.scopeKind === 'category' && data.scopeFilterIds.length > 0
      ? `${data.scopeFilterIds.length} categories`
      : data.scopeKind === 'entity' && data.scopeFilterIds.length > 0
      ? `${data.scopeFilterIds.length} entities`
      : 'all articles';

  return (
    <article className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Digests › Digest
        </div>
        <h1 className="pretty font-serif text-[34px] leading-tight text-ink">
          {data.title ? (
            <>
              <span className="font-medium text-muted">{periodLabel}:</span>{' '}
              <span className="text-ink">{data.title}</span>
            </>
          ) : (
            <span className="text-ink">{periodLabel}</span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-muted">
          <span className="tnum">
            {fmt(wFrom.toISOString())} → {fmt(wTo.toISOString())}
          </span>
          <Sep />
          <span>{scopeLabel}</span>
          <Sep />
          <span className="tnum text-ink">{data.articleCount} articles</span>
          <Sep />
          <span className="tnum text-ink">{data.entityCount} entities</span>
        </div>
        {data.status === 'ready' && data.model ? (
          <div className="font-mono text-[12px] text-mute2 tnum">
            {data.model} · {(data.inputTokens + data.outputTokens).toLocaleString()} tokens · {data.latencyMs.toLocaleString()} ms
          </div>
        ) : null}
      </header>

      {data.status === 'building' ? (
        <section className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[22px] text-ink">Building digest…</p>
          <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
            LLM is summarising {data.articleCount} articles. This usually takes 5-15 seconds.
            Page will refresh automatically when ready.
          </p>
        </section>
      ) : null}

      {data.status === 'failed' ? (
        <section className="border border-dashed border-critical/40 bg-critical-bg px-6 py-10 text-center">
          <p className="font-serif text-[22px] text-critical">Build failed</p>
          <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
            {data.errorMessage ?? 'Unknown error.'}
          </p>
        </section>
      ) : null}

      {data.status === 'ready' && data.summary ? (
        <>
          <section className="space-y-3">
            <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
              Summary
            </div>
            {data.summary.map((p, i) => (
              <p key={i} className="pretty font-serif text-[18px] leading-relaxed text-ink">
                {p}
              </p>
            ))}
          </section>

          {(data.topEntities.length > 0 || data.topCategories.length > 0) ? (
            <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {data.topEntities.length > 0 ? (
                <div>
                  <div className="mb-2 border-b border-border pb-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                    Top entities
                  </div>
                  <ol>
                    {data.topEntities.map((e, i) => (
                      <TopEntityRow key={e.id} e={e} rank={i + 1} />
                    ))}
                  </ol>
                </div>
              ) : null}
              {data.topCategories.length > 0 ? (
                <div>
                  <div className="mb-2 border-b border-border pb-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                    Top categories
                  </div>
                  <ol>
                    {data.topCategories.map((c, i) => (
                      <TopCategoryRow key={c.id} c={c} rank={i + 1} />
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          ) : null}

          {data.keyArticles.length > 0 ? (
            <section className="space-y-3">
              <div className="border-b border-border pb-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                Key articles
              </div>
              <ArticleListCard items={data.keyArticles} />
            </section>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
