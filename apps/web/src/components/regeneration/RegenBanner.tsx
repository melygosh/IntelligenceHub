import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { api, useGetCurrentRegenerationQuery } from '../../store/api';

const POLLING_MS = 2000;
const COMPLETED_BANNER_MS = 10_000;

export default function RegenBanner() {
  const dispatch = useDispatch();
  const { data: run } = useGetCurrentRegenerationQuery(undefined, {
    pollingInterval: POLLING_MS,
    skipPollingIfUnfocused: true,
  });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [autoHide, setAutoHide] = useState(false);

  useEffect(() => {
    if (!run) return;
    if (run.status === 'completed' || run.status === 'failed') {
      dispatch(api.util.invalidateTags(['Articles', 'Categories', 'Axes']));
      setAutoHide(false);
      const t = setTimeout(() => setAutoHide(true), COMPLETED_BANNER_MS);
      return () => clearTimeout(t);
    }
  }, [run?.id, run?.status, dispatch]);

  if (!run) return null;
  if (dismissed === run.id) return null;
  if (autoHide && run.status !== 'running') return null;

  if (run.status === 'running') {
    const pct =
      run.articlesTotal > 0
        ? Math.round((run.articlesProcessed / run.articlesTotal) * 100)
        : 0;
    return (
      <div className="border-b border-border bg-surface px-6 py-2 font-mono text-[11px] text-ink">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <span>
            Regenerating tags… <span className="text-muted">{run.articlesProcessed}</span> /{' '}
            <span className="text-muted">{run.articlesTotal}</span> articles{' '}
            {run.articlesCacheHit > 0 ? (
              <span className="text-mute2">({run.articlesCacheHit} from cache)</span>
            ) : null}
          </span>
          <div className="h-1 w-32 bg-paper">
            <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (run.status === 'completed') {
    return (
      <div className="border-b border-border bg-surface px-6 py-2 font-mono text-[11px] text-ink">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <span>
            Regeneration done — <strong>{run.articlesProcessed}</strong> articles updated{' '}
            <span className="text-mute2">
              ({run.articlesCacheHit} from cache, {run.articlesLlmCalled} new LLM calls
              {run.articlesErrored > 0 ? `, ${run.articlesErrored} errored` : ''})
            </span>
            . Graph refreshed.
          </span>
          <button
            type="button"
            onClick={() => setDismissed(run.id)}
            className="text-mute2 hover:text-ink"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // failed
  return (
    <div className="border-b border-border bg-surface px-6 py-2 font-mono text-[11px] text-critical">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <span>Regeneration failed: {run.errorMessage ?? 'unknown error'}.</span>
        <button
          type="button"
          onClick={() => setDismissed(run.id)}
          className="text-mute2 hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
