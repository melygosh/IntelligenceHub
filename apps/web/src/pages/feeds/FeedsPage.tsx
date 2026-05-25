import { useState } from 'react';
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useGetFeedsQuery,
  usePullFeedMutation,
  useUpdateFeedMutation,
} from '../../store/api';
import type { Feed } from '@intelligencehub/shared';

const Sep = () => <span className="text-border2">·</span>;

const ActionBtn = ({
  children,
  onClick,
  variant = 'default',
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) => {
  const base =
    'border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors disabled:opacity-50';
  const variants =
    variant === 'danger'
      ? 'border-border text-critical hover:border-critical hover:bg-critical-bg'
      : 'border-border text-muted hover:border-ink hover:text-ink hover:bg-paper2';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variants}`}>
      {children}
    </button>
  );
};

const STATUS_STYLE: Record<Feed['status'], { dot: string; label: string }> = {
  active: { dot: 'bg-accent', label: 'text-accent' },
  paused: { dot: 'bg-mute2', label: 'text-mute2' },
  error: { dot: 'bg-critical', label: 'text-critical' },
};

function StatusBadge({ status }: { status: Feed['status'] }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em]">
      <span className={`inline-block h-1.5 w-1.5 ${s.dot}`} />
      <span className={s.label}>{status}</span>
    </span>
  );
}

function StatsLine({ feeds }: { feeds: Feed[] }) {
  const total = feeds.length;
  const active = feeds.filter((f) => f.status === 'active').length;
  const paused = feeds.filter((f) => f.status === 'paused').length;
  const errors = feeds.filter((f) => f.status === 'error').length;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px]">
      <span className="text-muted">your feeds</span>
      <Sep />
      <span className="tnum text-ink">{total} total</span>
      <Sep />
      <span className="tnum text-ink">{active}</span>
      <span className="text-muted">active</span>
      <Sep />
      <span className="tnum text-ink">{paused}</span>
      <span className="text-muted">paused</span>
      <Sep />
      <span className="tnum text-ink">{errors}</span>
      <span className="text-muted">errors</span>
    </div>
  );
}

export default function FeedsPage() {
  const { data, isLoading } = useGetFeedsQuery();
  const [createFeed, { isLoading: isCreating }] = useCreateFeedMutation();
  const [deleteFeed] = useDeleteFeedMutation();
  const [pullFeed] = usePullFeedMutation();
  const [updateFeed] = useUpdateFeedMutation();
  const [url, setUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    try {
      await createFeed({ url }).unwrap();
      setUrl('');
      showToast('Feed added');
    } catch {
      showToast('Failed to add (check URL or duplicate)');
    }
  }

  async function onPull(id: string) {
    try {
      await pullFeed(id).unwrap();
      showToast('Queued — watch /admin/queues');
    } catch {
      showToast('Failed to enqueue');
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteFeed(id).unwrap();
      showToast('Feed deleted');
    } catch {
      showToast('Failed to delete');
    }
  }

  async function onTogglePause(feed: Feed) {
    try {
      const next = feed.status === 'paused' ? 'active' : 'paused';
      await updateFeed({ id: feed.id, body: { status: next } }).unwrap();
      showToast(next === 'paused' ? 'Paused' : 'Resumed');
    } catch {
      showToast('Failed to update');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Feeds
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">
          Sources & pulls
        </h1>
        {data ? <StatsLine feeds={data.feeds} /> : null}
        {toast ? <div className="mt-2 font-mono text-[10.5px] text-accent">{toast}</div> : null}
      </header>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          type="url"
          required
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 border border-border bg-paper px-3 py-2 font-mono text-[13px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={isCreating || !url}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-mono text-[12.5px] text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-mute2"
        >
          {isCreating ? 'adding…' : 'add feed'}
          {!isCreating ? <span>→</span> : null}
        </button>
      </form>

      {isLoading ? (
        <p className="font-mono text-[11px] text-mute2">Loading…</p>
      ) : !data || data.feeds.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-[18px] text-ink">No feeds yet</p>
          <p className="mx-auto mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-muted">
            Add an RSS or Atom feed URL above to start pulling articles. Try{' '}
            <code className="text-ink">https://hnrss.org/frontpage</code> if you don't have one
            handy.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border bg-surface">
          {data.feeds.map((feed) => (
            <li key={feed.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={feed.status} />
                    {feed.title ? (
                      <span className="truncate text-[13px] text-ink">{feed.title}</span>
                    ) : (
                      <span className="font-mono text-[11px] italic text-mute2">
                        no title yet
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-mute2">
                    {feed.url}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-mute2">
                    last pull{' '}
                    <span className="tnum text-muted">
                      {feed.lastPullAt
                        ? new Date(feed.lastPullAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                    <Sep />
                    added{' '}
                    <span className="tnum text-muted">
                      {new Date(feed.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <ActionBtn onClick={() => onTogglePause(feed)}>
                    {feed.status === 'paused' ? 'resume' : 'pause'}
                  </ActionBtn>
                  <ActionBtn
                    onClick={() => onPull(feed.id)}
                    disabled={feed.status === 'paused'}
                  >
                    pull now
                  </ActionBtn>
                  <ActionBtn variant="danger" onClick={() => onDelete(feed.id)}>
                    delete
                  </ActionBtn>
                </div>
              </div>
              {feed.status === 'error' && feed.lastPullError ? (
                <div className="border border-critical/30 bg-critical-bg px-2.5 py-1.5 font-mono text-[10.5px] text-critical">
                  {feed.lastPullError}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
