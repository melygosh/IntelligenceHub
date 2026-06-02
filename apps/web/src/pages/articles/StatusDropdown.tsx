import { useMemo } from 'react';
import { FacetDropdown, CheckboxIcon } from '../../components/filters/FacetDropdown';
import type { ArticleStatus } from '@intelligencehub/shared';

// Fixed catalog of statuses surfaced to the user. 'duplicate' is intentionally
// excluded — those rows back the N-similar counter and would dilute the feed.
const OPTIONS: { id: ArticleStatus; label: string }[] = [
  { id: 'ready', label: 'ready' },
  { id: 'pending', label: 'pending' },
  { id: 'filtered', label: 'filtered (pre-filter cut)' },
  { id: 'failed', label: 'failed' },
];

const LABEL_BY_ID = new Map(OPTIONS.map((o) => [o.id, o.label] as const));

/**
 * Multi-select processing-state filter for the articles list (US-7).
 * Parent owns selected ArticleStatus[] + onChange; an empty selection means
 * "use backend default" (currently ['ready']).
 */
export function StatusDropdown({
  selected,
  onChange,
}: {
  selected: ArticleStatus[];
  onChange: (next: ArticleStatus[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valueLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (LABEL_BY_ID.get(selected[0]) ?? selected[0])
        : `${selected.length} selected`;
  const toggle = (id: ArticleStatus) => {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <FacetDropdown label="Status" valueLabel={valueLabel} isActive={selected.length > 0}>
      {() => (
        <>
          {OPTIONS.map((o) => {
            const on = selectedSet.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                  (on ? 'text-ink' : 'text-muted')
                }
              >
                <CheckboxIcon on={on} />
                <span>{o.label}</span>
              </button>
            );
          })}
          {selected.length > 0 ? (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="block w-full px-3 py-1.5 text-left font-mono text-[12.5px] text-mute2 hover:bg-paper2 hover:text-ink"
              >
                Clear selection
              </button>
            </>
          ) : null}
        </>
      )}
    </FacetDropdown>
  );
}
