import { useMemo } from 'react';
import { useGetCategoriesQuery } from '../../store/api';
import { FacetDropdown, CheckboxIcon } from './FacetDropdown';

/**
 * Multi-select category dropdown. Shared by the articles list and the graph
 * page so both pages use the same visual treatment AND the same OR-across-
 * selected-categories semantics. Parent passes `selected` (uuid[]) +
 * `onChange((next: uuid[]) => void)` and decides how to persist (URL CSV,
 * local state, etc.).
 */
export function CategoryDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useGetCategoriesQuery();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valueLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (data?.categories.find((c) => c.id === selected[0])?.name ?? '1 selected')
        : `${selected.length} selected`;
  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <FacetDropdown
      label="Category"
      valueLabel={valueLabel}
      isActive={selected.length > 0}
    >
      {() => (
        <>
          {data?.categories.map((c) => {
            const on = selectedSet.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                  (on ? 'text-ink' : 'text-muted')
                }
              >
                <CheckboxIcon on={on} />
                <span>{c.name}</span>
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
