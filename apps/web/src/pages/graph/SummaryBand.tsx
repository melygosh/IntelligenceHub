import type { GraphPeriod, GraphSummaryResponse } from '@intelligencehub/shared';
import { IMP_STYLE } from '../../components/articles/importance';
import { colourFor } from './graph-palette';
import type { SelectedNode } from './GraphSidePanel';

/**
 * Two-cell band above the canvas. Each row is clickable → onSelect({id, kind})
 * which the page wires to "open the rail + (if the node is on canvas) focus
 * the graph". `selected` lets us highlight the matching row.
 *
 * Empty cells render a muted one-liner rather than an empty box.
 */
export function SummaryBand({
  data,
  selected,
  onSelect,
  period,
}: {
  data: GraphSummaryResponse | undefined;
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
  period: GraphPeriod;
}) {
  // Honest cell title — reflects the active filter, not a hard-coded "7d".
  const entitiesTitle =
    period === 'all' ? 'Top entities' : `Top entities · ${period}`;
  return (
    <div className="grid grid-cols-2 gap-px bg-border">
      <Cell title={entitiesTitle}>
        {!data || data.topEntities.length === 0 ? (
          <Empty>No mentions in this window.</Empty>
        ) : (
          <ul className="space-y-0.5 font-mono text-[12px] leading-snug">
            {data.topEntities.map((e) => {
              const isSelected =
                selected?.kind === 'entity' && selected.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: e.id, kind: 'entity' })}
                    className={
                      'flex w-full items-center gap-2 text-left hover:bg-paper2 ' +
                      (isSelected ? 'bg-paper2 font-medium' : '')
                    }
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: colourFor(e.dominantCategoryId),
                      }}
                    />
                    <span className="flex-1 truncate text-ink">{e.canonicalName}</span>
                    <span className="text-muted">· {e.mentionCount}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cell>
      <Cell title="Top articles · importance: high">
        {!data || data.topArticles.length === 0 ? (
          <Empty>No high-importance articles in this window.</Empty>
        ) : (
          <ul className="space-y-0.5 font-mono text-[12px] leading-snug">
            {data.topArticles.map((a) => {
              const imp = (a.importance ?? 'normal') as 'high' | 'normal' | 'junk';
              const isSelected =
                selected?.kind === 'article' && selected.id === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: a.id, kind: 'article' })}
                    className={
                      'flex w-full items-start gap-2 text-left hover:bg-paper2 ' +
                      (isSelected ? 'bg-paper2 font-medium' : '')
                    }
                    title={a.title}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginTop: 6,
                        background: IMP_STYLE[imp].dot,
                      }}
                    />
                    <span className="line-clamp-2 flex-1 text-ink">{a.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cell>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[12px] italic text-muted">{children}</p>
  );
}
