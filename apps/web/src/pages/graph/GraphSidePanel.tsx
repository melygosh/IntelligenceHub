import { Link } from 'react-router-dom';
import { useGetArticleQuery, useGetEntityQuery } from '../../store/api';
import { IMP_STYLE } from '../../components/articles/importance';
import { LoadingHint } from '../../components/ui/LoadingHint';

export type SelectedNode = { id: string; kind: 'article' | 'entity' };

/**
 * Right-rail panel for /graph (US-9 — open a side panel on node click rather
 * than navigating). Lazy-loads via existing detail queries; "Open full page →"
 * is the escape hatch when the user wants more.
 */
export function GraphSidePanel({
  selected,
  onClose,
}: {
  selected: SelectedNode;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-paper">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {selected.kind === 'article' ? 'Article' : 'Entity'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          title="Close"
          className="px-1 text-muted hover:text-ink"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {selected.kind === 'article' ? (
          <ArticlePanel id={selected.id} />
        ) : (
          <EntityPanel id={selected.id} />
        )}
      </div>
    </aside>
  );
}

function ArticlePanel({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetArticleQuery(id);
  if (isLoading) return <LoadingHint />;
  if (isError || !data) return <p className="font-mono text-[12.5px] text-muted">Could not load article.</p>;
  const imp = (data.importance ?? 'normal') as 'high' | 'normal' | 'junk';
  const impStyle = IMP_STYLE[imp];
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-[18px] leading-snug text-ink">{data.title}</h2>
      <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted">
        <span>{data.feedTitle}</span>
        <span>·</span>
        <span>{new Date(data.ts).toLocaleString()}</span>
        <span>·</span>
        <span
          className="rounded-sm px-1.5 py-[1px]"
          style={{ background: impStyle.bg, color: impStyle.fg }}
        >
          {imp}
        </span>
      </div>
      {data.summary ? (
        <p className="pretty font-mono text-[12.5px] leading-relaxed text-ink">{data.summary}</p>
      ) : null}
      {data.entities.length > 0 ? (
        <div>
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Entities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.entities.map((e) => (
              <Link
                key={e.id}
                to={`/entities/${e.id}`}
                className="border border-border bg-surface px-1.5 py-[1px] font-mono text-[11px] text-ink hover:bg-paper2"
              >
                {e.canonicalName}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <Link
        to={`/articles/${data.id}`}
        className="self-start font-mono text-[12px] text-accent hover:text-accent-deep"
      >
        Open full page →
      </Link>
    </div>
  );
}

function EntityPanel({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetEntityQuery(id);
  if (isLoading) return <LoadingHint />;
  if (isError || !data) return <p className="font-mono text-[12.5px] text-muted">Could not load entity.</p>;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-[18px] leading-snug text-ink">{data.canonicalName}</h2>
      <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted">
        <span>{data.type}</span>
        <span>·</span>
        <span>{data.mentionCount} mentions</span>
      </div>
      {data.aliases.length > 0 ? (
        <div>
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Aliases
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11.5px] text-ink">
            {data.aliases.map((a) => (
              <span key={a} className="border border-border bg-surface px-1.5 py-[1px]">{a}</span>
            ))}
          </div>
        </div>
      ) : null}
      {data.relatedEntities.length > 0 ? (
        <div>
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Co-mentioned with
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.relatedEntities.slice(0, 8).map((r) => (
              <Link
                key={r.id}
                to={`/entities/${r.id}`}
                className="border border-border bg-surface px-1.5 py-[1px] font-mono text-[11px] text-ink hover:bg-paper2"
                title={`${r.weight} shared articles`}
              >
                {r.canonicalName} <span className="text-muted">·{r.weight}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <Link
        to={`/entities/${data.id}`}
        className="self-start font-mono text-[12px] text-accent hover:text-accent-deep"
      >
        Open full page →
      </Link>
    </div>
  );
}
