import { useDispatch } from 'react-redux';
import type { ServerEvent } from '@intelligencehub/shared';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';

type DoneEvent = Extract<ServerEvent, { type: 'feed.pull.done' }>['payload'];
type FailedEvent = Extract<ServerEvent, { type: 'feed.pull.failed' }>['payload'];

/**
 * Filters the generic server-event stream to feed-pull + analysis events and
 * (a) auto-invalidates the Feeds + Articles RTK Query tags so the UI reflects
 * new pull state, newly-queued rows, and articles as they finish analysis, and
 * (b) fires caller-provided callbacks for surfacing toasts.
 *
 * Analysis is async (per-article jobs), so a pull completing no longer means
 * the rows are list-ready — `article.analyzed` re-invalidates Articles as each
 * one becomes ready, surfacing it on the list without a manual refresh.
 *
 * Mount on any page that wants to react (FeedsPage for toasts; ArticlesList
 * consumes the Articles invalidation implicitly via its own query).
 */
export function useFeedPullEvents({
  onDone,
  onFailed,
}: {
  onDone?: (e: DoneEvent) => void;
  onFailed?: (e: FailedEvent) => void;
} = {}): void {
  const dispatch = useDispatch();
  useServerEvents((event) => {
    if (event.type === 'feed.pull.done') {
      dispatch(api.util.invalidateTags(['Feeds', 'Articles']));
      onDone?.(event.payload);
    } else if (event.type === 'feed.pull.failed') {
      dispatch(api.util.invalidateTags(['Feeds']));
      onFailed?.(event.payload);
    } else if (event.type === 'article.analyzed' && event.payload.status === 'ready') {
      dispatch(api.util.invalidateTags(['Articles']));
    }
  });
}
