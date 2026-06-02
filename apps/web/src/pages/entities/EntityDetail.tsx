import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGetEntityQuery } from '../../store/api';
import type { EntityKind, RelatedEntitySummary } from '@intelligencehub/shared';
import { MentionTimeline } from './MentionTimeline';
import { useSetPageTitle } from '../../components/layout/usePageTitle';
import { ArticleListCard } from '../../components/articles/ArticleListCard';
import { EntityGlyph } from '../../components/entities/EntityGlyph';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TypeBadge({ type }: { type: EntityKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-border bg-paper2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink">
      <span className="inline-flex items-center text-muted">
        <EntityGlyph type={type} />
      </span>
      <span>{type}</span>
    </span>
  );
}

function StatPair({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={title}>
      <span className="uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="tnum text-ink">{value}</span>
    </span>
  );
}

function RelatedChip({ r }: { r: RelatedEntitySummary }) {
  return (
    <Link
      to={`/entities/${r.id}`}
      className="inline-flex items-center gap-1.5 border border-border bg-paper px-2 py-1 font-mono text-[13px] text-ink hover:bg-paper2"
    >
      <span className="inline-flex items-center text-mute2">
        <EntityGlyph type={r.type} />
      </span>
      <span>{r.canonicalName}</span>
      <span className="text-mute2">· {r.weight}</span>
    </Link>
  );
}

// "Often appears with" shows this many co-mentioned entities before the
// expand toggle; the mentioning-articles list reveals this many at a time.
const RELATED_VISIBLE = 8;
const MENTIONS_STEP = 10;

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetEntityQuery(id ?? '', { skip: !id });
  useSetPageTitle(data?.canonicalName);

  // Progressive reveal state. Reset during render when the route entity changes
  // (the component stays mounted across :id changes).
  const [mentionsShown, setMentionsShown] = useState(MENTIONS_STEP);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setMentionsShown(MENTIONS_STEP);
    setRelatedExpanded(false);
  }

  if (isLoading) {
    return <LoadingHint />;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl border border-dashed border-border">
        <EmptyState
          title="Entity not found"
          subtitle={
            <>
              Back to{' '}
              <Link to="/entities" className="text-accent hover:text-accent-deep">
                entities
              </Link>
              .
            </>
          }
        />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="pretty font-serif text-[30px] leading-tight text-ink">
            {data.canonicalName}
          </h1>
          <span className="self-center">
            <TypeBadge type={data.type} />
          </span>
          <Link
            to="/graph?period=all"
            state={{ anchorEntityId: data.id }}
            className="self-center font-mono text-[12.5px] text-accent hover:text-accent-deep"
          >
            view in graph →
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 font-mono text-[11.5px]">
          <StatPair label="mentions" value={String(data.mentionCount)} />
          {data.firstSeen !== null ? (
            <StatPair
              label="first seen"
              value={formatDate(data.firstSeen)}
              title={new Date(data.firstSeen * 1000).toISOString()}
            />
          ) : null}
          {data.lastSeen !== null ? (
            <StatPair
              label="last seen"
              value={formatDate(data.lastSeen)}
              title={new Date(data.lastSeen * 1000).toISOString()}
            />
          ) : null}
        </div>
        {data.description ? (
          <p className="font-serif text-[15.5px] leading-snug text-ink/85">{data.description}</p>
        ) : null}
      </header>

      {data.aliases.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Also known as
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {data.aliases.map((a) => (
              <li
                key={a}
                className="border border-border bg-paper px-1.5 py-px font-mono text-[12.5px] text-muted"
              >
                {a}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MentionTimeline buckets={data.timelineBuckets} />

      {data.relatedEntities.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Often appears with
          </div>
          <ul className="flex flex-wrap gap-2">
            {(relatedExpanded
              ? data.relatedEntities
              : data.relatedEntities.slice(0, RELATED_VISIBLE)
            ).map((r) => (
              <li key={r.id}>
                <RelatedChip r={r} />
              </li>
            ))}
          </ul>
          {data.relatedEntities.length > RELATED_VISIBLE ? (
            <button
              type="button"
              onClick={() => setRelatedExpanded((v) => !v)}
              className="font-mono text-[12px] text-accent hover:text-accent-deep"
            >
              {relatedExpanded
                ? 'Show less'
                : `Show all (+${data.relatedEntities.length - RELATED_VISIBLE})`}
            </button>
          ) : null}
        </section>
      ) : null}

      {data.mentioningArticles.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Mentioned in {data.mentionCount} article{data.mentionCount === 1 ? '' : 's'}
          </div>
          <ArticleListCard items={data.mentioningArticles.slice(0, mentionsShown)} />
          {data.mentioningArticles.length > mentionsShown ? (
            <button
              type="button"
              onClick={() =>
                setMentionsShown((n) => Math.min(n + MENTIONS_STEP, data.mentioningArticles.length))
              }
              className="font-mono text-[12px] text-accent hover:text-accent-deep"
            >
              Show {Math.min(MENTIONS_STEP, data.mentioningArticles.length - mentionsShown)} more (
              {mentionsShown} of {data.mentioningArticles.length})
            </button>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
