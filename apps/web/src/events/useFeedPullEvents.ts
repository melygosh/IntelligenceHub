import { useDispatch } from 'react-redux';
import type { ServerEvent } from '@intelligencehub/shared';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';

type DoneEvent = Extract<ServerEvent, { type: 'feed.pull.done' }>['payload'];
type FailedEvent = Extract<ServerEvent, { type: 'feed.pull.failed' }>['payload'];

/**
 * Filters the generic server-event stream to feed-pull events and
 * (a) auto-invalidates the Feeds + Articles RTK Query tags so the UI
 * reflects new pull state + new article rows, and
 * (b) fires caller-provided callbacks for surfacing toasts.
 *
 * Mount on any page that wants to react to pull completion (FeedsPage
 * today; future ArticlesList could consume the Articles invalidation
 * implicitly via its own query).
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
    }
  });
}
