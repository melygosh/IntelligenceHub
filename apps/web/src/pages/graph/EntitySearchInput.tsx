import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useGetEntityListQuery,
  useGetEntityQuery,
} from '../../store/api';

/**
 * Compact autocomplete for anchoring the graph on a specific entity.
 *
 * - `value` null  → renders a search input + dropdown of up to 8 matches.
 * - `value` set   → renders an "anchored on: {name} ×" chip; × clears.
 *
 * Owns no URL state — parent passes value + onChange and decides how to
 * persist (URL param, local state, etc.). Reuses the existing
 * useGetEntityListQuery (limit hardcoded to 500 server-side; we slice
 * client-side to 8) and useGetEntityQuery (anchor name lookup).
 */
export function EntitySearchInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  // Anchor name lookup — only fires when value is set.
  const { data: anchorEntity } = useGetEntityQuery(value ?? '', {
    skip: !value,
  });

  if (value) {
    return (
      <div className="flex items-center gap-1 border border-ink px-2 py-0.5 font-mono text-[12.5px]">
        <span className="text-muted">anchored on:</span>
        <span className="text-ink">{anchorEntity?.canonicalName ?? '…'}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear anchor"
          title="Clear anchor"
          className="ml-1 px-1 text-muted hover:text-ink"
        >
          ×
        </button>
      </div>
    );
  }

  return <SearchBox onSelect={(id) => onChange(id)} />;
}

function SearchBox({ onSelect }: { onSelect: (id: string) => void }) {
  const [input, setInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 200ms debounce: avoid a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(input.trim()), 200);
    return () => clearTimeout(id);
  }, [input]);

  // Outside-click closes the dropdown.
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

  const { data: results, isFetching } = useGetEntityListQuery(
    { q: debouncedQ, sort: 'mentions' },
    { skip: debouncedQ.length === 0 },
  );

  // Cap to 8 client-side. Server's hard limit (500) is wasteful but a query
  // with `q=Anth` typically returns <20 matches anyway.
  const matches = useMemo(
    () => (results?.entities ?? []).slice(0, 8),
    [results],
  );

  function pick(id: string): void {
    onSelect(id);
    setInput('');
    setDebouncedQ('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-2 border border-border bg-paper px-2 py-0.5 font-mono text-[12.5px]">
        <span className="text-muted">find:</span>
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setInput('');
              setDebouncedQ('');
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="entity name or alias…"
          className="w-44 bg-transparent text-ink placeholder:text-muted focus:outline-none"
        />
      </div>
      {open && debouncedQ.length > 0 ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 border border-border bg-paper shadow-[0_4px_16px_-4px_rgba(28,26,22,0.15)]">
          {isFetching && matches.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[11.5px] text-muted">
              Searching…
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[11.5px] text-muted">
              No matches.
            </div>
          ) : (
            <ul>
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => pick(e.id)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left font-mono text-[12px] text-ink hover:bg-paper2"
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
