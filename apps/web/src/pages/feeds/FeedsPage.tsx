import { useState } from 'react';
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useGetFeedsQuery,
  usePullFeedMutation,
} from '../../store/api';

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

export default function FeedsPage() {
  const { data, isLoading } = useGetFeedsQuery();
  const [createFeed, { isLoading: isCreating }] = useCreateFeedMutation();
  const [deleteFeed] = useDeleteFeedMutation();
  const [pullFeed] = usePullFeedMutation();
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
      showToast('Failed to add (check URL)');
    }
  }

  async function onPull(id: string) {
    try {
      await pullFeed(id).unwrap();
      showToast('Queued — see Bull Board');
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

  const feedCount = data?.feeds.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Feeds
        </div>
        <h1 className="pretty mb-3 font-serif text-[28px] leading-tight text-ink">
          Sources & pulls
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px]">
          <span className="text-muted">your feeds</span>
          <Sep />
          <span className="tnum text-ink">{feedCount} total</span>
          {toast ? (
            <>
              <Sep />
              <span className="text-accent">{toast}</span>
            </>
          ) : null}
        </div>
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
            Add an RSS or Atom feed URL above to start pulling articles. The first pull is
            manual — click <span className="text-ink">pull now</span> after adding.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border bg-surface">
          {data.feeds.map((feed) => (
            <li key={feed.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12.5px] text-ink">{feed.url}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-mute2">
                  added{' '}
                  <span className="tnum text-muted">
                    {new Date(feed.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <ActionBtn onClick={() => onPull(feed.id)}>pull now</ActionBtn>
                <ActionBtn variant="danger" onClick={() => onDelete(feed.id)}>
                  delete
                </ActionBtn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
