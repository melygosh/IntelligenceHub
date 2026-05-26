import { Link, useParams } from 'react-router-dom';
import { useGetEntityQuery } from '../../store/api';
import type { EntityKind, RelatedEntitySummary } from '@intelligencehub/shared';
import { MentionTimeline } from './MentionTimeline';

const TYPE_GLYPH: Record<EntityKind, React.ReactNode> = {
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

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function RelatedChip({ r }: { r: RelatedEntitySummary }) {
  return (
    <Link
      to={`/entities/${r.id}`}
      className="inline-flex items-center gap-1.5 border border-border bg-paper px-2 py-1 font-mono text-[11px] text-ink hover:bg-paper2"
    >
      <span className="text-mute2">{TYPE_GLYPH[r.type]}</span>
      <span>{r.canonicalName}</span>
      <span className="text-mute2">· {r.weight}</span>
    </Link>
  );
}

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetEntityQuery(id ?? '', { skip: !id });

  if (isLoading) {
    return <p className="font-mono text-[11px] text-mute2">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[18px] text-ink">Entity not found</p>
        <p className="mt-2 font-mono text-[12px] text-muted">
          Back to <Link to="/graph" className="text-accent hover:text-accent-deep">graph</Link>.
        </p>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Entities › Entity
        </div>
        <h1 className="pretty font-serif text-[28px] leading-tight text-ink">{data.canonicalName}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="text-mute2">{TYPE_GLYPH[data.type]}</span>
            <span className="uppercase tracking-[0.06em] text-ink">{data.type}</span>
          </span>
          <Sep />
          <span className="tnum text-ink">{data.mentionCount} mention{data.mentionCount === 1 ? '' : 's'}</span>
          {data.firstSeenTs && data.lastSeenTs ? (
            <>
              <Sep />
              <span>
                first <span className="tnum text-ink">{formatDate(data.firstSeenTs)}</span>
              </span>
              <Sep />
              <span>
                last <span className="tnum text-ink">{formatDate(data.lastSeenTs)}</span>
              </span>
            </>
          ) : null}
        </div>
      </header>

      {data.aliases.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Also known as</div>
          <ul className="flex flex-wrap gap-1.5">
            {data.aliases.map((a) => (
              <li
                key={a}
                className="border border-border bg-paper px-1.5 py-px font-mono text-[10.5px] text-muted"
              >
                {a}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Mention timeline</div>
        <MentionTimeline buckets={data.timelineBuckets} />
      </section>

      {data.relatedEntities.length > 0 ? (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Often appears with</div>
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
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Mentioned in {data.mentionCount} article{data.mentionCount === 1 ? '' : 's'}
          </div>
          <ul className="divide-y divide-border">
            {data.mentioningArticles.map((m) => (
              <li key={m.id} className="flex items-baseline gap-3 py-2">
                {m.importance ? (
                  <span className={`mt-1 inline-block h-2 w-2 shrink-0 ${IMPORTANCE_COLOR[m.importance] ?? 'bg-border'}`} />
                ) : (
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 bg-border" />
                )}
                <Link to={`/articles/${m.id}`} className="pretty flex-1 text-[14px] text-ink hover:text-accent-deep">
                  {m.title}
                </Link>
                <span className="font-mono text-[10.5px] tnum text-mute2">{formatDate(m.ts)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
