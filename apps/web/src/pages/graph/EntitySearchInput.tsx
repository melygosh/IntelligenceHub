import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useGetEntityListQuery,
  useGetEntityQuery,
} from '../../store/api';
import { SearchInput } from '../../components/filters/SearchInput';

/**
 * Anchor-the-graph-on-an-entity affordance for the filter bar.
 *
 * - `value` null  → renders the shared `SearchInput` (same magnifying-glass +
 *   `/` focus shortcut + 250 ms debounce as the articles-list search) with a
 *   dropdown of up to 8 matches below it.
 * - `value` set   → renders an "anchored on: {name} ×" chip; × clears.
 *
 * Owns no URL state — parent passes `value` + `onChange` and decides how to
 * persist. Reuses the existing `useGetEntityListQuery` (limit hardcoded
 * server-side; we slice to 8 client-side — a typical `q` returns few enough
 * that the over-fetch doesn't matter at MVP scale) and `useGetEntityQuery`
 * for the anchored-chip name lookup.
 */
export function EntitySearchInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: anchorEntity } = useGetEntityQuery(value ?? '', {
    skip: !value,
  });

  if (value) {
    return (
      <div className="flex items-center gap-2 border border-ink bg-paper2 px-2.5 py-1.5 font-mono text-[13.5px] md:w-[400px]">
        <span className="text-mute2">anchored on:</span>
        <span className="flex-1 truncate text-ink">
          {anchorEntity?.canonicalName ?? '…'}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear anchor"
          title="Clear anchor"
          className="px-1 text-muted hover:text-ink"
        >
          ×
        </button>
      </div>
    );
  }

  return <SearchBox onSelect={(id) => onChange(id)} />;
}

function SearchBox({ onSelect }: { onSelect: (id: string) => void }) {
  // `q` is the debounced value emitted by SearchInput's `onChange` (250 ms).
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside-click closer. Re-open is handled inline by handleQChange when a
  // new non-empty query arrives (don't sync via effect — cascading renders).
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function handleQChange(next: string): void {
    setQ(next);
    if (next.length > 0) setOpen(true);
  }

  const { data: results, isFetching } = useGetEntityListQuery(
    { q, sort: 'mentions' },
    { skip: q.length === 0 },
  );
  const matches = useMemo(
    () => (results?.entities ?? []).slice(0, 8),
    [results],
  );

  function pick(id: string): void {
    onSelect(id);
    setQ('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <SearchInput
        value={q}
        onChange={handleQChange}
        placeholder="anchor on entity name or alias…"
        widthClass="md:w-[400px]"
      />
      {open && q.length > 0 ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-full border border-border bg-paper shadow-[0_4px_16px_-4px_rgba(28,26,22,0.15)] md:w-[400px]">
          {isFetching && matches.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[12px] text-muted">
              Searching…
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[12px] text-muted">
              No matches.
            </div>
          ) : (
            <ul>
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => pick(e.id)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left font-mono text-[12.5px] text-ink hover:bg-paper2"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-ink">{e.canonicalName}</span>
                      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                        {e.type}
                      </span>
                    </span>
                    <span className="text-muted">· {e.mentionCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
