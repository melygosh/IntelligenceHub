import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';
import { createBurstCoalescer } from './coalesce';

// One feed pull emits dozens of `article.analyzed` events in a burst; coalesce
// them into a single cache invalidation per window rather than refetching the
// list once per event.
const SSE_INVALIDATE_DEBOUNCE_MS = 800;

/**
 * Filters the SSE stream to `article.analyzed` events and invalidates the
 * Articles list cache so newly-ready rows appear without a manual refresh.
 *
 * Mount on any page that displays the article list (ArticlesList,
 * potentially Dashboard if it grows a live feed). Multiple consumers
 * mount cheaply — each opens its own EventSource subscription via
 * useServerEvents, but a single event invalidates the shared RTK cache
 * once via the discriminated type check.
 *
 * Invalidations are coalesced: a feed pull emits one ready event per article,
 * and invalidating the actively-subscribed Articles query per event would
 * refetch + re-render the current page dozens of times. A burst collapses into
 * a single invalidation per ~800ms window (the mutation path debounces the same
 * way with its post-pull setTimeout).
 *
 * Distinct from useFeedPullEvents (which is mounted on FeedsPage for
 * pull-level toasts) so /articles works standalone, without /feeds being
 * open in another tab.
 */
export function useArticleAnalyzedEvents(): void {
  const dispatch = useDispatch();
  // Lazily create one coalescer per mount (useState initializer runs once;
  // dispatch is stable across renders, so capturing the mount-time one is safe).
  const [coalescer] = useState(() =>
    createBurstCoalescer(
      () => dispatch(api.util.invalidateTags(['Articles', 'Dashboard'])),
      SSE_INVALIDATE_DEBOUNCE_MS,
    ),
  );

  useEffect(() => () => coalescer.cancel(), [coalescer]);

  useServerEvents((event) => {
    if (event.type !== 'article.analyzed') return;
    if (event.payload.status !== 'ready') return;
    // Dashboard cards also depend on ready-article counts (total articles,
    // top entities/categories/feeds), so re-fetch them alongside the list.
    // Graph is intentionally excluded — it's heavier and live-updating the
    // layout while the user explores would be jarring; reload-on-open is
    // the right UX there.
    coalescer.schedule();
  });
}
