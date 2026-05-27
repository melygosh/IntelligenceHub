import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type BuildDigestRequest,
  type DigestPeriod,
  type DigestScopeKind,
  type DigestStatus,
  type DigestSummary,
} from '@intelligencehub/shared';
import {
  useGetCategoriesQuery,
  useGetDigestsQuery,
  useGetRecentEntitiesQuery,
  useStartDigestMutation,
} from '../../store/api';
import { useDigestStatusEvents } from '../../events/useDigestStatusEvents';
import { EntityGlyph } from '../../components/entities/EntityGlyph';
import { useSlashToFocus } from '../../components/filters/useSlashToFocus';

function EntitySearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useSlashToFocus(inputRef);

  return (
    <div className="flex w-full items-center gap-2 border border-border bg-paper2 px-2.5 py-1.5">
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-muted">
        <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M7.5 7.5 L10 10" stroke="currentColor" strokeWidth="1.1" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search entities by name…"
        className="flex-1 bg-transparent font-mono text-[13.5px] text-ink outline-none placeholder:text-mute2"
      />
      <span className="font-mono text-[12px] text-mute2">/ to focus</span>
    </div>
  );
}

function EntityPicker({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const { data, isLoading } = useGetRecentEntitiesQuery();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const ents = data?.entities ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return ents;
    return ents.filter((e) => e.canonicalName.toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <div className="space-y-2">
      <EntitySearchInput value={q} onChange={setQ} />

      {isLoading ? (
        <div className="font-mono text-[12.5px] text-mute2">Loading entities…</div>
      ) : filtered.length === 0 ? (
        <div className="font-mono text-[12.5px] text-mute2">
          {q ? `No matches for "${q}".` : 'No entities yet — analyze a few articles first.'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((e) => {
            const on = selectedIds.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onToggle(e.id)}
                aria-pressed={on}
                className={
                  'inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[13px] transition-colors ' +
                  (on
                    ? 'border-accent-deep bg-accent text-paper'
                    : 'border-border bg-paper text-ink hover:bg-paper2')
                }
              >
                <span className={on ? 'text-paper' : 'text-mute2'}><EntityGlyph type={e.type} /></span>
                <span>{e.canonicalName}</span>
                {on ? <span aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="pretty font-mono text-[12.5px] text-mute2">
        Showing recently-mentioned entities. The real flow has typeahead against the full
        entity index.
      </div>
    </div>
  );
}

const Sep = () => <span className="text-border2">·</span>;

const STATUS_STYLE: Record<
  DigestStatus,
  { bg: string; fg: string; dot: string; label: string }
> = {
  ready: { bg: '#dde5d2', fg: '#2f4a26', dot: '#4d6b3e', label: 'ready' },
  building: { bg: '#ece6d8', fg: '#6b6557', dot: '#9b9486', label: 'building' },
  failed: { bg: '#f5e6df', fg: '#7e2b1f', dot: '#7e2b1f', label: 'failed' },
};

const PERIOD_LABEL: Record<DigestPeriod, string> = {
  day: 'Last 24h',
  week: 'Last week',
  month: 'Last month',
};

function StatusBadge({ status }: { status: DigestStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[11.5px] uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.dot}55` }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 ${status === 'building' ? 'pulse-soft rounded-full' : ''}`}
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

function StatusLeading({ status }: { status: DigestStatus }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: STATUS_STYLE.ready.dot }}
        />
      </span>
    );
  }
  if (status === 'building') {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center">
        <span
          className="pulse-soft inline-block h-2 w-2 rounded-full"
          style={{ background: STATUS_STYLE.building.dot }}
        />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3 w-3 items-center justify-center text-critical">
      <svg viewBox="0 0 12 12" className="h-3 w-3">
        <path
          d="M6 1 L11 10 H1 Z"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          strokeLinejoin="round"
        />
        <path d="M6 5 V7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="6" cy="9" r="0.5" fill="currentColor" />
      </svg>
    </span>
  );
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function fmtWindow(fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const fmt = (x: Date) =>
    x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(f)} → ${fmt(t)}`;
}

function StatsLine({ items }: { items: DigestSummary[] }) {
  const total = items.length;
  const ready = items.filter((d) => d.status === 'ready').length;
  const building = items.filter((d) => d.status === 'building').length;
  const failed = items.filter((d) => d.status === 'failed').length;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px]">
      <span className="text-muted">your digests</span>
      <Sep />
      <span className="tnum text-ink">{total} total</span>
      <Sep />
      <span className="tnum text-ink">{ready}</span>
      <span className="text-muted">ready</span>
      <Sep />
      <span className="tnum text-ink">{building}</span>
      <span className="text-muted">building</span>
      <Sep />
      <span className="tnum text-ink">{failed}</span>
      <span className="text-muted">failed</span>
    </div>
  );
}

// Rough per-period token estimate range. Used in the form footer so the user
// has a sense of cost before clicking Generate digest — not exact, just a
// "what order of magnitude" hint.
const TOKEN_ESTIMATE: Record<DigestPeriod, string> = {
  day: '5–15k tokens',
  week: '25–60k tokens',
  month: '100–250k tokens',
};

const SCOPE_BTN_LABEL: Record<DigestScopeKind, string> = {
  category: 'by category',
  entity: 'by entity',
};

function SegmentedButton<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            className={
              'border px-3 py-1.5 font-mono text-[13.5px] transition-colors ' +
              (on
                ? 'border-ink bg-ink text-paper'
                : 'border-border bg-paper text-ink hover:bg-paper2')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-6 gap-y-2 px-6 py-3">
      <div className="pt-2 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

function DigestForm() {
  const [period, setPeriod] = useState<DigestPeriod>('week');
  const [scopeKind, setScopeKind] = useState<DigestScopeKind>('category');
  const [scopeFilterIds, setScopeFilterIds] = useState<string[]>([]);
  const { data: cats } = useGetCategoriesQuery();
  const { data: recentEnts } = useGetRecentEntitiesQuery();
  const [start, { isLoading, error }] = useStartDigestMutation();

  const recentEntsList = recentEnts?.entities ?? [];
  const selectedEnts = recentEntsList.filter((e) => scopeFilterIds.includes(e.id));

  const categories = cats?.categories ?? [];
  const selectedCats = categories.filter((c) => scopeFilterIds.includes(c.id));

  function reset() {
    setPeriod('week');
    setScopeKind('category');
    setScopeFilterIds([]);
  }

  function toggleCategory(id: string) {
    setScopeFilterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: BuildDigestRequest = { period, scopeKind, scopeFilterIds };
    await start(body).unwrap().catch(() => {});
    setScopeFilterIds([]);
  };

  // Footer summary — describes scope concisely so the user sees what'll be
  // submitted ("week · 3 categories: A, B, C", "week · 2 entities: OpenAI,
  // Nvidia"). Falls back to "all" when nothing specific is selected.
  let scopeSummary: string;
  if (scopeKind === 'entity') {
    if (selectedEnts.length === 0) {
      scopeSummary = 'all entities';
    } else if (selectedEnts.length <= 3) {
      scopeSummary = `${selectedEnts.length} entit${selectedEnts.length === 1 ? 'y' : 'ies'}: ${selectedEnts.map((e) => e.canonicalName).join(', ')}`;
    } else {
      scopeSummary = `${selectedEnts.length} entities: ${selectedEnts
        .slice(0, 3)
        .map((e) => e.canonicalName)
        .join(', ')} +${selectedEnts.length - 3} more`;
    }
  } else if (selectedCats.length === 0) {
    scopeSummary = 'all categories';
  } else if (selectedCats.length <= 3) {
    scopeSummary = `${selectedCats.length} categor${selectedCats.length === 1 ? 'y' : 'ies'}: ${selectedCats.map((c) => c.name).join(', ')}`;
  } else {
    scopeSummary = `${selectedCats.length} categories: ${selectedCats
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ')} +${selectedCats.length - 3} more`;
  }

  return (
    <form onSubmit={onSubmit} className="border border-border bg-paper">
      <header className="border-b border-border px-6 py-5">
        <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          New digest
        </div>
        <h2 className="pretty font-serif text-[24px] leading-tight text-ink">
          Generate a snapshot
        </h2>
      </header>

      <div className="divide-y divide-border">
        <FormRow label="Period">
          <SegmentedButton
            value={period}
            options={[
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
            ]}
            onChange={setPeriod}
          />
        </FormRow>

        <FormRow label="Scope">
          <SegmentedButton
            value={scopeKind}
            options={[
              { value: 'category', label: SCOPE_BTN_LABEL.category },
              { value: 'entity', label: SCOPE_BTN_LABEL.entity },
            ]}
            onChange={(k) => {
              setScopeKind(k);
              setScopeFilterIds([]);
            }}
          />

          {scopeKind === 'category' ? (
            categories.length === 0 ? (
              <div className="font-mono text-[12.5px] text-mute2">
                No categories yet — add some on the /categories page.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => {
                    const on = scopeFilterIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        aria-pressed={on}
                        className={
                          'inline-flex items-center gap-1 border px-2.5 py-1 font-mono text-[13px] transition-colors ' +
                          (on
                            ? 'border-accent-deep bg-accent text-paper'
                            : 'border-border bg-paper text-ink hover:bg-paper2')
                        }
                      >
                        {on ? <span aria-hidden="true">✓</span> : null}
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <EntityPicker
              selectedIds={scopeFilterIds}
              onToggle={(id) =>
                setScopeFilterIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
            />
          )}
        </FormRow>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-paper2/40 px-6 py-3">
        <div className="min-w-0 font-mono text-[12.5px] text-muted">
          <span className="text-ink">{period}</span>
          <span className="px-1.5 text-border2">·</span>
          <span>{scopeSummary}</span>
          <span className="px-1.5 text-border2">~</span>
          <span className="text-mute2">est. {TOKEN_ESTIMATE[period]}</span>
        </div>
        <div className="flex items-center gap-2">
          {error ? (
            <span className="font-mono text-[12.5px] text-critical">
              {String((error as { data?: { message?: string } }).data?.message ?? 'Request failed')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="border border-transparent px-3 py-1.5 font-mono text-[13.5px] text-muted hover:border-border hover:text-ink"
          >
            reset
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className={
              'inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[13.5px] transition-colors ' +
              (isLoading
                ? 'cursor-not-allowed border-border bg-paper2 text-mute2'
                : 'border-accent bg-accent text-paper hover:border-accent-deep hover:bg-accent-deep')
            }
          >
            {isLoading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
                <span>submitting…</span>
              </>
            ) : (
              <>
                <span>Generate digest</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
}

function DigestRow({ d }: { d: DigestSummary }) {
  return (
    <Link
      to={`/digests/${d.id}`}
      className="grid grid-cols-[20px_1fr_auto] gap-x-4 border-b border-border px-5 py-3 last:border-b-0 hover:bg-paper2/40"
    >
      <div className="self-center">
        <StatusLeading status={d.status} />
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="pretty text-[16px] leading-snug text-ink">
            <span className="font-medium text-muted">{PERIOD_LABEL[d.period]}</span>
            {d.title ? (
              <>
                <span className="text-border2">: </span>
                <span className="font-medium text-ink">{d.title}</span>
              </>
            ) : null}
          </span>
          <span className="font-mono text-[12.5px] text-mute2">
            {fmtWindow(d.windowFrom, d.windowTo)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px]">
          <StatusBadge status={d.status} />
          <Sep />
          <span className="text-muted">
            <span className="tnum text-ink">{d.articleCount}</span> articles
          </span>
          <Sep />
          <span className="text-muted">
            <span className="tnum text-ink">{d.entityCount}</span> entities
          </span>
          <Sep />
          <span className="text-muted">
            scope <span className="text-ink">{d.scopeKind}</span>
            {d.scopeFilterIds.length > 0 ? (
              <span className="text-mute2"> · {d.scopeFilterIds.length} filter{d.scopeFilterIds.length === 1 ? '' : 's'}</span>
            ) : (
              <span className="text-mute2"> · all</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 self-center font-mono text-[12.5px] text-mute2">
        <span className="tnum" title={d.createdAt}>{fmtRelative(d.createdAt)}</span>
        <span className="text-border2">›</span>
      </div>
    </Link>
  );
}

export default function DigestsPage() {
  useDigestStatusEvents();
  const { data, isLoading } = useGetDigestsQuery();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          /digests
        </div>
        <h1 className="pretty mb-3 font-serif text-[30px] leading-tight text-ink">
          Digests
        </h1>
        {data ? <StatsLine items={data.items} /> : null}
      </header>

      <DigestForm />

      {isLoading ? (
        <p className="font-mono text-[13px] text-mute2">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[22px] text-ink">No digests yet</p>
          <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
            Fill the form above and click <span className="text-ink">Generate digest</span> to
            create one. Watch the new row appear at the top and update live as it builds.
          </p>
        </div>
      ) : (
        <div className="border border-border bg-paper">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
            <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
              All digests
            </span>
            <span className="font-mono text-[12.5px] tnum text-mute2">
              sorted by created · desc
            </span>
          </div>
          {data.items.map((d) => (
            <DigestRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}
