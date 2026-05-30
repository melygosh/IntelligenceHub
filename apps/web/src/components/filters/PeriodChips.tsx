import type { GraphPeriod } from '@intelligencehub/shared';

const PERIODS: ReadonlyArray<GraphPeriod> = ['all', '24h', '7d', '30d', 'custom'];
const LABELS: Record<GraphPeriod, string> = {
  all: 'all',
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  custom: 'custom',
};

/**
 * Chip group for selecting a time window. Owns no URL state — the parent
 * passes `value` + `onChange` and decides how to persist (URL param, local
 * state, etc.). `custom` is included for completeness; the parent is
 * responsible for surfacing the from/to inputs when selected.
 */
export function PeriodChips({
  value,
  onChange,
  showLabel = true,
}: {
  value: GraphPeriod;
  onChange: (next: GraphPeriod) => void;
  showLabel?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[13.5px] text-muted">
      {showLabel ? <span>period:</span> : null}
      <div className="flex border border-border">
        {PERIODS.map((p) => {
          const active = value === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={
                'px-2 py-1 text-[13.5px] ' +
                (active
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink hover:bg-paper2')
              }
              aria-pressed={active}
            >
              {LABELS[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
