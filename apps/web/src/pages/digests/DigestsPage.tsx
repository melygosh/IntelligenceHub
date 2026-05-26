import { useState } from 'react';
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
  useStartDigestMutation,
} from '../../store/api';
import { useDigestStatusEvents } from '../../events/useDigestStatusEvents';

const Sep = () => <span className="text-border2">·</span>;

const STATUS_COLOR: Record<DigestStatus, string> = {
  building: 'bg-muted text-paper',
  ready: 'bg-accent text-paper',
  failed: 'bg-critical text-paper',
};

function periodLabel(p: DigestPeriod): string {
  return p === 'day' ? 'Last 24h' : p === 'week' ? 'Last week' : 'Last month';
}

function DigestRow({ d }: { d: DigestSummary }) {
  const from = new Date(d.windowFrom);
  const to = new Date(d.windowTo);
  const fmt = (x: Date) =>
    x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const created = new Date(d.createdAt);
  const ageSec = Math.floor((Date.now() - created.getTime()) / 1000);
  const age =
    ageSec < 60 ? `${ageSec}s ago`
    : ageSec < 3600 ? `${Math.floor(ageSec / 60)}m ago`
    : `${Math.floor(ageSec / 3600)}h ago`;

  return (
    <li className="hover:bg-paper2">
      <Link
        to={`/digests/${d.id}`}
        className="flex items-baseline gap-3 px-1 py-3"
      >
        <span
          className={`inline-block px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] ${STATUS_COLOR[d.status]}`}
        >
          {d.status}
        </span>
        <span className="font-mono text-[11px] text-ink">{periodLabel(d.period)}</span>
        <Sep />
        <span className="font-mono text-[10.5px] text-muted">
          {fmt(from)} → {fmt(to)}
        </span>
        <Sep />
        <span className="font-mono text-[10.5px] tnum text-muted">
          {d.articleCount} articles · {d.entityCount} entities
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-mute2">{age}</span>
      </Link>
    </li>
  );
}

function DigestForm() {
  const [period, setPeriod] = useState<DigestPeriod>('week');
  const [scopeKind, setScopeKind] = useState<DigestScopeKind>('category');
  const [scopeFilterIds, setScopeFilterIds] = useState<string[]>([]);
  const { data: cats } = useGetCategoriesQuery();
  const [start, { isLoading, error }] = useStartDigestMutation();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: BuildDigestRequest = { period, scopeKind, scopeFilterIds };
    await start(body).unwrap().catch(() => {});
    setScopeFilterIds([]);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
        <span className="text-muted">Period:</span>
        {(['day', 'week', 'month'] as DigestPeriod[]).map((p) => (
          <label key={p} className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="period"
              checked={period === p}
              onChange={() => setPeriod(p)}
              className="h-3 w-3 accent-accent"
            />
            <span className="text-ink">{p}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
        <span className="text-muted">Scope:</span>
        {(['category', 'entity'] as DigestScopeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setScopeKind(k); setScopeFilterIds([]); }}
            aria-pressed={scopeKind === k}
            className={
              'border border-border px-2 py-0.5 text-[10.5px] ' +
              (scopeKind === k ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-paper2')
            }
          >
            {k}
          </button>
        ))}
        <span className="text-mute2">(empty = all)</span>
      </div>

      {scopeKind === 'category' && cats?.categories.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {cats.categories.map((c) => {
            const on = scopeFilterIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setScopeFilterIds(on
                    ? scopeFilterIds.filter((id) => id !== c.id)
                    : [...scopeFilterIds, c.id])}
                className={
                  'border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] ' +
                  (on ? 'bg-accent text-paper' : 'bg-paper text-muted hover:text-ink')
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {scopeKind === 'entity' ? (
        <div className="font-mono text-[10.5px] text-mute2">
          Entity scope filter — use empty = all for now. Granular entity picker is Phase 3.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 font-mono text-[12px] text-paper hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-mute2"
      >
        {isLoading ? 'Submitting…' : 'Generate digest →'}
      </button>

      {error ? (
        <div className="font-mono text-[10.5px] text-critical">
          {String((error as { data?: { message?: string } }).data?.message ?? 'Request failed')}
        </div>
      ) : null}
    </form>
  );
}

function DigestHistory() {
  const { data, isLoading } = useGetDigestsQuery();

  if (isLoading) {
    return <p className="font-mono text-[11px] text-mute2">Loading…</p>;
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="border border-dashed border-border px-6 py-10 text-center">
        <p className="font-serif text-[18px] text-ink">No digests yet</p>
        <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
          Fill the form above and click <span className="text-ink">Generate digest</span> to create one.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {data.items.map((d) => <DigestRow key={d.id} d={d} />)}
    </ul>
  );
}

export default function DigestsPage() {
  useDigestStatusEvents();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          /digests
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">
          Digests
        </h1>
        <p className="font-mono text-[10.5px] text-mute2">
          On-demand. Fill the form, submit, watch the new row build at the top of history, click to read.
        </p>
      </header>

      <DigestForm />
      <DigestHistory />
    </div>
  );
}
