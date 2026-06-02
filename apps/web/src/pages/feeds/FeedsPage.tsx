import { useCallback, useMemo, useRef, useState } from 'react';
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useGetFeedsQuery,
  usePullAllFeedsMutation,
  usePullFeedMutation,
  useUpdateFeedMutation,
  useValidateFeedMutation,
} from '../../store/api';
import type { Feed, ValidateFeedResponse } from '@intelligencehub/shared';
import { useFeedPullEvents } from '../../events/useFeedPullEvents';
import { useToasts } from '../../components/toast/useToasts';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Sep } from '../../components/ui/Sep';
import { ExternalIcon } from '../../components/ui/ExternalIcon';
import { fmtRelative } from '../../lib/fmtRelative';

// Icon set from docs/IntelligenceHub_design/Sources.html — currentColor + thin strokes.
const PlayIcon = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3">
    <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3">
    <rect x="3" y="2.5" width="2" height="7" fill="currentColor" />
    <rect x="7" y="2.5" width="2" height="7" fill="currentColor" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3">
    <path
      d="M2 6 a4 4 0 0 1 7-2.5 L9 3 M10 6 a4 4 0 0 1 -7 2.5 L3 9 M9 1.5 V3.5 H7 M3 10.5 V8.5 H5"
      stroke="currentColor"
      strokeWidth="1.2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3">
    <path
      d="M3 4 V10 H9 V4 M2 4 H10 M5 2 H7"
      stroke="currentColor"
      strokeWidth="1.1"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M5 5.5 V8.5 M7 5.5 V8.5"
      stroke="currentColor"
      strokeWidth="0.9"
      strokeLinecap="round"
    />
  </svg>
);
const WarnTriIcon = () => (
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
);
const SpinnerIcon = () => (
  <span
    aria-hidden="true"
    className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

function RowActionBtn({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const cls =
    variant === 'danger'
      ? 'text-mute2 hover:text-critical hover:bg-critical-bg'
      : variant === 'primary'
        ? 'text-accent hover:text-accent-deep hover:bg-accent/10'
        : 'text-mute2 hover:text-ink hover:bg-paper2';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`relative inline-flex h-7 w-7 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {icon}
    </button>
  );
}

// Soft-bg pill colors per status. Hex matches the design's STATUS_STYLE so the
// pill's bg/fg/border stays visually distinct from the page chrome.
const STATUS_STYLE: Record<Feed['status'], { bg: string; fg: string; dot: string; label: string }> =
  {
    active: { bg: '#dde5d2', fg: '#2f4a26', dot: '#4d6b3e', label: 'active' },
    paused: { bg: '#ece6d8', fg: '#6b6557', dot: '#9b9486', label: 'paused' },
    error: { bg: '#f5e6df', fg: '#7e2b1f', dot: '#7e2b1f', label: 'error' },
  };

function StatusBadge({ status }: { status: Feed['status'] }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[11.5px] uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.dot}55` }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function StatusLeading({ status }: { status: Feed['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: STATUS_STYLE.active.dot }}
        />
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="inline-flex h-3 w-3 items-center justify-center text-mute2">
        <PauseIcon />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3 w-3 items-center justify-center text-critical">
      <WarnTriIcon />
    </span>
  );
}

function StatsLine({ feeds }: { feeds: Feed[] }) {
  const total = feeds.length;
  const active = feeds.filter((f) => f.status === 'active').length;
  const paused = feeds.filter((f) => f.status === 'paused').length;
  const errors = feeds.filter((f) => f.status === 'error').length;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px]">
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

const REASON_LABEL: Record<Extract<ValidateFeedResponse, { ok: false }>['reason'], string> = {
  unreachable: 'Could not reach the URL',
  not_a_feed: 'Not a valid RSS or Atom feed',
  malformed_url: 'URL is malformed',
  empty: 'Feed is empty',
  blocked: 'That address is not allowed',
};

type Stage =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | {
      kind: 'valid';
      title: string;
      iconUrl: string | null;
      normalisedUrl: string;
      itemCount: number;
    }
  | { kind: 'invalid'; reason: keyof typeof REASON_LABEL; detail: string };

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
      <path
        d="M3 7.5 L6 10 L11 4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
      <path
        d="M7 1.5 L13 12 H1 Z M7 6 V8.5 M7 10 V10.2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddFeedForm() {
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [validateFeed] = useValidateFeedMutation();
  const [createFeed, { isLoading: isAdding }] = useCreateFeedMutation();
  const { push: pushToast } = useToasts();

  const reset = () => setStage({ kind: 'idle' });

  async function onValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStage({ kind: 'validating' });
    try {
      const res = await validateFeed({ url: url.trim() }).unwrap();
      if (res.ok) {
        setStage({
          kind: 'valid',
          title: res.title,
          iconUrl: res.iconUrl,
          normalisedUrl: res.normalisedUrl,
          itemCount: res.itemCount,
        });
      } else {
        setStage({ kind: 'invalid', reason: res.reason, detail: res.detail });
      }
    } catch (err) {
      setStage({
        kind: 'invalid',
        reason: 'unreachable',
        detail:
          (err as { data?: { message?: string } }).data?.message ??
          'Request failed — check the URL and try again.',
      });
    }
  }

  async function onAdd() {
    if (stage.kind !== 'valid') return;
    const label = stage.title;
    try {
      await createFeed({
        url: stage.normalisedUrl,
        title: stage.title,
        iconUrl: stage.iconUrl ?? undefined,
      }).unwrap();
      setUrl('');
      reset();
      pushToast({ severity: 'success', title: 'Feed added', subtitle: label });
    } catch (err) {
      pushToast({
        severity: 'error',
        title: 'Failed to add',
        subtitle: label,
        body: (err as { data?: { message?: string } }).data?.message ?? 'Feed may already exist.',
      });
    }
  }

  const showClear = stage.kind !== 'idle' && stage.kind !== 'validating';
  const validateDisabled = !url.trim() || stage.kind === 'validating';

  return (
    <div className="border border-border bg-paper">
      <form onSubmit={onValidate} className="flex flex-wrap items-end gap-2 px-5 py-2.5">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
            Add feed
          </span>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (stage.kind !== 'idle' && stage.kind !== 'validating') reset();
            }}
            placeholder="https://example.com/feed.xml — or paste any site URL, we'll discover the feed"
            disabled={stage.kind === 'validating'}
            className={
              'w-full border bg-paper px-3 py-1.5 font-mono text-[13.5px] text-ink placeholder-mute2 focus:outline-none ' +
              (stage.kind === 'invalid'
                ? 'border-critical/50 focus:border-critical'
                : 'border-border focus:border-ink')
            }
          />
        </label>
        <div className="flex items-center gap-2">
          {showClear ? (
            <button
              type="button"
              onClick={() => {
                reset();
                setUrl('');
              }}
              className="border border-transparent px-3 py-1.5 font-mono text-[13.5px] text-muted hover:border-border hover:text-ink"
            >
              clear
            </button>
          ) : null}
          <button
            type="submit"
            disabled={validateDisabled}
            className={
              'inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[13.5px] transition-colors ' +
              (validateDisabled
                ? 'cursor-not-allowed border-border bg-paper2 text-mute2'
                : 'border-ink bg-ink text-paper hover:border-accent-deep hover:bg-accent-deep')
            }
          >
            {stage.kind === 'validating' ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
                <span>validating…</span>
              </>
            ) : (
              <>
                <span>Validate</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>
      </form>

      {stage.kind === 'validating' ? (
        <div className="flex items-center gap-2 border-t border-border bg-paper2/40 px-5 py-2.5 font-mono text-[13px] text-muted">
          <span className="pulse-soft inline-block h-2 w-2 rounded-full bg-accent" />
          <span>Fetching feed metadata, parsing entries…</span>
        </div>
      ) : null}

      {stage.kind === 'valid' ? (
        <div className="border-t border-border bg-accent/5">
          <div className="flex items-start gap-3 px-5 py-2.5">
            <span className="mt-0.5 shrink-0 text-accent">
              <CheckIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-[16px] text-ink">
                  Found <span className="font-medium">{stage.title}</span>
                </span>
                <span className="truncate font-mono text-[12.5px] text-muted">
                  {stage.normalisedUrl}
                </span>
              </div>
              <div className="font-mono text-[12.5px] text-muted">
                <span className="tnum text-ink">{stage.itemCount}</span> items detected
              </div>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={isAdding}
              className="inline-flex shrink-0 items-center gap-1.5 bg-accent px-3 py-1.5 font-mono text-[14px] text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-mute2"
            >
              {isAdding ? (
                <span>adding…</span>
              ) : (
                <>
                  <span>Add to sources</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === 'invalid' ? (
        <div className="border-t border-border bg-critical-bg">
          <div className="flex items-start gap-3 px-5 py-2.5">
            <span className="mt-0.5 shrink-0 text-critical">
              <WarnIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[15px] font-medium text-critical">
                {REASON_LABEL[stage.reason]}
              </div>
              <div className="pretty font-mono text-[13px] text-critical/80">{stage.detail}</div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="shrink-0 border border-critical/40 bg-paper px-3 py-1.5 font-mono text-[14px] text-critical hover:bg-paper2"
            >
              Try a different URL
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function FeedsPage() {
  const { data, isLoading } = useGetFeedsQuery();
  const [deleteFeed] = useDeleteFeedMutation();
  const [pullFeed] = usePullFeedMutation();
  const [pullAllFeeds, { isLoading: isPullingAll }] = usePullAllFeedsMutation();
  const [updateFeed] = useUpdateFeedMutation();
  const { push: pushToast } = useToasts();

  // Feed IDs currently in-flight (queued or being processed). Add on pull
  // dispatch, remove on the matching feed.pull.done / feed.pull.failed SSE
  // event. 60s safety timeout clears stale entries if the SSE event is missed.
  const [pendingPulls, setPendingPulls] = useState<Set<string>>(new Set());
  const pendingTimeouts = useRef<Map<string, number>>(new Map());

  const clearPending = useCallback((ids: string[]) => {
    setPendingPulls((prev) => {
      let mutated = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (next.delete(id)) mutated = true;
      }
      return mutated ? next : prev;
    });
    for (const id of ids) {
      const t = pendingTimeouts.current.get(id);
      if (t !== undefined) {
        window.clearTimeout(t);
        pendingTimeouts.current.delete(id);
      }
    }
  }, []);

  const addPending = useCallback(
    (ids: string[]) => {
      setPendingPulls((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      for (const id of ids) {
        const existing = pendingTimeouts.current.get(id);
        if (existing !== undefined) window.clearTimeout(existing);
        const t = window.setTimeout(() => clearPending([id]), 60_000);
        pendingTimeouts.current.set(id, t);
      }
    },
    [clearPending],
  );

  // feedId → label lookup so SSE callbacks can show "OpenAI Blog: 4 new
  // articles" instead of an opaque UUID. Closure captures the latest map
  // on every render (useServerEvents stores the callback in a ref).
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of data?.feeds ?? []) m.set(f.id, f.title ?? f.url);
    return m;
  }, [data]);

  useFeedPullEvents({
    onDone: ({ feedId, inserted, filtered, duplicates }) => {
      clearPending([feedId]);
      const label = labelById.get(feedId) ?? 'Feed';
      const parts: string[] = [];
      // `inserted` = new articles queued for analysis. Analysis runs async on
      // the article-analyze queue, so they appear on the list as each finishes
      // (article.analyzed re-invalidates Articles). Say "analyzing" so an empty
      // list right after the pull isn't mistaken for "nothing happened".
      if (inserted > 0) parts.push(`${inserted} new · analyzing`);
      if (duplicates > 0) parts.push(`${duplicates} duplicate`);
      if (filtered > 0) parts.push(`${filtered} filtered`);
      if (parts.length === 0) {
        pushToast({
          severity: 'info',
          title: 'Pull complete',
          subtitle: label,
          body: 'No new items.',
        });
        return;
      }
      pushToast({
        severity: 'success',
        title: 'Pull complete',
        subtitle: label,
        body: parts.join(' · '),
      });
    },
    onFailed: ({ feedId, error }) => {
      clearPending([feedId]);
      const label = labelById.get(feedId) ?? 'Feed';
      pushToast({
        severity: 'error',
        title: 'Pull failed',
        subtitle: label,
        body: error,
      });
    },
  });

  async function onPullAll() {
    const candidates = (data?.feeds ?? []).filter((f) => f.status !== 'paused').map((f) => f.id);
    try {
      const res = await pullAllFeeds().unwrap();
      if (res.enqueued === 0) {
        pushToast({
          severity: 'info',
          title: 'Nothing to pull',
          body:
            res.skippedPaused > 0
              ? `${res.skippedPaused} paused feed${res.skippedPaused === 1 ? '' : 's'} skipped.`
              : 'No feeds yet — add one above.',
        });
        return;
      }
      addPending(candidates);
      const parts = [`${res.enqueued} feed${res.enqueued === 1 ? '' : 's'} queued`];
      if (res.skippedPaused > 0) {
        parts.push(`${res.skippedPaused} paused skipped`);
      }
      if (res.skippedInFlight > 0) {
        parts.push(`${res.skippedInFlight} already in progress`);
      }
      pushToast({
        severity: 'info',
        title: 'Pull all queued',
        body: parts.join(' · '),
      });
    } catch (err) {
      pushToast({
        severity: 'error',
        title: 'Failed to enqueue pulls',
        body: (err as { data?: { message?: string } }).data?.message ?? 'Request failed.',
      });
    }
  }

  async function onPull(feed: Feed) {
    const label = feed.title ?? feed.url;
    addPending([feed.id]);
    try {
      const res = await pullFeed(feed.id).unwrap();
      if (!res.enqueued) {
        clearPending([feed.id]);
        pushToast({
          severity: 'info',
          title: 'Already in progress',
          subtitle: label,
        });
        return;
      }
      pushToast({ severity: 'info', title: 'Queued for pull', subtitle: label });
    } catch {
      clearPending([feed.id]);
      pushToast({ severity: 'error', title: 'Failed to enqueue', subtitle: label });
    }
  }

  async function onDelete(id: string) {
    const label = labelById.get(id) ?? 'Feed';
    try {
      await deleteFeed(id).unwrap();
      pushToast({ severity: 'success', title: 'Feed deleted', subtitle: label });
    } catch {
      pushToast({ severity: 'error', title: 'Failed to delete', subtitle: label });
    }
  }

  async function onTogglePause(feed: Feed) {
    const label = feed.title ?? feed.url;
    try {
      const next = feed.status === 'paused' ? 'active' : 'paused';
      await updateFeed({ id: feed.id, body: { status: next } }).unwrap();
      pushToast({
        severity: 'info',
        title: next === 'paused' ? 'Paused' : 'Resumed',
        subtitle: label,
      });
    } catch {
      pushToast({ severity: 'error', title: 'Failed to update', subtitle: label });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="/feeds"
        title="Sources & pulls"
        subtitle={data ? <StatsLine feeds={data.feeds} /> : undefined}
      />

      <AddFeedForm />

      {isLoading ? (
        <LoadingHint />
      ) : !data || data.feeds.length === 0 ? (
        <div className="border border-dashed border-border">
          <EmptyState
            title="No feeds yet"
            subtitle={
              <>
                Add an RSS or Atom feed URL above to start pulling articles. Try{' '}
                <code className="text-ink">https://hnrss.org/frontpage</code> if you don't have one
                handy.
              </>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={onPullAll}
              disabled={isPullingAll || pendingPulls.size > 0}
              className="inline-flex items-center justify-center gap-1.5 border border-accent bg-accent px-2.5 py-1 font-mono text-[12.5px] text-paper transition-colors hover:border-accent-deep hover:bg-accent-deep disabled:cursor-not-allowed disabled:border-border disabled:bg-paper2 disabled:text-mute2"
            >
              <span className="inline-flex h-3 w-3 items-center justify-center">
                {isPullingAll || pendingPulls.size > 0 ? <SpinnerIcon /> : <RefreshIcon />}
              </span>
              <span>
                {isPullingAll
                  ? 'queuing…'
                  : pendingPulls.size > 0
                    ? `pulling ${pendingPulls.size}…`
                    : 'pull all'}
              </span>
            </button>
          </div>
          <div className="border border-border bg-paper">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                All feeds
              </span>
              <span className="font-mono text-[12.5px] tnum text-mute2">
                sorted by last pull · desc
              </span>
            </div>
            {data.feeds.map((feed) => {
              const isPaused = feed.status === 'paused';
              const isError = feed.status === 'error';
              const isPulling = pendingPulls.has(feed.id);
              return (
                <article
                  key={feed.id}
                  className="grid grid-cols-[20px_1fr_auto] gap-x-4 border-b border-border px-5 py-3 last:border-b-0 hover:bg-paper2/40"
                >
                  <div className="self-center">
                    <StatusLeading status={feed.status} />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-baseline gap-2">
                      {feed.title ? (
                        <span
                          className={`pretty text-[16px] font-medium leading-snug ${isPaused ? 'text-muted' : 'text-ink'}`}
                        >
                          {feed.title}
                        </span>
                      ) : (
                        <span className="font-mono text-[13px] italic text-mute2">
                          pulling first run…
                        </span>
                      )}
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[12.5px] text-mute2 hover:text-ink"
                      >
                        <span className="truncate">{feed.url}</span>
                        <span className="shrink-0">
                          <ExternalIcon />
                        </span>
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px]">
                      <StatusBadge status={feed.status} />
                      <Sep />
                      <span className="text-muted">
                        last{' '}
                        <span className="tnum text-ink" title={feed.lastPullAt ?? undefined}>
                          {fmtRelative(feed.lastPullAt)}
                        </span>
                      </span>
                      <Sep />
                      {isError ? (
                        <span className="text-critical">{feed.lastPullError ?? 'pull failed'}</span>
                      ) : isPaused ? (
                        <span className="italic text-mute2">no pulls while paused</span>
                      ) : (
                        <span className="text-muted">
                          added{' '}
                          <span className="tnum text-ink">
                            {new Date(feed.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-px self-center">
                    {isPaused ? (
                      <RowActionBtn
                        icon={<PlayIcon />}
                        label="Resume"
                        variant="primary"
                        onClick={() => onTogglePause(feed)}
                        disabled={isPulling}
                      />
                    ) : (
                      <RowActionBtn
                        icon={<PauseIcon />}
                        label="Pause"
                        onClick={() => onTogglePause(feed)}
                        disabled={isPulling}
                      />
                    )}
                    <RowActionBtn
                      icon={isPulling ? <SpinnerIcon /> : <RefreshIcon />}
                      label={isPulling ? 'Pulling…' : 'Pull now'}
                      onClick={() => onPull(feed)}
                      disabled={isPaused || isPulling}
                    />
                    <RowActionBtn
                      icon={<TrashIcon />}
                      label="Delete"
                      variant="danger"
                      onClick={() => onDelete(feed.id)}
                      disabled={isPulling}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
