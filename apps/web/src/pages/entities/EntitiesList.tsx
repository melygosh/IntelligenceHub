import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGetEntityListQuery } from '../../store/api';
import type { EntityKind, EntitySort } from '@intelligencehub/shared';

const Sep = () => <span className="text-border2">·</span>;

const TYPE_GLYPH: Record<EntityKind, React.ReactNode> = {
  company: <span className="inline-block h-1.5 w-1.5 bg-current" />,
  person: <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />,
  product: <span className="inline-block h-1.5 w-1.5 rounded-sm bg-current" />,
  technology: <span className="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />,
  location: <span className="inline-block h-1.5 w-1.5 rounded-full border border-current bg-transparent" />,
};

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

function ChevronDown() {
  return (
    <svg viewBox="0 0 10 10" className="h-2 w-2">
      <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

/** Single-select facet dropdown — button trigger ("Label · value"), opens a
 * popover list beneath. Active when a non-default value is selected. */
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={
          'inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[13.5px] transition-colors ' +
          (isActive ? 'bg-paper2 text-ink' : 'bg-paper text-muted hover:text-ink')
        }
      >
        <span>{label}</span>
        {current ? <span className="text-ink">· {current.label}</span> : null}
        <span className="text-mute2">
          <ChevronDown />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] border border-border bg-paper py-1 shadow-[0_8px_24px_-8px_rgba(28,26,22,0.2)]">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value || '__all'}
                type="button"
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
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
          })}
        </div>
      ) : null}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  // Sync prop → local when the URL-driven value changes from outside.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setLocal(value);
  }
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 250);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex w-full items-center gap-2 border border-border bg-paper2 px-2.5 py-1.5 md:w-[300px]">
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-muted">
        <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M7.5 7.5 L10 10" stroke="currentColor" strokeWidth="1.1" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="search name or alias…"
        className="flex-1 bg-transparent font-mono text-[13.5px] text-ink outline-none placeholder:text-mute2"
      />
      <kbd className="border border-border bg-paper px-1 font-mono text-[11.5px] text-mute2">
        /
      </kbd>
    </div>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
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

  const { data, isLoading, error } = useGetEntityListQuery({
    type: type || undefined,
    sort,
    q: q || undefined,
  });

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
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
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          /entities
        </div>
        <h1 className="pretty font-serif text-[30px] leading-tight text-ink">
          Entities
        </h1>
      </header>

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
          <SearchInput value={q} onChange={(v) => updateParams({ q: v || undefined })} />
        </div>

        {/* Subtitle */}
        <div className="flex items-baseline justify-between gap-3 border-b border-border bg-paper2/40 px-5 py-1.5 font-mono text-[12.5px] text-mute2">
          <span>{subtitle}</span>
          <span className="tnum">
            sorted by {sortLabel}
            {data ? (
              <>
                {' '}· <span className="text-ink">{data.entities.length}</span> entit
                {data.entities.length === 1 ? 'y' : 'ies'}
              </>
            ) : null}
          </span>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="px-5 py-10 text-center font-mono text-[13px] text-mute2">Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-center">
            <p className="font-serif text-[22px] text-critical">Couldn't load entities</p>
            <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
              {(error as { data?: { message?: string } }).data?.message ??
                'Try a different filter or refresh the page.'}
            </p>
          </div>
        ) : !data || data.entities.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-serif text-[22px] text-ink">No entities yet</p>
            <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
              Entities are extracted from articles. Pull a feed in{' '}
              <Link to="/feeds" className="text-accent hover:text-accent-deep">
                Feeds
              </Link>{' '}
              to populate this directory.
            </p>
          </div>
        ) : (
          data.entities.map((e) => (
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
                    {TYPE_GLYPH[e.type]}
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
                  <span className="tnum" title={e.lastSeenTs ?? undefined}>
                    {fmtRelative(e.lastSeenTs)}
                  </span>
                </div>
              </div>
              <div className="mt-0.5 pl-6 font-mono text-[12px] uppercase tracking-[0.06em] text-mute2">
                {e.type}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
