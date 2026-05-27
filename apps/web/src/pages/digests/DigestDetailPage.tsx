import { Link, useParams } from 'react-router-dom';
import {
  type DigestKeyArticle,
  type DigestTopCategory,
  type DigestTopEntity,
  type EntityKind,
} from '@intelligencehub/shared';
import { useGetDigestQuery } from '../../store/api';
import { useDigestStatusEvents } from '../../events/useDigestStatusEvents';
import { useSetPageTitle } from '../../components/layout/PageTitleContext';

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

// Filled importance pill matching the ArticlesList badge palette so the
// digest's Key Articles row reads as the same primitive used elsewhere.
const IMP_STYLE: Record<'high' | 'normal' | 'junk', { bg: string; fg: string; dot: string }> = {
  high: { bg: '#dde5d2', fg: '#2f4a26', dot: '#4d6b3e' },
  normal: { bg: '#ece6d8', fg: '#3d3a32', dot: '#6b6557' },
  junk: { bg: '#ece6d8', fg: '#857f74', dot: '#9b9486' },
};

function ImportanceBadge({ importance }: { importance: 'high' | 'normal' | 'junk' | null }) {
  if (!importance) return null;
  const s = IMP_STYLE[importance];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[11.5px] uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
      {importance}
    </span>
  );
}

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmt(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function TopEntityRow({ e, rank }: { e: DigestTopEntity; rank: number }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5 font-mono text-[13px]">
      <span className="w-5 text-right text-mute2 tnum">{rank}.</span>
      <span className="text-mute2">{TYPE_GLYPH[e.type]}</span>
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

function KeyArticleRow({ a, rank }: { a: DigestKeyArticle; rank: number }) {
  const rankStr = String(rank).padStart(2, '0');
  // Defensive defaults — digests persisted before this schema change have
  // no entities/feedTitle in key_articles_json. The API doesn't re-parse
  // through Zod, so the .default([]) doesn't apply at runtime.
  const entities = a.entities ?? [];
  const feedTitle = a.feedTitle ?? null;
  return (
    <li>
      <Link
        to={`/articles/${a.id}`}
        className="group grid grid-cols-[36px_minmax(0,1fr)_16px] items-start gap-x-4 px-6 py-5 transition-colors hover:bg-paper2/40"
      >
        <span className="pt-1 font-mono text-[13px] text-mute2 tnum">{rankStr}</span>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px] text-mute2">
            {feedTitle ? <span>{feedTitle}</span> : null}
            {feedTitle ? <Sep /> : null}
            <span className="tnum">{fmtShort(a.ts)}</span>
            {a.importance ? (
              <span className="ml-1">
                <ImportanceBadge importance={a.importance} />
              </span>
            ) : null}
          </div>
          <h3 className="pretty font-serif text-[22px] leading-snug text-ink group-hover:text-accent-deep">
            {a.title}
          </h3>
          {entities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[12.5px] text-mute2">
              {entities.map((e, i) => (
                <span key={e.id} className="inline-flex items-center gap-1">
                  {i > 0 ? <span className="px-1 text-border2">·</span> : null}
                  <span>{e.canonicalName}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <span className="pt-3 self-start text-border2 transition-colors group-hover:text-mute2">
          <svg viewBox="0 0 8 12" className="h-3 w-2">
            <path d="M1 1 L6 6 L1 11" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </Link>
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
              <ol className="divide-y divide-border border border-border bg-paper">
                {data.keyArticles.map((a, i) => (
                  <KeyArticleRow key={a.id} a={a} rank={i + 1} />
                ))}
              </ol>
            </section>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
