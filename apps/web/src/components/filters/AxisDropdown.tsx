import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGetAxesQuery } from '../../store/api';
import { FacetDropdown, CheckboxIcon } from './FacetDropdown';

/**
 * Multi-select axis-value dropdown. Values are grouped under their parent
 * axis. Backend semantics: AND across axes, OR within an axis. Parent passes
 * `selected` (axis_value uuid[]) + `onChange((next: uuid[]) => void)` and
 * decides how to persist (URL CSV, local state, etc.).
 */
export function AxisDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data, isLoading } = useGetAxesQuery();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const valueLabel = useMemo(() => {
    if (selected.length === 0) return null;
    if (selected.length === 1) {
      for (const ax of data?.axes ?? []) {
        const hit = ax.values.find((v) => v.id === selected[0]);
        if (hit) return hit.value;
      }
      return '1 selected';
    }
    return `${selected.length} selected`;
  }, [selected, data]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };

  const hasAxes = (data?.axes.length ?? 0) > 0;

  return (
    <FacetDropdown label="Axis" valueLabel={valueLabel} isActive={selected.length > 0}>
      {() => (
        <>
          {isLoading ? (
            <div className="px-3 py-2 font-mono text-[12.5px] text-mute2">
              Loading…
            </div>
          ) : !hasAxes ? (
            <div className="px-3 py-2 font-mono text-[12.5px] text-mute2">
              No axes defined yet ·{' '}
              <Link to="/settings/axes" className="text-accent hover:text-accent-deep">
                open Axes
              </Link>
            </div>
          ) : (
            data?.axes.map((ax) => (
              <div key={ax.id}>
                <div className="px-3 pb-0.5 pt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mute2">
                  {ax.name}
                </div>
                {ax.values.map((v) => {
                  const on = selectedSet.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggle(v.id)}
                      className={
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                        (on ? 'text-ink' : 'text-muted')
                      }
                    >
                      <CheckboxIcon on={on} />
                      <span>{v.value}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
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
