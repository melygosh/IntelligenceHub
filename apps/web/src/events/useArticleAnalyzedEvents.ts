import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';

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
 * Distinct from useFeedPullEvents (which is mounted on FeedsPage for
 * pull-level toasts) so /articles works standalone, without /feeds being
 * open in another tab.
 */
export function useArticleAnalyzedEvents(): void {
  const dispatch = useDispatch();
  useServerEvents((event) => {
    if (event.type !== 'article.analyzed') return;
    if (event.payload.status !== 'ready') return;
    // Dashboard cards also depend on ready-article counts (total articles,
    // top entities/categories/feeds), so re-fetch them alongside the list.
    // Graph is intentionally excluded — it's heavier and live-updating the
    // layout while the user explores would be jarring; reload-on-open is
    // the right UX there.
    dispatch(api.util.invalidateTags(['Articles', 'Dashboard']));
  });
}
