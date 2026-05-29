import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGetEntityListQuery } from '../../store/api';
import type { EntityKind, EntitySort } from '@intelligencehub/shared';
import { EntityGlyph } from '../../components/entities/EntityGlyph';
import { FacetDropdown } from '../../components/filters/FacetDropdown';
import { SearchInput } from '../../components/filters/SearchInput';
import { Pager } from '../../components/filters/Pager';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';

const Sep = () => <span className="text-border2">·</span>;

const TYPE_OPTIONS: { value: EntityKind | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'company', label: 'Companies' },
  { value: 'person', label: 'People' },
  { value: 'product', label: 'Products' },
  { value: 'technology', label: 'Technology' },
  { value: 'location', label: 'Locations' },
];

const SORT_OPTIONS: { value: EntitySort; label: string }[] = [
  { value: 'mentions', label: 'Most mentioned' },
  { value: 'recent', label: 'Recently seen' },
  { value: 'name', label: 'Name (A–Z)' },
];

function isEntityKind(s: string | null): s is EntityKind {
  return (
    s === 'company' ||
    s === 'person' ||
    s === 'product' ||
    s === 'technology' ||
    s === 'location'
  );
}

function isSort(s: string | null): s is EntitySort {
  return s === 'mentions' || s === 'recent' || s === 'name';
}

/** Single-select facet — renders an option list inside the shared
 * FacetDropdown popover. Always shows the current value next to the label. */
function FilterMenu<T extends string>({
  label,
  value,
  options,
  isActive,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  isActive: boolean;
  onSelect: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <FacetDropdown label={label} valueLabel={current?.label ?? null} isActive={isActive}>
      {(close) =>
        options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value || '__all'}
              type="button"
              onClick={() => {
                onSelect(o.value);
                close();
              }}
              className={
                'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                (on ? 'text-ink' : 'text-muted')
              }
            >
              <span
                className={
                  'inline-flex h-3 w-3 shrink-0 items-center justify-center ' +
                  (on ? 'text-ink' : 'text-transparent')
                }
              >
                <svg viewBox="0 0 10 10" className="h-2 w-2">
                  <path
                    d="M2 5.5 L4 7.5 L8 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{o.label}</span>
            </button>
          );
        })
      }
    </FacetDropdown>
  );
}

function fmtRelative(unixSeconds: number | null): string {
  if (unixSeconds === null) return '—';
  const ms = Date.now() - unixSeconds * 1000;
  if (ms < 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  return `${mon}mo ago`;
}

export default function EntitiesList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  const type: EntityKind | '' = isEntityKind(rawType) ? rawType : '';
  const rawSort = searchParams.get('sort');
  const sort: EntitySort = isSort(rawSort) ? rawSort : 'mentions';
  const q = searchParams.get('q') ?? '';

  const parsedPage = Number(searchParams.get('page'));
  const page =
    Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

  const { data, isLoading, error } = useGetEntityListQuery({
    type: type || undefined,
    sort,
    q: q || undefined,
    page,
  });

  // keepPage opt-in matches ArticlesList: every filter change clears ?page
  // so the user doesn't end up on an empty page after narrowing results.
  const updateParams = (
    changes: Record<string, string | undefined>,
    opts: { keepPage?: boolean } = {},
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!opts.keepPage) next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const setPage = (next: number) => {
    updateParams({ page: next > 1 ? String(next) : undefined }, { keepPage: true });
  };

  const sortLabel = (SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Most mentioned').toLowerCase();

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (type) parts.push(`type: ${type}`);
    if (q) parts.push(`matching "${q}"`);
    if (parts.length === 0) return 'all types';
    return parts.join(' · ');
  }, [type, q]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="/entities" title="Entities" />

      <div className="border border-border bg-paper">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-5 py-2.5">
          <FilterMenu
            label="Type"
            value={type}
            options={TYPE_OPTIONS}
            isActive={type !== ''}
            onSelect={(v) => updateParams({ type: v || undefined })}
          />
          <FilterMenu
            label="Sort"
            value={sort}
            options={SORT_OPTIONS}
            isActive={sort !== 'mentions'}
            onSelect={(v) => updateParams({ sort: v === 'mentions' ? undefined : v })}
          />
          <div className="flex-1" />
          <SearchInput
            value={q}
            onChange={(v) => updateParams({ q: v || undefined })}
            placeholder="search name or alias…"
          />
        </div>

        {/* Subtitle */}
        <div className="flex items-baseline justify-between gap-3 border-b border-border bg-paper2/40 px-5 py-1.5 font-mono text-[12.5px] text-mute2">
          <span>{subtitle}</span>
          <span className="tnum">
            sorted by {sortLabel}
            {data ? (
              <>
                {' '}· <span className="text-ink">{data.total}</span> entit
                {data.total === 1 ? 'y' : 'ies'}
              </>
            ) : null}
          </span>
        </div>

        {/* Body */}
        {isLoading ? (
          <LoadingHint className="px-5 py-10 text-center" />
        ) : error ? (
          <EmptyState
            variant="error"
            title="Couldn't load entities"
            subtitle={
              (error as { data?: { message?: string } }).data?.message ??
              'Try a different filter or refresh the page.'
            }
          />
        ) : !data || data.entities.length === 0 ? (
          <EmptyState
            title="No entities yet"
            subtitle={
              <>
                Entities are extracted from articles. Pull a feed in{' '}
                <Link to="/feeds" className="text-accent hover:text-accent-deep">
                  Feeds
                </Link>{' '}
                to populate this directory.
              </>
            }
          />
        ) : (
          <>
            {data.entities.map((e) => (
              <Link
                key={e.id}
                to={`/entities/${e.id}`}
                className="group block border-b border-border px-5 py-3 last:border-b-0 hover:bg-paper2/60"
              >
                {/* glyph, name and meta share one items-center line so the icon
                    sits on the bold name's optical centre; the type label sits
                    below, indented to line up under the name. */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-mute2">
                      <EntityGlyph type={e.type} className="h-3 w-3" />
                    </span>
                    <span className="pretty truncate text-[15.5px] font-medium leading-snug text-ink group-hover:text-accent">
                      {e.canonicalName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap font-mono text-[12.5px] text-mute2">
                    <span className="tnum text-muted">
                      {e.mentionCount} mention{e.mentionCount === 1 ? '' : 's'}
                    </span>
                    <Sep />
                    <span
                      className="tnum"
                      title={
                        e.lastSeen !== null
                          ? new Date(e.lastSeen * 1000).toISOString()
                          : undefined
                      }
                    >
                      {fmtRelative(e.lastSeen)}
                    </span>
                  </div>
                </div>
                <div className="mt-0.5 pl-6 font-mono text-[12px] uppercase tracking-[0.06em] text-mute2">
                  {e.type}
                </div>
              </Link>
            ))}
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
