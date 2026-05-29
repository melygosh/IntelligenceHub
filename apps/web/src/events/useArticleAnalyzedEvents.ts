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
    dispatch(api.util.invalidateTags(['Articles']));
  });
}
