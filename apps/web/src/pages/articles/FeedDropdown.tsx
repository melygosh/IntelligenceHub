import { useMemo } from 'react';
import { useGetFeedsQuery } from '../../store/api';
import {
  FacetDropdown,
  CheckboxIcon,
} from '../../components/filters/FacetDropdown';

/**
 * Multi-select feed dropdown for the articles list (US-7). Mirrors
 * CategoryDropdown — parent owns selected uuid[] + onChange((next) => void)
 * and decides how to persist (URL CSV, local state, etc.). Per-page
 * because no other page filters by feed today; promote to
 * `components/filters/` if a second consumer appears.
 */
export function FeedDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useGetFeedsQuery();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valueLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (data?.feeds.find((f) => f.id === selected[0])?.title ?? '1 selected')
        : `${selected.length} selected`;
  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <FacetDropdown
      label="Feed"
      valueLabel={valueLabel}
      isActive={selected.length > 0}
    >
      {() => (
        <>
          {data?.feeds.map((f) => {
            const on = selectedSet.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                  (on ? 'text-ink' : 'text-muted')
                }
              >
                <CheckboxIcon on={on} />
                <span className="truncate">{f.title ?? '(untitled)'}</span>
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
