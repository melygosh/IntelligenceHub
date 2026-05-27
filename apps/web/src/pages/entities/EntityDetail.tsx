import { Link, useParams } from 'react-router-dom';
import { useGetEntityQuery } from '../../store/api';
import type { EntityKind, RelatedEntitySummary } from '@intelligencehub/shared';
import { MentionTimeline } from './MentionTimeline';
import { useSetPageTitle } from '../../components/layout/usePageTitle';
import { ArticleListCard } from '../../components/articles/ArticleListCard';
import { EntityGlyph } from '../../components/entities/EntityGlyph';

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TypeBadge({ type }: { type: EntityKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-border bg-paper2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink">
      <span className="inline-flex items-center text-muted"><EntityGlyph type={type} /></span>
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
      <span className="inline-flex items-center text-mute2"><EntityGlyph type={r.type} /></span>
      <span>{r.canonicalName}</span>
      <span className="text-mute2">· {r.weight}</span>
    </Link>
  );
}

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetEntityQuery(id ?? '', { skip: !id });
  useSetPageTitle(data?.canonicalName);

  if (isLoading) {
    return <p className="font-mono text-[13px] text-mute2">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[22px] text-ink">Entity not found</p>
        <p className="mt-2 font-mono text-[14px] text-muted">
          Back to <Link to="/entities" className="text-accent hover:text-accent-deep">entities</Link>.
        </p>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Entities › Entity
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="pretty font-serif text-[30px] leading-tight text-ink">{data.canonicalName}</h1>
          <TypeBadge type={data.type} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 font-mono text-[11.5px]">
          <StatPair label="mentions" value={String(data.mentionCount)} />
          {data.firstSeenTs ? (
            <StatPair label="first seen" value={formatDate(data.firstSeenTs)} title={data.firstSeenTs} />
          ) : null}
          {data.lastSeenTs ? (
            <StatPair label="last seen" value={formatDate(data.lastSeenTs)} title={data.lastSeenTs} />
          ) : null}
        </div>
      </header>

      {data.aliases.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Also known as</div>
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
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Often appears with</div>
          <ul className="flex flex-wrap gap-2">
            {data.relatedEntities.map((r) => (
              <li key={r.id}>
                <RelatedChip r={r} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.mentioningArticles.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Mentioned in {data.mentionCount} article{data.mentionCount === 1 ? '' : 's'}
          </div>
          <ArticleListCard items={data.mentioningArticles} />
        </section>
      ) : null}
    </article>
  );
}
