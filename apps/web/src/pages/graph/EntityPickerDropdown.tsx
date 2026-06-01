import { useMemo, useState } from 'react';
import { useGetEntitiesInfiniteQuery } from '../../store/api';
import { FacetDropdown, CheckboxIcon } from '../../components/filters/FacetDropdown';
import { SearchInput } from '../../components/filters/SearchInput';
import { pinSelectedFirst } from './relation';

/**
 * Topbar multi-select for graph entities (the primary canvas selection).
 * Backed by the cached `getEntitiesInfinite` endpoint: pages accumulate in the
 * RTK cache keyed by the search text, so reopening the dropdown is a cache hit.
 * `selectedIds` is the source of truth (lives in GraphPage); this component
 * only proposes the next set via `onChange`. `cap` mirrors graphSelectionCap.
 */
export function EntityPickerDropdown({
  selectedIds,
  onChange,
  cap,
}: {
  // The set shown as checked + pinned. May be the committed explicit selection
  // OR (when untouched) the on-canvas top-N — the parent decides. The dropdown
  // is display-only: toggling proposes the next full set via onChange; merely
  // opening the dropdown changes nothing (no graph refetch).
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  cap: number;
}) {
  const [q, setQ] = useState('');
  const { data, fetchNextPage, hasNextPage, isFetching } =
    useGetEntitiesInfiniteQuery({ q: q || undefined, sort: 'mentions' });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.entities) ?? [],
    [data],
  );
  // Retain every entity loaded this session so a selected entity stays pinned
  // to the top even after a later search (or clearing the search) no longer
  // returns it. Accumulated DURING RENDER (React's "store info from prior
  // renders" pattern) — the conditional setState stops once nothing is new.
  const [seenById, setSeenById] = useState<Map<string, (typeof items)[number]>>(
    new Map(),
  );
  if (items.some((e) => !seenById.has(e.id))) {
    const next = new Map(seenById);
    for (const e of items) next.set(e.id, e);
    setSeenById(next);
  }
  const pool = useMemo(() => [...seenById.values()], [seenById]);
  const rows = useMemo(
    () => pinSelectedFirst(items, selectedIds, pool),
    [items, selectedIds, pool],
  );

  const count = selectedIds.size;
  const atCap = count >= cap;

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= cap) return;
      next.add(id);
    }
    onChange(next);
  };
  const selectAllVisible = () => {
    const next = new Set(selectedIds);
    for (const e of items) {
      if (next.size >= cap) break;
      next.add(e.id);
    }
    onChange(next);
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      hasNextPage &&
      !isFetching &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
    ) {
      void fetchNextPage();
    }
  };

  return (
    <FacetDropdown
      label="Entities"
      valueLabel={count > 0 ? String(count) : null}
      isActive={count > 0}
      panelClassName="w-[320px] p-0"
    >
      {() => (
        <div className="flex flex-col">
          <div className="border-b border-border p-2.5">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="search entities…"
              widthClass="w-full"
            />
            <div className="mt-2 flex items-center justify-between font-mono text-[11.5px] text-muted">
              <span>
                <span className={atCap ? 'text-accent-deep' : 'text-ink'}>{count}</span> /{' '}
                {cap} selected
              </span>
              <span className="flex gap-3">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={items.length === 0 || atCap}
                  className="hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
                  title={atCap ? `max ${cap} reached` : undefined}
                >
                  select all
                </button>
                <button
                  type="button"
                  onClick={() => onChange(new Set())}
                  disabled={count === 0}
                  className="hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
                >
                  clear all
                </button>
              </span>
            </div>
            {atCap ? (
              <p className="mt-1.5 font-mono text-[11px] text-accent-deep">
                Cap of {cap} reached — uncheck one to add another.
              </p>
            ) : null}
          </div>
          <div className="max-h-[300px] overflow-y-auto" onScroll={onScroll}>
            {rows.length === 0 ? (
              <p className="px-3 py-3 font-mono text-[12px] italic text-muted">
                {isFetching ? 'Loading…' : 'No entities.'}
              </p>
            ) : (
              rows.map((e) => {
                const on = selectedIds.has(e.id);
                const disabled = !on && atCap;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggle(e.id)}
                    disabled={disabled}
                    title={disabled ? 'selection cap reached' : undefined}
                    className={
                      'flex w-full items-start gap-2 px-3 py-1.5 text-left ' +
                      (disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-paper2')
                    }
                  >
                    <span className="mt-0.5">
                      <CheckboxIcon on={on} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12.5px] text-ink">
                        {e.canonicalName}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-mute2">
                        {e.mentionCount} mention{e.mentionCount === 1 ? '' : 's'} · {e.type}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            {hasNextPage ? (
              <p className="px-3 py-2 text-center font-mono text-[11px] text-mute2">
                {isFetching ? 'Loading…' : 'scroll for more'}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </FacetDropdown>
  );
}
